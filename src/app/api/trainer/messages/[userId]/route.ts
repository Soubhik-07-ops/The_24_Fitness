import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTrainerFromRequest } from '@/lib/trainerAuth';
import { checkTrainerMessagingAccess } from '@/lib/trainerMessagingAccess';
import { logger } from '@/lib/logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Get messages with a specific user
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ userId: string }> }
) {
    try {
        const trainer = await getTrainerFromRequest(request);
        if (!trainer) {
            return NextResponse.json({ error: 'Not authenticated or session expired' }, { status: 401 });
        }

        const { userId } = await context.params;

        // Verify that this trainer is authorized to access this client's conversation
        const { data: membershipData, error: memErr } = await supabaseAdmin
            .from('memberships')
            .select('id, trainer_id, trainer_assigned')
            .eq('user_id', userId)
            .eq('trainer_id', trainer.id)
            .limit(1)
            .maybeSingle();

        if (memErr) {
            logger.error('Error verifying membership for trainer message GET:', memErr);
            return NextResponse.json({ error: 'Failed to verify client assignment' }, { status: 500 });
        }

        if (!membershipData) {
            // Check if there are any existing messages between trainer and user (historical access)
            const { count: msgCount } = await supabaseAdmin
                .from('trainer_messages')
                .select('*', { count: 'exact', head: true })
                .eq('trainer_id', trainer.id)
                .eq('user_id', userId);

            if (!msgCount || msgCount === 0) {
                return NextResponse.json(
                    { error: 'Unauthorized: Client is not assigned to you.', messages: [] },
                    { status: 403 }
                );
            }
        }

        const { data: messages, error } = await supabaseAdmin
            .from('trainer_messages')
            .select('*')
            .eq('trainer_id', trainer.id)
            .eq('user_id', userId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Mark messages as read
        await supabaseAdmin
            .from('trainer_messages')
            .update({ read_at: new Date().toISOString() })
            .eq('trainer_id', trainer.id)
            .eq('user_id', userId)
            .eq('is_trainer', false)
            .is('read_at', null);

        // Get user profile info
        let userName = 'Client';
        try {
            const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('full_name')
                .eq('id', userId)
                .single();

            if (profile?.full_name) {
                userName = profile.full_name;
            } else {
                // Try to get from auth.users metadata
                try {
                    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(userId);
                    if (user) {
                        const metadataName = user.user_metadata?.full_name;
                        if (metadataName) {
                            userName = metadataName;
                        } else if (user.email) {
                            // Fallback to email username
                            const emailName = user.email.split('@')[0];
                            userName = emailName
                                .split('.')
                                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                .join(' ');
                        }
                    }
                } catch (authErr) {
                    logger.error('Error fetching auth user:', authErr);
                }
            }
        } catch (profileErr) {
            logger.error('Error fetching user profile:', profileErr);
        }

        return NextResponse.json({
            messages: messages || [],
            user_name: userName
        });
    } catch (err: any) {
        logger.error('Get trainer messages error:', err);
        return NextResponse.json(
            { error: 'Failed to fetch messages' },
            { status: 500 }
        );
    }
}

// Send a message to a user (from trainer)
export async function POST(
    request: NextRequest,
    context: { params: Promise<{ userId: string }> }
) {
    try {
        const trainer = await getTrainerFromRequest(request);
        if (!trainer) {
            return NextResponse.json({ error: 'Not authenticated or session expired' }, { status: 401 });
        }

        const { userId } = await context.params;

        const body = await request.json();
        const content = (body?.content || '').toString().trim();

        if (!content) {
            return NextResponse.json({ error: 'Content required' }, { status: 400 });
        }

        // Authoritatively check assignment and active messaging eligibility
        const { data: membershipData, error: memErr } = await supabaseAdmin
            .from('memberships')
            .select('id, trainer_id, trainer_assigned, trainer_period_end, trainer_grace_period_end, membership_end_date, end_date, plan_name, status')
            .eq('user_id', userId)
            .eq('trainer_id', trainer.id)
            .eq('trainer_assigned', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (memErr) {
            logger.error('Error verifying membership for trainer message:', memErr);
            return NextResponse.json({ error: 'Failed to verify client assignment' }, { status: 500 });
        }

        if (!membershipData) {
            return NextResponse.json(
                { error: 'Unauthorized: Client is not assigned to you.' },
                { status: 403 }
            );
        }

        const accessStatus = checkTrainerMessagingAccess(
            membershipData.trainer_period_end,
            membershipData.trainer_grace_period_end,
            undefined,
            membershipData.membership_end_date || membershipData.end_date || null,
            membershipData.plan_name
        );

        if (!accessStatus.canMessage) {
            return NextResponse.json(
                { error: accessStatus.reason || 'Unauthorized: Client messaging access is expired or inactive.' },
                { status: 403 }
            );
        }

        // Insert message
        const { data: message, error } = await supabaseAdmin
            .from('trainer_messages')
            .insert({
                trainer_id: trainer.id,
                user_id: userId,
                sender_id: trainer.id,
                is_trainer: true,
                content
            })
            .select()
            .single();

        if (error) {
            logger.error('Insert trainer message error:', error);
            throw error;
        }

        // Get trainer name for real-time broadcast
        const trainerName = trainer.name || 'the trainer';

        // Send real-time notification to user
        try {
            // Subscribe to channel before sending
            const notifyChannel = supabaseAdmin.channel(`notifications_user_${userId}`);
            await notifyChannel.subscribe();
            await new Promise(resolve => setTimeout(resolve, 100));
            await notifyChannel.send({
                type: 'broadcast',
                event: 'new_message',
                payload: {
                    trainerId: trainer.id,
                    trainerName: trainerName,
                    by: 'trainer'
                }
            });
            await notifyChannel.unsubscribe();

            // Broadcast to both channel naming variants (with and without user_ infix)
            const payload = { by: 'trainer', message };
            const ch1 = supabaseAdmin.channel(`trainer_messages_user_${trainer.id}_${userId}`);
            await ch1.subscribe();
            await new Promise(resolve => setTimeout(resolve, 50));
            await ch1.send({ type: 'broadcast', event: 'new_message', payload });
            await ch1.unsubscribe();

            const ch2 = supabaseAdmin.channel(`trainer_messages_${trainer.id}_${userId}`);
            await ch2.subscribe();
            await new Promise(resolve => setTimeout(resolve, 50));
            await ch2.send({ type: 'broadcast', event: 'new_message', payload });
            await ch2.unsubscribe();

            // Broadcast to conversation list channel for live preview & ordering updates
            const listCh = supabaseAdmin.channel('trainer_messages_realtime');
            await listCh.subscribe();
            await new Promise(resolve => setTimeout(resolve, 50));
            await listCh.send({
                type: 'broadcast',
                event: 'conversation_updated',
                payload: { userId, trainerId: trainer.id, message }
            });
            await listCh.unsubscribe();
        } catch (broadcastErr) {
            logger.error('Error sending broadcast notification:', broadcastErr);
        }

        return NextResponse.json({ success: true, message });
    } catch (err: any) {
        logger.error('Send trainer message exception:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to send message' },
            { status: 500 }
        );
    }
}

// Delete all messages in a conversation (delete entire conversation)
export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ userId: string }> }
) {
    try {
        const trainer = await getTrainerFromRequest(request);
        if (!trainer) {
            return NextResponse.json({ error: 'Not authenticated or session expired' }, { status: 401 });
        }

        const { userId } = await context.params;

        // Verify trainer is authorized for this user
        const { count: msgCount } = await supabaseAdmin
            .from('trainer_messages')
            .select('*', { count: 'exact', head: true })
            .eq('trainer_id', trainer.id)
            .eq('user_id', userId);

        if (!msgCount || msgCount === 0) {
            return NextResponse.json({ error: 'Conversation not found or not authorized' }, { status: 404 });
        }

        // Delete all messages between this trainer and user
        const { error: deleteError } = await supabaseAdmin
            .from('trainer_messages')
            .delete()
            .eq('trainer_id', trainer.id)
            .eq('user_id', userId);

        if (deleteError) {
            logger.error('Delete trainer conversation error:', deleteError);
            return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 });
        }

        // Send broadcast to refresh conversations list and active chat windows
        try {
            const payload = { userId, trainerId: trainer.id };
            const channel = supabaseAdmin.channel('trainer_messages_realtime');
            await channel.subscribe();
            await new Promise(resolve => setTimeout(resolve, 50));
            await channel.send({
                type: 'broadcast',
                event: 'conversation_deleted',
                payload
            });
            await channel.unsubscribe();

            const ch1 = supabaseAdmin.channel(`trainer_messages_${trainer.id}_${userId}`);
            await ch1.subscribe();
            await new Promise(resolve => setTimeout(resolve, 50));
            await ch1.send({ type: 'broadcast', event: 'conversation_deleted', payload });
            await ch1.unsubscribe();

            const ch2 = supabaseAdmin.channel(`trainer_messages_user_${trainer.id}_${userId}`);
            await ch2.subscribe();
            await new Promise(resolve => setTimeout(resolve, 50));
            await ch2.send({ type: 'broadcast', event: 'conversation_deleted', payload });
            await ch2.unsubscribe();
        } catch (err) {
            logger.error('Error sending conversation_deleted broadcast:', err);
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        logger.error('Delete trainer conversation exception:', err);
        return NextResponse.json(
            { error: 'Failed to delete conversation' },
            { status: 500 }
        );
    }
}

