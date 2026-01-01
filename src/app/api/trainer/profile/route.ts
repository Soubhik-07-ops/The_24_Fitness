import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateTrainerSession } from '@/lib/trainerAuth';
import { logger } from '@/lib/logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Get trainer profile
export async function GET(request: NextRequest) {
    try {
        const token = request.cookies.get('trainer_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const trainer = await validateTrainerSession(token);
        if (!trainer) {
            return NextResponse.json({ error: 'Invalid or expired trainer session' }, { status: 401 });
        }

        return NextResponse.json({
            success: true,
            trainer
        });
    } catch (err: any) {
        logger.error('Get trainer profile error:', err);
        return NextResponse.json(
            { error: 'Failed to fetch profile' },
            { status: 500 }
        );
    }
}

// Update trainer profile
export async function PUT(request: NextRequest) {
    try {
        const token = request.cookies.get('trainer_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const trainer = await validateTrainerSession(token);
        if (!trainer) {
            return NextResponse.json({ error: 'Invalid or expired trainer session' }, { status: 401 });
        }

        const body = await request.json();
        const { name, phone, email, photo_url } = body;

        if (!name || !phone) {
            return NextResponse.json({ error: 'Name and phone are required' }, { status: 400 });
        }

        // Check if phone number is already taken by another trainer
        const { data: existingTrainer } = await supabaseAdmin
            .from('trainers')
            .select('id, phone')
            .eq('phone', phone)
            .neq('id', trainer.id)
            .single();

        if (existingTrainer) {
            return NextResponse.json({ error: 'Phone number already in use by another trainer' }, { status: 400 });
        }

        const updateData: any = {
            name,
            phone,
            email: email || null,
            photo_url: photo_url || null,
            updated_at: new Date().toISOString()
        };

        const { data: updatedTrainer, error: updateError } = await supabaseAdmin
            .from('trainers')
            .update(updateData)
            .eq('id', trainer.id)
            .select('id, name, phone, email, photo_url')
            .single();

        if (updateError) {
            if (updateError.code === '23505') {
                return NextResponse.json({ error: 'Phone number already in use' }, { status: 400 });
            }
            logger.error('Error updating trainer profile:', updateError);
            throw updateError;
        }

        logger.info(`Trainer ${trainer.id} updated their profile`);

        return NextResponse.json({
            success: true,
            trainer: updatedTrainer
        });
    } catch (err: any) {
        logger.error('Update trainer profile error:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to update profile' },
            { status: 500 }
        );
    }
}

