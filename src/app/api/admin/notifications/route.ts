import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';
import { logger } from '@/lib/logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Get admin notifications
export async function GET(request: NextRequest) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });
        }

        // Fetch all admin notifications (admin is the only admin, so no filtering needed)
        const { data: notifications, error } = await supabaseAdmin
            .from('admin_notifications')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            logger.error('Error fetching admin notifications:', error);
            return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
        }

        // Filter out old notifications (older than 24 hours)
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const filtered = (notifications || []).filter((n: any) =>
            new Date(n.created_at) > twentyFourHoursAgo
        );

        return NextResponse.json({ notifications: filtered });
    } catch (err: any) {
        logger.error('Admin notifications GET exception:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to fetch notifications' },
            { status: 500 }
        );
    }
}

// Mark admin notification as read
export async function PUT(request: NextRequest) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });
        }

        const body = await request.json();
        const { id } = body;

        if (!id) {
            return NextResponse.json({ error: 'Notification ID required' }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from('admin_notifications')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            logger.error('Error marking admin notification as read:', error);
            return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        logger.error('Admin notifications PUT exception:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to mark as read' },
            { status: 500 }
        );
    }
}

// Mark all admin notifications as read
export async function PATCH(request: NextRequest) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });
        }

        const { error } = await supabaseAdmin
            .from('admin_notifications')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('is_read', false);

        if (error) {
            logger.error('Error marking all admin notifications as read:', error);
            return NextResponse.json({ error: 'Failed to mark all as read' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        logger.error('Admin notifications PATCH exception:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to mark all as read' },
            { status: 500 }
        );
    }
}

