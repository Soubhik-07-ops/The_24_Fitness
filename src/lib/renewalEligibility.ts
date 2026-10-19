/**
 * Comprehensive Renewal Eligibility Utility
 * 
 * Determines explicit eligibility for membership and trainer renewals
 * Based on status fields and date checks, NOT inferred from payment history or addons
 * 
 * Rules:
 * - Membership Renewal: Eligible when status === 'grace_period' (membership expired)
 * - Trainer Renewal: Eligible when status === 'active' AND trainer_period_end has expired
 * - These are mutually exclusive eligibility checks
 */

import { checkTrainerRenewalEligibility } from './trainerRenewalEligibility';
import { isTrainerInGracePeriod } from './trainerGracePeriod';

export interface MembershipRenewalEligibility {
    isEligible: boolean;
    reason?: string;
    gracePeriodDaysRemaining?: number | null;
}

export interface TrainerRenewalEligibility {
    isEligible: boolean;
    reason?: string;
    isInGracePeriod?: boolean;
    gracePeriodDaysRemaining?: number | null;
    remainingPlanDays?: number;
}

export interface RenewalEligibilityStatus {
    membershipRenewal: MembershipRenewalEligibility;
    trainerRenewal: TrainerRenewalEligibility;
}

/**
 * Check membership renewal eligibility
 * Authoritative boundary conditions:
 * 1. Active membership within 15-day renewal window (daysRemaining <= 15 or already past expiry)
 * 2. In grace period (status === 'grace_period' or within 5 days past expiry)
 * 3. Expired membership (status === 'expired' or > 5 days past expiry - reactivation renewal)
 * 4. Rejected payment retry (status === 'rejected')
 */
