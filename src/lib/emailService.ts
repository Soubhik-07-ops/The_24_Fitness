/**
 * Centralized Email Service
 * 
 * Production-ready transactional email system using Resend
 * Handles all automated emails for membership lifecycle events
 */

import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { GRACE_PERIOD_DAYS } from './gracePeriod';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Initialize Resend client
const resendApiKey = process.env.RESEND_API_KEY;
if (!resendApiKey) {
    console.warn('[EMAIL SERVICE] RESEND_API_KEY not found. Email sending will be disabled.');
}

const resend = resendApiKey ? new Resend(resendApiKey) : null;

// Email configuration
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'The 24 Fitness Gym <noreply@the24fitness.co.in>';
const FROM_NAME = 'The 24 Fitness Gym';
const REPLY_TO = process.env.RESEND_REPLY_TO || 'The24fitness8055@gmail.com';

/**
 * Email event types for tracking (prevents duplicates)
 */
export type EmailEventType =
    | 'plan_expiry_reminder_5days'
    | 'plan_expiry_day'
    | 'grace_period_start'
    | 'grace_period_end'
    | 'welcome_email';

/**
 * Check if an email has already been sent for a specific event
 * This prevents duplicate emails
 */
async function hasEmailBeenSent(
    userId: string,
    membershipId: number | null,
    eventType: EmailEventType
): Promise<boolean> {
    try {
        const { data, error } = await supabaseAdmin
            .from('email_events')
            .select('id')
            .eq('user_id', userId)
            .eq('event_type', eventType)
            .eq('membership_id', membershipId || 0)
            .limit(1)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            console.error('[EMAIL SERVICE] Error checking email event:', error);
            return false; // If check fails, allow sending (fail open)
        }

        return !!data;
    } catch (error) {
        console.error('[EMAIL SERVICE] Exception checking email event:', error);
        return false; // If check fails, allow sending (fail open)
    }
}

/**
 * Record that an email was sent (for duplicate prevention)
 */
async function recordEmailSent(
    userId: string,
    membershipId: number | null,
    eventType: EmailEventType,
    emailAddress: string
): Promise<void> {
    try {
        const { error } = await supabaseAdmin
            .from('email_events')
            .insert({
                user_id: userId,
                membership_id: membershipId,
                event_type: eventType,
                email_address: emailAddress,
                sent_at: new Date().toISOString()
            });

        if (error) {
            console.error('[EMAIL SERVICE] Error recording email event:', error);
            // Don't throw - email was sent, just tracking failed
        }
    } catch (error) {
        console.error('[EMAIL SERVICE] Exception recording email event:', error);
        // Don't throw - email was sent, just tracking failed
    }
}

/**
 * Get user email address from user ID
 */
async function getUserEmail(userId: string): Promise<string | null> {
    try {
        const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (error || !user) {
            console.error('[EMAIL SERVICE] Error fetching user email:', error);
            return null;
        }
        return user.email || null;
    } catch (error) {
        console.error('[EMAIL SERVICE] Exception fetching user email:', error);
        return null;
    }
}

/**
 * Get user profile data (name, etc.)
 */
async function getUserProfile(userId: string): Promise<{ fullName: string; email: string } | null> {
    try {
        const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (userError || !user) {
            return null;
        }

        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('full_name')
            .eq('id', userId)
            .single();

        return {
            fullName: profile?.full_name || user.email?.split('@')[0] || 'Member',
            email: user.email || ''
        };
    } catch (error) {
        console.error('[EMAIL SERVICE] Exception fetching user profile:', error);
        return null;
    }
}

/**
 * Send email via Resend with retry logic
 * Implements exponential backoff for transient failures
 */
