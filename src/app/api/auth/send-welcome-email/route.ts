/**
 * Welcome Email API Route
 * 
 * Sends welcome email on first successful login
 * Called after user successfully authenticates
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWelcomeEmail } from '@/lib/emailService';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { userId } = body;

        if (!userId) {
            return NextResponse.json(
                { error: 'User ID is required' },
                { status: 400 }
            );
        }

        // Send welcome email (idempotent - checks if already sent)
        const result = await sendWelcomeEmail(userId);

        if (result.success) {
            return NextResponse.json({
                success: true,
                message: 'Welcome email sent successfully'
            });
        } else {
            console.error('[WELCOME EMAIL] Failed to send:', result.error);
            return NextResponse.json(
                { error: result.error || 'Failed to send welcome email' },
                { status: 500 }
            );
        }
    } catch (error: any) {
        console.error('[WELCOME EMAIL] Error:', error);
        return NextResponse.json(
            { error: 'Failed to process welcome email request' },
            { status: 500 }
        );
    }
}

