/**
 * Trainer access control utilities
 * 
 * Centralized functions for checking trainer access, including grace period handling
 */

import { isTrainerInGracePeriod, getTrainerGracePeriodDaysRemaining } from './trainerGracePeriod';

/**
 * Check if user has active trainer access
 * Trainer access is active if:
 * 1. trainer_assigned is true
 * 2. trainer_period_end is in the future OR trainer is in grace period
 */
export function hasActiveTrainerAccess(
    trainerAssigned: boolean,
    trainerPeriodEnd: Date | string | null,
    trainerGracePeriodEnd: Date | string | null
): boolean {
    if (!trainerAssigned) return false;
    if (!trainerPeriodEnd) return false;

    const periodEnd = typeof trainerPeriodEnd === 'string' ? new Date(trainerPeriodEnd) : trainerPeriodEnd;
    const now = new Date();

    // Active if period hasn't ended yet
    if (periodEnd > now) return true;

    // If period ended, check if in grace period
    return isTrainerInGracePeriod(trainerPeriodEnd, trainerGracePeriodEnd);
}

/**
 * Check if trainer access is in grace period
 */
export function isTrainerAccessInGracePeriod(
    trainerPeriodEnd: Date | string | null,
    trainerGracePeriodEnd: Date | string | null
): boolean {
    return isTrainerInGracePeriod(trainerPeriodEnd, trainerGracePeriodEnd);
}

/**
 * Get trainer access status
 * @param currentDate - Optional current date (for demo mode). If not provided, uses real current date.
 */
export function getTrainerAccessStatus(
    trainerAssigned: boolean,
    trainerPeriodEnd: Date | string | null,
    trainerGracePeriodEnd: Date | string | null,
    currentDate?: Date | string | null
): 'active' | 'grace_period' | 'expired' | 'none' {
    if (!trainerAssigned) return 'none';
    if (!trainerPeriodEnd) return 'none';

    const periodEnd = typeof trainerPeriodEnd === 'string' ? new Date(trainerPeriodEnd) : trainerPeriodEnd;
    const now = currentDate 
        ? (typeof currentDate === 'string' ? new Date(currentDate) : currentDate)
        : new Date();

    if (periodEnd > now) return 'active';
    
    if (isTrainerInGracePeriod(trainerPeriodEnd, trainerGracePeriodEnd, currentDate)) {
        return 'grace_period';
    }

    return 'expired';
}

/**
 * Get days remaining for trainer access (including grace period)
 */
export function getTrainerAccessDaysRemaining(
    trainerPeriodEnd: Date | string | null,
    trainerGracePeriodEnd: Date | string | null
): number | null {
    if (!trainerPeriodEnd) return null;

    const periodEnd = typeof trainerPeriodEnd === 'string' ? new Date(trainerPeriodEnd) : trainerPeriodEnd;
    const now = new Date();

    // If period hasn't ended, return days until period end
    if (periodEnd > now) {
        const diffTime = periodEnd.getTime() - now.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // If in grace period, return grace period days remaining
    if (trainerGracePeriodEnd) {
        return getTrainerGracePeriodDaysRemaining(trainerGracePeriodEnd);
    }

    // Expired
    return 0;
}

