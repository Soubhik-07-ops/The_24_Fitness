import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hashPassword } from '@/lib/trainerAuth';
import { validateAdminSession } from '@/lib/adminAuth';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Default password MUST come from environment variable
// No hardcoded fallback - prevents password exposure in source code
function getDefaultPassword(): string {
    const envPassword = process.env.TRAINER_DEFAULT_PASSWORD;

    if (!envPassword) {
        throw new Error('TRAINER_DEFAULT_PASSWORD environment variable is required. Please set it in your .env.local file.');
    }

    return envPassword;
}

// Helper function to check admin authentication
async function requireAdmin(request: NextRequest): Promise<{ admin: any } | { error: string; status: number }> {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;

    if (!token) {
        return { error: 'Admin authentication required', status: 401 };
    }

    const admin = await validateAdminSession(token);
    if (!admin) {
        return { error: 'Invalid or expired admin session', status: 401 };
    }

    return { admin };
}

export async function POST(request: NextRequest) {
    try {
        // Require admin authentication
        const authCheck = await requireAdmin(request);
        if ('error' in authCheck) {
            return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
        }

        const body = await request.json();
        const { trainerId, password } = body;

        if (!trainerId) {
            return NextResponse.json({ error: 'Trainer ID is required' }, { status: 400 });
        }

        // Password must be provided - never use default in POST
        if (!password) {
            return NextResponse.json({ error: 'Password is required' }, { status: 400 });
        }

        const passwordHash = await hashPassword(password);

        const { data, error } = await supabaseAdmin
            .from('trainers')
            .update({ password_hash: passwordHash })
            .eq('id', trainerId)
            .select()
            .single();

        if (error) {
            throw error;
        }

        // Never return password in response
        return NextResponse.json({
            success: true,
            message: 'Trainer password set successfully',
            trainer: {
                id: data.id,
                name: data.name,
                phone: data.phone
            }
        });
    } catch (err: any) {
        if (process.env.NODE_ENV === 'development') {
            console.error('Trainer setup error:', err);
        }
        return NextResponse.json({ error: 'Failed to setup trainer' }, { status: 500 });
    }
}

// Initialize all trainers with default password - PROTECTED ENDPOINT
export async function GET(request: NextRequest) {
    try {
        // Require admin authentication
        const authCheck = await requireAdmin(request);
        if ('error' in authCheck) {
            return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
        }

        // Get all trainers without passwords
        const { data: trainers, error } = await supabaseAdmin
            .from('trainers')
            .select('id, name, phone')
            .is('password_hash', null);

        if (error) throw error;

        // Get default password (will throw error in production if not set)
        const defaultPassword = getDefaultPassword();

        const results = [];
        for (const trainer of trainers || []) {
            const passwordHash = await hashPassword(defaultPassword);
            const { error: updateError } = await supabaseAdmin
                .from('trainers')
                .update({ password_hash: passwordHash })
                .eq('id', trainer.id);

            if (!updateError) {
                // NEVER return password in response - security risk
                results.push({
                    id: trainer.id,
                    name: trainer.name,
                    phone: trainer.phone
                    // Password intentionally omitted from response
                });
            }
        }

        // Don't expose default password in response message
        return NextResponse.json({
            success: true,
            message: `Initialized ${results.length} trainer(s) with default password`,
            trainers: results,
            note: 'Trainers should change their password after first login'
        });
    } catch (err: any) {
        if (process.env.NODE_ENV === 'development') {
            console.error('Trainer initialization error:', err);
        }
        return NextResponse.json({ error: 'Failed to initialize trainers' }, { status: 500 });
    }
}

