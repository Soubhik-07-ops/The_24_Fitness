// API route to check and process membership/trainer expiries
// This should be called by a cron job or scheduled task

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';

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

        // Fetch expiry notification days from admin_settings (default: 4)
        const { data: expiryDaysSetting } = await supabaseAdmin
            .from('admin_settings')
            .select('setting_value')
            .eq('setting_key', 'expiry_notification_days')
            .single();
        const expiryNotificationDays = parseInt(expiryDaysSetting?.setting_value || '4', 10) || 4;

        const now = new Date();
        const notificationDate = new Date();
        notificationDate.setDate(notificationDate.getDate() + expiryNotificationDays);

        // Check memberships expiring within notification period
        const { data: expiringMemberships } = await supabaseAdmin
            .from('memberships')
            .select('id, user_id, plan_name, membership_end_date, trainer_period_end')
            .eq('status', 'active')
            .lte('membership_end_date', notificationDate.toISOString())
            .gt('membership_end_date', now.toISOString());

        // Check trainer periods expiring within notification period
        const { data: expiringTrainerPeriods } = await supabaseAdmin
            .from('memberships')
            .select('id, user_id, plan_name, trainer_id, trainer_period_end, trainer_assigned')
            .eq('status', 'active')
            .eq('trainer_assigned', true)
            .lte('trainer_period_end', notificationDate.toISOString())
            .gt('trainer_period_end', now.toISOString());

        // Check expired memberships
        const { data: expiredMemberships } = await supabaseAdmin
            .from('memberships')
            .select('id, user_id, plan_name, membership_end_date')
            .eq('status', 'active')
            .lte('membership_end_date', now.toISOString());

        // Check expired trainer periods
        const { data: expiredTrainerPeriods } = await supabaseAdmin
            .from('memberships')
            .select('id, user_id, plan_name, trainer_id, trainer_period_end')
            .eq('status', 'active')
            .eq('trainer_assigned', true)
            .lte('trainer_period_end', now.toISOString());

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

        // Process expired memberships
        if (expiredMemberships) {
            for (const membership of expiredMemberships) {
                // Update membership status
                await supabaseAdmin
                    .from('memberships')
                    .update({ status: 'expired' })
                    .eq('id', membership.id);

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
                expiredMemberships: expiredMemberships?.length || 0,
                expiredTrainerPeriods: expiredTrainerPeriods?.length || 0,
                notificationsCreated: notifications.length
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

