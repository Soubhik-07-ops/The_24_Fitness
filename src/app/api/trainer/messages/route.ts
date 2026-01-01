import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateTrainerSession } from '@/lib/trainerAuth';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Get all conversations for a trainer
export async function GET(request: NextRequest) {
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

        // Get all unique user_ids that have conversations with this trainer
        const { data: messages, error: messagesError } = await supabaseAdmin
            .from('trainer_messages')
            .select('user_id, created_at')
            .eq('trainer_id', trainer.id)
            .order('created_at', { ascending: false });

        if (messagesError) throw messagesError;

        // Get unique user IDs
        const userIds = [...new Set(messages?.map(m => m.user_id) || [])];

        if (userIds.length === 0) {
            return NextResponse.json({ conversations: [] });
        }

        // Get user profiles
        const { data: profiles } = await supabaseAdmin
            .from('profiles')
            .select('id, full_name, avatar_url')
            .in('id', userIds);

        // Get latest message for each conversation
        const conversations = await Promise.all(
            userIds.map(async (userId) => {
                const { data: latestMessages } = await supabaseAdmin
                    .from('trainer_messages')
                    .select('*')
                    .eq('trainer_id', trainer.id)
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(1);

                const latestMessage = latestMessages?.[0];

                const { count: unreadCount } = await supabaseAdmin
                    .from('trainer_messages')
                    .select('*', { count: 'exact', head: true })
                    .eq('trainer_id', trainer.id)
                    .eq('user_id', userId)
                    .eq('is_trainer', false)
                    .is('read_at', null);

                const profile = profiles?.find(p => p.id === userId);

                return {
                    user_id: userId,
                    user_name: profile?.full_name || 'Unknown User',
                    avatar_url: profile?.avatar_url,
                    latest_message: latestMessage?.content || '',
                    latest_message_time: latestMessage?.created_at || '',
                    unread_count: unreadCount || 0
                };
            })
        );

        return NextResponse.json({ conversations });
    } catch (err: any) {
        console.error('Trainer messages error:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to fetch conversations' },
            { status: 500 }
        );
    }
}

