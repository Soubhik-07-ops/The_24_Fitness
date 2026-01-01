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

        const { id } = await context.params;
        const { data: requestData, error } = await supabaseAdmin
            .from('contact_requests')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return NextResponse.json({ request: requestData });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Failed to fetch request' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        const admin = await validateAdminSession(token);
        if (!admin) return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });

        const { id } = await context.params;
        const { error } = await supabaseAdmin
            .from('contact_requests')
            .delete()
            .eq('id', id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('Admin delete contact request error:', err);
        return NextResponse.json({ error: err.message || 'Failed to delete request' }, { status: 500 });
    }
}


