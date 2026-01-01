import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

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

        // Get auth users
        const { data: { users: authUsers }, error: authError } = await supabaseAdmin.auth.admin.listUsers();
        if (authError) throw authError;

        // Get profiles
        const { data: profiles, error: profilesError } = await supabaseAdmin
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (profilesError) throw profilesError;

        // Merge auth users with profiles
        const mergedUsers = (profiles || []).map(profile => {
            const authUser = authUsers?.find(u => u.id === profile.id);
            return {
                ...profile,
                email: authUser?.email || 'No email'
            };
        });

        return NextResponse.json({ users: mergedUsers });
    } catch (err: any) {
        return NextResponse.json(
            { error: err.message || 'Failed to fetch users' },
            { status: 500 }
        );
    }
}