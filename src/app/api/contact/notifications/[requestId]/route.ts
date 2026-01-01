import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Delete admin message notifications for a contact request
export async function DELETE(
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

        // Delete admin message notifications
        const { error: deleteError } = await supabaseAdmin
            .from('notifications')
            .delete()
            .eq('recipient_id', user.id)
            .eq('actor_role', 'admin')
            .eq('type', 'message')
            .eq('request_id', requestId);

        if (deleteError) {
            logger.error('Error deleting admin notifications:', deleteError);
            return NextResponse.json({ error: 'Failed to delete notifications' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        logger.error('Delete contact notifications error:', err);
        return NextResponse.json(
            { error: 'Failed to delete notifications' },
            { status: 500 }
        );
    }
}

