import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Get messages with a trainer (for users)
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ trainerId: string }> }
) {
    try {
        const { trainerId } = await context.params;

        // Get auth token from Authorization header
        const authHeader = request.headers.get('authorization');
        const token = authHeader?.replace('Bearer ', '') || request.cookies.get('sb-access-token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        // Verify user with service role
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        // Check if user has an active membership with this trainer assigned
        const { data: activeMembership } = await supabaseAdmin
            .from('memberships')
            .select('id, trainer_id, trainer_assigned, trainer_period_end, status')
            .eq('user_id', user.id)
            .eq('trainer_id', trainerId)
            .eq('trainer_assigned', true)
            .eq('status', 'active')
            .gt('trainer_period_end', new Date().toISOString())
            .limit(1)
            .single();

        // Allow reading messages even if trainer period expired (for viewing existing conversation)
        // But restrict sending messages (handled in POST)

        const { data: messages, error } = await supabaseAdmin
            .from('trainer_messages')
            .select('*')
            .eq('trainer_id', trainerId)
            .eq('user_id', user.id)
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Mark messages as read
        await supabaseAdmin
            .from('trainer_messages')
            .update({ read_at: new Date().toISOString() })
            .eq('trainer_id', trainerId)
            .eq('user_id', user.id)
            .eq('is_trainer', true)
            .is('read_at', null);

        // Delete related notifications when user is viewing the chat (auto-delete on read)
        // Get trainer name first to match notification content
        const { data: trainerData } = await supabaseAdmin
            .from('trainers')
            .select('name')
            .eq('id', trainerId)
            .single();

        if (trainerData?.name) {
            // Delete notifications that mention this trainer's name (notification content is "New message from [Trainer Name].")
            await supabaseAdmin
                .from('notifications')
                .delete()
                .eq('recipient_id', user.id)
                .eq('actor_role', 'trainer')
                .eq('type', 'message')
                .ilike('content', `%${trainerData.name}%`);
        }

        return NextResponse.json({ messages: messages || [] });
    } catch (err: any) {
        logger.error('Get user-trainer messages error:', err);
        return NextResponse.json(
            { error: 'Failed to fetch messages' },
            { status: 500 }
        );
    }
}

// Send a message to a trainer (from user)
export async function POST(
    request: NextRequest,
    context: { params: Promise<{ trainerId: string }> }
) {
    try {
        const { trainerId } = await context.params;

        // Get auth token from Authorization header
        const authHeader = request.headers.get('authorization');
        const token = authHeader?.replace('Bearer ', '') || request.cookies.get('sb-access-token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        // Verify user with service role
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        // Check if user has an active membership with this trainer assigned and trainer period is active
        const { data: activeMembership, error: membershipError } = await supabaseAdmin
            .from('memberships')
            .select('id, trainer_id, trainer_assigned, trainer_period_end, status, plan_name')
            .eq('user_id', user.id)
            .eq('trainer_id', trainerId)
            .eq('trainer_assigned', true)
            .eq('status', 'active')
            .gt('trainer_period_end', new Date().toISOString())
            .limit(1)
            .single();

        if (membershipError || !activeMembership) {
            // Check if membership exists but trainer period expired
            const { data: expiredMembership } = await supabaseAdmin
                .from('memberships')
                .select('id, trainer_period_end')
                .eq('user_id', user.id)
                .eq('trainer_id', trainerId)
                .eq('trainer_assigned', true)
                .eq('status', 'active')
                .limit(1)
                .single();

            if (expiredMembership) {
                return NextResponse.json(
                    { error: 'Your trainer access period has expired. Please renew your trainer access to continue messaging.' },
                    { status: 403 }
                );
            }

            return NextResponse.json(
                { error: 'You can only message trainers when you have an active membership with trainer access assigned.' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const content = (body?.content || '').toString().trim();

        if (!content) {
            return NextResponse.json({ error: 'Content required' }, { status: 400 });
        }

        // Insert message
        const { data: message, error } = await supabaseAdmin
            .from('trainer_messages')
            .insert({
                trainer_id: trainerId,
                user_id: user.id,
                sender_id: user.id,
                is_trainer: false,
                content
            })
            .select()
            .single();

        if (error) throw error;

        // Send real-time notification to trainer (they'll see it in their panel)
        try {
            const supabaseAdmin = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL || '',
                process.env.SUPABASE_SERVICE_ROLE_KEY || '',
                { auth: { autoRefreshToken: false, persistSession: false } }
            );

            // Get user's name
            const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('full_name')
                .eq('id', user.id)
                .single();

            const userName = profile?.full_name || 'A client';

            // Send broadcast to trainer-specific notification channel with 'by: user' to indicate user sent it
            // CRITICAL: Use trainer-specific channel to prevent notifications going to wrong trainers
            // Subscribe first to ensure proper delivery
            try {
                const notifyChannel = supabaseAdmin.channel(`notify_trainer_${trainerId}`);
                await notifyChannel.subscribe();
                // Wait a bit for subscription to be ready
                await new Promise(resolve => setTimeout(resolve, 100));
                const sendResult = await notifyChannel.send({
                    type: 'broadcast',
                    event: 'new_message',
                    payload: { userId: user.id, userName, trainerId, by: 'user' }
                });
                await notifyChannel.unsubscribe();

                if (sendResult !== 'ok') {
                    logger.error('[USER SEND MESSAGE] Error sending to trainer channel');
                }
            } catch (err) {
                logger.error('[USER SEND MESSAGE] Exception sending to trainer channel:', err);
            }

            // Also broadcast to trainer's message channel for real-time update in message page
            try {
                const messageChannel = supabaseAdmin.channel(`trainer_messages_${trainerId}_${user.id}`);
                await messageChannel.subscribe();
                await new Promise(resolve => setTimeout(resolve, 100));
                await messageChannel.send({
                    type: 'broadcast',
                    event: 'new_message',
                    payload: { by: 'user', userId: user.id }
                });
                await messageChannel.unsubscribe();
            } catch (broadcastErr) {
                logger.error('[USER SEND MESSAGE] Error broadcasting to message channel:', broadcastErr);
            }
        } catch (notifErr) {
            logger.error('Failed to send notification:', notifErr);
        }

        return NextResponse.json({ success: true, message });
    } catch (err: any) {
        logger.error('Send user-trainer message error:', err);
        return NextResponse.json(
            { error: 'Failed to send message' },
            { status: 500 }
        );
    }
}

