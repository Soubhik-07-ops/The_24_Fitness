/**
 * Trainer Renewal Rejection API
 * 
 * Admin endpoint to reject trainer renewal payments.
 */

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

        const body = await request.json();
        const { reason } = body;

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

        const { id } = await context.params;
        const membershipId = parseInt(id);
        if (isNaN(membershipId)) {
            return NextResponse.json({ error: 'Invalid membership ID' }, { status: 400 });
        }

        // Get membership details
        const { data: membership, error: membershipError } = await supabaseAdmin
            .from('memberships')
            .select('*')
            .eq('id', membershipId)
            .single();

        if (membershipError || !membership) {
            return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
        }

        // Find pending trainer renewal payment
        const { data: pendingPayment } = await supabaseAdmin
            .from('membership_payments')
            .select('*')
            .eq('membership_id', membershipId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (!pendingPayment) {
            return NextResponse.json(
                { error: 'No pending payment found for trainer renewal' },
                { status: 404 }
            );
        }

        // Find associated trainer addon and assignment
        const { data: trainerAddon } = await supabaseAdmin
            .from('membership_addons')
            .select('*')
            .eq('membership_id', membershipId)
            .eq('addon_type', 'personal_trainer')
            .eq('status', 'pending')
            .gt('created_at', pendingPayment.created_at)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        const { data: trainerAssignment } = await supabaseAdmin
            .from('trainer_assignments')
            .select('*')
            .eq('membership_id', membershipId)
            .eq('status', 'pending')
            .eq('assignment_type', 'addon')
            .gt('created_at', pendingPayment.created_at)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        // Reject the payment
        const { error: rejectError } = await supabaseAdmin
            .from('membership_payments')
            .update({
                status: 'rejected',
                verified_by: adminAuthUserId,
                verified_at: new Date().toISOString()
            })
            .eq('id', pendingPayment.id);

        if (rejectError) {
            console.error('Error rejecting payment:', rejectError);
            return NextResponse.json({
                error: 'Failed to reject payment',
                details: rejectError.message
            }, { status: 500 });
        }

        // Delete pending trainer addon and assignment if they exist
        if (trainerAddon) {
            await supabaseAdmin
                .from('membership_addons')
                .delete()
                .eq('id', trainerAddon.id);
        }

        if (trainerAssignment) {
            await supabaseAdmin
                .from('trainer_assignments')
                .delete()
                .eq('id', trainerAssignment.id);
        }

        // Log audit event
        await logAuditEvent({
            membership_id: membershipId,
            action: 'trainer_renewal_rejected',
            admin_id: adminAuthUserId,
            admin_email: admin.email,
            previous_status: 'pending',
            new_status: 'rejected',
            details: `Trainer renewal payment rejected. Reason: ${reason || 'No reason provided'}`,
            metadata: {
                payment_id: pendingPayment.id,
                addon_id: trainerAddon?.id || null,
                assignment_id: trainerAssignment?.id || null,
                rejection_reason: reason || 'No reason provided'
            }
        });

        // Create notification for user
        const { error: notificationError } = await supabaseAdmin
            .from('notifications')
            .insert({
                recipient_id: membership.user_id,
                actor_role: 'admin',
                type: 'trainer_renewal_rejected',
                content: `Your trainer access renewal payment has been rejected.${reason ? ` Reason: ${reason}` : ''} Please contact admin for more information.`,
                is_read: false,
                metadata: {
                    membership_id: membershipId,
                    payment_id: pendingPayment.id,
                    rejection_reason: reason || 'No reason provided'
                }
            });

        if (notificationError) {
            console.error('Failed to create notification:', notificationError);
        }

        return NextResponse.json({
            success: true,
            message: 'Trainer renewal payment rejected successfully'
        });

    } catch (error: any) {
        console.error('Error rejecting trainer renewal:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}

