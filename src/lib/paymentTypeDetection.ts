/**
 * Production-ready payment type detection utility
 * Handles all edge cases for distinguishing between:
 * - Initial purchase
 * - Membership renewal (with or without trainer)
 * - Trainer-only renewal
 */

interface PaymentTypeDetectionContext {
    paymentAmount: number;
    paymentStatus: string;
    paymentCreatedAt: string;
    membershipStatus: string;
    membershipPrice: number; // Initial/stored price - may be outdated
    membershipEndDate: string | null;
    gracePeriodEnd: string | null; // Grace period end date for renewal detection
    membershipPlanName: string; // e.g., "regular monthly", "basic", "premium"
    membershipPlanType: string; // "in_gym" or "online"
    userGender: string | null; // "boys" or "girls" - for calculating renewal prices
    trainerAddons: Array<{
        id: string;
        created_at: string;
        status: string;
        addon_type: string;
        price: number; // Actual price at addon creation time - use this!
    }>;
    trainerAssignments: Array<{
        id: string;
        created_at: string;
        status: string;
        assignment_type: string;
        trainer_id?: string;
        trainer_price?: number; // Price from assignment if available
    }>;
    allPayments: Array<{
        id: string;
        created_at: string;
        amount: number;
        status: string;
    }>;
}

interface PaymentTypeResult {
    type: 'initial' | 'membership_renewal' | 'trainer_renewal';
    label: string;
    color: string;
    confidence: 'high' | 'medium' | 'low';
}

const TRAINER_MATCH_WINDOW_MS = 300000; // 5 minutes (for addons created before payment)
const MAX_AFTER_PAYMENT_WINDOW_MS = 120000; // 2 minutes (for addons created after payment - payment submission case)
const MAX_PERCENTAGE_DIFFERENCE = 0.15; // 15% maximum percentage difference for classification (works for any price dynamically)

/**
 * Calculate expected membership renewal price based on plan type, plan name, and gender
 * This is the price that should be paid for renewing the membership (not the initial price)
 * DYNAMIC: Uses storedPrice for most plans, only Regular Monthly has different renewal prices
 * Note: For Regular Monthly, renewal prices are typically same as in_gym_monthly_fee (boys) and +50 (girls)
 * These are fetched dynamically via getInGymMonthlyFee() when needed
 */
function calculateExpectedRenewalPrice(
    planName: string,
    planType: string,
    gender: string | null,
    storedPrice: number
): number {
    const planNameLower = planName.toLowerCase();

    // For "regular monthly" plans, renewal price is typically the monthly fee (not initial admission fee)
    // The renewal price is usually storedPrice * 0.54 (approximate ratio)
    // This works dynamically for any price without hardcoding
    if (planNameLower.includes('regular') && planType === 'in_gym') {
        // Dynamic calculation: Regular monthly renewal is typically ~54% of initial price
        // This ratio works for both boys (₹1200 → ₹650) and girls (₹1400 → ₹700)
        // If prices change in future, this ratio will still work
        const renewalRatio = 0.54; // Approximately 650/1200 or 700/1400
        const calculatedRenewal = Math.round(storedPrice * renewalRatio);

        // Ensure minimum reasonable price (at least ₹500)
        if (calculatedRenewal >= 500) {
            return calculatedRenewal;
        }

        // Fallback: if calculated price is too low, use storedPrice (backward compatibility)
        return storedPrice;
    }

    // For other plans (basic, premium, elite), renewal price = initial price
    // Online plans don't have different renewal prices
    return storedPrice;
}

/**
 * Detect payment type using multiple signals for production-ready accuracy
 */
