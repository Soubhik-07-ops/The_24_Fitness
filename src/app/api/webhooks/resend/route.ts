/**
 * Resend Webhook Handler
 * 
 * Receives webhook events from Resend for email delivery status:
 * - email.sent
 * - email.delivered
 * - email.delivery_delayed
 * - email.complained
 * - email.bounced
 * - email.opened
 * - email.clicked
 * 
 * Logs bounce/complaint events to email_failures table for admin visibility
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Resend webhook secret (set in Resend dashboard)
const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET || '';

interface ResendWebhookEvent {
    type: string;
    created_at: string;
    data: {
        email_id: string;
        from: string;
        to: string[];
        subject: string;
        created_at: string;
        bounce_type?: string;
        bounce_subtype?: string;
        complaint_feedback_type?: string;
    };
}

/**
 * Verify webhook signature from Resend (uses Svix)
 * Resend/Svix signs webhooks with HMAC SHA256
 * Signature format: Base64 encoded HMAC SHA256 hash
 */
function verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
): boolean {
    if (!secret) {
        console.warn('[RESEND WEBHOOK] No webhook secret configured, skipping signature verification');
        return true; // Allow if no secret (for development)
    }

    try {
        // Svix uses HMAC SHA256 with base64 encoding
        const hmac = crypto.createHmac('sha256', secret);
        const digest = hmac.update(payload).digest('base64');

        // Compare signatures using constant-time comparison
        const providedSignature = signature.trim();
        const expectedSignature = digest.trim();

        // Use constant-time comparison to prevent timing attacks
        if (providedSignature.length !== expectedSignature.length) {
            return false;
        }

        return crypto.timingSafeEqual(
            Buffer.from(providedSignature),
            Buffer.from(expectedSignature)
        );
    } catch (error) {
        console.error('[RESEND WEBHOOK] Signature verification error:', error);
        return false;
    }
}

/**
 * Find user and membership from email address
 */
