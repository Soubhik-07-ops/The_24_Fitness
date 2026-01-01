// src/app/api/admin/reviews/list/route.ts
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
        // Authenticate admin
        const token = request.cookies.get('admin_token')?.value;
        if (!token) {
            return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ success: false, error: 'Invalid or expired admin session' }, { status: 401 });
        }

        // Fetch ALL reviews using admin client (bypasses RLS)
        const { data: reviewsData, error: reviewsError } = await supabaseAdmin
            .from('reviews')
            .select('*')
            .order('created_at', { ascending: false });

        if (reviewsError) {
            return NextResponse.json({ success: false, error: reviewsError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, reviews: reviewsData || [] }, { status: 200 });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
    }
}

