// src/app/api/admin/memberships/[id]/approve/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';
import { calculateTrainerPeriod, assignTrainerToMembership, createTrainerAssignmentRequest, type TrainerAssignmentConfig } from '@/lib/trainerAssignment';
import { addMonths } from '@/lib/membershipUtils';
import { logAuditEvent } from '@/lib/auditLog';
import { getRenewalInfo } from '@/lib/renewalTracking';
import { shouldReactivateMembership, calculateGracePeriodEnd } from '@/lib/gracePeriod';
import { generateInvoiceAsync } from '@/lib/invoiceService';

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

        // Get membership details
        const { data: membership, error: membershipError } = await supabaseAdmin
            .from('memberships')
            .select('*')
            .eq('id', membershipId)
            .single();

        if (membershipError || !membership) {
            return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
        }

        // Validate membership status before approval
        // Allow approval for 'pending' (new purchase) or 'grace_period' (renewal)
        if (membership.status !== 'pending' && membership.status !== 'grace_period') {
            return NextResponse.json({
                error: `Cannot approve membership. Current status is '${membership.status}'. Only memberships with 'pending' (new purchase) or 'grace_period' (renewal) status can be approved.`,
                currentStatus: membership.status
            }, { status: 400 });
        }

        // Get admin's auth user ID (if exists) for verified_by field
        // The verified_by column references auth.users(id), not admins.id
        // Try to find admin's auth user by email
        let adminAuthUserId: string | null = null;
        try {
            const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
            const authUser = users?.find(u => u.email === admin.email);
            if (authUser?.id) {
                adminAuthUserId = authUser.id;
            }
        } catch (authError) {
            // If we can't find admin's auth.users entry, we'll set verified_by to null
            console.log('Admin does not have auth.users entry, verified_by will be null');
        }

        // Determine if this is a renewal using explicit renewal tracking
        // Prefer renewal_of_membership_id field if available (explicit tracking)
        // Fallback to payment count for backward compatibility with old data
        const renewalInfo = getRenewalInfo(membership);
        let isRenewal: boolean = renewalInfo.isRenewal;

        // If not explicitly marked as renewal, check payment count (backward compatibility)
        if (!isRenewal) {
        const { data: allPayments } = await supabaseAdmin
            .from('membership_payments')
            .select('*')
            .eq('membership_id', membershipId)
            .eq('status', 'verified');

            // Legacy: Consider it a renewal if more than 1 verified payment exists
            isRenewal = Boolean(allPayments && allPayments.length > 1);
        }

        // Verify payment - for both renewals and new memberships
        // Find the most recent pending payment (could be renewal or initial payment)
        const { data: pendingPayment } = await supabaseAdmin
            .from('membership_payments')
            .select('*')
            .eq('membership_id', membershipId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (pendingPayment) {
            // First, reject all other pending payments for this membership (to prevent multiple approvals)
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
                // Don't fail - continue with verification
            }

            // Verify the selected payment
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
                    error: isRenewal ? 'Failed to verify renewal payment' : 'Failed to verify payment',
                    details: verifyError.message
                }, { status: 500 });
            }
        }

        // Check if there is a pending plan switch stored in form_data.renewal_pending_plan
        const pendingPlan = (membership.form_data && typeof membership.form_data === 'object')
            ? membership.form_data.renewal_pending_plan
            : null;

        let finalPlanName = membership.plan_name;
        let finalPlanType = membership.plan_type;
        let finalDuration = Number(membership.duration_months) || 1;
        let finalPrice = membership.price;

        if (pendingPlan) {
            if (pendingPlan.planName) finalPlanName = String(pendingPlan.planName).toLowerCase();
            if (pendingPlan.planType) finalPlanType = pendingPlan.planType;
            if (pendingPlan.durationMonths) finalDuration = Number(pendingPlan.durationMonths);
            if (pendingPlan.price) finalPrice = Number(pendingPlan.price);
            console.log('[APPROVE] Applying pending plan switch upon approval:', {
                membershipId,
                finalPlanName,
                finalPlanType,
                finalDuration,
                finalPrice
            });
        }

        // Authoritative Date Calculations:
        // - Active renewal: current end date is strictly in the future.
        //   Extend from current end date so the member does NOT lose any paid days.
        // - Expired renewal / grace period or new purchase:
        //   Start fresh from today (approval date), so no unintended free time is granted.
        const now = new Date();
        const currentEndDateStr = membership.membership_end_date || membership.end_date;
        const currentEndDate = currentEndDateStr ? new Date(currentEndDateStr) : null;
        const isActiveRenewal = isRenewal && currentEndDate !== null && currentEndDate > now;

        let startDate: Date;
        let endDate: Date;

        if (isActiveRenewal && currentEndDate) {
            startDate = membership.membership_start_date
                ? new Date(membership.membership_start_date)
                : (membership.start_date ? new Date(membership.start_date) : now);
            endDate = addMonths(currentEndDate, finalDuration);
            console.log('[APPROVE] Active renewal - extending from current end date without lost days:', {
                membershipId,
                currentEndDate: currentEndDate.toISOString(),
                newEndDate: endDate.toISOString(),
                durationMonths: finalDuration
            });
        } else {
            startDate = now;
            endDate = addMonths(startDate, finalDuration);
            console.log('[APPROVE] New membership or expired renewal - starting fresh from approval date (no free time):', {
                membershipId,
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                durationMonths: finalDuration
            });
        }

        // Get membership addons to check for trainer
        const { data: addons, error: addonsError } = await supabaseAdmin
            .from('membership_addons')
            .select('*')
            .eq('membership_id', membershipId)
            .eq('addon_type', 'personal_trainer');

        if (addonsError) {
            console.error('[APPROVE] Error fetching addons:', addonsError);
        }

        console.log('[APPROVE] Found addons:', {
            membershipId,
            addonsCount: addons?.length || 0,
            addons: addons?.map(a => ({ id: a.id, status: a.status, trainer_id: a.trainer_id }))
        });

        const hasTrainerAddon = Boolean(addons && addons.length > 0);
        const trainerAddon = hasTrainerAddon ? addons![0] : null;

        // Check if there's a pending trainer assignment request
        const { data: pendingAssignment } = await supabaseAdmin
            .from('trainer_assignments')
            .select('*')
            .eq('membership_id', membershipId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        // Determine trainer assignment logic
        let trainerId: string | null = null;
        let trainerPeriodEnd: Date | null = null;

        if (pendingAssignment) {
            // Use the trainer from pending assignment
            trainerId = pendingAssignment.trainer_id;

            // Recalculate period with actual start date
            const assignmentConfig: TrainerAssignmentConfig = {
                planName: finalPlanName,
                planMode: finalPlanType === 'in_gym' ? 'InGym' : 'Online',
                hasTrainerAddon: hasTrainerAddon,
                selectedTrainerId: trainerId,
                durationMonths: finalDuration
            };

            const { periodEnd } = calculateTrainerPeriod(startDate, assignmentConfig);
            
            // Ensure trainer period never exceeds membership end date
            trainerPeriodEnd = periodEnd > endDate ? endDate : periodEnd;
            
            console.log('[APPROVE] Trainer period calculated:', {
                membershipId,
                finalPlanName,
                membershipStartDate: startDate.toISOString(),
                membershipEndDate: endDate.toISOString(),
                calculatedTrainerPeriodEnd: periodEnd.toISOString(),
                finalTrainerPeriodEnd: trainerPeriodEnd.toISOString()
            });

            // Update assignment with correct dates and status to 'assigned'
            const { error: assignmentUpdateError } = await supabaseAdmin
                .from('trainer_assignments')
                .update({
                    status: 'assigned',
                    period_start: startDate.toISOString(),
                    period_end: periodEnd.toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', pendingAssignment.id);

            if (assignmentUpdateError) {
                console.error('[APPROVE] Error updating trainer assignment:', {
                    error: assignmentUpdateError,
                    assignmentId: pendingAssignment.id,
                    membershipId
                });
            } else {
                console.log('[APPROVE] Successfully updated trainer assignment status to assigned:', {
                    assignmentId: pendingAssignment.id,
                    membershipId,
                    trainerId
                });
            }
        } else if (finalPlanName.includes('premium') || finalPlanName.includes('elite')) {
            console.log(`Plan ${finalPlanName} includes trainer - admin should assign trainer via admin panel`);
        }

        // Check if this is a grace period reactivation (renewal during grace period)
        const isGracePeriodReactivation = shouldReactivateMembership(membership.status, membership.grace_period_end);

        // Prepare updated form_data (removing temporary renewal_pending_plan)
        const updatedFormData = { ...(membership.form_data || {}) };
        if (pendingPlan) {
            delete updatedFormData.renewal_pending_plan;
        }

        // Update membership status to active, set authoritative dates, and apply approved plan
        const updateData: any = {
            status: 'active',
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString(),
            membership_start_date: startDate.toISOString(),
            membership_end_date: endDate.toISOString(),
            plan_name: finalPlanName,
            plan_type: finalPlanType,
            duration_months: finalDuration,
            price: finalPrice,
            form_data: updatedFormData,
            updated_at: new Date().toISOString()
        };

        // Clear grace period end if reactivating from grace period
        if (isGracePeriodReactivation) {
            updateData.grace_period_end = null;
        }

        // If trainer is assigned, update trainer fields
        if (trainerId && trainerPeriodEnd) {
            updateData.trainer_assigned = true;
            updateData.trainer_id = trainerId;
            updateData.trainer_period_end = trainerPeriodEnd.toISOString();
            updateData.trainer_addon = hasTrainerAddon;
        }

        // Activate any pending addons for this membership upon approval
        await supabaseAdmin
            .from('membership_addons')
            .update({ status: 'active', updated_at: new Date().toISOString() })
            .eq('membership_id', membershipId)
            .eq('status', 'pending');

        // Use conditional update to prevent race conditions - only update if still 'pending' or 'grace_period'
        const { error: updateError, data: updatedMembership } = await supabaseAdmin
            .from('memberships')
            .update(updateData)
            .eq('id', membershipId)
            .in('status', ['pending', 'grace_period']) // Only update if still pending or grace_period (prevents race conditions)
            .select()
            .single();

        if (updateError || !updatedMembership) {
            console.error('[APPROVE] Critical error updating membership:', {
                error: updateError,
                membershipId,
                updateData,
                membershipStatus: membership.status
            });
            await logAuditEvent({
                membership_id: membershipId,
                action: 'status_changed',
                admin_id: adminAuthUserId,
                admin_email: admin.email,
                previous_status: membership.status,
                new_status: 'active',
                details: `Failed to update membership: ${updateError?.message || 'Status changed before approval'} - Membership may have been modified concurrently`,
                metadata: { error: updateError?.message, updateData, membershipStatus: membership.status }
            });

            // If payment was verified, we should potentially rollback, but Supabase doesn't support transactions easily
            // Log the error and return appropriate message
            return NextResponse.json({
                error: `Failed to approve membership. Membership status may have changed (current: ${membership.status}). Please refresh and try again.`,
                details: updateError?.message || 'Status changed before approval'
            }, { status: 409 }); // 409 Conflict
        }

        // Log successful approval to audit trail
        await logAuditEvent({
            membership_id: membershipId,
            action: 'approved',
            admin_id: adminAuthUserId,
            admin_email: admin.email,
            previous_status: membership.status,
            new_status: 'active',
            details: `Membership approved and activated. Plan: ${membership.plan_name}, Duration: ${membership.duration_months} months`,
            metadata: {
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString(),
                is_renewal: isRenewal,
                trainer_assigned: !!trainerId
            }
        });

        // If trainer was assigned, update assignment status
        // Note: We already updated the assignment status above, so we don't need to call assignTrainerToMembership
        // which might fail due to assigned_by foreign key constraint
        // The assignment status is already set to 'assigned' in the update above
        if (trainerId && pendingAssignment) {
            console.log('[APPROVE] Trainer assignment already updated above, skipping assignTrainerToMembership call');
        }

        // Update trainer addon status to 'active' if trainer addon exists
        // IMPORTANT: Update ALL pending trainer addons, not just one
        if (hasTrainerAddon && addons && addons.length > 0) {
            const pendingAddons = addons.filter(a => a.status === 'pending');
            console.log('[APPROVE] Updating trainer addon status:', {
                membershipId,
                totalAddons: addons.length,
                pendingAddons: pendingAddons.length,
                trainerId,
                hasPendingAssignment: !!pendingAssignment
            });

            if (pendingAddons.length > 0) {
                // Update all pending trainer addons to active
                // Also update trainer_id if trainer is assigned and addon doesn't have it
                const addonIds = pendingAddons.map(a => a.id);
                const updateData: any = { status: 'active' };

                // If trainer is assigned and any addon doesn't have trainer_id, set it
                if (trainerId) {
                    const addonsNeedingTrainerId = pendingAddons.filter(a => !a.trainer_id);
                    if (addonsNeedingTrainerId.length > 0) {
                        updateData.trainer_id = trainerId;
                        console.log('[APPROVE] Also updating trainer_id for addons:', {
                            addonIds: addonsNeedingTrainerId.map(a => a.id),
                            trainerId
                        });
                    }
                }

                const { data: updatedAddons, error: addonUpdateError } = await supabaseAdmin
                    .from('membership_addons')
                    .update(updateData)
                    .in('id', addonIds)
                    .select();

                if (addonUpdateError) {
                    console.error('[APPROVE] Error updating trainer addon status:', {
                        error: addonUpdateError,
                        addonIds,
                        membershipId
                    });
                    // Don't throw - membership approval is still successful
                } else {
                    console.log('[APPROVE] Successfully updated trainer addon status to active:', {
                        updatedCount: updatedAddons?.length || 0,
                        addonIds,
                        membershipId
                    });
                }
            } else {
                console.log('[APPROVE] No pending trainer addons to update:', {
                    membershipId,
                    addonsStatuses: addons.map(a => ({ id: a.id, status: a.status }))
                });
            }
        } else {
            console.log('[APPROVE] No trainer addons found to update:', {
                membershipId,
                hasTrainerAddon,
                addonsCount: addons?.length || 0
            });
        }

        // Create notification for user
        const { data: notificationData, error: notificationError } = await supabaseAdmin
            .from('notifications')
            .insert({
                recipient_id: membership.user_id,
                actor_role: 'admin',
                type: 'membership_approved',
                content: `Your ${membership.plan_name} membership has been approved and is now active.`,
                is_read: false
            })
            .select()
            .single();

        if (notificationError) {
            // Don't throw - membership approval is still successful
            console.error('Failed to create notification:', notificationError);
        } else {
            // Send real-time broadcast to ensure instant notification
            try {
                const realtimeChannel = supabaseAdmin.channel(`notify_user_${membership.user_id}`);
                await realtimeChannel.subscribe();
                await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to ensure subscription
                await realtimeChannel.send({
                    type: 'broadcast',
                    event: 'membership_approved',
                    payload: {
                        notificationId: notificationData?.id,
                        membershipId: membershipId,
                        content: `Your ${membership.plan_name} membership has been approved and is now active.`
                    }
                });
                await realtimeChannel.unsubscribe();
            } catch (broadcastError) {
                console.error('Failed to send real-time broadcast:', broadcastError);
                // Don't throw - notification is still created in DB
            }
        }

        // Generate invoice for approved payment (non-blocking)
        // Note: Invoice generation is done asynchronously to not block approval
        // Invoice type will be determined from payment.payment_purpose in the invoice generation API
        if (pendingPayment) {
            // Determine invoice type from payment_purpose (explicit intent) or fallback to isRenewal
            let invoiceType: 'initial' | 'renewal' | 'trainer_renewal';
            
            if (pendingPayment.payment_purpose === 'trainer_renewal') {
                invoiceType = 'trainer_renewal';
            } else if (pendingPayment.payment_purpose === 'membership_renewal') {
                invoiceType = 'renewal';
            } else if (pendingPayment.payment_purpose === 'initial_purchase') {
                invoiceType = 'initial';
            } else {
                // Backward compatibility: infer from isRenewal if payment_purpose not set
                invoiceType = isRenewal ? 'renewal' : 'initial';
            }
            
            // Generate invoice asynchronously (don't await - non-blocking)
            // Invoice generation API will use payment_purpose as source of truth
            generateInvoiceAsync(pendingPayment.id, membershipId, invoiceType, admin.email, request.nextUrl.origin)
                .catch(err => console.error('[APPROVE] Invoice generation error (async):', err));
        }

        return NextResponse.json({
            success: true,
            message: 'Membership approved and activated successfully'
        });
    } catch (err: any) {
        return NextResponse.json(
            { error: err.message || 'Failed to approve membership' },
            { status: 500 }
        );
    }
}

