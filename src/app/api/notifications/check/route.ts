import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { validateUserAuth } from '@/lib/userAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Simple API endpoint to check for new notifications
// This is polled by the frontend every few seconds
export async function GET(request: NextRequest) {
    try {
        // Get auth token
        const authHeader = request.headers.get('authorization');
        const token = authHeader?.replace('Bearer ', '') || request.cookies.get('sb-access-token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        // Verify user exists and is valid (not deleted)
        const user = await validateUserAuth(token);
        if (!user) {
            return NextResponse.json({ error: 'User was deleted or not authenticated' }, { status: 401 });
        }

        // Get user notifications
        const { data: notifications, error } = await supabaseAdmin
            .from('notifications')
            .select('*')
            .eq('recipient_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            logger.error('Error fetching notifications:', error);
            return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
        }

        // Filter out old notifications (older than 24 hours)
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const filtered = (notifications || []).filter((n: any) =>
            new Date(n.created_at) > twentyFourHoursAgo
        );

        return NextResponse.json({
            notifications: filtered,
            count: filtered.length,
            unreadCount: filtered.filter((n: any) => !n.is_read).length
        });
    } catch (err: any) {
        logger.error('Check notifications exception:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to check notifications' },
            { status: 500 }
        );
    }
}