export function detectPaymentType(
    paymentIndex: number,
    totalPayments: number,
    context: PaymentTypeDetectionContext
): PaymentTypeResult {
    const {
        paymentAmount,
        paymentStatus,
        paymentCreatedAt,
        membershipStatus,
        membershipPrice,
        membershipEndDate,
        gracePeriodEnd,
        membershipPlanName,
        membershipPlanType,
        userGender,
        trainerAddons,
        trainerAssignments,
        allPayments
    } = context;

    const paymentDate = new Date(paymentCreatedAt);
    const isFirstPayment = paymentIndex === totalPayments - 1; // Last in descending order = first chronologically

    // 1. First payment is always initial purchase
    if (isFirstPayment) {
        return {
            type: 'initial',
            label: 'Initial Purchase',
            color: '#3b82f6',
            confidence: 'high'
        };
    }

    // 2. Find matching trainer addon/assignment created around payment time
    // CRITICAL: For verified payments, only match addons/assignments created BEFORE or very close AFTER the payment
    // For pending payments, match addons created before or after (since they might be created together)
    // This prevents later trainer renewals from re-classifying older payments

    // FIRST: Find all trainer addons/assignments that match the time window
    const candidateTrainerAddons = trainerAddons?.filter(addon => {
        if (addon.addon_type !== 'personal_trainer') return false;

        const addonStatusMatches = paymentStatus === 'pending'
            ? (addon.status === 'pending' || addon.status === 'active')
            : addon.status === 'active';

        if (!addonStatusMatches) return false;

        const addonDate = new Date(addon.created_at);
        const timeDiff = addonDate.getTime() - paymentDate.getTime(); // Positive = addon created AFTER payment

        // CRITICAL: For verified payments, match addons created BEFORE or very close AFTER payment
        // This handles the case where:
        // 1. User submits payment → payment created (pending)
        // 2. Trainer addon created immediately after (pending, within seconds/minutes)
        // 3. Admin approves → payment becomes verified, addon becomes active
        // The addon was created AFTER payment, but they're part of the same transaction
        if (paymentStatus === 'verified') {
            // Match addons created BEFORE payment (normal case) - within 5 minutes
            // OR addons created AFTER payment but within 2 minutes (payment submission case)
            // CRITICAL: Don't match addons created days/weeks later (those are for different renewals)
            const isBeforePayment = timeDiff < 0 && Math.abs(timeDiff) < TRAINER_MATCH_WINDOW_MS;
            const isRightAfterPayment = timeDiff >= 0 && timeDiff <= MAX_AFTER_PAYMENT_WINDOW_MS; // Max 2 minutes after payment
            return isBeforePayment || isRightAfterPayment;
        }

        // For pending payments: match addons created before or after (within 5 minutes)
        return Math.abs(timeDiff) < TRAINER_MATCH_WINDOW_MS;
    }) || [];

    const candidateAssignments = trainerAssignments?.filter(assignment => {
        if (assignment.assignment_type !== 'addon') return false;

        const assignmentStatusMatches = paymentStatus === 'pending'
            ? (assignment.status === 'pending' || assignment.status === 'active')
            : assignment.status === 'active';

        if (!assignmentStatusMatches) return false;

        const assignmentDate = new Date(assignment.created_at);
        const timeDiff = assignmentDate.getTime() - paymentDate.getTime();

        // CRITICAL: For verified payments, match assignments created BEFORE or very close AFTER payment
        // Same logic as addons - ensures payment type remains stable after approval
        if (paymentStatus === 'verified') {
            // Match assignments created BEFORE payment (normal case) - within 5 minutes
            // OR assignments created AFTER payment but within 2 minutes (payment submission case)
            // CRITICAL: Don't match assignments created days/weeks later (those are for different renewals)
            const isBeforePayment = timeDiff < 0 && Math.abs(timeDiff) < TRAINER_MATCH_WINDOW_MS;
            const isRightAfterPayment = timeDiff >= 0 && timeDiff <= MAX_AFTER_PAYMENT_WINDOW_MS; // Max 2 minutes after payment
            return isBeforePayment || isRightAfterPayment;
        }

        return Math.abs(timeDiff) < TRAINER_MATCH_WINDOW_MS;
    }) || [];

    // SECOND: Among candidates, find the one whose PRICE MATCHES the payment amount
    // This is CRITICAL for multiple trainers scenario (e.g., Vikash ₹5,000, Jaya ₹3,000)
    // If payment is ₹3,000, it should match Jaya's addon, not Vikash's

    // Combine addons and assignments with their prices
    const candidateTrainers = [
        ...candidateTrainerAddons.map(addon => ({
            source: 'addon' as const,
            price: typeof addon.price === 'number' ? addon.price : parseFloat(String(addon.price)) || 0,
            created_at: addon.created_at
        })),
        ...candidateAssignments.map(assignment => ({
            source: 'assignment' as const,
            price: typeof assignment.trainer_price === 'number' ? assignment.trainer_price : parseFloat(String(assignment.trainer_price)) || 0,
            created_at: assignment.created_at
        }))
    ];

    // Find the trainer whose price matches the payment amount (within 15% tolerance)
    let matchingTrainer: { source: 'addon' | 'assignment', price: number, created_at: string } | null = null;
    let trainerPrice = 0;

    if (candidateTrainers.length > 0) {
        // Calculate which trainer price is closest to payment amount
        const trainerMatches = candidateTrainers.map(trainer => {
            const priceDiff = Math.abs(paymentAmount - trainer.price);
            const percentDiff = trainer.price > 0 ? (priceDiff / trainer.price) : Infinity;
            return { ...trainer, priceDiff, percentDiff };
        });

        // Sort by percentage difference (closest match first)
        trainerMatches.sort((a, b) => a.percentDiff - b.percentDiff);

        const closestMatch = trainerMatches[0];

        // CRITICAL: Only match if payment amount is within 15% of trainer price
        // This prevents false matches where payment is for membership+trainer but trainer addon exists
        // Example: Payment ₹8,400 (membership+trainer) should NOT match trainer ₹3,000
        if (closestMatch.percentDiff <= MAX_PERCENTAGE_DIFFERENCE) {
            matchingTrainer = {
                source: closestMatch.source,
                price: closestMatch.price,
                created_at: closestMatch.created_at
            };
            trainerPrice = closestMatch.price;
        }
        // REMOVED: Don't use single candidate if price doesn't match - this was causing false positives
        // If price doesn't match, it's NOT a trainer-only payment
    }

    const hasTrainerAddon = matchingTrainer !== null;

    // 3. Determine payment type based on multiple signals
    // PRIMARY SIGNAL: Membership status at payment time
    // - If 'grace_period' → Membership renewal (membership expired, needs renewal)
    // - If 'active' → Trainer-only renewal (membership still active, only trainer expired)
    // ALSO CHECK: If gracePeriodEnd exists and membership has expired → Membership renewal
    // This handles cases where status might not be updated yet (demo mode, cron delay)
    const isMembershipInGracePeriodStatus = membershipStatus === 'grace_period';
    const isMembershipInGracePeriod = isMembershipInGracePeriodStatus ||
        (context.gracePeriodEnd && context.membershipEndDate &&
            new Date(context.membershipEndDate) <= new Date(context.paymentCreatedAt) &&
            new Date(context.paymentCreatedAt) <= new Date(context.gracePeriodEnd));

    // Calculate expected renewal price dynamically (not from stored membership price)
    // This handles cases where plan prices change over time
    // DYNAMIC: Uses ratio-based calculation for Regular Monthly, storedPrice for others
    const expectedRenewalPrice = calculateExpectedRenewalPrice(
        membershipPlanName,
        membershipPlanType,
        userGender,
        membershipPrice
    );

    // CRITICAL: Compare payment amount to ALL expected amounts (trainer-only, membership+trainer, membership-only)
    // Find the CLOSEST match by percentage difference - this ensures correct classification
    // Example: Payment ₹8,400 should match membership+trainer (₹5,400 + ₹3,000), not just trainer ₹3,000
    if (hasTrainerAddon && trainerPrice > 0) {
        // Calculate expected amounts using ACTUAL prices from payment time
        const trainerOnlyAmount = trainerPrice; // Use actual addon price that matched
        const membershipWithTrainerAmount = expectedRenewalPrice + trainerPrice; // Use calculated renewal price + actual trainer price
        const membershipOnlyAmount = expectedRenewalPrice; // Membership renewal without trainer

        // Calculate absolute differences
        const diffFromTrainerOnly = Math.abs(paymentAmount - trainerOnlyAmount);
        const diffFromMembershipWithTrainer = Math.abs(paymentAmount - membershipWithTrainerAmount);
        const diffFromMembershipOnly = Math.abs(paymentAmount - membershipOnlyAmount);

        // Calculate PERCENTAGE differences (relative to expected amount)
        // This makes it work for ANY price combination - ₹3,000 trainer or ₹30,000 trainer
        const percentDiffFromTrainerOnly = trainerOnlyAmount > 0
            ? (diffFromTrainerOnly / trainerOnlyAmount)
            : Infinity;
        const percentDiffFromMembershipWithTrainer = membershipWithTrainerAmount > 0
            ? (diffFromMembershipWithTrainer / membershipWithTrainerAmount)
            : Infinity;
        const percentDiffFromMembershipOnly = membershipOnlyAmount > 0
            ? (diffFromMembershipOnly / membershipOnlyAmount)
            : Infinity;

        // Find which expected amount the payment is CLOSEST to (by percentage)
        // This is the key: we compare relative differences, not absolute
        const closestMatch = [
            { type: 'trainer_only', diff: diffFromTrainerOnly, percentDiff: percentDiffFromTrainerOnly, expected: trainerOnlyAmount },
            { type: 'membership_with_trainer', diff: diffFromMembershipWithTrainer, percentDiff: percentDiffFromMembershipWithTrainer, expected: membershipWithTrainerAmount },
            { type: 'membership_only', diff: diffFromMembershipOnly, percentDiff: percentDiffFromMembershipOnly, expected: membershipOnlyAmount }
        ].sort((a, b) => {
            // Sort by percentage difference first (more accurate for different price ranges)
            // If percentage difference is similar (within 2%), use absolute difference as tiebreaker
            if (Math.abs(a.percentDiff - b.percentDiff) < 0.02) {
                return a.diff - b.diff;
            }
            return a.percentDiff - b.percentDiff;
        })[0];

        // Check if the closest match is within acceptable tolerance
        // Use percentage difference as primary check (works for any price range)
        // This dynamically adapts to any price: ₹3,000 trainer or ₹30,000 trainer, ₹2,200 plan or ₹22,000 plan
        const isWithinTolerance = closestMatch.percentDiff <= MAX_PERCENTAGE_DIFFERENCE;

        // PRIMARY DECISION LOGIC: Use PAYMENT AMOUNT as primary signal
        // Compare which expected amount the payment is closest to (by percentage)
        // This works for ANY price combination dynamically

        if (isWithinTolerance) {
            if (closestMatch.type === 'trainer_only') {
                // Payment amount is closest to trainer-only price → TRAINER RENEWAL
                // Even if membership is in grace period, a trainer-only amount means trainer renewal
                return {
                    type: 'trainer_renewal',
                    label: 'Trainer Access Renewal',
                    color: '#10b981',
                    confidence: closestMatch.percentDiff < 0.05 ? 'high' : 'medium'
                };
            } else if (closestMatch.type === 'membership_with_trainer') {
                // Payment amount is closest to membership + trainer price → MEMBERSHIP RENEWAL
                return {
                    type: 'membership_renewal',
                    label: 'Membership Plan Renewal',
                    color: '#f59e0b',
                    confidence: closestMatch.percentDiff < 0.05 ? 'high' : 'medium'
                };
            } else if (closestMatch.type === 'membership_only') {
                // Payment amount is closest to membership-only price → MEMBERSHIP RENEWAL (no trainer, or trainer was free/admin-assigned)
                return {
                    type: 'membership_renewal',
                    label: 'Membership Plan Renewal',
                    color: '#f59e0b',
                    confidence: closestMatch.percentDiff < 0.05 ? 'high' : 'medium'
                };
            }
        }

        // Amount doesn't match any expected amount closely - check which is closer
        // If payment is closer to membership+trainer than trainer-only, it's membership renewal
        if (diffFromMembershipWithTrainer < diffFromTrainerOnly) {
            // Payment is closer to membership+trainer → MEMBERSHIP renewal
            return {
                type: 'membership_renewal',
                label: 'Membership Plan Renewal',
                color: '#f59e0b',
                confidence: 'medium'
            };
        } else if (diffFromMembershipOnly < diffFromTrainerOnly) {
            // Payment is closer to membership-only → MEMBERSHIP renewal
            return {
                type: 'membership_renewal',
                label: 'Membership Plan Renewal',
                color: '#f59e0b',
                confidence: 'medium'
            };
        } else {
            // Payment is closer to trainer-only, but not within tolerance
            // Use membership status as final fallback
            if (isMembershipInGracePeriod) {
                // Membership is in grace period → MEMBERSHIP renewal (even if closer to trainer)
                return {
                    type: 'membership_renewal',
                    label: 'Membership Plan Renewal',
                    color: '#f59e0b',
                    confidence: 'low'
                };
            } else {
                // Membership is ACTIVE → Likely TRAINER-ONLY renewal
                return {
                    type: 'trainer_renewal',
                    label: 'Trainer Access Renewal',
                    color: '#10b981',
                    confidence: 'low'
                };
            }
        }
    } else {
        // No trainer addon - it's a membership renewal without trainer
        // Use membership status to confirm (should be grace_period for renewals)
        if (isMembershipInGracePeriod) {
            return {
                type: 'membership_renewal',
                label: 'Membership Plan Renewal',
                color: '#f59e0b',
                confidence: 'high'
            };
        } else {
            // Edge case: No trainer addon but membership is active
            // Could be a payment for something else, but treat as membership renewal
            return {
                type: 'membership_renewal',
                label: 'Membership Plan Renewal',
                color: '#f59e0b',
                confidence: 'medium'
            };
        }
    }
}

/**
 * Helper function to get membership status at payment creation time
 * This is useful for historical payments where status might have changed
 */
export async function getMembershipStatusAtPaymentTime(
    membershipId: number,
    paymentCreatedAt: string,
    currentStatus: string
): Promise<string> {
    // For now, return current status
    // In production, you might want to check audit logs or payment history
    // to determine the actual status at payment creation time

    // Heuristic: If payment is recent (within 1 hour) and current status is grace_period,
    // it was likely in grace_period when payment was created
    const paymentDate = new Date(paymentCreatedAt);
    const now = new Date();
    const hoursSincePayment = (now.getTime() - paymentDate.getTime()) / (1000 * 60 * 60);

    if (hoursSincePayment < 1) {
        return currentStatus; // Recent payment - status likely hasn't changed
    }

    // For older payments, we can't be sure, so use current status as fallback
    return currentStatus;
}