export function checkMembershipRenewalEligibility(
    membershipStatus: string,
    membershipEndDate: Date | string | null,
    gracePeriodEnd: Date | string | null,
    currentDate: Date = new Date()
): MembershipRenewalEligibility {
    const status = (membershipStatus || '').toLowerCase();

    // Not eligible for new purchases awaiting payment or pending verification
    if (status === 'awaiting_payment' || status === 'pending') {
        return {
            isEligible: false,
            reason: `Membership is in '${membershipStatus}' status. Payment is either awaiting initial submission or pending admin verification.`
        };
    }

    const endDate = membershipEndDate
        ? (typeof membershipEndDate === 'string' ? new Date(membershipEndDate) : membershipEndDate)
        : null;

    const daysRemaining = endDate
        ? Math.ceil((endDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

    // 1. Grace period state
    if (status === 'grace_period') {
        let graceDaysRemaining = 0;
        if (gracePeriodEnd) {
            const graceEnd = typeof gracePeriodEnd === 'string' ? new Date(gracePeriodEnd) : gracePeriodEnd;
            if (currentDate > graceEnd) {
                return {
                    isEligible: false,
                    reason: 'Grace period has ended. Membership can no longer be renewed.'
                };
            }
            graceDaysRemaining = Math.max(0, Math.ceil((graceEnd.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)));
        } else if (endDate) {
            // Default 5-day grace window
            const defaultGraceEnd = new Date(endDate.getTime() + 5 * 24 * 60 * 60 * 1000);
            if (currentDate > defaultGraceEnd) {
                return {
                    isEligible: false,
                    reason: 'Grace period has ended. Membership can no longer be renewed.'
                };
            }
            graceDaysRemaining = Math.max(0, Math.ceil((defaultGraceEnd.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)));
        }

        return {
            isEligible: true,
            gracePeriodDaysRemaining: graceDaysRemaining
        };
    }

    // 2. Active membership within 15-day pre-expiry window
    if (status === 'active') {
        if (!endDate || daysRemaining <= 15) {
            return {
                isEligible: true,
                gracePeriodDaysRemaining: null
            };
        }
        return {
            isEligible: false,
            reason: `Membership is active with ${daysRemaining} days remaining. Early renewal opens 15 days before expiration.`
        };
    }

    // 3. Expired membership (outside grace period)
    if (status === 'expired') {
        return {
            isEligible: false,
            reason: `Membership status is 'expired'. Grace period has ended. Membership must be reactivated.`
        };
    }

    // 4. Rejected payment retry
    if (status === 'rejected') {
        return {
            isEligible: true,
            gracePeriodDaysRemaining: null
        };
    }

    return {
        isEligible: false,
        reason: `Membership in status '${membershipStatus}' is not eligible for renewal.`
    };
}

/**
 * Check trainer renewal eligibility
 * Eligible when:
 * 1. Membership status === 'active' (membership must be active)
 * 2. Trainer is assigned (trainer_assigned === true)
 * 3. Trainer period has expired (trainer_period_end < currentDate)
 * 4. Remaining plan duration >= minimum trainer duration (30 days)
 */
export function checkTrainerRenewalEligibilityExplicit(
    membershipStatus: string,
    trainerAssigned: boolean,
    trainerPeriodEnd: Date | string | null,
    trainerGracePeriodEnd: Date | string | null,
    membershipEndDate: Date | string | null,
    currentDate: Date = new Date()
): TrainerRenewalEligibility {
    // CRITICAL: Only eligible if membership is active
    if (membershipStatus !== 'active') {
        return {
            isEligible: false,
            reason: `Membership status is '${membershipStatus}'. Trainer renewal requires an active membership.`
        };
    }

    // Must have trainer assigned
    if (!trainerAssigned) {
        return {
            isEligible: false,
            reason: 'No trainer is assigned to this membership. Trainer renewal is not applicable.'
        };
    }

    // Must have trainer period end date
    if (!trainerPeriodEnd) {
        return {
            isEligible: false,
            reason: 'Trainer period end date is missing. Cannot determine trainer renewal eligibility.'
        };
    }

    const periodEnd = typeof trainerPeriodEnd === 'string' ? new Date(trainerPeriodEnd) : trainerPeriodEnd;
    const now = currentDate;

    // Check if trainer period has expired
    const isExpired = periodEnd < now;

    if (!isExpired) {
        return {
            isEligible: false,
            reason: `Trainer period is still active (ends ${periodEnd.toLocaleDateString()}). Renewal is not yet available.`
        };
    }

    // Check if in grace period
    const inGracePeriod = trainerGracePeriodEnd
        ? isTrainerInGracePeriod(trainerPeriodEnd, trainerGracePeriodEnd, currentDate)
        : false;

    // Check remaining plan duration (use trainer renewal eligibility utility)
    const membershipEnd = typeof membershipEndDate === 'string'
        ? new Date(membershipEndDate)
        : (membershipEndDate || new Date());

    const planEligibility = checkTrainerRenewalEligibility(
        membershipStatus,
        membershipEnd,
        currentDate
    );

    if (!planEligibility.isEligible) {
        return {
            isEligible: false,
            reason: planEligibility.reason || 'Trainer renewal is not eligible.',
            isInGracePeriod: inGracePeriod,
            remainingPlanDays: planEligibility.remainingPlanDays
        };
    }

    // Calculate grace period days remaining if applicable
    let graceDaysRemaining: number | null = null;
    if (inGracePeriod && trainerGracePeriodEnd) {
        const graceEnd = typeof trainerGracePeriodEnd === 'string'
            ? new Date(trainerGracePeriodEnd)
            : trainerGracePeriodEnd;
        const diffTime = graceEnd.getTime() - now.getTime();
        graceDaysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    return {
        isEligible: true,
        isInGracePeriod: inGracePeriod,
        gracePeriodDaysRemaining: graceDaysRemaining,
        remainingPlanDays: planEligibility.remainingPlanDays
    };
}

/**
 * Get comprehensive renewal eligibility status for a membership
 * Returns both membership and trainer renewal eligibility
 */
export function getRenewalEligibilityStatus(
    membershipStatus: string,
    membershipEndDate: Date | string | null,
    gracePeriodEnd: Date | string | null,
    trainerAssigned: boolean,
    trainerPeriodEnd: Date | string | null,
    trainerGracePeriodEnd: Date | string | null,
    currentDate: Date = new Date()
): RenewalEligibilityStatus {
    const membershipRenewal = checkMembershipRenewalEligibility(
        membershipStatus,
        membershipEndDate,
        gracePeriodEnd,
        currentDate
    );

    const trainerRenewal = checkTrainerRenewalEligibilityExplicit(
        membershipStatus,
        trainerAssigned,
        trainerPeriodEnd,
        trainerGracePeriodEnd,
        membershipEndDate,
        currentDate
    );

    return {
        membershipRenewal,
        trainerRenewal
    };
}

/**
 * Determine which renewal badge to show in admin panel
 * Returns 'membership_renewal', 'trainer_renewal', or null
 * These are mutually exclusive - only one can be eligible at a time
 */
export function getRenewalBadgeType(
    membershipStatus: string,
    membershipEndDate: Date | string | null,
    gracePeriodEnd: Date | string | null,
    trainerAssigned: boolean,
    trainerPeriodEnd: Date | string | null,
    trainerGracePeriodEnd: Date | string | null,
    currentDate: Date = new Date()
): 'membership_renewal' | 'trainer_renewal' | null {
    const eligibility = getRenewalEligibilityStatus(
        membershipStatus,
        membershipEndDate,
        gracePeriodEnd,
        trainerAssigned,
        trainerPeriodEnd,
        trainerGracePeriodEnd,
        currentDate
    );

    // Priority: Membership renewal takes precedence if eligible
    // (If membership is in grace period, trainer renewal is not applicable)
    if (eligibility.membershipRenewal.isEligible) {
        return 'membership_renewal';
    }

    // Trainer renewal is only eligible if membership renewal is NOT eligible
    if (eligibility.trainerRenewal.isEligible) {
        return 'trainer_renewal';
    }

    return null;
}

