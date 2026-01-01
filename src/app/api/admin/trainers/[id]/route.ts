import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Update a trainer
export async function PUT(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('admin_token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });
        }

        const { id: trainerId } = await context.params;
        const body = await request.json();
        const { name, phone, email, photo_url, specialization, bio, online_training, in_gym_training, price } = body;

        if (!name || !phone) {
            return NextResponse.json({ error: 'Name and phone are required' }, { status: 400 });
        }

        const updateData: any = {
            name,
            phone,
            email: email || null,
            photo_url: photo_url || null,
            specialization: specialization || null,
            bio: bio || null,
            online_training: online_training || false,
            in_gym_training: in_gym_training || false,
            price: price ? parseFloat(price) : null,
            updated_at: new Date().toISOString()
        };

        const { data: trainer, error: updateError } = await supabaseAdmin
            .from('trainers')
            .update(updateData)
            .eq('id', trainerId)
            .select('id, name, phone, email, photo_url, specialization, bio, online_training, in_gym_training')
            .single();

        if (updateError) {
            if (updateError.code === '23505') { // Unique constraint violation
                return NextResponse.json({ error: 'Trainer with this phone number already exists' }, { status: 400 });
            }
            logger.error('Error updating trainer:', updateError);
            throw updateError;
        }

        logger.info(`Admin ${admin.email} updated trainer ${trainer.name}`);

        return NextResponse.json({
            success: true,
            trainer
        });
    } catch (err: any) {
        logger.error('Update trainer exception:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to update trainer' },
            { status: 500 }
        );
    }
}

// Delete a trainer
export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('admin_token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });
        }

        const { id: trainerId } = await context.params;

        // Get trainer info before deletion for notification
        const { data: trainer } = await supabaseAdmin
            .from('trainers')
            .select('name, phone')
            .eq('id', trainerId)
            .single();

        // Delete trainer (cascade will handle related records)
        const { error: deleteError } = await supabaseAdmin
            .from('trainers')
            .delete()
            .eq('id', trainerId);

        if (deleteError) {
            logger.error('Error deleting trainer:', deleteError);
            return NextResponse.json({ error: 'Failed to delete trainer' }, { status: 500 });
        }

        // Booking system removed - no booking notifications needed
        // Note: Users with active memberships assigned to this trainer will be handled by membership system

        logger.info(`Admin ${admin.email} deleted trainer ${trainer?.name || trainerId}`);

        return NextResponse.json({ success: true });
    } catch (err: any) {
        logger.error('Delete trainer exception:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to delete trainer' },
            { status: 500 }
        );
    }
}

