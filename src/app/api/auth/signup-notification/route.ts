import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Create a notification when user signs up successfully
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { userId, email, fullName } = body;

        if (!userId) {
            return NextResponse.json({ error: 'User ID required' }, { status: 400 });
        }

        // Create signup success notification
        const { error } = await supabaseAdmin.from('notifications').insert({
            recipient_id: userId,
            actor_role: 'user',
            type: 'signup_success',
            content: 'Welcome to The 24 Fitness Gym! Your account has been created successfully. Start your fitness journey today!'
        });

        if (error) {
            logger.error('Error creating signup notification:', error);
            return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 });
        }

        // Send real-time notification
        try {
            const channel = supabaseAdmin.channel(`notifications_user_${userId}`);
            await channel.subscribe();
            await new Promise(resolve => setTimeout(resolve, 100));
            await channel.send({
                type: 'broadcast',
                event: 'new_message',
                payload: {
                    by: 'system',
                    notificationType: 'signup_success'
                }
            });
            await channel.unsubscribe();
        } catch (broadcastErr) {
            logger.error('Error sending signup notification broadcast:', broadcastErr);
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        logger.error('Signup notification exception:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to create signup notification' },
            { status: 500 }
        );
    }
}

