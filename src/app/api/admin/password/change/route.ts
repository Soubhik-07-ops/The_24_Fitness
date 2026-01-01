import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession, verifyPassword, hashPassword } from '@/lib/adminAuth';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Change admin password
export async function POST(request: NextRequest) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('admin_token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
        }

        const body = await request.json();
        const { currentPassword, newPassword } = body;

        if (!currentPassword || !newPassword) {
            return NextResponse.json({ error: 'Current password and new password are required' }, { status: 400 });
        }

        if (newPassword.length < 8) {
            return NextResponse.json({ error: 'New password must be at least 8 characters long' }, { status: 400 });
        }

        // Get current password hash
        const { data: adminData, error: fetchError } = await supabaseAdmin
            .from('admins')
            .select('password_hash')
            .eq('id', admin.id)
            .single();

        if (fetchError || !adminData) {
            return NextResponse.json({ error: 'Failed to fetch admin data' }, { status: 500 });
        }

        if (!adminData.password_hash) {
            return NextResponse.json({ error: 'No password set. Please contact system administrator.' }, { status: 400 });
        }

        // Verify current password
        const isCurrentPasswordValid = await verifyPassword(currentPassword, adminData.password_hash);
        if (!isCurrentPasswordValid) {
            return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
        }

        // Hash new password
        const newPasswordHash = await hashPassword(newPassword);

        // Update password
        const { error: updateError } = await supabaseAdmin
            .from('admins')
            .update({ password_hash: newPasswordHash })
            .eq('id', admin.id);

        if (updateError) {
            return NextResponse.json({ error: 'Failed to update password' }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Password changed successfully' });
    } catch (err: any) {
        return NextResponse.json(
            { error: err.message || 'Failed to change password' },
            { status: 500 }
        );
    }
}

