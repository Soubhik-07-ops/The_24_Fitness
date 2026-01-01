import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';
import { hashPassword } from '@/lib/trainerAuth';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Generate a secure random password
function generateSecurePassword(): string {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    const randomBytes = crypto.randomBytes(length);
    let password = '';
    for (let i = 0; i < length; i++) {
        password += charset[randomBytes[i] % charset.length];
    }
    return password;
}

// Get all trainers
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

        const { data: trainers, error } = await supabaseAdmin
            .from('trainers')
            .select('id, name, phone, email, is_active, created_at, photo_url, specialization, bio, online_training, in_gym_training, price')
            .order('created_at', { ascending: false });

        if (error) {
            logger.error('Error fetching trainers:', error);
            throw error;
        }

        return NextResponse.json({ trainers: trainers || [] });
    } catch (err: any) {
        logger.error('Get trainers exception:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to fetch trainers' },
            { status: 500 }
        );
    }
}

// Add a new trainer
export async function POST(request: NextRequest) {
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
        const { name, phone, email, photo_url, specialization, bio, online_training, in_gym_training, price } = body;

        if (!name || !phone) {
            return NextResponse.json({ error: 'Name and phone are required' }, { status: 400 });
        }

        // Generate secure password
        const password = generateSecurePassword();
        const passwordHash = await hashPassword(password);

        // Insert trainer
        const { data: trainer, error: insertError } = await supabaseAdmin
            .from('trainers')
            .insert({
                name,
                phone,
                email: email || null,
                photo_url: photo_url || null,
                specialization: specialization || null,
                bio: bio || null,
                online_training: online_training || false,
                in_gym_training: in_gym_training || false,
                price: price ? parseFloat(price) : null,
                password_hash: passwordHash,
                is_active: true
            })
            .select('id, name, phone, email, photo_url, specialization, bio, online_training, in_gym_training, price')
            .single();

        if (insertError) {
            if (insertError.code === '23505') { // Unique constraint violation
                return NextResponse.json({ error: 'Trainer with this phone number already exists' }, { status: 400 });
            }
            logger.error('Error inserting trainer:', insertError);
            throw insertError;
        }

        // Create notification for admin (confirmation)
        try {
            // Note: Admin notifications are handled differently, but we can log this
            logger.info(`Admin ${admin.email} added trainer ${trainer.name}`);
        } catch (notifErr) {
            logger.error('Error creating notification:', notifErr);
        }

        // Return trainer info with password (only shown once)
        return NextResponse.json({
            success: true,
            trainer: {
                id: trainer.id,
                name: trainer.name,
                phone: trainer.phone,
                email: trainer.email,
                photo_url: trainer.photo_url,
                specialization: trainer.specialization,
                bio: trainer.bio,
                online_training: trainer.online_training,
                in_gym_training: trainer.in_gym_training,
                price: trainer.price
            },
            password: password // Only returned once - admin must save it
        });
    } catch (err: any) {
        logger.error('Add trainer exception:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to add trainer' },
            { status: 500 }
        );
    }
}

