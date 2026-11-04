import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession, getAdminTokenFromRequest } from '@/lib/adminAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', { auth: { autoRefreshToken: false, persistSession: false } });

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const token = getAdminTokenFromRequest(request);
        if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        const admin = await validateAdminSession(token);
        if (!admin) return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });

        const { id: requestId } = await context.params;
        const { data: reqRow } = await supabaseAdmin
            .from('contact_requests')
            .select('id, user_id, subject')
            .eq('id', requestId)
            .single();

        // Store notification in DB for the user
        try {
            if (reqRow?.user_id) {
                await supabaseAdmin.from('notifications').insert({
                    recipient_id: reqRow.user_id,
                    actor_role: 'admin',
                    type: 'request_declined',
                    request_id: requestId,
                    content: 'Your message request was declined by the admin.'
                });
            }
        } catch {}

        // Delete the request (cascades messages via FK)
        const { error } = await supabaseAdmin
            .from('contact_requests')
            .delete()
            .eq('id', requestId);
        if (error) throw error;

        // Notify user
        try {
            const realtime = supabaseAdmin.channel(`notify_user_${reqRow?.user_id || 'unknown'}`);
            await realtime.send({ type: 'broadcast', event: 'declined', payload: { requestId, subject: reqRow?.subject || null } });
            await realtime.unsubscribe();
        } catch {}
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('Admin decline contact request error:', err);
        return NextResponse.json({ error: err.message || 'Failed to decline request' }, { status: 500 });
    }
}


