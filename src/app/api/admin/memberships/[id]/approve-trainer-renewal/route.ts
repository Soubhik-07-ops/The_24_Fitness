/**
 * Trainer Renewal Approval API
 * 
 * Admin endpoint to approve trainer renewal payments.
 * Atomically:
 * 1. Verifies payment
 * 2. Activates trainer addon
 * 3. Updates trainer assignment
 * 4. Extends trainer_period_end (cannot exceed membership end date)
 * 5. Clears trainer grace period
 * 6. Updates trainer visibility and chart responsibility
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';
import { calculateTrainerRenewalEndDate } from '@/lib/trainerRenewalEligibility';
import { logAuditEvent } from '@/lib/auditLog';
// Invoice generation will be called directly via route handler to avoid HTTP fetch issues

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

        // Membership must be active for trainer renewal
        if (membership.status !== 'active') {
            return NextResponse.json(
                { error: `Cannot approve trainer renewal. Membership status is '${membership.status}'. Trainer renewal requires an active membership.` },
                { status: 400 }
            );
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

        // Find associated trainer addon
        // Strategy: First try to find addon within time window, then try broader search
        const paymentDate = new Date(pendingPayment.created_at);
        const paymentAmount = parseFloat(pendingPayment.amount?.toString() || '0');

        // First: Try to find addon within 5 minutes window
        const timeWindowStart = new Date(paymentDate.getTime() - 300000); // 5 minutes before payment
        const timeWindowEnd = new Date(paymentDate.getTime() + 300000); // 5 minutes after payment

        let { data: trainerAddons, error: addonQueryError } = await supabaseAdmin
            .from('membership_addons')
            .select('*')
            .eq('membership_id', membershipId)
            .eq('addon_type', 'personal_trainer')
            .eq('status', 'pending')
            .gte('created_at', timeWindowStart.toISOString())
            .lte('created_at', timeWindowEnd.toISOString())
            .order('created_at', { ascending: false });

        // If no addons found in time window, try broader search (any pending addon for this membership)
        if ((!trainerAddons || trainerAddons.length === 0) && !addonQueryError) {
            console.log('No addon found in time window, trying broader search...');
            const broaderQuery = await supabaseAdmin
                .from('membership_addons')
                .select('*')
                .eq('membership_id', membershipId)
                .eq('addon_type', 'personal_trainer')
                .eq('status', 'pending')
                .order('created_at', { ascending: false })
                .limit(10);

            trainerAddons = broaderQuery.data;
            addonQueryError = broaderQuery.error;
        }

        if (addonQueryError) {
            console.error('Error querying trainer addons:', addonQueryError);
            return NextResponse.json(
                { error: 'Failed to query trainer addons', details: addonQueryError.message },
                { status: 500 }
            );
        }

        // Find the addon that matches the payment amount (most reliable matching)
        let trainerAddon = trainerAddons?.find(addon => {
            const addonPrice = parseFloat(addon.price?.toString() || '0');
            // Allow 10 rupee difference for rounding
            return Math.abs(addonPrice - paymentAmount) <= 10;
        }) || trainerAddons?.[0]; // Fallback to most recent if no exact match

        if (!trainerAddon) {
            // Log all pending addons for debugging
            console.error('No matching trainer addon found for payment:', {
                paymentId: pendingPayment.id,
                paymentAmount,
                paymentCreatedAt: pendingPayment.created_at,
                foundAddons: trainerAddons?.map(a => ({
                    id: a.id,
                    price: a.price,
                    created_at: a.created_at,
                    status: a.status
                })) || []
            });

            return NextResponse.json(
                {
                    error: 'No pending trainer addon found for this payment',
                    details: `Payment amount: ₹${paymentAmount}. No pending trainer addon found that matches this payment. The addon may not have been created during payment submission.`,
                    debug: {
                        paymentId: pendingPayment.id,
                        paymentAmount,
                        foundAddonsCount: trainerAddons?.length || 0,
                        foundAddons: trainerAddons?.map(a => ({
                            id: a.id,
                            price: a.price,
                            created_at: a.created_at
                        })) || []
                    }
                },
                { status: 404 }
            );
        }

        // Find associated trainer assignment (created around payment time)
        // First try time window, then broader search
        let { data: trainerAssignments, error: assignmentQueryError } = await supabaseAdmin
            .from('trainer_assignments')
            .select('*')
            .eq('membership_id', membershipId)
            .eq('status', 'pending')
            .eq('assignment_type', 'addon')
            .gte('created_at', timeWindowStart.toISOString())
            .lte('created_at', timeWindowEnd.toISOString())
            .order('created_at', { ascending: false });

        // If no assignments in time window, try broader search
        if ((!trainerAssignments || trainerAssignments.length === 0) && !assignmentQueryError) {
            const broaderQuery = await supabaseAdmin
                .from('trainer_assignments')
                .select('*')
                .eq('membership_id', membershipId)
                .eq('status', 'pending')
                .eq('assignment_type', 'addon')
                .order('created_at', { ascending: false })
                .limit(10);

            trainerAssignments = broaderQuery.data;
            assignmentQueryError = broaderQuery.error;
        }

        if (assignmentQueryError) {
            console.error('Error querying trainer assignments:', assignmentQueryError);
        }

        // Find assignment that matches the trainer addon (most reliable matching)
        const trainerAssignment = trainerAssignments?.find(assignment =>
            assignment.trainer_id === trainerAddon.trainer_id
        ) || trainerAssignments?.[0]; // Fallback to most recent if no exact match

        // If assignment doesn't exist, we'll create it during approval
        // This handles cases where the assignment wasn't created during payment submission

        // Get renewal duration and start date
        // Note: metadata column doesn't exist in membership_addons table
        // Trainer renewal is always 1 month, and starts from trainer_period_end or current date
        const durationMonths = 1; // Trainer renewal is fixed to 1 month
        const renewalStartDate = membership.trainer_period_end
            ? new Date(membership.trainer_period_end)
            : new Date();

        // Calculate trainer renewal end date (cannot exceed membership end date)
        const membershipEndDate = membership.membership_end_date || membership.end_date;
        if (!membershipEndDate) {
            return NextResponse.json(
                { error: 'Membership end date is missing. Cannot calculate trainer renewal period.' },
                { status: 400 }
            );
        }

        const trainerRenewalEndDate = calculateTrainerRenewalEndDate(
            renewalStartDate,
            durationMonths,
            membershipEndDate
        );

        // Verify payment amount matches trainer addon price
        // paymentAmount is already defined above (around line 99)
        const expectedAmount = parseFloat(trainerAddon.price?.toString() || '0');

        if (Math.abs(paymentAmount - expectedAmount) > 1) { // Allow 1 rupee difference
            return NextResponse.json(
                {
                    error: `Payment amount (₹${paymentAmount}) does not match trainer addon price (₹${expectedAmount})`,
                    paymentAmount,
                    expectedAmount
                },
                { status: 400 }
            );
        }

        // Reject all other pending payments for this membership
        const { error: rejectOtherPaymentsError } = await supabaseAdmin
            .from('membership_payments')
            .update({
                status: 'rejected',
                verified_by: adminAuthUserId,
                verified_at: new Date().toISOString()
            })
            .eq('membership_id', membershipId)
            .eq('status', 'pending')
            .neq('id', pendingPayment.id);

        if (rejectOtherPaymentsError) {
            console.error('Error rejecting other pending payments:', rejectOtherPaymentsError);
        }

        // Verify the payment
        const { error: verifyError } = await supabaseAdmin
            .from('membership_payments')
            .update({
                status: 'verified',
                verified_by: adminAuthUserId,
                verified_at: new Date().toISOString()
            })
            .eq('id', pendingPayment.id);

        if (verifyError) {
            console.error('Payment verification error:', verifyError);
            return NextResponse.json({
                error: 'Failed to verify payment',
                details: verifyError.message
            }, { status: 500 });
        }

        // Activate trainer addon
        const { error: addonUpdateError } = await supabaseAdmin
            .from('membership_addons')
            .update({
                status: 'active',
                trainer_id: trainerAddon.trainer_id
            })
            .eq('id', trainerAddon.id);

        if (addonUpdateError) {
            console.error('Error activating trainer addon:', addonUpdateError);
            return NextResponse.json({
                error: 'Failed to activate trainer addon',
                details: addonUpdateError.message
            }, { status: 500 });
        }

        // Update or create trainer assignment
        if (trainerAssignment) {
            // Update existing assignment
            const { error: assignmentUpdateError } = await supabaseAdmin
                .from('trainer_assignments')
                .update({
                    status: 'assigned',
                    period_start: renewalStartDate.toISOString(),
                    period_end: trainerRenewalEndDate.toISOString()
                })
                .eq('id', trainerAssignment.id);

            if (assignmentUpdateError) {
                console.error('Error updating trainer assignment:', assignmentUpdateError);
                return NextResponse.json({
                    error: 'Failed to update trainer assignment',
                    details: assignmentUpdateError.message
                }, { status: 500 });
            }
        } else {
            // Create new assignment if it doesn't exist
            const { error: assignmentCreateError } = await supabaseAdmin
                .from('trainer_assignments')
                .insert({
                    membership_id: membershipId,
                    trainer_id: trainerAddon.trainer_id,
                    assignment_type: 'addon',
                    status: 'assigned',
                    period_start: renewalStartDate.toISOString(),
                    period_end: trainerRenewalEndDate.toISOString()
                });

            if (assignmentCreateError) {
                console.error('Error creating trainer assignment:', assignmentCreateError);
                // Don't fail - assignment creation is not critical
            }
        }

        // Update membership with extended trainer period
        // Clear trainer grace period if it exists
        const membershipUpdateData: any = {
            trainer_assigned: true,
            trainer_id: trainerAddon.trainer_id,
            trainer_period_end: trainerRenewalEndDate.toISOString(),
            trainer_addon: true,
            trainer_grace_period_end: null // Clear grace period on renewal
        };

        const { error: membershipUpdateError } = await supabaseAdmin
            .from('memberships')
            .update(membershipUpdateData)
            .eq('id', membershipId)
            .eq('status', 'active'); // Only update if still active

        if (membershipUpdateError) {
            console.error('Error updating membership:', membershipUpdateError);
            return NextResponse.json({
                error: 'Failed to update membership trainer period',
                details: membershipUpdateError.message
            }, { status: 500 });
        }

        // Log audit event
        await logAuditEvent({
            membership_id: membershipId,
            action: 'trainer_renewal_approved',
            admin_id: adminAuthUserId,
            admin_email: admin.email,
            previous_status: membership.trainer_period_end || 'expired',
            new_status: trainerRenewalEndDate.toISOString(),
            details: `Trainer renewal approved. Extended trainer period to ${trainerRenewalEndDate.toISOString()}. Duration: ${durationMonths} month(s).`,
            metadata: {
                payment_id: pendingPayment.id,
                addon_id: trainerAddon.id,
                assignment_id: trainerAssignment?.id || null,
                trainer_id: trainerAddon.trainer_id,
                duration_months: durationMonths,
                renewal_start_date: renewalStartDate.toISOString(),
                renewal_end_date: trainerRenewalEndDate.toISOString()
            }
        });

        // Create notification for user
        const { data: trainer } = await supabaseAdmin
            .from('trainers')
            .select('name')
            .eq('id', trainerAddon.trainer_id)
            .single();

        const { error: notificationError } = await supabaseAdmin
            .from('notifications')
            .insert({
                recipient_id: membership.user_id,
                actor_role: 'admin',
                type: 'trainer_renewal_approved',
                content: `Your trainer access renewal has been approved. ${trainer?.name || 'Trainer'} access extended until ${trainerRenewalEndDate.toLocaleDateString()}.`,
                is_read: false,
                metadata: {
                    membership_id: membershipId,
                    trainer_id: trainerAddon.trainer_id,
                    trainer_name: trainer?.name,
                    renewal_end_date: trainerRenewalEndDate.toISOString()
                }
            });

        if (notificationError) {
            console.error('Failed to create notification:', notificationError);
        }

        // Generate invoice for trainer renewal payment
        // CRITICAL: Call invoice generation directly (internal route handler) instead of HTTP fetch
        // This avoids network issues in development and ensures it works in all environments
        console.log('[TRAINER RENEWAL APPROVAL] Triggering invoice generation', {
            paymentId: pendingPayment.id,
            membershipId,
            payment_purpose: pendingPayment.payment_purpose,
            paymentAmount: pendingPayment.amount,
            paymentStatus: pendingPayment.status, // Should be 'verified' now
            trainerId: trainerAddon.trainer_id,
            addonId: trainerAddon.id
        });

        // Call invoice generation directly via internal route handler to avoid HTTP fetch issues
        try {
            // Dynamically import the invoice generation route handler
            const invoiceRoute = await import('@/app/api/admin/invoices/generate/route');

            // Create a mock request object for the invoice generation route
            const invoiceRequest = new NextRequest(
                new URL('/api/admin/invoices/generate', request.nextUrl.origin),
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        paymentId: pendingPayment.id,
                        membershipId,
                        invoiceType: 'trainer_renewal', // Fallback type if payment_purpose not set
                        adminEmail: admin.email
                    })
                }
            );

            // Call the POST handler directly
            const invoiceResponse = await invoiceRoute.POST(invoiceRequest);

            if (invoiceResponse.ok) {
                const invoiceData = await invoiceResponse.json();
                console.log('[TRAINER RENEWAL] Invoice generation completed successfully:', {
                    invoiceNumber: invoiceData.invoice?.invoiceNumber,
                    invoiceId: invoiceData.invoice?.id,
                    fileUrl: invoiceData.invoice?.fileUrl
                });
            } else {
                const errorData = await invoiceResponse.json().catch(() => ({}));
                console.error('[TRAINER RENEWAL] Invoice generation failed:', {
                    status: invoiceResponse.status,
                    statusText: invoiceResponse.statusText,
                    error: errorData
                });
            }
        } catch (err: any) {
            console.error('[TRAINER RENEWAL] Invoice generation error:', {
                error: err?.message,
                stack: err?.stack,
                paymentId: pendingPayment.id,
                membershipId
            });
            // Don't fail the approval if invoice generation fails - it's non-critical
            // But log it for investigation
        }

        // Send real-time notification to user
        try {
            const userChannel = supabaseAdmin.channel(`user_${membership.user_id}_notifications`);
            await userChannel.subscribe();
            await new Promise(resolve => setTimeout(resolve, 100));
            await userChannel.send({
                type: 'broadcast',
                event: 'notification',
                payload: {
                    type: 'trainer_renewal_approved',
                    content: `Your trainer access renewal has been approved.`
                }
            });
            await userChannel.unsubscribe();
        } catch (broadcastError) {
            console.error('Failed to send real-time broadcast:', broadcastError);
        }

        return NextResponse.json({
            success: true,
            message: 'Trainer renewal approved successfully',
            trainerRenewal: {
                membership_id: membershipId,
                trainer_id: trainerAddon.trainer_id,
                trainer_name: trainer?.name,
                renewal_start_date: renewalStartDate.toISOString(),
                renewal_end_date: trainerRenewalEndDate.toISOString(),
                duration_months: durationMonths
            }
        });

    } catch (error: any) {
        console.error('Error approving trainer renewal:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}

