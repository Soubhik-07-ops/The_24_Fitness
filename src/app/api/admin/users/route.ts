import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

export async function DELETE(request: NextRequest) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

        const admin = await validateAdminSession(token);
        if (!admin) return NextResponse.json({ success: false, error: 'Invalid or expired admin session' }, { status: 401 });

        const body = await request.json();
        const { id } = body;
        if (!id) return NextResponse.json({ success: false, error: 'Missing id for delete' }, { status: 400 });

        // Get user profile before deleting
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('full_name')
            .eq('id', id)
            .single();

        const userName = profile?.full_name || 'User';

        // Booking system removed - no bookings to delete

        // Notify user before deleting (if they're still logged in)
        try {
            await supabaseAdmin.from('notifications').insert({
                recipient_id: id,
                actor_role: 'admin',
                type: 'account_deleted',
                content: 'Your account has been deleted by the admin.'
            });

            const userChannel = supabaseAdmin.channel(`notifications_user_${id}`);
            await userChannel.subscribe();
            await new Promise(resolve => setTimeout(resolve, 100));
            await userChannel.send({
                type: 'broadcast',
                event: 'new_message',
                payload: {
                    by: 'admin',
                    notificationType: 'account_deleted',
                    content: 'Your account has been deleted by the admin.'
                }
            });
            await userChannel.unsubscribe();
        } catch (userNotifErr) {
            console.error('Error notifying user:', userNotifErr);
        }

        // Booking system removed - no booking notifications needed

        // Delete related reviews
        const { error: reviewsError } = await supabaseAdmin.from('reviews').delete().eq('user_id', id);
        if (reviewsError) console.error('Error deleting reviews for user:', reviewsError);

        // Delete trainer messages (messages between user and trainers)
        const { error: messagesError } = await supabaseAdmin.from('trainer_messages').delete().eq('user_id', id);
        if (messagesError) console.error('Error deleting trainer messages for user:', messagesError);

        // Delete profile
        const { error } = await supabaseAdmin.from('profiles').delete().eq('id', id);
        if (error) {
            console.error('Admin users DELETE error:', error);
            return NextResponse.json({ success: false, error: error.message || error }, { status: 500 });
        }

        try {
            await supabaseAdmin.from('admin_audit').insert([{ admin_id: admin.id, action: 'delete', table_name: 'profiles', record_id: id, payload: null, created_at: new Date().toISOString() }]);
        } catch (auditErr) {
            console.warn('Failed to write audit log (users):', auditErr);
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (err: any) {
        console.error('Admin users DELETE exception:', err);
        return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
    }
}
