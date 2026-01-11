// src/app/api/admin/memberships/[id]/delete/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });
        }

        const { id } = await context.params;
        const membershipId = parseInt(id);
        if (isNaN(membershipId)) {
            return NextResponse.json({ error: 'Invalid membership ID' }, { status: 400 });
        }

        // Get membership details before deletion
        const { data: membership, error: membershipError } = await supabaseAdmin
            .from('memberships')
            .select('*')
            .eq('id', membershipId)
            .single();

        if (membershipError || !membership) {
            return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
        }

        const wasActive = membership.status === 'active';

        // Delete associated addons first (foreign key constraint)
        await supabaseAdmin
            .from('membership_addons')
            .delete()
            .eq('membership_id', membershipId);

        // Delete associated payment records
        await supabaseAdmin
            .from('membership_payments')
            .delete()
            .eq('membership_id', membershipId);

        // Delete the membership
        const { error: deleteError } = await supabaseAdmin
            .from('memberships')
            .delete()
            .eq('id', membershipId);

        if (deleteError) {
            throw deleteError;
        }

        // If membership was active, notify the user
        if (wasActive) {
            const { error: notificationError } = await supabaseAdmin
                .from('notifications')
                .insert({
                    recipient_id: membership.user_id,
                    actor_role: 'admin',
                    type: 'membership_cancelled',
                    content: `Your ${membership.plan_name} membership has been cancelled by the admin.`,
                    is_read: false
                });

            if (notificationError) {
                // Don't throw - deletion is still successful
                console.error('Failed to send cancellation notification:', notificationError);
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Membership deleted successfully'
        });
    } catch (err: any) {
        return NextResponse.json(
            { error: err.message || 'Failed to delete membership' },
            { status: 500 }
        );
    }
}

