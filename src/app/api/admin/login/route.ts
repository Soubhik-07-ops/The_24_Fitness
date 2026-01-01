// src/app/api/admin/login/route.ts
// IMPROVED VERSION with proper cookie handling

import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, createAdminSession } from '@/lib/adminAuth';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const serverSupabase = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// In-memory rate limiter (simple version)
const loginAttempts = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(email: string): boolean {
    const now = Date.now();
    const attempt = loginAttempts.get(email);

    if (!attempt || now > attempt.resetTime) {
        loginAttempts.set(email, {
            count: 1,
            resetTime: now + 15 * 60 * 1000 // Reset after 15 minutes
        });
        return true;
    }

    if (attempt.count >= 5) {
        return false; // Too many attempts
    }

    attempt.count++;
    return true;
}

export async function POST(request: NextRequest) {
    try {
        const { email, password } = await request.json();

        // Validate input
        if (!email || !password) {
            return NextResponse.json(
                { error: 'Email and password are required' },
                { status: 400 }
            );
        }

        // Check rate limit
        if (!checkRateLimit(email)) {
            return NextResponse.json(
                { error: 'Too many login attempts. Please try again in 15 minutes.' },
                { status: 429 }
            );
        }

        // Fetch admin by email
        const { data: admin, error } = await serverSupabase
            .from('admins')
            .select('id, email, password_hash, full_name, role, is_active')
            .eq('email', email)
            .single();

        if (error || !admin) {
            return NextResponse.json(
                { error: 'Invalid credentials' },
                { status: 401 }
            );
        }

        // Check if admin is active
        if (!admin.is_active) {
            return NextResponse.json(
                { error: 'Account is deactivated. Contact system administrator.' },
                { status: 403 }
            );
        }

        // Verify password
        const isValidPassword = await verifyPassword(password, admin.password_hash);
        if (!isValidPassword) {
            return NextResponse.json(
                { error: 'Invalid credentials' },
                { status: 401 }
            );
        }

        // Create session
        const token = await createAdminSession(admin.id);

        // Update last login
        await serverSupabase
            .from('admins')
            .update({ last_login: new Date().toISOString() })
            .eq('id', admin.id);

        // Reset rate limit on successful login
        loginAttempts.delete(email);

        // Create response with admin data
        const response = NextResponse.json({
            success: true,
            admin: {
                id: admin.id,
                email: admin.email,
                full_name: admin.full_name,
                role: admin.role
            }
        });

        // Set secure HTTP-only cookie
        response.cookies.set('admin_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60, // 24 hours
            path: '/'
        });

        return response;
    } catch (error) {
        console.error('Admin login error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
