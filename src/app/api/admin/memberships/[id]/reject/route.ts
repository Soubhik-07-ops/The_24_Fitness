// src/app/api/admin/memberships/[id]/reject/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';
import { logAuditEvent } from '@/lib/auditLog';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

export async function POST(
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

        const body = await request.json();
        const reason = body.reason || 'No reason provided';

        // Get membership details
        const { data: membership, error: membershipError } = await supabaseAdmin
            .from('memberships')
            .select('*')
            .eq('id', membershipId)
            .single();

        if (membershipError || !membership) {
            return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
        }

        // Get admin's auth user ID for audit trail
        let adminAuthUserId: string | null = null;
        try {
            const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
            const authUser = users?.find(u => u.email === admin.email);
            if (authUser?.id) {
                adminAuthUserId = authUser.id;
            }
        } catch (authError) {
            console.log('Admin does not have auth.users entry for audit trail');
        }

        const previousStatus = membership.status;

        // Update membership status to rejected
        const { error: updateError } = await supabaseAdmin
            .from('memberships')
            .update({ status: 'rejected' })
            .eq('id', membershipId);

        if (updateError) {
            console.error('[REJECT] Critical error updating membership:', {
                error: updateError,
                membershipId
            });
            await logAuditEvent({
                membership_id: membershipId,
                action: 'rejected',
                admin_id: adminAuthUserId,
                admin_email: admin.email,
                previous_status: previousStatus,
                new_status: 'rejected',
                details: `Failed to reject membership: ${updateError.message}`,
                metadata: { error: updateError.message, reason }
            });
            throw updateError;
        }

        // Log successful rejection to audit trail
        await logAuditEvent({
            membership_id: membershipId,
            action: 'rejected',
            admin_id: adminAuthUserId,
            admin_email: admin.email,
            previous_status: previousStatus,
            new_status: 'rejected',
            details: `Membership rejected. Reason: ${reason}`,
            metadata: { reason, plan_name: membership.plan_name }
        });

        // Create notification for user
        const { data: notificationData, error: notificationError } = await supabaseAdmin
            .from('notifications')
            .insert({
                recipient_id: membership.user_id,
                actor_role: 'admin',
                type: 'membership_rejected',
                content: `Your ${membership.plan_name} membership application has been rejected. Reason: ${reason}`,
                is_read: false
            })
            .select()
            .single();

        if (notificationError) {
            // Don't throw - membership rejection is still successful
            console.error('Failed to create notification:', notificationError);
        } else {
            // Send real-time broadcast to ensure instant notification
            try {
                const realtimeChannel = supabaseAdmin.channel(`notify_user_${membership.user_id}`);
                await realtimeChannel.subscribe();
                await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to ensure subscription
                await realtimeChannel.send({
                    type: 'broadcast',
                    event: 'membership_rejected',
                    payload: {
                        notificationId: notificationData?.id,
                        membershipId: membershipId,
                        content: `Your ${membership.plan_name} membership application has been rejected. Reason: ${reason}`
                    }
                });
                await realtimeChannel.unsubscribe();
            } catch (broadcastError) {
                console.error('Failed to send real-time broadcast:', broadcastError);
                // Don't throw - notification is still created in DB
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Membership rejected successfully'
        });
    } catch (err: any) {
        return NextResponse.json(
            { error: err.message || 'Failed to reject membership' },
            { status: 500 }
        );
    }
}

