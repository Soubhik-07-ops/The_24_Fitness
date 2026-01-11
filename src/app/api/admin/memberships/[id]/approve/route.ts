// src/app/api/admin/memberships/[id]/approve/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';
import { calculateTrainerPeriod, assignTrainerToMembership, createTrainerAssignmentRequest, type TrainerAssignmentConfig } from '@/lib/trainerAssignment';

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

        // Check if this is a renewal (has multiple verified payments)
        const { data: allPayments } = await supabaseAdmin
            .from('membership_payments')
            .select('*')
            .eq('membership_id', membershipId)
            .eq('status', 'verified');

        const isRenewal = allPayments && allPayments.length > 1;

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

        // For renewals, extend dates; for new memberships, create new dates
        let startDate: Date;
        let endDate: Date;

        if (isRenewal) {
            // Renewal: extend from current end date
            const currentEndDate = membership.membership_end_date
                ? new Date(membership.membership_end_date)
                : new Date();
            startDate = currentEndDate > new Date() ? currentEndDate : new Date();
            endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + membership.duration_months);
        } else {
            // New membership: create new dates
            startDate = new Date();
            endDate = new Date();
            endDate.setMonth(endDate.getMonth() + membership.duration_months);
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
        const planName = membership.plan_name.toLowerCase();
        let trainerId: string | null = null;
        let trainerPeriodEnd: Date | null = null;

        if (pendingAssignment) {
            // Use the trainer from pending assignment
            trainerId = pendingAssignment.trainer_id;

            // Recalculate period with actual start date
            const assignmentConfig: TrainerAssignmentConfig = {
                planName: membership.plan_name,
                planMode: membership.plan_mode || 'Online',
                hasTrainerAddon: hasTrainerAddon,
                selectedTrainerId: trainerId,
                durationMonths: membership.duration_months
            };

            const { periodEnd } = calculateTrainerPeriod(startDate, assignmentConfig);
            trainerPeriodEnd = periodEnd;

            // Update assignment with correct dates and status to 'assigned'
            // Note: We don't set assigned_by because admin ID might not be in users table
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
                // Don't throw - continue with approval
            } else {
                console.log('[APPROVE] Successfully updated trainer assignment status to assigned:', {
                    assignmentId: pendingAssignment.id,
                    membershipId,
                    trainerId
                });
            }
        } else if (planName === 'premium' || planName === 'elite') {
            // Premium/Elite plans include trainer, but no assignment request yet
            // Admin needs to assign trainer manually (this will be handled in admin panel)
            // For now, we'll just note that trainer assignment is needed
            console.log(`Plan ${planName} includes trainer - admin should assign trainer via admin panel`);
        }

        // Update membership status to approved and set dates
        const updateData: any = {
            status: 'approved',
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString(),
            membership_start_date: startDate.toISOString(),
            membership_end_date: endDate.toISOString()
        };

        // If trainer is assigned, update trainer fields
        if (trainerId && trainerPeriodEnd) {
            updateData.trainer_assigned = true;
            updateData.trainer_id = trainerId;
            updateData.trainer_period_end = trainerPeriodEnd.toISOString();
            updateData.trainer_addon = hasTrainerAddon;
        }

        const { error: updateError } = await supabaseAdmin
            .from('memberships')
            .update(updateData)
            .eq('id', membershipId);

        if (updateError) {
            throw updateError;
        }

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

        // After approval, activate the membership
        const { error: activateError } = await supabaseAdmin
            .from('memberships')
            .update({ status: 'active' })
            .eq('id', membershipId);

        if (activateError) {
            // Don't throw - approval is still successful
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