async function sendEmail(
    to: string,
    subject: string,
    htmlContent: string,
    maxRetries: number = 3
): Promise<{ success: boolean; error?: string; emailId?: string }> {
    if (!resend) {
        console.error('[EMAIL SERVICE] Resend not configured. Email not sent:', { to, subject });
        return { success: false, error: 'Email service not configured' };
    }

    let lastError: string | undefined;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const { data, error } = await resend.emails.send({
                from: FROM_EMAIL,
                to: [to],
                subject,
                html: htmlContent,
                replyTo: REPLY_TO
            });

            if (error) {
                lastError = error.message || 'Failed to send email';
                
                // Retry on transient errors (rate limits, network issues)
                const isTransientError = 
                    error.statusCode === 429 || // Rate limit
                    error.statusCode === 503 || // Service unavailable
                    error.statusCode === 500 || // Server error
                    error.message?.toLowerCase().includes('timeout') ||
                    error.message?.toLowerCase().includes('network');
                
                if (isTransientError && attempt < maxRetries) {
                    const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
                    console.warn(`[EMAIL SERVICE] Transient error (attempt ${attempt}/${maxRetries}), retrying in ${delayMs}ms:`, error);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                    continue;
                }
                
                // Non-transient error or max retries reached
                console.error('[EMAIL SERVICE] Resend error:', error);
                return { success: false, error: lastError };
            }

            // Success
            console.log('[EMAIL SERVICE] Email sent successfully:', { to, subject, id: data?.id, attempt });
            return { success: true, emailId: data?.id };
        } catch (error: any) {
            lastError = error.message || 'Failed to send email';
            
            // Retry on network exceptions
            if (attempt < maxRetries) {
                const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                console.warn(`[EMAIL SERVICE] Exception (attempt ${attempt}/${maxRetries}), retrying in ${delayMs}ms:`, error);
                await new Promise(resolve => setTimeout(resolve, delayMs));
                continue;
            }
            
            console.error('[EMAIL SERVICE] Exception sending email after retries:', error);
            return { success: false, error: lastError };
        }
    }

    return { success: false, error: lastError || 'Failed to send email after retries' };
}

/**
 * Log email failure for admin visibility
 */
async function logEmailFailure(
    userId: string,
    membershipId: number | null,
    eventType: EmailEventType,
    emailAddress: string,
    errorMessage: string,
    retryCount: number = 0
): Promise<void> {
    try {
        const { error } = await supabaseAdmin
            .from('email_failures')
            .insert({
                user_id: userId,
                membership_id: membershipId,
                event_type: eventType,
                email_address: emailAddress,
                error_message: errorMessage,
                retry_count: retryCount,
                last_attempt_at: new Date().toISOString()
            });

        if (error) {
            console.error('[EMAIL SERVICE] Error logging email failure:', error);
            // Don't throw - logging failure shouldn't break email flow
        }
    } catch (error) {
        console.error('[EMAIL SERVICE] Exception logging email failure:', error);
        // Don't throw - logging failure shouldn't break email flow
    }
}

/**
 * Mark email failure as resolved (when email is successfully sent after retry)
 */
