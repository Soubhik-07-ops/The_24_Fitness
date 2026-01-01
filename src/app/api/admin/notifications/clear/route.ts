import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';
import { logger } from '@/lib/logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Delete all admin notifications
export async function DELETE(request: NextRequest) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });
        }

        // Delete all admin notifications
        const { error } = await supabaseAdmin
            .from('admin_notifications')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (using a condition that's always true)

        if (error) {
            logger.error('Error deleting admin notifications:', error);
            return NextResponse.json({ error: 'Failed to delete notifications' }, { status: 500 });
        }

        logger.info('All admin notifications deleted');
        return NextResponse.json({ success: true, message: 'All notifications cleared' });
    } catch (err: any) {
        logger.error('Admin notifications DELETE exception:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to delete notifications' },
            { status: 500 }
        );
    }
}

// Delete a single admin notification
export async function POST(request: NextRequest) {
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

        // Delete the specific notification
        const { error } = await supabaseAdmin
            .from('admin_notifications')
            .delete()
            .eq('id', id);

        if (error) {
            logger.error('Error deleting admin notification:', error);
            return NextResponse.json({ error: 'Failed to delete notification' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        logger.error('Admin notifications DELETE (single) exception:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to delete notification' },
            { status: 500 }
        );
    }
}

