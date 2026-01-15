/**
 * Trainer Renewal Submission API
 * 
 * Allows users to submit a renewal payment for trainer access.
 * Validates eligibility (active membership, sufficient plan duration).
 * Creates trainer addon and payment record.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { checkTrainerRenewalEligibility, calculateTrainerRenewalEndDate } from '@/lib/trainerRenewalEligibility';
import { getInGymAdmissionFee } from '@/lib/adminSettings';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id: membershipId } = await context.params;
        const membershipIdNum = parseInt(membershipId, 10);

        if (isNaN(membershipIdNum)) {
            return NextResponse.json(
                { error: 'Invalid membership ID' },
                { status: 400 }
            );
        }

        // Get user from session token
        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json(
                { error: 'Not authenticated' },
                { status: 401 }
            );
        }

        const token = authHeader.replace('Bearer ', '');

        // Verify token and get user
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) {
            return NextResponse.json(
                { error: 'Invalid authentication token' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { transactionId, paymentDate, amount, screenshotPath, trainerId, durationMonths } = body;

        // Validate required fields
        if (!transactionId || !paymentDate || !amount || !screenshotPath || !trainerId || !durationMonths) {
            return NextResponse.json(
                { error: 'Missing required fields: transactionId, paymentDate, amount, screenshotPath, trainerId, durationMonths' },
                { status: 400 }
            );
        }

        // Fetch membership
        const { data: membership, error: membershipError } = await supabaseAdmin
            .from('memberships')
            .select('*')
            .eq('id', membershipIdNum)
            .eq('user_id', user.id)
            .single();

        if (membershipError || !membership) {
            return NextResponse.json(
                { error: 'Membership not found or access denied' },
                { status: 404 }
            );
        }

        // Check eligibility for trainer renewal
        const eligibility = checkTrainerRenewalEligibility(
            membership.status,
            membership.membership_end_date || membership.end_date
        );

        if (!eligibility.isEligible) {
            return NextResponse.json(
                {
                    error: eligibility.reason || 'Not eligible for trainer renewal',
                    eligibility
                },
                { status: 400 }
            );
        }

        // Verify trainer exists
        const { data: trainer, error: trainerError } = await supabaseAdmin
            .from('trainers')
            .select('id, name, price, is_active')
            .eq('id', trainerId)
            .single();

        if (trainerError || !trainer) {
            return NextResponse.json(
                { error: 'Trainer not found' },
                { status: 404 }
            );
        }

        if (!trainer.is_active) {
            return NextResponse.json(
                { error: 'Trainer is not active' },
                { status: 400 }
            );
        }

        // Validate trainer price matches payment amount
        const expectedAmount = parseFloat(trainer.price?.toString() || '0') * durationMonths;
        if (Math.abs(parseFloat(amount) - expectedAmount) > 1) { // Allow 1 rupee difference for rounding
            return NextResponse.json(
                {
                    error: `Payment amount (₹${amount}) does not match expected trainer fee (₹${expectedAmount} for ${durationMonths} month(s))`,
                    expectedAmount,
                    receivedAmount: amount
                },
                { status: 400 }
            );
        }

        // Calculate trainer renewal end date (cannot exceed membership end date)
        const membershipEndDate = membership.membership_end_date || membership.end_date;
        if (!membershipEndDate) {
            return NextResponse.json(
                { error: 'Membership end date is missing' },
                { status: 400 }
            );
        }

        const currentTrainerPeriodEnd = membership.trainer_period_end
            ? new Date(membership.trainer_period_end)
            : new Date();

        // Start renewal from current trainer period end (or now if expired)
        const renewalStartDate = currentTrainerPeriodEnd > new Date()
            ? currentTrainerPeriodEnd
            : new Date();

        const trainerRenewalEndDate = calculateTrainerRenewalEndDate(
            renewalStartDate,
            durationMonths,
            membershipEndDate
        );

        // Check if renewal would exceed membership end date
        if (trainerRenewalEndDate > new Date(membershipEndDate)) {
            return NextResponse.json(
                {
                    error: `Trainer renewal cannot extend beyond membership end date (${new Date(membershipEndDate).toLocaleDateString()}). Maximum renewal period: ${eligibility.maxTrainerRenewalDays} days.`,
                    membershipEndDate,
                    maxRenewalDays: eligibility.maxTrainerRenewalDays
                },
                { status: 400 }
            );
        }

        // CRITICAL: Check for ANY existing pending payment (prevent duplicate submissions)
        const { data: existingPendingPayments } = await supabaseAdmin
            .from('membership_payments')
            .select('id, created_at, amount')
            .eq('membership_id', membershipIdNum)
            .eq('status', 'pending');

        if (existingPendingPayments && existingPendingPayments.length > 0) {
            return NextResponse.json(
                { 
                    error: 'A payment is already pending for this membership. Please wait for admin approval before submitting another payment.',
                    pendingPayments: existingPendingPayments.length
                },
                { status: 400 }
            );
        }

        // Create payment record with explicit payment_purpose for trainer renewal
        const { data: payment, error: paymentError } = await supabaseAdmin
            .from('membership_payments')
            .insert({
                membership_id: membershipIdNum,
                transaction_id: transactionId,
                payment_date: paymentDate,
                amount: amount,
                payment_screenshot_url: screenshotPath,
                payment_method: 'qr_code',
                status: 'pending',
                payment_purpose: 'trainer_renewal' // Explicit intent: trainer renewal
            })
            .select()
            .single();

        if (paymentError) {
            console.error('Error creating trainer renewal payment:', paymentError);
            return NextResponse.json(
                { error: paymentError.message || 'Failed to create payment record' },
                { status: 500 }
            );
        }

        // Create trainer addon with pending status
        // Note: metadata column doesn't exist in membership_addons table, so we don't include it
        const { data: trainerAddon, error: addonError } = await supabaseAdmin
            .from('membership_addons')
            .insert({
                membership_id: membershipIdNum,
                addon_type: 'personal_trainer',
                price: expectedAmount,
                status: 'pending',
                trainer_id: trainerId
            })
            .select()
            .single();

        if (addonError) {
            console.error('Error creating trainer addon:', addonError);
            // CRITICAL: If addon creation fails, we should fail the payment too
            // Otherwise, admin approval will fail because addon is missing
            // Delete the payment that was just created
            await supabaseAdmin
                .from('membership_payments')
                .delete()
                .eq('id', payment.id);
            
            return NextResponse.json(
                { 
                    error: 'Failed to create trainer addon. Payment was not processed. Please try again.',
                    details: addonError.message
                },
                { status: 500 }
            );
        }

        if (!trainerAddon) {
            // Addon creation succeeded but no data returned - this shouldn't happen but handle it
            console.error('Trainer addon creation succeeded but no data returned');
            await supabaseAdmin
                .from('membership_payments')
                .delete()
                .eq('id', payment.id);
            
            return NextResponse.json(
                { error: 'Failed to create trainer addon. Payment was not processed. Please try again.' },
                { status: 500 }
            );
        }

        // Create trainer assignment request (pending)
        const { data: assignment, error: assignmentError } = await supabaseAdmin
            .from('trainer_assignments')
            .insert({
                membership_id: membershipIdNum,
                trainer_id: trainerId,
                user_id: user.id,
                assignment_type: 'addon',
                status: 'pending',
                period_start: renewalStartDate.toISOString(),
                period_end: trainerRenewalEndDate.toISOString(),
                metadata: {
                    renewal: true,
                    payment_id: payment.id,
                    addon_id: trainerAddon?.id || null
                }
            })
            .select()
            .single();

        if (assignmentError) {
            console.error('Error creating trainer assignment request:', assignmentError);
            // Don't fail - payment and addon were created
        }

        // Create notification for admin
        const { error: notificationError } = await supabaseAdmin
            .from('notifications')
            .insert({
                recipient_id: null, // Admin notification
                actor_role: 'system',
                type: 'trainer_renewal_payment_submitted',
                content: `User has submitted a trainer renewal payment for ${membership.plan_name} membership. Trainer: ${trainer.name}, Duration: ${durationMonths} month(s), Amount: ₹${amount}`,
                is_read: false,
                metadata: {
                    membership_id: membershipIdNum,
                    payment_id: payment.id,
                    trainer_id: trainerId,
                    addon_id: trainerAddon?.id || null,
                    assignment_id: assignment?.id || null
                }
            });

        if (notificationError) {
            console.error('Failed to create notification:', notificationError);
        }

        return NextResponse.json({
            success: true,
            message: 'Trainer renewal payment submitted successfully. Admin will verify and activate your trainer access soon.',
            payment: {
                id: payment.id,
                amount: payment.amount,
                status: payment.status
            },
            trainerAddon: trainerAddon ? {
                id: trainerAddon.id,
                status: trainerAddon.status
            } : null,
            assignment: assignment ? {
                id: assignment.id,
                status: assignment.status
            } : null
        });

    } catch (error: any) {
        console.error('Error in trainer renewal submission:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}

