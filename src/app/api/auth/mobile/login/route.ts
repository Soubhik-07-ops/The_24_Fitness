import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyPassword as verifyAdminPassword, createAdminSession } from '@/lib/adminAuth';
import { verifyPassword as verifyTrainerPassword, createTrainerSession } from '@/lib/trainerAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const serverSupabase = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Throttling / Rate limiting: 5 attempts per 15 minutes per identifier/IP
const loginAttempts = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(key: string): boolean {
    const now = Date.now();
    const attempt = loginAttempts.get(key);

    if (!attempt || now > attempt.resetTime) {
        loginAttempts.set(key, {
            count: 1,
            resetTime: now + 15 * 60 * 1000
        });
        return true;
    }

    if (attempt.count >= 5) {
        return false;
    }

    attempt.count++;
    return true;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));
        const identifier = (body.identifier || body.email || body.phone || '').toString().trim().toLowerCase();
        const password = (body.password || '').toString();

        if (!identifier || !password) {
            return NextResponse.json(
                { error: 'Identifier and password are required' },
                { status: 400 }
            );
        }

        const clientIp = request.headers.get('x-forwarded-for') || 'local';
        const rateLimitKey = `${clientIp}:${identifier}`;

        if (!checkRateLimit(rateLimitKey)) {
            return NextResponse.json(
                { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
                { status: 429 }
            );
        }

        // 1. Check if identifier belongs to an Admin
        try {
            const { data: admin, error: adminErr } = await serverSupabase
                .from('admins')
                .select('id, email, password_hash, full_name, role, is_active, phone')
                .or(`email.ilike.${identifier},phone.eq.${identifier}`)
                .maybeSingle();

            if (!adminErr && admin && admin.password_hash) {
                if (!admin.is_active) {
                    return NextResponse.json(
                        { error: 'Account is deactivated. Contact system administrator.' },
                        { status: 403 }
                    );
                }

                const isValidAdmin = await verifyAdminPassword(password, admin.password_hash);
                if (isValidAdmin) {
                    const token = await createAdminSession(admin.id);
                    loginAttempts.delete(rateLimitKey);

                    // Update last login
                    try {
                        await serverSupabase
                            .from('admins')
                            .update({ last_login: new Date().toISOString() })
                            .eq('id', admin.id);
                    } catch {
                        // Ignore last_login update error
                    }

                    return NextResponse.json({
                        success: true,
                        user: {
                            id: admin.id,
                            role: 'ADMIN',
                            fullName: admin.full_name || 'System Admin',
                            email: admin.email || '',
                            phone: admin.phone || '',
                            gender: 'MALE',
                            joinedDate: new Date().toISOString()
                        },
                        session: {
                            accessToken: token,
                            role: 'ADMIN',
                            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                        }
                    });
                } else {
                    return NextResponse.json({
                        success: false,
                        isStaff: true,
                        error: 'Invalid password for administrator account.'
                    }, { status: 401 });
                }
            }
        } catch (err) {
            console.error('Error during admin mobile auth check:', err);
        }

        // 2. Check if identifier belongs to a Trainer
        try {
            const { data: trainer, error: trainerErr } = await serverSupabase
                .from('trainers')
                .select('id, name, phone, email, password_hash, user_id, is_active, photo_url')
                .or(`email.ilike.${identifier},phone.eq.${identifier}`)
                .maybeSingle();

            if (!trainerErr && trainer && trainer.password_hash) {
                if (!trainer.is_active) {
                    return NextResponse.json(
                        { error: 'Trainer account is inactive. Please contact management.' },
                        { status: 403 }
                    );
                }

                const isValidTrainer = await verifyTrainerPassword(password, trainer.password_hash);
                if (isValidTrainer) {
                    const token = await createTrainerSession(trainer.id);
                    loginAttempts.delete(rateLimitKey);

                    return NextResponse.json({
                        success: true,
                        user: {
                            id: trainer.id,
                            role: 'TRAINER',
                            fullName: trainer.name || 'Trainer',
                            email: trainer.email || '',
                            phone: trainer.phone || '',
                            gender: 'MALE',
                            avatarUrl: trainer.photo_url || undefined,
                            joinedDate: new Date().toISOString()
                        },
                        session: {
                            accessToken: token,
                            role: 'TRAINER',
                            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                        }
                    });
                } else {
                    return NextResponse.json({
                        success: false,
                        isStaff: true,
                        error: 'Invalid password for trainer account.'
                    }, { status: 401 });
                }
            }
        } catch (err) {
            console.error('Error during trainer mobile auth check:', err);
        }

        // 3. Neither admin nor trainer matched
        // Return isStaff: false so mobile client seamlessly routes to Supabase Member authentication
        return NextResponse.json({
            success: false,
            isStaff: false,
            error: 'Not a recognized staff account or invalid credentials.'
        }, { status: 401 });

    } catch (error: any) {
        console.error('Mobile authentication exception:', error);
        return NextResponse.json(
            { error: 'Authentication service temporarily unavailable' },
            { status: 500 }
        );
    }
}
