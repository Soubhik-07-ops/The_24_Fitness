/**
 * Trainer renewal eligibility utilities
 * 
 * Checks if a user is eligible to renew their trainer access:
 * 1. Membership must be active
 * 2. Remaining plan duration must be >= minimum trainer duration (30 days)
 * 3. Trainer renewal cannot extend beyond membership end date
 */

import { addMonths } from './membershipUtils';
import { MIN_TRAINER_RENEWAL_DURATION_DAYS } from './trainerGracePeriod';

export interface TrainerRenewalEligibility {
    isEligible: boolean;
    reason?: string;
    remainingPlanDays?: number;
    maxTrainerRenewalDays?: number;
}

/**
 * Check if user is eligible to renew trainer access
 */
export function checkTrainerRenewalEligibility(
    membershipStatus: string,
    membershipEndDate: Date | string | null,
    currentDate: Date = new Date()
): TrainerRenewalEligibility {
    // Check 1: Membership must be active
    if (membershipStatus !== 'active') {
        return {
            isEligible: false,
            reason: `Membership status is '${membershipStatus}'. Trainer renewal requires an active membership.`
        };
    }

    // Check 2: Membership must have an end date
    if (!membershipEndDate) {
        return {
            isEligible: false,
            reason: 'Membership end date is missing. Cannot calculate remaining plan duration.'
        };
    }

    const endDate = typeof membershipEndDate === 'string' ? new Date(membershipEndDate) : membershipEndDate;
    const now = currentDate;

    // Check 3: Calculate remaining plan days
    const diffTime = endDate.getTime() - now.getTime();
    const remainingPlanDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Check 4: Remaining plan duration must be >= minimum trainer duration
    if (remainingPlanDays < MIN_TRAINER_RENEWAL_DURATION_DAYS) {
        return {
            isEligible: false,
            reason: `Remaining plan duration is ${remainingPlanDays} days. Trainer renewal requires at least ${MIN_TRAINER_RENEWAL_DURATION_DAYS} days remaining on your membership.`,
            remainingPlanDays,
            maxTrainerRenewalDays: Math.max(0, remainingPlanDays)
        };
    }

    // Eligible - can renew trainer access
    return {
        isEligible: true,
        remainingPlanDays,
        maxTrainerRenewalDays: remainingPlanDays // Can renew up to remaining plan days
    };
}

/**
 * Calculate maximum trainer renewal period (cannot exceed membership end date)
 */
export function calculateMaxTrainerRenewalPeriod(
    membershipEndDate: Date | string,
    currentDate: Date = new Date()
): { maxDays: number; maxEndDate: Date } {
    const endDate = typeof membershipEndDate === 'string' ? new Date(membershipEndDate) : membershipEndDate;
    const now = currentDate;

    const diffTime = endDate.getTime() - now.getTime();
    const maxDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return {
        maxDays: Math.max(0, maxDays),
        maxEndDate: new Date(endDate)
    };
}

/**
 * Calculate trainer renewal end date (cannot exceed membership end date)
 */
export function calculateTrainerRenewalEndDate(
    renewalStartDate: Date,
    renewalDurationMonths: number,
    membershipEndDate: Date | string
): Date {
    const startDate = new Date(renewalStartDate);
    const membershipEnd = typeof membershipEndDate === 'string' ? new Date(membershipEndDate) : membershipEndDate;

    // Calculate proposed end date
    const proposedEndDate = addMonths(startDate, renewalDurationMonths);

    // Cannot exceed membership end date
    return proposedEndDate <= membershipEnd ? proposedEndDate : new Date(membershipEnd);
}

