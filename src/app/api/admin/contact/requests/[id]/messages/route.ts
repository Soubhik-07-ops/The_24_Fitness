import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', { auth: { autoRefreshToken: false, persistSession: false } });

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        const admin = await validateAdminSession(token);
        if (!admin) return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });

        const { id: requestId } = await context.params;
        const { data, error } = await supabaseAdmin
            .from('contact_messages')
            .select('*')
            .eq('request_id', requestId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return NextResponse.json({ messages: data || [] });
    } catch (err: any) {
        console.error('Admin get messages error:', err);
        return NextResponse.json({ error: err.message || 'Failed to fetch messages' }, { status: 500 });
    }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        const admin = await validateAdminSession(token);
        if (!admin) return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });

        const { id: requestId } = await context.params;
        const body = await request.json();
        const content = (body?.content || '').toString().trim();
        if (!content) return NextResponse.json({ error: 'Content required' }, { status: 400 });

        const { data: reqRow } = await supabaseAdmin
            .from('contact_requests')
            .select('id, user_id')
            .eq('id', requestId)
            .single();

        const { error } = await supabaseAdmin
            .from('contact_messages')
            .insert({ request_id: requestId, sender_id: null, content, is_admin: true });
        if (error) throw error;

        // Store notification in DB for the user
        try {
            if (reqRow?.user_id) {
                await supabaseAdmin.from('notifications').insert({
                    recipient_id: reqRow.user_id,
                    actor_role: 'admin',
                    type: 'message',
                    request_id: requestId,
                    content: 'New message from Admin.'
                });
            }
        } catch {}

        // Notify user via broadcast
        try {
            const userChannel = supabaseAdmin.channel(`notifications_user_${reqRow?.user_id || 'unknown'}`);
            await userChannel.subscribe();
            await new Promise(resolve => setTimeout(resolve, 100));
            await userChannel.send({ 
                type: 'broadcast', 
                event: 'new_message', 
                payload: { 
                    requestId,
                    by: 'admin'
                } 
            });
            await userChannel.unsubscribe();
        } catch {}

        // Also broadcast to admin message channel for real-time update in admin panel
        try {
            const adminChannel = supabaseAdmin.channel(`contact_messages_${requestId}`);
            await adminChannel.subscribe();
            await new Promise(resolve => setTimeout(resolve, 100));
            await adminChannel.send({ type: 'broadcast', event: 'new_message', payload: { by: 'admin' } });
            await adminChannel.unsubscribe();
        } catch {}

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('Admin send message error:', err);
        return NextResponse.json({ error: err.message || 'Failed to send message' }, { status: 500 });
    }
}


