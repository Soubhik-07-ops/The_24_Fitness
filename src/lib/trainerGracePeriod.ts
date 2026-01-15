/**
 * Trainer grace period utilities
 * 
 * Trainer grace period system:
 * - When trainer period expires, allow 3-5 day grace period for renewal
 * - During grace period, trainer access is blocked but membership remains active
 * - Show warnings and send notifications
 * - If renewed within grace period, extend trainer period
 * - If grace period ends, trainer access is permanently revoked (until new renewal)
 */

export const TRAINER_GRACE_PERIOD_DAYS = 5; // 5-day grace period for trainer renewals
export const MIN_TRAINER_RENEWAL_DURATION_DAYS = 30; // Minimum plan duration required for trainer renewal

/**
 * Calculate trainer grace period end date (trainer_period_end + 5 days)
 */
export function calculateTrainerGracePeriodEnd(trainerPeriodEnd: Date | string): Date {
    const end = typeof trainerPeriodEnd === 'string' ? new Date(trainerPeriodEnd) : trainerPeriodEnd;
    const graceEnd = new Date(end);
    graceEnd.setDate(graceEnd.getDate() + TRAINER_GRACE_PERIOD_DAYS);
    return graceEnd;
}

/**
 * Check if trainer period is in grace period
 * @param trainerPeriodEnd - The trainer period end date
 * @param trainerGracePeriodEnd - The trainer grace period end date
 * @param currentDate - Optional current date (for demo mode). If not provided, uses real current date.
 */
export function isTrainerInGracePeriod(
    trainerPeriodEnd: Date | string | null,
    trainerGracePeriodEnd: Date | string | null,
    currentDate?: Date | string | null
): boolean {
    if (!trainerPeriodEnd || !trainerGracePeriodEnd) return false;

    const end = typeof trainerPeriodEnd === 'string' ? new Date(trainerPeriodEnd) : trainerPeriodEnd;
    const graceEnd = typeof trainerGracePeriodEnd === 'string' ? new Date(trainerGracePeriodEnd) : trainerGracePeriodEnd;
    const now = currentDate
        ? (typeof currentDate === 'string' ? new Date(currentDate) : currentDate)
        : new Date();

    // In grace period if past trainer_period_end but before grace_period_end
    return end <= now && now <= graceEnd;
}

/**
 * Calculate days remaining in trainer grace period
 * @param trainerGracePeriodEnd - The trainer grace period end date
 * @param currentDate - Optional current date (for demo mode). If not provided, uses real current date.
 */
export function getTrainerGracePeriodDaysRemaining(
    trainerGracePeriodEnd: Date | string | null,
    currentDate?: Date | string | null
): number | null {
    if (!trainerGracePeriodEnd) return null;

    const graceEnd = typeof trainerGracePeriodEnd === 'string' ? new Date(trainerGracePeriodEnd) : trainerGracePeriodEnd;
    const now = currentDate
        ? (typeof currentDate === 'string' ? new Date(currentDate) : currentDate)
        : new Date();
    const diffTime = graceEnd.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
}

/**
 * Check if trainer period should transition to grace period
 */
export function shouldTransitionTrainerToGracePeriod(
    trainerPeriodEnd: Date | string | null,
    trainerGracePeriodEnd: Date | string | null
): boolean {
    if (!trainerPeriodEnd) return false;

    const end = typeof trainerPeriodEnd === 'string' ? new Date(trainerPeriodEnd) : trainerPeriodEnd;
    const now = new Date();

    // Transition if past trainer_period_end and not already in grace period
    return end <= now && !trainerGracePeriodEnd;
}

