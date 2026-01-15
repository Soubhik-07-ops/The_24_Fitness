// API route to check and process membership/trainer expiries
// This should be called by a cron job or scheduled task

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';
import { EXPIRATION_WARNING_DAYS } from '@/lib/membershipUtils';
import {
    calculateGracePeriodEnd,
    isInGracePeriod,
    getGracePeriodDaysRemaining,
    shouldTransitionToGracePeriod,
    getGracePeriodNotificationMilestones,
    GRACE_PERIOD_DAYS
} from '@/lib/gracePeriod';
import {
    calculateTrainerGracePeriodEnd,
    shouldTransitionTrainerToGracePeriod,
    getTrainerGracePeriodDaysRemaining,
    TRAINER_GRACE_PERIOD_DAYS
} from '@/lib/trainerGracePeriod';
import { logAuditEvent } from '@/lib/auditLog';
import {
    sendPlanExpiryReminder,
    sendPlanExpiryDayEmail,
    sendGracePeriodStartEmail,
    sendGracePeriodEndEmail
} from '@/lib/emailService';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

export async function POST(request: NextRequest) {
    try {
        // Optional: Require admin auth for security (or use a secret key)
        const authHeader = request.headers.get('authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.replace('Bearer ', '');
            const admin = await validateAdminSession(token);
            if (!admin) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
        }

        // Use standard expiration warning days (7 days) from membershipUtils
        // Can still check admin_settings for override, but default to 7 days
        const { data: expiryDaysSetting } = await supabaseAdmin
            .from('admin_settings')
            .select('setting_value')
            .eq('setting_key', 'expiry_notification_days')
            .single();
        const expiryNotificationDays = parseInt(expiryDaysSetting?.setting_value || String(EXPIRATION_WARNING_DAYS), 10) || EXPIRATION_WARNING_DAYS;

        // Use real current date with timezone handling (IST - India Standard Time)
        // Ensure consistent date calculations regardless of server timezone
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
        const istNow = new Date(now.getTime() + istOffset);
        
        // Normalize to IST midnight for date comparisons
        const todayIST = new Date(istNow);
        todayIST.setUTCHours(0, 0, 0, 0);
        todayIST.setTime(todayIST.getTime() - istOffset);
        
        const notificationDate = new Date(todayIST);
        notificationDate.setDate(notificationDate.getDate() + expiryNotificationDays);

        // Check memberships expiring within notification period
        // IMPORTANT: Only check memberships, NOT trainer renewals
        // Use membership_end_date or end_date as fallback
        const { data: expiringMembershipsData } = await supabaseAdmin
            .from('memberships')
            .select('id, user_id, plan_name, membership_end_date, end_date, trainer_period_end')
            .eq('status', 'active')
            // Exclude memberships that are ONLY trainer renewals (no base membership)
            // This ensures trainer renewals don't trigger membership expiry emails
            .not('membership_end_date', 'is', null)
            .or('end_date.not.is.null');

        // Filter in JavaScript since Supabase doesn't support complex OR queries across different columns easily
        const expiringMemberships = expiringMembershipsData?.filter(m => {
            const endDate = m.membership_end_date || m.end_date;
            if (!endDate) return false;
            const end = new Date(endDate);
            return end <= notificationDate && end > now;
        });

        // EMAIL: Send Plan Expiry Reminder (5 days before expiry)
        // Check for memberships expiring exactly 5 days from today (IST)
        const fiveDaysFromNow = new Date(todayIST);
        fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + 5);
        const fiveDaysFromNowStart = new Date(fiveDaysFromNow);
        fiveDaysFromNowStart.setUTCHours(0, 0, 0, 0);
        fiveDaysFromNowStart.setTime(fiveDaysFromNowStart.getTime() - istOffset);
        const fiveDaysFromNowEnd = new Date(fiveDaysFromNow);
        fiveDaysFromNowEnd.setUTCHours(23, 59, 59, 999);
        fiveDaysFromNowEnd.setTime(fiveDaysFromNowEnd.getTime() - istOffset);

        const membershipsExpiringIn5Days = expiringMembershipsData?.filter(m => {
            const endDate = m.membership_end_date || m.end_date;
            if (!endDate) return false;
            const end = new Date(endDate);
            return end >= fiveDaysFromNowStart && end <= fiveDaysFromNowEnd;
        });

        let planExpiryReminderEmailsSent = 0;
        if (membershipsExpiringIn5Days) {
            for (const membership of membershipsExpiringIn5Days) {
                const endDate = membership.membership_end_date || membership.end_date;
                if (!endDate) continue;

                const result = await sendPlanExpiryReminder(
                    membership.user_id,
                    membership.id,
                    membership.plan_name,
                    endDate
                );

                if (result.success) {
                    planExpiryReminderEmailsSent++;
                    console.log(`[EMAIL] Plan expiry reminder sent to user ${membership.user_id} for membership ${membership.id}`);
                } else {
                    console.error(`[EMAIL] Failed to send plan expiry reminder:`, result.error);
                }
            }
        }

        // Check trainer periods expiring within notification period
        const { data: expiringTrainerPeriods } = await supabaseAdmin
            .from('memberships')
            .select('id, user_id, plan_name, trainer_id, trainer_period_end, trainer_assigned')
            .eq('status', 'active')
            .eq('trainer_assigned', true)
            .lte('trainer_period_end', notificationDate.toISOString())
            .gt('trainer_period_end', now.toISOString());

        // Check active memberships that should transition to grace period
        const { data: activeMembershipsData } = await supabaseAdmin
            .from('memberships')
            .select('id, user_id, plan_name, status, membership_end_date, end_date, grace_period_end, trainer_assigned')
            .eq('status', 'active');

        // Filter memberships that should transition to grace period
        // Use IST timezone for date comparison (same as other checks)
        // Grace period starts the day AFTER expiry (so if end_date is 14 Feb, grace period starts on 15 Feb)
        const yesterdayIST = new Date(todayIST);
        yesterdayIST.setDate(yesterdayIST.getDate() - 1);
        
        const membershipsForGracePeriod = activeMembershipsData?.filter(m => {
            const endDate = m.membership_end_date || m.end_date;
            if (!endDate || m.grace_period_end) return false;
            
            // Convert end date to IST for comparison
            const endDateObj = new Date(endDate);
            const endDateIST = new Date(endDateObj.getTime() + istOffset);
            endDateIST.setUTCHours(0, 0, 0, 0);
            endDateIST.setTime(endDateIST.getTime() - istOffset);
            
            // Check if end date was yesterday or earlier (grace period starts the day after expiry)
            // So if end_date is 14 Feb, on 15 Feb we transition to grace period
            const shouldTransition = endDateIST <= yesterdayIST;
            
            if (shouldTransition) {
                console.log(`[GRACE PERIOD START] Membership ${m.id}: end_date=${endDate}, endDateIST=${endDateIST.toISOString()}, yesterdayIST=${yesterdayIST.toISOString()}, todayIST=${todayIST.toISOString()}`);
            }
            
            return shouldTransition;
        });

        // EMAIL: Send Plan Expiry Day Email (on the day membership expires)
        // Check for memberships expiring today (IST date range)
        const todayStart = new Date(todayIST);
        const todayEnd = new Date(todayIST);
        todayEnd.setUTCHours(23, 59, 59, 999);

        const membershipsExpiringToday = activeMembershipsData?.filter(m => {
            const endDate = m.membership_end_date || m.end_date;
            if (!endDate || m.grace_period_end) return false; // Skip if already in grace period
            const end = new Date(endDate);
            return end >= todayStart && end <= todayEnd;
        });

        let planExpiryDayEmailsSent = 0;
        if (membershipsExpiringToday) {
            for (const membership of membershipsExpiringToday) {
                const endDate = membership.membership_end_date || membership.end_date;
                if (!endDate) continue;

                const result = await sendPlanExpiryDayEmail(
                    membership.user_id,
                    membership.id,
                    membership.plan_name,
                    endDate
                );

                if (result.success) {
                    planExpiryDayEmailsSent++;
                    console.log(`[EMAIL] Plan expiry day email sent to user ${membership.user_id} for membership ${membership.id}`);
                } else {
                    console.error(`[EMAIL] Failed to send plan expiry day email:`, result.error);
                }
            }
        }

        // Check memberships in grace period that should expire
        const { data: gracePeriodMemberships } = await supabaseAdmin
            .from('memberships')
            .select('id, user_id, plan_name, membership_end_date, end_date, grace_period_end')
            .eq('status', 'grace_period')
            .lte('grace_period_end', now.toISOString());

        // Check expired memberships (status is still 'active' but end_date has passed and grace period logic not applied)
        // This is a fallback for old data that doesn't have grace period
        const expiredMemberships = activeMembershipsData?.filter(m => {
            const endDate = m.membership_end_date || m.end_date;
            if (!endDate || m.grace_period_end) return false;
            return new Date(endDate) <= now;
        });

        // Check expired trainer periods (should transition to grace period)
        const { data: expiredTrainerPeriods } = await supabaseAdmin
            .from('memberships')
            .select('id, user_id, plan_name, trainer_id, trainer_period_end, trainer_grace_period_end')
            .eq('status', 'active')
            .eq('trainer_assigned', true)
            .lte('trainer_period_end', now.toISOString());

        // Check trainer periods in grace period that should expire
        const { data: trainerGracePeriodMemberships } = await supabaseAdmin
            .from('memberships')
            .select('id, user_id, plan_name, trainer_id, trainer_period_end, trainer_grace_period_end')
            .eq('status', 'active')
            .eq('trainer_assigned', true)
            .not('trainer_grace_period_end', 'is', null)
            .lte('trainer_grace_period_end', now.toISOString());

        const notifications: any[] = [];

        // Create notifications for expiring memberships (4 days before)
        if (expiringMemberships) {
            for (const membership of expiringMemberships) {
                // User notification
                notifications.push({
                    recipient_id: membership.user_id,
                    actor_role: 'system',
                    type: 'membership_expiring',
                    content: `Your ${membership.plan_name} membership will expire soon. Please renew.`,
                    is_read: false
                });

                // Admin notification
                notifications.push({
                    recipient_id: null, // Admin notifications go to admin_notifications table
                    actor_role: 'system',
                    type: 'membership_expiring',
                    content: `User's ${membership.plan_name} membership is ending soon.`,
                    is_read: false
                });
            }
        }

        // Create notifications for expiring trainer periods
        if (expiringTrainerPeriods) {
            for (const membership of expiringTrainerPeriods) {
                // User notification
                notifications.push({
                    recipient_id: membership.user_id,
                    actor_role: 'system',
                    type: 'trainer_period_expiring',
                    content: `Your trainer access period will expire soon. Please renew.`,
                    is_read: false
                });

                // Trainer notification
                if (membership.trainer_id) {
                    // Get trainer's user_id if exists
                    const { data: trainer } = await supabaseAdmin
                        .from('trainers')
                        .select('user_id')
                        .eq('id', membership.trainer_id)
                        .single();

                    if (trainer?.user_id) {
                        notifications.push({
                            recipient_id: trainer.user_id,
                            actor_role: 'system',
                            type: 'client_trainer_period_expiring',
                            content: `Your client's trainer access period is expiring soon.`,
                            is_read: false
                        });
                    }
                }

                // Admin notification
                notifications.push({
                    recipient_id: null,
                    actor_role: 'system',
                    type: 'trainer_period_expiring',
                    content: `User's trainer period is ending soon.`,
                    is_read: false
                });
            }
        }

        // Process trainer periods that should transition to grace period
        let transitionedTrainerToGracePeriod = 0;
        if (expiredTrainerPeriods) {
            for (const membership of expiredTrainerPeriods) {
                if (shouldTransitionTrainerToGracePeriod(
                    membership.trainer_period_end,
                    membership.trainer_grace_period_end
                )) {
                    const trainerGracePeriodEnd = calculateTrainerGracePeriodEnd(membership.trainer_period_end);
                    const { error: updateError } = await supabaseAdmin
                        .from('memberships')
                        .update({
                            trainer_grace_period_end: trainerGracePeriodEnd.toISOString()
                        })
                        .eq('id', membership.id)
                        .eq('status', 'active')
                        .eq('trainer_assigned', true);

                    if (!updateError) {
                        transitionedTrainerToGracePeriod++;
                        console.log(`[EXPIRY] Transitioned trainer period for membership ${membership.id} to grace period`);

                        // Send notification for trainer grace period start (5 days remaining)
                        notifications.push({
                            recipient_id: membership.user_id,
                            actor_role: 'system',
                            type: 'trainer_grace_period_started',
                            content: `Your trainer access has entered a ${TRAINER_GRACE_PERIOD_DAYS}-day grace period. Please renew to continue trainer access.`,
                            is_read: false
                        });

                        // Trainer notification
                        if (membership.trainer_id) {
                            const { data: trainer } = await supabaseAdmin
                                .from('trainers')
                                .select('user_id')
                                .eq('id', membership.trainer_id)
                                .single();

                            if (trainer?.user_id) {
                                notifications.push({
                                    recipient_id: trainer.user_id,
                                    actor_role: 'system',
                                    type: 'client_trainer_grace_period_started',
                                    content: `Your client's trainer access has entered a grace period.`,
                                    is_read: false
                                });
                            }
                        }

                        await logAuditEvent({
                            membership_id: membership.id,
                            action: 'trainer_grace_period_started',
                            admin_id: null,
                            admin_email: 'system',
                            previous_status: membership.trainer_period_end || 'active',
                            new_status: 'trainer_grace_period',
                            details: `Trainer period transitioned to grace period. Grace period ends: ${trainerGracePeriodEnd.toISOString()}`
                        });
                    } else {
                        console.error(`[EXPIRY] Error transitioning trainer period for membership ${membership.id} to grace period:`, updateError);
                    }
                }
            }
        }

        // Process trainer grace period notifications (milestones: 3 days, 1 day)
        let trainerGracePeriodNotificationsSent = 0;
        const { data: activeTrainerGracePeriodMemberships } = await supabaseAdmin
            .from('memberships')
            .select('id, user_id, plan_name, trainer_id, trainer_grace_period_end')
            .eq('status', 'active')
            .eq('trainer_assigned', true)
            .not('trainer_grace_period_end', 'is', null)
            .gt('trainer_grace_period_end', now.toISOString());

        if (activeTrainerGracePeriodMemberships) {
            for (const membership of activeTrainerGracePeriodMemberships) {
                if (!membership.trainer_grace_period_end) continue;

                const daysRemaining = getTrainerGracePeriodDaysRemaining(membership.trainer_grace_period_end);

                // Send notifications at milestones (3 days, 1 day)
                if (daysRemaining === 3) {
                    notifications.push({
                        recipient_id: membership.user_id,
                        actor_role: 'system',
                        type: 'trainer_grace_period_warning',
                        content: `Your trainer access grace period has 3 days remaining. Renew soon!`,
                        is_read: false
                    });
                    trainerGracePeriodNotificationsSent++;
                } else if (daysRemaining === 1) {
                    notifications.push({
                        recipient_id: membership.user_id,
                        actor_role: 'system',
                        type: 'trainer_grace_period_warning',
                        content: `Your trainer access grace period ends tomorrow. Renew today to avoid losing trainer access!`,
                        is_read: false
                    });
                    trainerGracePeriodNotificationsSent++;
                }
            }
        }

        // Process trainer grace period expirations (past trainer_grace_period_end)
        let trainerGracePeriodExpired = 0;
        if (trainerGracePeriodMemberships) {
            for (const membership of trainerGracePeriodMemberships) {
                // Revoke trainer access (but keep membership active)
                const { error: updateError } = await supabaseAdmin
                    .from('memberships')
                    .update({
                        trainer_assigned: false,
                        trainer_id: null,
                        trainer_period_end: null,
                        trainer_grace_period_end: null
                    })
                    .eq('id', membership.id)
                    .eq('status', 'active')
                    .eq('trainer_assigned', true);

                if (!updateError) {
                    trainerGracePeriodExpired++;
                    console.log(`[EXPIRY] Revoked trainer access for membership ${membership.id} after grace period`);

                    // User notification
                    notifications.push({
                        recipient_id: membership.user_id,
                        actor_role: 'system',
                        type: 'trainer_grace_period_expired',
                        content: `Your trainer access grace period has ended. Trainer access has been revoked. Please renew to regain trainer access.`,
                        is_read: false
                    });

                    // Trainer notification
                    if (membership.trainer_id) {
                        const { data: trainer } = await supabaseAdmin
                            .from('trainers')
                            .select('user_id')
                            .eq('id', membership.trainer_id)
                            .single();

                        if (trainer?.user_id) {
                            notifications.push({
                                recipient_id: trainer.user_id,
                                actor_role: 'system',
                                type: 'client_trainer_grace_period_expired',
                                content: `Your client's trainer access grace period has ended.`,
                                is_read: false
                            });
                        }
                    }

                    await logAuditEvent({
                        membership_id: membership.id,
                        action: 'trainer_grace_period_expired',
                        admin_id: null,
                        admin_email: 'system',
                        previous_status: 'trainer_grace_period',
                        new_status: 'trainer_revoked',
                        details: `Trainer access revoked after grace period ended.`
                    });
                } else {
                    console.error(`[EXPIRY] Error revoking trainer access for membership ${membership.id}:`, updateError);
                }
            }
        }

        // Process memberships that should transition to grace period
        let transitionedToGracePeriod = 0;
        let gracePeriodStartEmailsSent = 0;
        if (membershipsForGracePeriod) {
            for (const membership of membershipsForGracePeriod) {
                const endDate = membership.membership_end_date || membership.end_date;
                if (!endDate) continue;

                // Membership is already filtered to be eligible for grace period transition
                // No need to check again - just proceed with transition
                {
                    const gracePeriodEnd = calculateGracePeriodEnd(endDate);

                    // CRITICAL: For Regular Monthly plans, expire trainer access when membership expires
                    // Trainer access must be tightly bound to membership lifecycle - no carryover to grace period
                    const planName = (membership.plan_name || '').toLowerCase();
                    const isRegularMonthly = planName.includes('regular') && (planName.includes('monthly') || planName.includes('boys') || planName.includes('girls'));

                    const updateData: any = {
                        status: 'grace_period',
                        grace_period_end: gracePeriodEnd.toISOString()
                    };

                    // For Regular Monthly plans: expire trainer access immediately (no grace period for trainer)
                    if (isRegularMonthly && membership.trainer_assigned) {
                        updateData.trainer_assigned = false;
                        updateData.trainer_id = null;
                        updateData.trainer_period_end = null;
                        updateData.trainer_grace_period_end = null;
                        console.log(`[EXPIRY] Regular Monthly plan ${membership.id}: Expiring trainer access with membership expiry`);

                        // Update trainer assignment status to expired
                        await supabaseAdmin
                            .from('trainer_assignments')
                            .update({ status: 'expired' })
                            .eq('membership_id', membership.id)
                            .eq('status', 'assigned');
                    }

                    const { error: updateError } = await supabaseAdmin
                        .from('memberships')
                        .update(updateData)
                        .eq('id', membership.id)
                        .eq('status', 'active');

                    if (!updateError) {
                        transitionedToGracePeriod++;
                        console.log(`[EXPIRY] Transitioned membership ${membership.id} to grace period`);

                        // Send notification about trainer access expiration for Regular Monthly plans
                        if (isRegularMonthly && membership.trainer_assigned) {
                            notifications.push({
                                recipient_id: membership.user_id,
                                actor_role: 'system',
                                type: 'trainer_access_expired_with_membership',
                                content: `Your trainer access has expired with your Regular Monthly membership. You can add trainer access when you renew your membership.`,
                                is_read: false
                            });
                        }

                        // Send notification for grace period start
                        // Calculate days remaining for accurate notification
                        const daysRemaining = getGracePeriodDaysRemaining(gracePeriodEnd.toISOString(), now);
                        const effectiveDaysRemaining = daysRemaining !== null ? daysRemaining : GRACE_PERIOD_DAYS;
                        notifications.push({
                            recipient_id: membership.user_id,
                            actor_role: 'system',
                            type: 'membership_grace_period_started',
                            content: `Your ${membership.plan_name} membership grace period has started. You have ${effectiveDaysRemaining} day${effectiveDaysRemaining !== 1 ? 's' : ''} remaining to renew your membership.`,
                            is_read: false
                        });

                        // EMAIL: Send Grace Period Start Email
                        // Double-check: Only send if grace_period_end was just set (not already existed)
                        // This is a safety check - the filter above should already exclude memberships with grace_period_end
                        const endDate = membership.membership_end_date || membership.end_date;
                        if (endDate && !membership.grace_period_end) {
                            const emailResult = await sendGracePeriodStartEmail(
                                membership.user_id,
                                membership.id,
                                membership.plan_name,
                                gracePeriodEnd.toISOString()
                            );

                            if (emailResult.success) {
                                gracePeriodStartEmailsSent++;
                                console.log(`[EMAIL] Grace period start email sent to user ${membership.user_id} for membership ${membership.id}`);
                            } else {
                                // If email was already sent (idempotency check), that's fine - just log it
                                if (emailResult.error?.includes('already sent')) {
                                    console.log(`[EMAIL] Grace period start email already sent for membership ${membership.id}, skipping`);
                                } else {
                                    console.error(`[EMAIL] Failed to send grace period start email:`, emailResult.error);
                                }
                            }
                        } else if (membership.grace_period_end) {
                            console.log(`[EMAIL] Grace period start email skipped for membership ${membership.id} - grace_period_end already exists (${membership.grace_period_end})`);
                        }
                    } else {
                        console.error(`[EXPIRY] Error transitioning membership ${membership.id} to grace period:`, updateError);
                    }
                }
            }
        }

        // Process grace period notifications (milestones: 7 days, 2 days, final day)
        let gracePeriodNotificationsSent = 0;
        // Get all grace period memberships (including those ending today)
        const { data: activeGracePeriodMemberships } = await supabaseAdmin
            .from('memberships')
            .select('id, user_id, plan_name, grace_period_end')
            .eq('status', 'grace_period')
            .not('grace_period_end', 'is', null);

        // EMAIL: Send Grace Period End / Final Warning Email (on last day of grace period)
        // Use IST timezone handling (same as other date checks - istOffset already defined above)
        const gracePeriodEndTodayStart = new Date(todayIST);
        const gracePeriodEndTodayEnd = new Date(todayIST);
        gracePeriodEndTodayEnd.setUTCHours(23, 59, 59, 999);
        gracePeriodEndTodayEnd.setTime(gracePeriodEndTodayEnd.getTime() - istOffset);

        const gracePeriodEndingToday = activeGracePeriodMemberships?.filter(m => {
            if (!m.grace_period_end) return false;
            const graceEnd = new Date(m.grace_period_end);
            const graceEndIST = new Date(graceEnd.getTime() + istOffset);
            graceEndIST.setUTCHours(0, 0, 0, 0);
            graceEndIST.setTime(graceEndIST.getTime() - istOffset);
            const shouldSend = graceEndIST >= gracePeriodEndTodayStart && graceEndIST <= gracePeriodEndTodayEnd;
            
            if (shouldSend) {
                console.log(`[GRACE PERIOD END] Membership ${m.id}: grace_period_end=${m.grace_period_end}, graceEndIST=${graceEndIST.toISOString()}, todayStart=${gracePeriodEndTodayStart.toISOString()}, todayEnd=${gracePeriodEndTodayEnd.toISOString()}`);
            }
            
            return shouldSend;
        });

        let gracePeriodEndEmailsSent = 0;
        if (gracePeriodEndingToday) {
            for (const membership of gracePeriodEndingToday) {
                if (!membership.grace_period_end) continue;

                const emailResult = await sendGracePeriodEndEmail(
                    membership.user_id,
                    membership.id,
                    membership.plan_name,
                    membership.grace_period_end
                );

                if (emailResult.success) {
                    gracePeriodEndEmailsSent++;
                    console.log(`[EMAIL] Grace period end email sent to user ${membership.user_id} for membership ${membership.id}`);
                } else {
                    console.error(`[EMAIL] Failed to send grace period end email:`, emailResult.error);
                }
            }
        }

        if (activeGracePeriodMemberships) {
            for (const membership of activeGracePeriodMemberships) {
                if (!membership.grace_period_end) continue;

                // Use simulated date for milestone calculation in demo mode
                const milestones = getGracePeriodNotificationMilestones(membership.grace_period_end, now);
                for (const milestone of milestones) {
                    if (milestone.shouldNotify) {
                        let content = '';
                        if (milestone.daysRemaining === 7) {
                            content = `Your ${membership.plan_name} membership grace period has 7 days remaining. Please renew soon.`;
                        } else if (milestone.daysRemaining === 2) {
                            content = `Your ${membership.plan_name} membership grace period has 2 days remaining. Please renew immediately.`;
                        } else if (milestone.daysRemaining === 1) {
                            content = `Your ${membership.plan_name} membership grace period ends tomorrow. Please renew today to avoid losing access.`;
                        }

                        if (content) {
                            notifications.push({
                                recipient_id: membership.user_id,
                                actor_role: 'system',
                                type: 'membership_grace_period_warning',
                                content,
                                is_read: false
                            });
                            gracePeriodNotificationsSent++;
                        }
                    }
                }
            }
        }

        // Process grace period expirations (past grace_period_end)
        let expiredFromGracePeriod = 0;
        if (gracePeriodMemberships) {
            for (const membership of gracePeriodMemberships) {
                const { error: deleteError } = await supabaseAdmin
                    .from('memberships')
                    .delete()
                    .eq('id', membership.id)
                    .eq('status', 'grace_period');

                if (!deleteError) {
                    expiredFromGracePeriod++;
                    console.log(`[EXPIRY] Deleted expired membership ${membership.id} after grace period`);

                    // Send final expiration notification
                    notifications.push({
                        recipient_id: membership.user_id,
                        actor_role: 'system',
                        type: 'membership_expired_final',
                        content: `Your ${membership.plan_name} membership has expired after the grace period. Please purchase a new plan to reactivate your membership.`,
                        is_read: false
                    });
                } else {
                    console.error(`[EXPIRY] Error deleting expired membership ${membership.id}:`, deleteError);
                }
            }
        }

        // Process expired memberships (fallback for old data without grace period)
        let updatedExpiredCount = 0;
        if (expiredMemberships) {
            for (const membership of expiredMemberships) {
                const endDate = membership.membership_end_date || membership.end_date;
                if (!endDate) continue;

                const endDateObj = new Date(endDate);
                if (endDateObj <= now) {
                    const { error: updateError } = await supabaseAdmin
                        .from('memberships')
                        .update({ status: 'expired' })
                        .eq('id', membership.id)
                        .eq('status', 'active');

                    if (!updateError) {
                        updatedExpiredCount++;
                        console.log(`[EXPIRY] Updated membership ${membership.id} status to expired (legacy)`);
                    } else {
                        console.error(`[EXPIRY] Error updating membership ${membership.id}:`, updateError);
                    }
                }

                // User notification
                notifications.push({
                    recipient_id: membership.user_id,
                    actor_role: 'system',
                    type: 'membership_expired',
                    content: `Your ${membership.plan_name} membership has expired. Please renew your plan.`,
                    is_read: false
                });

                // Admin notification (to admin_notifications table)
                await supabaseAdmin
                    .from('admin_notifications')
                    .insert({
                        notification_type: 'membership_expired',
                        content: `User's ${membership.plan_name} membership has expired. Please remove or follow up.`,
                        reference_id: membership.id.toString(),
                        actor_role: 'system',
                        is_read: false
                    });
            }
        }

        // Process expired trainer periods
        if (expiredTrainerPeriods) {
            for (const membership of expiredTrainerPeriods) {
                // Unassign trainer
                await supabaseAdmin
                    .from('memberships')
                    .update({
                        trainer_assigned: false,
                        trainer_id: null,
                        trainer_period_end: null
                    })
                    .eq('id', membership.id);

                // Update trainer assignment status
                await supabaseAdmin
                    .from('trainer_assignments')
                    .update({ status: 'expired' })
                    .eq('membership_id', membership.id)
                    .eq('status', 'assigned');

                // User notification
                notifications.push({
                    recipient_id: membership.user_id,
                    actor_role: 'system',
                    type: 'trainer_period_expired',
                    content: `Your trainer access period has expired. Please renew your trainer access.`,
                    is_read: false
                });

                // Trainer notification
                if (membership.trainer_id) {
                    const { data: trainer } = await supabaseAdmin
                        .from('trainers')
                        .select('user_id')
                        .eq('id', membership.trainer_id)
                        .single();

                    if (trainer?.user_id) {
                        notifications.push({
                            recipient_id: trainer.user_id,
                            actor_role: 'system',
                            type: 'client_trainer_period_expired',
                            content: `Client's trainer access period has expired.`,
                            is_read: false
                        });
                    }
                }

                // Admin notification
                await supabaseAdmin
                    .from('admin_notifications')
                    .insert({
                        notification_type: 'trainer_period_expired',
                        content: `User's trainer period has expired.`,
                        reference_id: membership.id.toString(),
                        actor_role: 'system',
                        is_read: false
                    });
            }
        }

        // Insert user notifications
        if (notifications.length > 0) {
            const userNotifications = notifications.filter(n => n.recipient_id !== null);
            if (userNotifications.length > 0) {
                await supabaseAdmin
                    .from('notifications')
                    .insert(userNotifications);
            }
        }

        return NextResponse.json({
            success: true,
            processed: {
                expiringMemberships: expiringMemberships?.length || 0,
                expiringTrainerPeriods: expiringTrainerPeriods?.length || 0,
                transitionedToGracePeriod,
                gracePeriodNotificationsSent,
                expiredFromGracePeriod,
                expiredMembershipsFound: expiredMemberships?.length || 0,
                expiredMembershipsUpdated: updatedExpiredCount,
                expiredTrainerPeriods: expiredTrainerPeriods?.length || 0,
                transitionedTrainerToGracePeriod: transitionedTrainerToGracePeriod || 0,
                trainerGracePeriodNotificationsSent: trainerGracePeriodNotificationsSent || 0,
                trainerGracePeriodExpired: trainerGracePeriodExpired || 0,
                notificationsCreated: notifications.length,
                emailsSent: {
                    planExpiryReminder: planExpiryReminderEmailsSent || 0,
                    planExpiryDay: planExpiryDayEmailsSent || 0,
                    gracePeriodStart: gracePeriodStartEmailsSent || 0,
                    gracePeriodEnd: gracePeriodEndEmailsSent || 0
                }
            }
        });
    } catch (error: any) {
        console.error('Error checking expiries:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to check expiries' },
            { status: 500 }
        );
    }
}

// Allow GET for manual testing
export async function GET(request: NextRequest) {
    return POST(request);
}

