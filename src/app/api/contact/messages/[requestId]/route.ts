import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Get contact messages for a user (and auto-delete notifications)
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ requestId: string }> }
) {
    try {
        const { requestId } = await context.params;

        // Get auth token from Authorization header or cookie
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

        // Verify the request belongs to this user
        const { data: requestData, error: requestError } = await supabaseAdmin
            .from('contact_requests')
            .select('id, user_id')
            .eq('id', requestId)
            .eq('user_id', user.id)
            .single();

        if (requestError || !requestData) {
            return NextResponse.json({ error: 'Request not found or unauthorized' }, { status: 404 });
        }

        // Fetch messages
        const { data: messages, error } = await supabaseAdmin
            .from('contact_messages')
            .select('*')
            .eq('request_id', requestId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Delete admin message notifications when user is viewing the chat (auto-delete on read)
        try {
            await supabaseAdmin
                .from('notifications')
                .delete()
                .eq('recipient_id', user.id)
                .eq('actor_role', 'admin')
                .eq('type', 'message')
                .eq('request_id', requestId);
        } catch (notifErr) {
            logger.error('Error deleting admin notifications:', notifErr);
        }

        return NextResponse.json({ messages: messages || [] });
    } catch (err: any) {
        logger.error('Get contact messages error:', err);
        return NextResponse.json(
            { error: 'Failed to fetch messages' },
            { status: 500 }
        );
    }
}

