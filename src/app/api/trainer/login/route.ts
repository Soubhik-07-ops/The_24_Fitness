import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hashPassword, verifyPassword, createTrainerSession } from '@/lib/trainerAuth';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Rate limiting (simple in-memory store - in production use Redis)
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(phone: string): boolean {
    const now = Date.now();
    const attempt = loginAttempts.get(phone);

    if (!attempt) {
        loginAttempts.set(phone, { count: 1, lastAttempt: now });
        return true;
    }

    if (now - attempt.lastAttempt > RATE_LIMIT_WINDOW) {
        loginAttempts.set(phone, { count: 1, lastAttempt: now });
        return true;
    }

    if (attempt.count >= MAX_ATTEMPTS) {
        return false;
    }

    attempt.count++;
    attempt.lastAttempt = now;
    return true;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { phone, password } = body;

        if (!phone || !password) {
            return NextResponse.json({ error: 'Phone and password are required' }, { status: 400 });
        }

        if (!checkRateLimit(phone)) {
            return NextResponse.json(
                { error: 'Too many login attempts. Please try again later.' },
                { status: 429 }
            );
        }

        // Find trainer by phone
        const { data: trainer, error: trainerError } = await supabaseAdmin
            .from('trainers')
            .select('id, name, phone, email, user_id, password_hash, is_active')
            .eq('phone', phone)
            .single();

        if (trainerError || !trainer) {
            return NextResponse.json({ error: 'Invalid phone or password' }, { status: 401 });
        }

        if (!trainer.is_active) {
            return NextResponse.json({ error: 'Trainer account is inactive' }, { status: 403 });
        }

        // Verify password
        if (!trainer.password_hash) {
            return NextResponse.json({ error: 'Password not set. Please contact admin.' }, { status: 401 });
        }

        const isValid = await verifyPassword(password, trainer.password_hash);
        if (!isValid) {
            return NextResponse.json({ error: 'Invalid phone or password' }, { status: 401 });
        }

        // Create session
        const token = await createTrainerSession(trainer.id);

        // Set cookie
        const cookieStore = await cookies();
        cookieStore.set('trainer_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60, // 24 hours
            path: '/'
        });

        return NextResponse.json({
            success: true,
            trainer: {
                id: trainer.id,
                name: trainer.name,
                phone: trainer.phone,
                email: trainer.email,
                user_id: trainer.user_id
            }
        });
    } catch (err: any) {
        console.error('Trainer login error:', err);
        return NextResponse.json({ error: err.message || 'Login failed' }, { status: 500 });
    }
}