async function findUserAndMembershipByEmail(
    emailAddress: string
): Promise<{ userId: string | null; membershipId: number | null }> {
    try {
        // First, try to find user by email in auth.users
        const { data: { users }, error: authError } = await supabaseAdmin.auth.admin.listUsers();

        if (authError || !users) {
            console.error('[RESEND WEBHOOK] Error fetching users:', authError);
            return { userId: null, membershipId: null };
        }

        const user = users.find(u => u.email === emailAddress);
        if (!user) {
            console.log(`[RESEND WEBHOOK] User not found for email: ${emailAddress}`);
            return { userId: null, membershipId: null };
        }

        // Try to find active membership for this user
        const { data: membership, error: membershipError } = await supabaseAdmin
            .from('memberships')
            .select('id, status')
            .eq('user_id', user.id)
            .in('status', ['active', 'grace_period'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (membershipError) {
            console.error('[RESEND WEBHOOK] Error fetching membership:', membershipError);
            return { userId: user.id, membershipId: null };
        }

        return {
            userId: user.id,
            membershipId: membership?.id || null
        };
    } catch (error) {
        console.error('[RESEND WEBHOOK] Exception finding user:', error);
        return { userId: null, membershipId: null };
    }
}

/**
 * Determine event type from email subject
 */
function inferEmailEventType(subject: string): string {
    const subjectLower = subject.toLowerCase();

    if (subjectLower.includes('expires soon') || subjectLower.includes('5 days')) {
        return 'plan_expiry_reminder_5days';
    }
    if (subjectLower.includes('expires today') || subjectLower.includes('has expired')) {
        return 'plan_expiry_day';
    }
    if (subjectLower.includes('grace period started')) {
        return 'grace_period_start';
    }
    if (subjectLower.includes('grace period ends') || subjectLower.includes('final notice')) {
        return 'grace_period_end';
    }
    if (subjectLower.includes('welcome')) {
        return 'welcome_email';
    }

    return 'unknown';
}

/**
 * Log webhook event to email_failures table
 */
async function logWebhookFailure(
    userId: string | null,
    membershipId: number | null,
    emailAddress: string,
    subject: string,
    webhookType: string,
    errorMessage: string,
    emailId: string
): Promise<void> {
    if (!userId) {
        console.log(`[RESEND WEBHOOK] Cannot log failure - no user ID found for email: ${emailAddress}`);
        return;
    }

    try {
        const eventType = inferEmailEventType(subject);

        // Check if this is a valid event type for email_failures
        const validEventTypes = [
            'plan_expiry_reminder_5days',
            'plan_expiry_day',
            'grace_period_start',
            'grace_period_end',
            'welcome_email'
        ];

        const finalEventType = validEventTypes.includes(eventType) ? eventType : 'unknown';

        // Format error message based on webhook type
        let formattedErrorMessage = errorMessage;
        if (webhookType === 'email.bounced') {
            formattedErrorMessage = `Email bounced: ${errorMessage || 'Recipient email address does not exist or is invalid'}`;
        } else if (webhookType === 'email.complained') {
            formattedErrorMessage = `Email complaint: ${errorMessage || 'Recipient marked email as spam'}`;
        } else if (webhookType === 'email.delivery_delayed') {
            formattedErrorMessage = `Delivery delayed: ${errorMessage || 'Email delivery is taking longer than expected'}`;
        }

        const { error } = await supabaseAdmin
            .from('email_failures')
            .insert({
                user_id: userId,
                membership_id: membershipId,
                event_type: finalEventType,
                email_address: emailAddress,
                error_message: formattedErrorMessage,
                retry_count: 0,
                last_attempt_at: new Date().toISOString()
            });

        if (error) {
            console.error('[RESEND WEBHOOK] Error logging webhook failure:', error);
        } else {
            console.log(`[RESEND WEBHOOK] Logged ${webhookType} for email: ${emailAddress}, event: ${finalEventType}`);
        }
    } catch (error) {
        console.error('[RESEND WEBHOOK] Exception logging webhook failure:', error);
    }
}

export async function POST(request: NextRequest) {
    try {
        // Get raw body for signature verification
        const rawBody = await request.text();

        // Resend uses Svix for webhooks - signature is in svix-signature header
        // Format: "v1,<signature>" or just "<signature>"
        const signatureHeader = request.headers.get('svix-signature') || '';
        let signature = signatureHeader;

        // Extract signature if it's in "v1,<signature>" format
        if (signatureHeader.includes(',')) {
            const parts = signatureHeader.split(',');
            signature = parts.find(part => !part.startsWith('v')) || signatureHeader;
        }

        // Verify webhook signature (skip if no secret set - for development)
        if (RESEND_WEBHOOK_SECRET && signature) {
            if (!verifyWebhookSignature(rawBody, signature, RESEND_WEBHOOK_SECRET)) {
                console.error('[RESEND WEBHOOK] Invalid webhook signature');
                return NextResponse.json(
                    { error: 'Invalid signature' },
                    { status: 401 }
                );
            }
        } else if (RESEND_WEBHOOK_SECRET && !signature) {
            console.warn('[RESEND WEBHOOK] Webhook secret configured but no signature header found');
        }

        // Parse webhook event
        let event: ResendWebhookEvent;
        try {
            event = JSON.parse(rawBody);
        } catch (error) {
            console.error('[RESEND WEBHOOK] Invalid JSON payload:', error);
            return NextResponse.json(
                { error: 'Invalid JSON payload' },
                { status: 400 }
            );
        }

        console.log(`[RESEND WEBHOOK] Received event: ${event.type}`, {
            emailId: event.data?.email_id,
            to: event.data?.to,
            subject: event.data?.subject
        });

        // Process bounce, complaint, and delivery_delayed events
        const failureEventTypes = ['email.bounced', 'email.complained', 'email.delivery_delayed'];

        if (failureEventTypes.includes(event.type)) {
            const emailAddress = event.data?.to?.[0] || '';
            const subject = event.data?.subject || '';
            const emailId = event.data?.email_id || '';

            if (!emailAddress) {
                console.warn('[RESEND WEBHOOK] No email address in webhook event');
                return NextResponse.json({ success: true });
            }

            // Find user and membership
            const { userId, membershipId } = await findUserAndMembershipByEmail(emailAddress);

            // Format error message
            let errorMessage = '';
            if (event.type === 'email.bounced') {
                errorMessage = event.data?.bounce_type
                    ? `Bounce type: ${event.data.bounce_type}${event.data.bounce_subtype ? ` (${event.data.bounce_subtype})` : ''}`
                    : 'Email bounced - recipient address invalid or mailbox full';
            } else if (event.type === 'email.complained') {
                errorMessage = event.data?.complaint_feedback_type
                    ? `Complaint: ${event.data.complaint_feedback_type}`
                    : 'Recipient marked email as spam';
            } else if (event.type === 'email.delivery_delayed') {
                errorMessage = 'Email delivery delayed - retrying delivery';
            }

            // Log to email_failures table
            await logWebhookFailure(
                userId || '',
                membershipId,
                emailAddress,
                subject,
                event.type,
                errorMessage,
                emailId
            );
        } else {
            // Log other events for debugging (delivered, opened, clicked, etc.)
            console.log(`[RESEND WEBHOOK] Event ${event.type} received (not a failure event)`);
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[RESEND WEBHOOK] Exception processing webhook:', error);
        return NextResponse.json(
            { error: 'Failed to process webhook' },
            { status: 500 }
        );
    }
}

// Allow GET for webhook verification (Resend may ping the endpoint)
export async function GET(request: NextRequest) {
    return NextResponse.json({
        message: 'Resend webhook endpoint is active',
        timestamp: new Date().toISOString()
    });
}

