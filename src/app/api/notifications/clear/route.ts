import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Delete all user notifications
export async function DELETE(request: NextRequest) {
    try {
        // Get auth token
        const authHeader = request.headers.get('authorization');
        const token = authHeader?.replace('Bearer ', '') || request.cookies.get('sb-access-token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        // Verify user
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        // Delete all notifications for this user
        const { error } = await supabaseAdmin
            .from('notifications')
            .delete()
            .eq('recipient_id', user.id);

        if (error) {
            logger.error('Error deleting user notifications:', error);
            return NextResponse.json({ error: 'Failed to delete notifications' }, { status: 500 });
        }

        logger.info(`All notifications deleted for user ${user.id}`);
        return NextResponse.json({ success: true, message: 'All notifications cleared' });
    } catch (err: any) {
        logger.error('User notifications DELETE exception:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to delete notifications' },
            { status: 500 }
        );
    }
}

// Delete a single user notification
export async function POST(request: NextRequest) {
    try {
        // Get auth token
        const authHeader = request.headers.get('authorization');
        const token = authHeader?.replace('Bearer ', '') || request.cookies.get('sb-access-token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        // Verify user
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const body = await request.json();
        const { id } = body;

        if (!id) {
            return NextResponse.json({ error: 'Notification ID required' }, { status: 400 });
        }

        // Delete the specific notification (and verify it belongs to the user)
        const { data: deletedData, error } = await supabaseAdmin
            .from('notifications')
            .delete()
            .eq('id', id)
            .eq('recipient_id', user.id)
            .select();

        if (error) {
            logger.error('Error deleting user notification:', error);
            logger.error('Error details:', JSON.stringify(error, null, 2));
            return NextResponse.json({ error: 'Failed to delete notification: ' + error.message }, { status: 500 });
        }

        // Check if notification was actually deleted
        if (!deletedData || deletedData.length === 0) {
            logger.warn(`Notification ${id} not found or doesn't belong to user ${user.id}`);
            return NextResponse.json({ error: 'Notification not found or unauthorized' }, { status: 404 });
        }

        logger.info(`Notification ${id} deleted successfully for user ${user.id}`);
        return NextResponse.json({ success: true });
    } catch (err: any) {
        logger.error('User notifications DELETE (single) exception:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to delete notification' },
            { status: 500 }
        );
    }
}