async function resolveEmailFailure(
    userId: string,
    membershipId: number | null,
    eventType: EmailEventType
): Promise<void> {
    try {
        const { error } = await supabaseAdmin
            .from('email_failures')
            .update({ resolved_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('membership_id', membershipId || 0)
            .eq('event_type', eventType)
            .is('resolved_at', null);

        if (error) {
            console.error('[EMAIL SERVICE] Error resolving email failure:', error);
        }
    } catch (error) {
        console.error('[EMAIL SERVICE] Exception resolving email failure:', error);
    }
}

/**
 * Send Plan Expiry Reminder (5 days before expiry)
 */
export async function sendPlanExpiryReminder(
    userId: string,
    membershipId: number,
    planName: string,
    expiryDate: string
): Promise<{ success: boolean; error?: string; emailId?: string }> {
    const eventType: EmailEventType = 'plan_expiry_reminder_5days';

    // Idempotency check: Skip if already sent
    if (await hasEmailBeenSent(userId, membershipId, eventType)) {
        console.log('[EMAIL SERVICE] Plan expiry reminder already sent, skipping:', { userId, membershipId });
        return { success: true }; // Already sent, consider success
    }

    const userProfile = await getUserProfile(userId);
    if (!userProfile || !userProfile.email) {
        return { success: false, error: 'User email not found' };
    }

    const expiryDateFormatted = new Date(expiryDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    const htmlContent = getPlanExpiryReminderTemplate(
        userProfile.fullName,
        planName,
        expiryDateFormatted
    );

    const subject = `Your ${planName} Membership Expires Soon - Renew Now`;

    const result = await sendEmail(
        userProfile.email,
        subject,
        htmlContent
    );

    if (result.success) {
        await recordEmailSent(userId, membershipId, eventType, userProfile.email);
        await resolveEmailFailure(userId, membershipId, eventType);
    } else {
        await logEmailFailure(userId, membershipId, eventType, userProfile.email, result.error || 'Unknown error');
    }

    return result;
}

/**
 * Send Plan Expiry Day Email
 * Production-only: Validates membership state before sending
 */
export async function sendPlanExpiryDayEmail(
    userId: string,
    membershipId: number,
    planName: string,
    expiryDate: string
): Promise<{ success: boolean; error?: string; emailId?: string }> {
    const eventType: EmailEventType = 'plan_expiry_day';

    // Idempotency check: Skip if already sent
    if (await hasEmailBeenSent(userId, membershipId, eventType)) {
        console.log('[EMAIL SERVICE] Plan expiry day email already sent, skipping:', { userId, membershipId });
        return { success: true };
    }

    // Validate membership state at send time
    const { data: membership, error: membershipError } = await supabaseAdmin
        .from('memberships')
        .select('id, status, membership_end_date, end_date, grace_period_end')
        .eq('id', membershipId)
        .eq('user_id', userId)
        .single();

    if (membershipError || !membership) {
        const errorMsg = `Membership ${membershipId} not found or invalid`;
        console.error('[EMAIL SERVICE]', errorMsg);
        await logEmailFailure(userId, membershipId, eventType, '', errorMsg);
        return { success: false, error: errorMsg };
    }

    // Verify membership hasn't already entered grace period
    if (membership.status === 'grace_period' || membership.grace_period_end) {
        const errorMsg = `Membership ${membershipId} already in grace period, expiry day email should not be sent`;
        console.warn('[EMAIL SERVICE]', errorMsg);
        return { success: false, error: errorMsg };
    }

    const userProfile = await getUserProfile(userId);
    if (!userProfile || !userProfile.email) {
        const errorMsg = 'User email not found';
        await logEmailFailure(userId, membershipId, eventType, '', errorMsg);
        return { success: false, error: errorMsg };
    }

    const expiryDateFormatted = new Date(expiryDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    const htmlContent = getPlanExpiryDayTemplate(
        userProfile.fullName,
        planName,
        expiryDateFormatted
    );

    const subject = `Your ${planName} Membership Has Expired - Renew Within ${GRACE_PERIOD_DAYS} Days`;

    const result = await sendEmail(
        userProfile.email,
        subject,
        htmlContent
    );

    if (result.success) {
        await recordEmailSent(userId, membershipId, eventType, userProfile.email);
        await resolveEmailFailure(userId, membershipId, eventType);
    } else {
        await logEmailFailure(userId, membershipId, eventType, userProfile.email, result.error || 'Unknown error');
    }

    return result;
}

/**
 * Send Grace Period Start Email
 * Production-only: Validates membership state before sending
 */
export async function sendGracePeriodStartEmail(
    userId: string,
    membershipId: number,
    planName: string,
    gracePeriodEndDate: string
): Promise<{ success: boolean; error?: string; emailId?: string }> {
    const eventType: EmailEventType = 'grace_period_start';

    // Idempotency check: Skip if already sent
    if (await hasEmailBeenSent(userId, membershipId, eventType)) {
        console.log('[EMAIL SERVICE] Grace period start email already sent, skipping:', { userId, membershipId });
        return { success: true };
    }

    // Validate membership state at send time
    const { data: membership, error: membershipError } = await supabaseAdmin
        .from('memberships')
        .select('id, status, grace_period_end')
        .eq('id', membershipId)
        .eq('user_id', userId)
        .single();

    if (membershipError || !membership) {
        const errorMsg = `Membership ${membershipId} not found or invalid`;
        console.error('[EMAIL SERVICE]', errorMsg);
        await logEmailFailure(userId, membershipId, eventType, '', errorMsg);
        return { success: false, error: errorMsg };
    }

    // Verify membership is in grace period
    if (membership.status !== 'grace_period') {
        const errorMsg = `Membership ${membershipId} is not in grace_period (status: ${membership.status})`;
        console.warn('[EMAIL SERVICE]', errorMsg);
        return { success: false, error: errorMsg };
    }

    // Verify grace period end date matches
    if (membership.grace_period_end !== gracePeriodEndDate) {
        const errorMsg = `Membership ${membershipId} grace period end date mismatch (expected: ${gracePeriodEndDate}, actual: ${membership.grace_period_end})`;
        console.warn('[EMAIL SERVICE]', errorMsg);
        // Still send email but log the mismatch
    }

    const userProfile = await getUserProfile(userId);
    if (!userProfile || !userProfile.email) {
        const errorMsg = 'User email not found';
        await logEmailFailure(userId, membershipId, eventType, '', errorMsg);
        return { success: false, error: errorMsg };
    }

    const gracePeriodEndFormatted = new Date(gracePeriodEndDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    const htmlContent = getGracePeriodStartTemplate(
        userProfile.fullName,
        planName,
        gracePeriodEndFormatted
    );

    const subject = `Renew Your ${planName} Membership - ${GRACE_PERIOD_DAYS} Days Grace Period Started`;

    const result = await sendEmail(
        userProfile.email,
        subject,
        htmlContent
    );

    if (result.success) {
        await recordEmailSent(userId, membershipId, eventType, userProfile.email);
        await resolveEmailFailure(userId, membershipId, eventType);
    } else {
        await logEmailFailure(userId, membershipId, eventType, userProfile.email, result.error || 'Unknown error');
    }

    return result;
}

/**
 * Send Grace Period End / Final Warning Email
 * Production-only: Validates membership state before sending
 */
export async function sendGracePeriodEndEmail(
    userId: string,
    membershipId: number,
    planName: string,
    gracePeriodEndDate: string
): Promise<{ success: boolean; error?: string; emailId?: string }> {
    const eventType: EmailEventType = 'grace_period_end';

    // Idempotency check: Skip if already sent
    if (await hasEmailBeenSent(userId, membershipId, eventType)) {
        console.log('[EMAIL SERVICE] Grace period end email already sent, skipping:', { userId, membershipId });
        return { success: true };
    }

    // Validate membership state at send time
    const { data: membership, error: membershipError } = await supabaseAdmin
        .from('memberships')
        .select('id, status, grace_period_end')
        .eq('id', membershipId)
        .eq('user_id', userId)
        .single();

    if (membershipError || !membership) {
        const errorMsg = `Membership ${membershipId} not found or invalid`;
        console.error('[EMAIL SERVICE]', errorMsg);
        await logEmailFailure(userId, membershipId, eventType, '', errorMsg);
        return { success: false, error: errorMsg };
    }

    // Verify membership is still in grace period
    if (membership.status !== 'grace_period') {
        const errorMsg = `Membership ${membershipId} is not in grace_period (status: ${membership.status})`;
        console.warn('[EMAIL SERVICE]', errorMsg);
        return { success: false, error: errorMsg };
    }

    const userProfile = await getUserProfile(userId);
    if (!userProfile || !userProfile.email) {
        const errorMsg = 'User email not found';
        await logEmailFailure(userId, membershipId, eventType, '', errorMsg);
        return { success: false, error: errorMsg };
    }

    const gracePeriodEndFormatted = new Date(gracePeriodEndDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    const htmlContent = getGracePeriodEndTemplate(
        userProfile.fullName,
        planName,
        gracePeriodEndFormatted
    );

    const subject = `Final Notice: Your ${planName} Membership Grace Period Ends Today`;

    const result = await sendEmail(
        userProfile.email,
        subject,
        htmlContent
    );

    if (result.success) {
        await recordEmailSent(userId, membershipId, eventType, userProfile.email);
        await resolveEmailFailure(userId, membershipId, eventType);
    } else {
        await logEmailFailure(userId, membershipId, eventType, userProfile.email, result.error || 'Unknown error');
    }

    return result;
}

/**
 * Send Welcome Email (first login)
 * Production-only: Validates user state before sending
 */
export async function sendWelcomeEmail(
    userId: string
): Promise<{ success: boolean; error?: string; emailId?: string }> {
    const eventType: EmailEventType = 'welcome_email';

    // Idempotency check: Skip if already sent
    if (await hasEmailBeenSent(userId, null, eventType)) {
        console.log('[EMAIL SERVICE] Welcome email already sent, skipping:', { userId });
        return { success: true };
    }

    // Validate user exists
    const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (userError || !user) {
        const errorMsg = `User ${userId} not found`;
        console.error('[EMAIL SERVICE]', errorMsg);
        await logEmailFailure(userId, null, eventType, '', errorMsg);
        return { success: false, error: errorMsg };
    }

    const userProfile = await getUserProfile(userId);
    if (!userProfile || !userProfile.email) {
        const errorMsg = 'User email not found';
        await logEmailFailure(userId, null, eventType, '', errorMsg);
        return { success: false, error: errorMsg };
    }

    const htmlContent = getWelcomeEmailTemplate(userProfile.fullName);

    const subject = 'Welcome to The 24 Fitness Gym - Start Your Fitness Journey!';

    const result = await sendEmail(
        userProfile.email,
        subject,
        htmlContent
    );

    if (result.success) {
        await recordEmailSent(userId, null, eventType, userProfile.email);
        await resolveEmailFailure(userId, null, eventType);
    } else {
        await logEmailFailure(userId, null, eventType, userProfile.email, result.error || 'Unknown error');
    }

    return result;
}

// Email template functions (HTML templates)
function getPlanExpiryReminderTemplate(fullName: string, planName: string, expiryDate: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Membership Expiry Reminder</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 20px; text-align: center;">
                <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #f97316, #dc2626); border-radius: 8px 8px 0 0;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">THE 24 FITNESS GYM</h1>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="margin: 0 0 20px; color: #1a1a1a; font-size: 24px; font-weight: 600;">Membership Expiry Reminder</h2>
                            <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">Hello ${fullName},</p>
                            <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">This is a friendly reminder that your <strong>${planName}</strong> membership will expire on <strong>${expiryDate}</strong>.</p>
                            <p style="margin: 0 0 30px; color: #4b5563; font-size: 16px; line-height: 1.6;">To continue enjoying all the benefits of your membership, please renew before the expiry date.</p>
                            <!-- CTA Button -->
                            <table role="presentation" style="width: 100%; margin: 30px 0;">
                                <tr>
                                    <td style="text-align: center;">
                                        <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.the24fitness.co.in'}/dashboard" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #f97316, #dc2626); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Renew Plan</a>
                                    </td>
                                </tr>
                            </table>
                            <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">If you have any questions or need assistance, please contact us through our website or reply to this email.</p>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
                            <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;">The 24 Fitness Gym</p>
                            <p style="margin: 0; color: #9ca3af; font-size: 12px;">Digwadih No. 10, near Gobinda sweets, Old SBI Building</p>
                            <p style="margin: 10px 0 0; color: #9ca3af; font-size: 12px;">Email: ${REPLY_TO} | Phone: 8084548055</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `.trim();
}

function getPlanExpiryDayTemplate(fullName: string, planName: string, expiryDate: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Membership Expired</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 20px; text-align: center;">
                <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #f97316, #dc2626); border-radius: 8px 8px 0 0;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">THE 24 FITNESS GYM</h1>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="margin: 0 0 20px; color: #1a1a1a; font-size: 24px; font-weight: 600;">Your Membership Has Expired</h2>
                            <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">Hello ${fullName},</p>
                            <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">Your <strong>${planName}</strong> membership expired on <strong>${expiryDate}</strong>.</p>
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 4px;">
                                <p style="margin: 0; color: #92400e; font-size: 15px; line-height: 1.6;"><strong>Good News:</strong> You have entered a <strong>${GRACE_PERIOD_DAYS}-day grace period</strong>. You can still renew your membership during this time to continue your fitness journey without interruption.</p>
                            </div>
                            <p style="margin: 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">After the grace period ends, you'll need to purchase a new plan to reactivate your membership.</p>
                            <!-- CTA Button -->
                            <table role="presentation" style="width: 100%; margin: 30px 0;">
                                <tr>
                                    <td style="text-align: center;">
                                        <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.the24fitness.co.in'}/dashboard" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #f97316, #dc2626); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Renew Now</a>
                                    </td>
                                </tr>
                            </table>
                            <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">If you have any questions, please contact us through our website or reply to this email.</p>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
                            <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;">The 24 Fitness Gym</p>
                            <p style="margin: 0; color: #9ca3af; font-size: 12px;">Digwadih No. 10, near Gobinda sweets, Old SBI Building</p>
                            <p style="margin: 10px 0 0; color: #9ca3af; font-size: 12px;">Email: ${REPLY_TO} | Phone: 8084548055</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `.trim();
}

function getGracePeriodStartTemplate(fullName: string, planName: string, gracePeriodEndDate: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Grace Period Started</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 20px; text-align: center;">
                <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #f97316, #dc2626); border-radius: 8px 8px 0 0;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">THE 24 FITNESS GYM</h1>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="margin: 0 0 20px; color: #1a1a1a; font-size: 24px; font-weight: 600;">Grace Period Started</h2>
                            <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">Hello ${fullName},</p>
                            <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">Your <strong>${planName}</strong> membership has entered a <strong>${GRACE_PERIOD_DAYS}-day grace period</strong>.</p>
                            <div style="background-color: #dbeafe; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0; border-radius: 4px;">
                                <p style="margin: 0; color: #1e40af; font-size: 15px; line-height: 1.6;"><strong>You have until ${gracePeriodEndDate}</strong> to renew your membership. After this date, your membership will be cancelled and you'll need to purchase a new plan.</p>
                            </div>
                            <p style="margin: 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">Renew now to continue enjoying all the benefits of your membership without any interruption.</p>
                            <!-- CTA Button -->
                            <table role="presentation" style="width: 100%; margin: 30px 0;">
                                <tr>
                                    <td style="text-align: center;">
                                        <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.the24fitness.co.in'}/dashboard" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #f97316, #dc2626); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Renew Membership</a>
                                    </td>
                                </tr>
                            </table>
                            <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">If you have any questions or need assistance, please contact us through our website or reply to this email.</p>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
                            <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;">The 24 Fitness Gym</p>
                            <p style="margin: 0; color: #9ca3af; font-size: 12px;">Digwadih No. 10, near Gobinda sweets, Old SBI Building</p>
                            <p style="margin: 10px 0 0; color: #9ca3af; font-size: 12px;">Email: ${REPLY_TO} | Phone: 8084548055</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `.trim();
}

function getGracePeriodEndTemplate(fullName: string, planName: string, gracePeriodEndDate: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Final Notice - Grace Period Ending</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 20px; text-align: center;">
                <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #f97316, #dc2626); border-radius: 8px 8px 0 0;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">THE 24 FITNESS GYM</h1>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="margin: 0 0 20px; color: #dc2626; font-size: 24px; font-weight: 600;">Final Notice: Grace Period Ends Today</h2>
                            <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">Hello ${fullName},</p>
                            <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">This is your <strong>final notice</strong> regarding your <strong>${planName}</strong> membership.</p>
                            <div style="background-color: #fee2e2; border-left: 4px solid #dc2626; padding: 16px; margin: 20px 0; border-radius: 4px;">
                                <p style="margin: 0; color: #991b1b; font-size: 15px; line-height: 1.6;"><strong>Your grace period ends today (${gracePeriodEndDate}).</strong> If you do not renew by the end of today, your membership will be cancelled and you'll need to purchase a new plan to continue services.</p>
                            </div>
                            <p style="margin: 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">Don't lose access to your fitness journey. Renew now to continue without interruption.</p>
                            <!-- CTA Button -->
                            <table role="presentation" style="width: 100%; margin: 30px 0;">
                                <tr>
                                    <td style="text-align: center;">
                                        <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.the24fitness.co.in'}/dashboard" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #f97316, #dc2626); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Renew Immediately</a>
                                    </td>
                                </tr>
                            </table>
                            <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">If you have any questions or need assistance, please contact us immediately through our website or reply to this email.</p>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
                            <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;">The 24 Fitness Gym</p>
                            <p style="margin: 0; color: #9ca3af; font-size: 12px;">Digwadih No. 10, near Gobinda sweets, Old SBI Building</p>
                            <p style="margin: 10px 0 0; color: #9ca3af; font-size: 12px;">Email: ${REPLY_TO} | Phone: 8084548055</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `.trim();
}

function getWelcomeEmailTemplate(fullName: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to The 24 Fitness Gym</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 20px; text-align: center;">
                <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #f97316, #dc2626); border-radius: 8px 8px 0 0;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">THE 24 FITNESS GYM</h1>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="margin: 0 0 20px; color: #1a1a1a; font-size: 24px; font-weight: 600;">Welcome to The 24 Fitness Gym! 💪</h2>
                            <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">Hello ${fullName},</p>
                            <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">We're thrilled to have you join The 24 Fitness Gym family! Your fitness journey starts now, and we're here to support you every step of the way.</p>
                            <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 16px; margin: 20px 0; border-radius: 4px;">
                                <p style="margin: 0; color: #065f46; font-size: 15px; line-height: 1.6;"><strong>What's Next?</strong></p>
                                <ul style="margin: 10px 0 0; padding-left: 20px; color: #065f46; font-size: 15px; line-height: 1.8;">
                                    <li>Explore our membership plans and choose the one that fits your goals</li>
                                    <li>Access your dashboard to track your progress</li>
                                    <li>Connect with certified trainers for personalized guidance</li>
                                    <li>Download weekly workout and diet charts</li>
                                </ul>
                            </div>
                            <!-- CTA Button -->
                            <table role="presentation" style="width: 100%; margin: 30px 0;">
                                <tr>
                                    <td style="text-align: center;">
                                        <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.the24fitness.co.in'}/membership" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #f97316, #dc2626); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">View Membership Plans</a>
                                    </td>
                                </tr>
                            </table>
                            <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">If you have any questions or need assistance, please contact us through our website or reply to this email. We're here to help!</p>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
                            <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;">The 24 Fitness Gym</p>
                            <p style="margin: 0; color: #9ca3af; font-size: 12px;">Digwadih No. 10, near Gobinda sweets, Old SBI Building</p>
                            <p style="margin: 10px 0 0; color: #9ca3af; font-size: 12px;">Email: ${REPLY_TO} | Phone: 8084548055</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `.trim();
}

