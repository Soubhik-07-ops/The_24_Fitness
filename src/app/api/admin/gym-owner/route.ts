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

// Get gym owner information (admin's own profile)
export async function GET(request: NextRequest) {
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

        const { data: owner, error } = await supabaseAdmin
            .from('admins')
            .select('id, email, full_name, photo_url, phone, bio, specialization, experience')
            .eq('id', admin.id)
            .single();

        if (error) {
            logger.error('Error fetching admin/owner:', error);
            throw error;
        }

        // Return admin data as owner
        return NextResponse.json({
            owner: {
                id: owner.id,
                full_name: owner.full_name || '',
                photo_url: owner.photo_url || null,
                phone: owner.phone || '',
                email: owner.email || '',
                bio: owner.bio || '',
                specialization: owner.specialization || '',
                experience: owner.experience || ''
            }
        });
    } catch (err: any) {
        logger.error('Get gym owner exception:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to fetch gym owner' },
            { status: 500 }
        );
    }
}

// Update gym owner information (admin's own profile)
export async function PUT(request: NextRequest) {
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

        const body = await request.json();
        const { full_name, photo_url, phone, email, bio, specialization, experience } = body;

        if (!full_name) {
            return NextResponse.json({ error: 'Full name is required' }, { status: 400 });
        }

        // Update admin's own profile (email cannot be changed as it's the login credential)
        const { data: owner, error: updateError } = await supabaseAdmin
            .from('admins')
            .update({
                full_name,
                photo_url: photo_url || null,
                phone: phone || null,
                // Email is not updated - it's the login credential
                bio: bio || null,
                specialization: specialization || null,
                experience: experience || null
            })
            .eq('id', admin.id)
            .select('id, email, full_name, photo_url, phone, bio, specialization, experience')
            .single();

        if (updateError) {
            logger.error('Error updating admin/owner:', updateError);
            throw updateError;
        }

        logger.info(`Admin ${admin.email} updated their profile information`);

        return NextResponse.json({
            success: true,
            owner: {
                id: owner.id,
                full_name: owner.full_name || '',
                photo_url: owner.photo_url || null,
                phone: owner.phone || '',
                email: owner.email || '',
                bio: owner.bio || '',
                specialization: owner.specialization || '',
                experience: owner.experience || ''
            }
        });
    } catch (err: any) {
        logger.error('Update gym owner exception:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to update gym owner' },
            { status: 500 }
        );
    }
}

