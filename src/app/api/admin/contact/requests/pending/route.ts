import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', { auth: { autoRefreshToken: false, persistSession: false } });

export async function GET(request: NextRequest) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        const admin = await validateAdminSession(token);
        if (!admin) return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });

        // Prefer PostgREST join when FK exists; fallback to manual hydration otherwise
        try {
            const { data: joined, error: joinErr } = await supabaseAdmin
                .from('contact_requests')
                .select('id, user_id, subject, message, status, created_at, profiles(full_name, email)')
                .eq('status', 'pending')
                .order('created_at', { ascending: true });
            if (joinErr) throw joinErr;
            const mapped = (joined || []).map((r: any) => ({
                id: r.id,
                user_id: r.user_id,
                subject: r.subject,
                message: r.message,
                status: r.status,
                created_at: r.created_at,
                full_name: r.profiles?.full_name ?? null,
                email: r.profiles?.email ?? null
            }));
            return NextResponse.json({ requests: mapped });
        } catch (_ignored) {
            const { data: requests, error } = await supabaseAdmin
                .from('contact_requests')
                .select('id, user_id, subject, message, status, created_at')
                .eq('status', 'pending')
                .order('created_at', { ascending: true });
            if (error) throw error;

            const list = requests || [];
            const userIds = Array.from(new Set(list.map((r: any) => r.user_id))).filter(Boolean);
            let profiles: Record<string, { full_name: string | null; email: string | null }> = {};
            if (userIds.length > 0) {
                const { data: profs } = await supabaseAdmin
                    .from('profiles')
                    .select('id, full_name, email')
                    .in('id', userIds as string[]);
                if (profs) {
                    profiles = Object.fromEntries(profs.map((p: any) => [p.id, { full_name: p.full_name, email: p.email }]));
                }
            }
            const hydrated = list.map((r: any) => ({
                ...r,
                full_name: profiles[r.user_id]?.full_name || null,
                email: profiles[r.user_id]?.email || null
            }));
            return NextResponse.json({ requests: hydrated });
        }
    } catch (err: any) {
        console.error('Admin pending contact requests error:', err);
        return NextResponse.json({ error: err.message || 'Failed to fetch requests' }, { status: 500 });
    }
}


