// API route for admin to assign trainer to a membership

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';
import { calculateTrainerPeriod, assignTrainerToMembership, type TrainerAssignmentConfig } from '@/lib/trainerAssignment';

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
        const { trainerId } = body;

        if (!trainerId) {
            return NextResponse.json({ error: 'Trainer ID is required' }, { status: 400 });
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

        if (membership.status !== 'active') {
            return NextResponse.json({ error: 'Membership must be active to assign trainer' }, { status: 400 });
        }

        // Get trainer details
        const { data: trainer, error: trainerError } = await supabaseAdmin
            .from('trainers')
            .select('id, name')
            .eq('id', trainerId)
            .single();

        if (trainerError || !trainer) {
            return NextResponse.json({ error: 'Trainer not found' }, { status: 404 });
        }

        // Get addons to check if trainer addon exists
        const { data: addons } = await supabaseAdmin
            .from('membership_addons')
            .select('*')
            .eq('membership_id', membershipId)
            .eq('addon_type', 'personal_trainer');

        const hasTrainerAddon = Boolean(addons && addons.length > 0);

        // Calculate trainer period
        const membershipStartDate = membership.membership_start_date
            ? new Date(membership.membership_start_date)
            : membership.start_date
                ? new Date(membership.start_date)
                : new Date();

        const assignmentConfig: TrainerAssignmentConfig = {
            planName: membership.plan_name,
            planMode: membership.plan_mode || 'Online',
            hasTrainerAddon: hasTrainerAddon,
            selectedTrainerId: trainerId
        };

        const { periodStart, periodEnd } = calculateTrainerPeriod(membershipStartDate, assignmentConfig);

        // Check if trainer assignment already exists
        const { data: existingAssignment } = await supabaseAdmin
            .from('trainer_assignments')
            .select('id')
            .eq('membership_id', membershipId)
            .eq('trainer_id', trainerId)
            .eq('status', 'pending')
            .single();

        // Assign trainer
        const assignmentResult = await assignTrainerToMembership(
            membershipId,
            trainerId,
            admin.id,
            periodStart,
            periodEnd
        );

        if (!assignmentResult.success) {
            return NextResponse.json(
                { error: assignmentResult.error || 'Failed to assign trainer' },
                { status: 500 }
            );
        }

        // Update trainer addon status to 'active' if addon exists
        if (hasTrainerAddon && addons && addons.length > 0) {
            const pendingAddons = addons.filter(a => a.status === 'pending');
            console.log('[ASSIGN TRAINER] Updating trainer addon status:', {
                membershipId,
                trainerId,
                totalAddons: addons.length,
                pendingAddons: pendingAddons.length,
                addonsStatuses: addons.map(a => ({ id: a.id, status: a.status, trainer_id: a.trainer_id }))
            });

            if (pendingAddons.length > 0) {
                // Update all pending trainer addons for this membership to active
                // Also update trainer_id if it's null (for Basic plan addons)
                const addonIds = pendingAddons.map(a => a.id);
                const updateData: any = { status: 'active' };

                // If any addon doesn't have trainer_id, set it
                const addonsNeedingTrainerId = pendingAddons.filter(a => !a.trainer_id);
                if (addonsNeedingTrainerId.length > 0) {
                    updateData.trainer_id = trainerId;
                    console.log('[ASSIGN TRAINER] Also updating trainer_id for addons:', {
                        addonIds: addonsNeedingTrainerId.map(a => a.id),
                        trainerId
                    });
                }

                const { data: updatedAddons, error: addonUpdateError } = await supabaseAdmin
                    .from('membership_addons')
                    .update(updateData)
                    .in('id', addonIds)
                    .select();

                if (addonUpdateError) {
                    console.error('[ASSIGN TRAINER] Error updating trainer addon status:', {
                        error: addonUpdateError,
                        addonIds,
                        membershipId,
                        trainerId
                    });
                    // Don't fail - trainer assignment is still successful
                } else {
                    console.log('[ASSIGN TRAINER] Successfully updated trainer addon status to active:', {
                        updatedCount: updatedAddons?.length || 0,
                        addonIds,
                        membershipId,
                        trainerId
                    });
                }
            } else {
                console.log('[ASSIGN TRAINER] No pending trainer addons to update:', {
                    membershipId,
                    trainerId,
                    addonsStatuses: addons.map(a => ({ id: a.id, status: a.status }))
                });
            }
        } else {
            console.log('[ASSIGN TRAINER] No trainer addons found to update:', {
                membershipId,
                trainerId,
                hasTrainerAddon,
                addonsCount: addons?.length || 0
            });
        }

        // Get user profile for notification
        const { data: userProfile } = await supabaseAdmin
            .from('profiles')
            .select('full_name')
            .eq('id', membership.user_id)
            .single();

        const userName = userProfile?.full_name || 'A user';

        // Create notification for user
        const { data: userNotification } = await supabaseAdmin
            .from('notifications')
            .insert({
                recipient_id: membership.user_id,
                actor_role: 'admin',
                type: 'trainer_assigned',
                content: `Trainer ${trainer.name} has been assigned to your membership.`,
                is_read: false
            })
            .select()
            .single();

        // Send real-time notification to user
        if (userNotification) {
            try {
                const userChannel = supabaseAdmin.channel(`notify_user_${membership.user_id}`);
                await userChannel.subscribe();
                await new Promise(resolve => setTimeout(resolve, 100));
                await userChannel.send({
                    type: 'broadcast',
                    event: 'trainer_assigned',
                    payload: { notificationId: userNotification.id, trainerName: trainer.name }
                });
                await userChannel.unsubscribe();
            } catch (err) {
                console.error('Error sending real-time notification to user:', err);
            }
        }

        // Create notification for trainer
        const { data: trainerUser } = await supabaseAdmin
            .from('trainers')
            .select('user_id')
            .eq('id', trainerId)
            .single();

        if (trainerUser?.user_id) {
            // Create notification in notifications table (for user-facing notifications)
            const { data: trainerNotification } = await supabaseAdmin
                .from('notifications')
                .insert({
                    recipient_id: trainerUser.user_id,
                    actor_role: 'admin',
                    type: 'client_assigned',
                    content: `${userName} has been assigned as your client.`,
                    is_read: false
                })
                .select()
                .single();

            // Also create notification in trainer_notifications table for consistency
            try {
                await supabaseAdmin
                    .from('trainer_notifications')
                    .insert({
                        trainer_id: trainerId,
                        notification_type: 'client_assigned',
                        content: `${userName} has been assigned as your client.`,
                        reference_id: membershipId.toString(),
                        is_read: false
                    });
            } catch (trainerNotifErr) {
                console.error('Error creating trainer_notifications entry:', trainerNotifErr);
                // Don't fail - notification in notifications table is more important
            }

            // Send real-time notification to trainer
            if (trainerNotification) {
                try {
                    // Send to trainer-specific channel for toast notifications
                    const trainerChannel = supabaseAdmin.channel(`notify_trainer_${trainerId}`);
                    await trainerChannel.subscribe();
                    await new Promise(resolve => setTimeout(resolve, 150)); // Increased delay for better reliability
                    const sendResult = await trainerChannel.send({
                        type: 'broadcast',
                        event: 'client_assigned',
                        payload: {
                            notificationId: trainerNotification.id,
                            userName,
                            content: `${userName} has been assigned as your client.`
                        }
                    });
                    console.log('[ASSIGN TRAINER] Broadcast send result (trainer channel):', sendResult);
                    await new Promise(resolve => setTimeout(resolve, 100)); // Wait before unsubscribe
                    await trainerChannel.unsubscribe();

                    // Also send to trainer_notifications_bell channel for NotificationBell component
                    const bellChannel = supabaseAdmin.channel('trainer_notifications_bell');
                    await bellChannel.subscribe();
                    await new Promise(resolve => setTimeout(resolve, 150));
                    const bellSendResult = await bellChannel.send({
                        type: 'broadcast',
                        event: 'client_assigned',
                        payload: {
                            trainerId: trainerId,
                            notificationId: trainerNotification.id,
                            userName,
                            content: `${userName} has been assigned as your client.`
                        }
                    });
                    console.log('[ASSIGN TRAINER] Broadcast send result (bell channel):', bellSendResult);
                    await new Promise(resolve => setTimeout(resolve, 100));
                    await bellChannel.unsubscribe();
                } catch (err) {
                    console.error('[ASSIGN TRAINER] Error sending real-time notification to trainer:', err);
                }
            } else {
                console.error('[ASSIGN TRAINER] Trainer notification not created - trainerUser:', trainerUser);
            }
        }

        // Generate invoice for trainer addon if it exists
        if (hasTrainerAddon && addons && addons.length > 0) {
            try {
                // Get trainer addon price
                const trainerAddonPrice = addons[0]?.price || 0;

                if (trainerAddonPrice > 0) {
                    const invoiceResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/invoices/generate`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            membershipId: membershipId,
                            paymentId: null, // No payment ID for addon assignment
                            invoiceType: 'trainer_addon',
                            amount: trainerAddonPrice
                        })
                    });

                    if (invoiceResponse.ok) {
                        const invoiceData = await invoiceResponse.json();
                        console.log('[ASSIGN TRAINER] Invoice generated for trainer addon:', invoiceData.invoice?.invoiceNumber);
                    } else {
                        console.error('[ASSIGN TRAINER] Failed to generate invoice:', await invoiceResponse.text());
                    }
                }
            } catch (invoiceError) {
                console.error('[ASSIGN TRAINER] Error generating invoice:', invoiceError);
                // Don't throw - trainer assignment is still successful
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Trainer assigned successfully',
            trainer: {
                id: trainer.id,
                name: trainer.name
            },
            periodEnd: periodEnd.toISOString()
        });
    } catch (error: any) {
        console.error('Error assigning trainer:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to assign trainer' },
            { status: 500 }
        );
    }
}

