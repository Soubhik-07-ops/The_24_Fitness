import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateTrainerSession } from '@/lib/trainerAuth';
import { cookies } from 'next/headers';
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
        const cookieStore = await cookies();
        const token = cookieStore.get('trainer_token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const trainer = await validateTrainerSession(token);
        if (!trainer) {
            return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
        }

        const { userId } = await context.params;

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
        const cookieStore = await cookies();
        const token = cookieStore.get('trainer_token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const trainer = await validateTrainerSession(token);
        if (!trainer) {
            return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
        }

        const { userId } = await context.params;

        const body = await request.json();
        const content = (body?.content || '').toString().trim();

        if (!content) {
            return NextResponse.json({ error: 'Content required' }, { status: 400 });
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

            // Also broadcast to user's message channel for real-time update in chat window
            const messageChannel = supabaseAdmin.channel(`trainer_messages_user_${trainer.id}_${userId}`);
            await messageChannel.subscribe();
            await new Promise(resolve => setTimeout(resolve, 100));
            await messageChannel.send({
                type: 'broadcast',
                event: 'new_message',
                payload: { by: 'trainer' }
            });
            await messageChannel.unsubscribe();
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
        const cookieStore = await cookies();
        const token = cookieStore.get('trainer_token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const trainer = await validateTrainerSession(token);
        if (!trainer) {
            return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
        }

        const { userId } = await context.params;

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

        // Send broadcast to refresh conversations list
        try {
            const channel = supabaseAdmin.channel('trainer_messages_realtime');
            await channel.subscribe();
            await new Promise(resolve => setTimeout(resolve, 100));
            await channel.send({
                type: 'broadcast',
                event: 'conversation_deleted',
                payload: { userId }
            });
            await channel.unsubscribe();
        } catch (err) {
            logger.error('Error sending broadcast:', err);
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
