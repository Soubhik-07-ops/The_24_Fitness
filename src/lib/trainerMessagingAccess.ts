/**
 * Trainer Messaging Access Control
 * 
 * Determines if a user can message a trainer based solely on trainer access validity.
 * Decoupled from membership status or trainer_assigned flag - only checks trainer access dates.
 * 
 * Rules:
 * - Can message ONLY when trainer_period_end > current_date (access is actively valid)
 * - Cannot message when trainer access is expired (trainer_period_end <= current_date)
 * - Cannot message during grace period (expired but grace_period_end > current_date)
 * - Grace period is for renewal opportunity, not messaging access
 */

export interface TrainerAccessStatus {
    canMessage: boolean;
    isActive: boolean;
    isExpired: boolean;
    isInGracePeriod: boolean;
    reason: string;
    gracePeriodDaysRemaining: number | null;
}

/**
 * Check if user can message a trainer based on trainer access validity
 * 
 * @param trainerPeriodEnd - Trainer period end date (trainer_period_end)
 * @param trainerGracePeriodEnd - Trainer grace period end date (trainer_grace_period_end) - optional
 * @param currentDate - Optional current date (for demo mode). Defaults to now.
 * @param membershipEndDate - Optional membership end date (for Regular Monthly plan strict expiry check)
 * @param planName - Optional plan name (to check if Regular Monthly plan)
 * @returns Access status with canMessage flag and detailed information
 */
export function checkTrainerMessagingAccess(
    trainerPeriodEnd: Date | string | null,
    trainerGracePeriodEnd: Date | string | null = null,
    currentDate?: Date | string | null,
    membershipEndDate?: Date | string | null,
    planName?: string | null
): TrainerAccessStatus {
    const now = currentDate
        ? (typeof currentDate === 'string' ? new Date(currentDate) : currentDate)
        : new Date();

    // CRITICAL: For Regular Monthly plans, trainer access expires with membership expiry
    // Check if this is a Regular Monthly plan and if membership has expired
    const planLower = (planName || '').toLowerCase();
    const isRegularMonthly = planLower.includes('regular') && (planLower.includes('monthly') || planLower.includes('boys') || planLower.includes('girls'));
    
    if (isRegularMonthly && membershipEndDate) {
        const membershipEnd = typeof membershipEndDate === 'string' ? new Date(membershipEndDate) : membershipEndDate;
        // If membership has expired, trainer access is immediately revoked (no grace period)
        if (membershipEnd <= now) {
            return {
                canMessage: false,
                isActive: false,
                isExpired: true,
                isInGracePeriod: false,
                reason: 'Your Regular Monthly membership has expired. Trainer access has been revoked. Please renew your membership and add trainer access as an addon.',
                gracePeriodDaysRemaining: null
            };
        }
    }

    // No trainer period end = no trainer access = cannot message
    if (!trainerPeriodEnd) {
        return {
            canMessage: false,
            isActive: false,
            isExpired: true,
            isInGracePeriod: false,
            reason: 'No trainer access period found. Please purchase or renew trainer access.',
            gracePeriodDaysRemaining: null
        };
    }

    const periodEnd = typeof trainerPeriodEnd === 'string' ? new Date(trainerPeriodEnd) : trainerPeriodEnd;
    const graceEnd = trainerGracePeriodEnd
        ? (typeof trainerGracePeriodEnd === 'string' ? new Date(trainerGracePeriodEnd) : trainerGracePeriodEnd)
        : null;

    // Check if trainer period is active (hasn't expired)
    const isActive = periodEnd > now;
    
    // Check if expired (period end has passed)
    const isExpired = periodEnd <= now;
    
    // Check if in grace period (expired but grace period not ended)
    // NOTE: For Regular Monthly plans, grace period is not applicable (checked above)
    const isInGracePeriod = isExpired && graceEnd !== null && now <= graceEnd && !isRegularMonthly;
    
    // Calculate grace period days remaining
    let gracePeriodDaysRemaining: number | null = null;
    if (isInGracePeriod && graceEnd) {
        const diffTime = graceEnd.getTime() - now.getTime();
        gracePeriodDaysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // Can message ONLY if access is actively valid (not expired, not in grace period)
    const canMessage = isActive;

    // Determine reason message
    let reason = '';
    if (isActive) {
        reason = 'Trainer access is active. You can message your trainer.';
    } else if (isInGracePeriod && gracePeriodDaysRemaining !== null) {
        reason = `Trainer access expired. Grace period active (${gracePeriodDaysRemaining} day${gracePeriodDaysRemaining !== 1 ? 's' : ''} remaining). Please renew to continue messaging.`;
    } else if (isExpired) {
        reason = 'Trainer access period has expired. Please renew your trainer access to continue messaging.';
    } else {
        reason = 'Trainer access is not available. Please purchase or renew trainer access.';
    }

    return {
        canMessage,
        isActive,
        isExpired,
        isInGracePeriod,
        reason,
        gracePeriodDaysRemaining
    };
}

/**
 * Get membership with trainer access details for messaging validation
 * This fetches only the necessary fields for access checking
 */
export interface MembershipTrainerAccessData {
    id: number;
    trainer_id: string | null;
    trainer_period_end: string | null;
    trainer_grace_period_end: string | null;
}

/**
 * Check if a user can message a specific trainer based on their membership data
 * 
 * @param membershipData - Membership data with trainer access fields
 * @param trainerId - The trainer ID to check access for
 * @param currentDate - Optional current date (for demo mode)
 * @returns Access status
 */
export function checkTrainerMessagingAccessFromMembership(
    membershipData: MembershipTrainerAccessData | null,
    trainerId: string,
    currentDate?: Date | string | null
): TrainerAccessStatus {
    // No membership or trainer ID mismatch
    if (!membershipData || membershipData.trainer_id !== trainerId) {
        return {
            canMessage: false,
            isActive: false,
            isExpired: true,
            isInGracePeriod: false,
            reason: 'You do not have an assigned trainer. Please contact admin or purchase trainer access.',
            gracePeriodDaysRemaining: null
        };
    }

    return checkTrainerMessagingAccess(
        membershipData.trainer_period_end,
        membershipData.trainer_grace_period_end,
        currentDate
    );
}

