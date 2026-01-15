/**
 * Utility functions for membership expiration and status checks
 */

export const EXPIRATION_WARNING_DAYS = 7; // Show warnings 7 days before expiration

/**
 * Safely add months to a date, handling month overflow correctly
 * @param date - The base date
 * @param months - Number of months to add (can be negative)
 * @returns New Date object with months added
 */
export function addMonths(date: Date, months: number): Date {
    const result = new Date(date);
    const dayOfMonth = result.getDate();
    result.setMonth(result.getMonth() + months);
    
    // Handle month overflow (e.g., Jan 31 + 1 month should be Feb 28/29, not March 3)
    // If the day of month has changed, it means we've overflowed
    if (result.getDate() !== dayOfMonth) {
        // Set to last day of the previous month
        result.setDate(0);
    }
    
    return result;
}

/**
 * Check if membership is expiring soon or expired
 * @param endDate - The membership end date (string or Date)
 * @param currentDate - Optional current date (for demo mode). If not provided, uses real current date.
 * @returns Object with isExpiringSoon, isExpired, and daysRemaining
 */
export function getMembershipExpirationStatus(
    endDate: string | Date | null | undefined,
    currentDate?: Date | string | null
): {
    isExpiringSoon: boolean;
    isExpired: boolean;
    daysRemaining: number | null;
} {
    if (!endDate) {
        return { isExpiringSoon: false, isExpired: false, daysRemaining: null };
    }

    const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
    const now = currentDate 
        ? (typeof currentDate === 'string' ? new Date(currentDate) : currentDate)
        : new Date();
    
    // Calculate calendar days difference using UTC dates (ignoring time and timezone)
    // This ensures "7 days remaining" shows correctly (Jan 12 to Jan 19 = 7 days)
    // Using UTC to avoid timezone conversion issues
    const endUTC = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
    const nowUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    
    const diffTime = endUTC - nowUTC;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        return { isExpiringSoon: false, isExpired: true, daysRemaining: Math.abs(diffDays) };
    } else if (diffDays <= EXPIRATION_WARNING_DAYS) {
        return { isExpiringSoon: true, isExpired: false, daysRemaining: diffDays };
    }

    return { isExpiringSoon: false, isExpired: false, daysRemaining: diffDays };
}

/**
 * Check if trainer period is expiring soon or expired
 * @param trainerPeriodEnd - The trainer period end date (string or Date)
 * @param currentDate - Optional current date (for demo mode). If not provided, uses real current date.
 * @returns Object with isExpiringSoon, isExpired, and daysRemaining
 */
export function getTrainerPeriodExpirationStatus(
    trainerPeriodEnd: string | Date | null | undefined,
    currentDate?: Date | string | null
): {
    isExpiringSoon: boolean;
    isExpired: boolean;
    daysRemaining: number | null;
} {
    if (!trainerPeriodEnd) {
        return { isExpiringSoon: false, isExpired: false, daysRemaining: null };
    }

    return getMembershipExpirationStatus(trainerPeriodEnd, currentDate);
}

/**
 * Get membership start date (preferring membership_start_date over start_date)
 * Note: Both fields exist for backward compatibility, but membership_* fields are primary
 */
export function getMembershipStartDate(membership: {
    membership_start_date?: string | null;
    start_date?: string | null;
}): string | null {
    return membership.membership_start_date || membership.start_date || null;
}

/**
 * Get membership end date (preferring membership_end_date over end_date)
 * Note: Both fields exist for backward compatibility, but membership_* fields are primary
 */
export function getMembershipEndDate(membership: {
    membership_end_date?: string | null;
    end_date?: string | null;
}): string | null {
    return membership.membership_end_date || membership.end_date || null;
}

