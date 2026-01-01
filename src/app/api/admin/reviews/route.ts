import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

export async function PUT(request: NextRequest) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

        const admin = await validateAdminSession(token);
        if (!admin) return NextResponse.json({ success: false, error: 'Invalid or expired admin session' }, { status: 401 });

        const body = await request.json();
        const { id, is_approved } = body;
        if (!id || typeof is_approved !== 'boolean') {
            return NextResponse.json({ success: false, error: 'Missing id or is_approved' }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from('reviews')
            .update({ is_approved, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            return NextResponse.json({ success: false, error: error.message || error }, { status: 500 });
        }

        try {
            await supabaseAdmin.from('admin_audit').insert([{
                admin_id: admin.id,
                action: is_approved ? 'approve' : 'reject',
                table_name: 'reviews',
                record_id: id,
                payload: null,
                created_at: new Date().toISOString()
            }]);
        } catch (auditErr) {
            // Audit log failure is non-critical
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

        const admin = await validateAdminSession(token);
        if (!admin) return NextResponse.json({ success: false, error: 'Invalid or expired admin session' }, { status: 401 });

        const body = await request.json();
        const { id } = body;
        if (!id) return NextResponse.json({ success: false, error: 'Missing id for delete' }, { status: 400 });

        const { error } = await supabaseAdmin.from('reviews').delete().eq('id', id);
        if (error) {
            return NextResponse.json({ success: false, error: error.message || error }, { status: 500 });
        }

        try {
            await supabaseAdmin.from('admin_audit').insert([{ admin_id: admin.id, action: 'delete', table_name: 'reviews', record_id: id, payload: null, created_at: new Date().toISOString() }]);
        } catch (auditErr) {
            // Audit log failure is non-critical
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
    }
}
