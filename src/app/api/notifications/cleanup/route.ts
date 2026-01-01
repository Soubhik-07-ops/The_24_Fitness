import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

export async function POST(request: NextRequest) {
    try {
        // Delete notifications older than 24 hours
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // First, count how many will be deleted from notifications table
        const { count: notificationsCount } = await supabaseAdmin
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .lt('created_at', twentyFourHoursAgo);

        // Delete old notifications
        const { error: notificationsError } = await supabaseAdmin
            .from('notifications')
            .delete()
            .lt('created_at', twentyFourHoursAgo);

        if (notificationsError) {
            console.error('Error cleaning up notifications:', notificationsError);
            return NextResponse.json({ error: notificationsError.message }, { status: 500 });
        }

        // Also cleanup trainer_notifications table (older than 24 hours)
        const { count: trainerNotificationsCount } = await supabaseAdmin
            .from('trainer_notifications')
            .select('*', { count: 'exact', head: true })
            .lt('created_at', twentyFourHoursAgo);

        const { error: trainerNotificationsError } = await supabaseAdmin
            .from('trainer_notifications')
            .delete()
            .lt('created_at', twentyFourHoursAgo);

        if (trainerNotificationsError) {
            console.error('Error cleaning up trainer notifications:', trainerNotificationsError);
            // Don't fail if trainer notifications cleanup fails
        }

        return NextResponse.json({
            deleted: {
                notifications: notificationsCount || 0,
                trainer_notifications: trainerNotificationsCount || 0
            },
            message: 'Notifications cleaned up successfully'
        });
    } catch (err: any) {
        console.error('Cleanup error:', err);
        return NextResponse.json({ error: err.message || 'Failed to cleanup notifications' }, { status: 500 });
    }
}

