// src/app/api/admin/memberships/[id]/reject/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession, getAdminTokenFromRequest } from '@/lib/adminAuth';
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
        const token = getAdminTokenFromRequest(request);
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });
        }

        const { id } = await context.params;
        const parsedId = parseInt(id);
        if (isNaN(parsedId)) {
            return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
        }

        const body = await request.json().catch(() => ({}));
        const reason = body.reason || 'No reason provided';
        const specificPaymentId = body.paymentId ? parseInt(body.paymentId) : null;

        // Resolve membership and target payment
        let membership: any = null;
        let targetPayment: any = null;

        // 1. Try finding membership with parsedId
        const { data: memData } = await supabaseAdmin
            .from('memberships')
            .select('*')
            .eq('id', parsedId)
            .maybeSingle();

        if (memData) {
            membership = memData;
        } else {
            // 2. Fallback: check if parsedId was actually a payment ID
            const { data: payData } = await supabaseAdmin
                .from('membership_payments')
                .select('*')
                .eq('id', parsedId)
                .maybeSingle();

            if (payData) {
                targetPayment = payData;
                const { data: relatedMem } = await supabaseAdmin
                    .from('memberships')
                    .select('*')
                    .eq('id', payData.membership_id)
                    .maybeSingle();
                membership = relatedMem;
            }
        }

        if (!membership) {
            return NextResponse.json({ error: 'Membership or Payment record not found' }, { status: 404 });
        }

        const membershipId = membership.id;

        // If targetPayment not determined yet, find specified paymentId or latest pending payment
        if (!targetPayment && specificPaymentId && !isNaN(specificPaymentId)) {
            const { data: specPay } = await supabaseAdmin
                .from('membership_payments')
                .select('*')
                .eq('id', specificPaymentId)
                .eq('membership_id', membershipId)
                .maybeSingle();
            targetPayment = specPay;
        }

        if (!targetPayment) {
            const { data: latestPending } = await supabaseAdmin
                .from('membership_payments')
                .select('*')
                .eq('membership_id', membershipId)
                .eq('status', 'pending')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            targetPayment = latestPending;
        }

        if (!targetPayment) {
            return NextResponse.json({ error: 'No pending payment found to reject for this membership' }, { status: 404 });
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
        const isRenewalPayment = targetPayment.payment_purpose === 'membership_renewal';
        const endDateStr = membership.membership_end_date || membership.end_date;
        const now = new Date();
        const hasFutureExpiry = endDateStr ? new Date(endDateStr) > now : false;

        // Check grace period boundary (up to 5 days past expiry)
        let isGracePeriod = false;
        if (endDateStr && !hasFutureExpiry) {
            const expiryDate = new Date(endDateStr);
            const diffDays = Math.ceil((now.getTime() - expiryDate.getTime()) / (1000 * 60 * 60 * 24));
            isGracePeriod = diffDays <= 5;
        }

        // Update ONLY the targeted payment record to rejected (membership_payments does not have a rejection_reason column)
        const { error: paymentUpdateError } = await supabaseAdmin
            .from('membership_payments')
            .update({
                status: 'rejected',
                verified_by: adminAuthUserId,
                verified_at: new Date().toISOString()
            })
            .eq('id', targetPayment.id);

        if (paymentUpdateError) {
            console.error('[REJECT] Error updating payment record:', paymentUpdateError);
            return NextResponse.json({ error: 'Failed to update payment record status' }, { status: 500 });
        }

        // Check if other genuine pending payments exist on this membership
        const { data: remainingPending } = await supabaseAdmin
            .from('membership_payments')
            .select('id')
            .eq('membership_id', membershipId)
            .eq('status', 'pending');

        const hasRemainingPending = remainingPending && remainingPending.length > 0;

        // Check if user has any verified historical payments
        const { count: verifiedCount } = await supabaseAdmin
            .from('membership_payments')
            .select('id', { count: 'exact', head: true })
            .eq('membership_id', membershipId)
            .eq('status', 'verified');

        const hasHistoricalVerified = (verifiedCount || 0) > 0;

        // Determine safe target membership status:
        let newStatus = 'rejected';
        if (hasRemainingPending) {
            newStatus = 'pending'; // Remain pending if another payment is still under review
        } else if (hasHistoricalVerified || isRenewalPayment || hasFutureExpiry) {
            if (hasFutureExpiry) {
                newStatus = 'active'; // Member still has valid paid days remaining
            } else if (isGracePeriod) {
                newStatus = 'grace_period'; // Member is in grace period window
            } else {
                newStatus = 'expired'; // Expired membership restored to expired for reactivation
            }
        }

        // Clean up temporary renewal_pending_plan from form_data on rejection and store rejection reason
        const cleanFormData = (typeof membership.form_data === 'object' && membership.form_data !== null) ? { ...membership.form_data } : {};
        delete cleanFormData.renewal_pending_plan;
        if (reason) {
            cleanFormData.rejection_reason = reason;
        }

        // Update membership status safely
        const { error: updateError } = await supabaseAdmin
            .from('memberships')
            .update({
                status: newStatus,
                admin_notes: reason ? `Rejected: ${reason}` : membership.admin_notes,
                form_data: cleanFormData,
                updated_at: new Date().toISOString()
            })
            .eq('id', membershipId);

        // Cancel pending renewal addons or assignments for this rejected renewal
        if (!hasRemainingPending && (isRenewalPayment || hasFutureExpiry || hasHistoricalVerified)) {
            await supabaseAdmin
                .from('membership_addons')
                .update({ status: 'cancelled' })
                .eq('membership_id', membershipId)
                .eq('status', 'pending');

            await supabaseAdmin
                .from('trainer_assignments')
                .update({ status: 'cancelled' })
                .eq('membership_id', membershipId)
                .eq('status', 'pending');
        }

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
                new_status: newStatus,
                details: `Failed to reject payment: ${updateError.message}`,
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
            new_status: newStatus,
            details: isRenewalPayment || hasFutureExpiry
                ? `Renewal payment rejected. Reason: ${reason}. Active membership status safely restored to '${newStatus}'.`
                : `Initial membership application rejected. Reason: ${reason}`,
            metadata: { reason, plan_name: membership.plan_name, isRenewalPayment, targetStatus: newStatus }
        });

        // Notification content tailored to renewal vs initial application
        const notificationContent = isRenewalPayment || hasFutureExpiry
            ? `Your renewal payment verification was rejected: ${reason}. Your current membership access remains intact until expiry. You can re-submit your payment proof with correct details from the renewal page.`
            : `Your ${membership.plan_name} membership application has been rejected. Reason: ${reason}`;

        // Create notification for user
        const { data: notificationData, error: notificationError } = await supabaseAdmin
            .from('notifications')
            .insert({
                recipient_id: membership.user_id,
                actor_role: 'admin',
                type: 'membership_rejected',
                content: notificationContent,
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
            message: 'Payment rejected successfully',
            paymentId: targetPayment.id,
            membershipId,
            status: newStatus
        });
    } catch (err: any) {
        return NextResponse.json(
            { error: err.message || 'Failed to reject membership' },
            { status: 500 }
        );
    }
}

