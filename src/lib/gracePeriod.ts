/**
 * Grace period utilities for membership expiration
 * 
 * Grace period system:
 * - When membership reaches end_date, transition from 'active' to 'grace_period'
 * - Set grace_period_end = end_date + 15 days
 * - Block new plan purchases during grace period
 * - Show daily warnings and send notifications at milestones
 * - If renewed within grace period, reactivate same membership
 * - If grace_period_end passes, mark as 'expired', delete membership, notify user
 */

import { addMonths } from './membershipUtils';

export const GRACE_PERIOD_DAYS = 15;

/**
 * Calculate grace period end date (end_date + 15 days)
 */
export function calculateGracePeriodEnd(endDate: Date | string): Date {
    const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
    const graceEnd = new Date(end);
    graceEnd.setDate(graceEnd.getDate() + GRACE_PERIOD_DAYS);
    return graceEnd;
}

/**
 * Check if a date is within grace period
 * @param endDate - The membership end date
 * @param gracePeriodEnd - The grace period end date
 * @param currentDate - Optional current date (for demo mode). If not provided, uses real current date.
 */
export function isInGracePeriod(
    endDate: Date | string | null, 
    gracePeriodEnd: Date | string | null,
    currentDate?: Date | string | null
): boolean {
    if (!endDate || !gracePeriodEnd) return false;
    
    const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
    const graceEnd = typeof gracePeriodEnd === 'string' ? new Date(gracePeriodEnd) : gracePeriodEnd;
    const now = currentDate 
        ? (typeof currentDate === 'string' ? new Date(currentDate) : currentDate)
        : new Date();
    
    // In grace period if past end_date but before grace_period_end
    return end <= now && now <= graceEnd;
}

/**
 * Calculate days remaining in grace period
 * @param gracePeriodEnd - The grace period end date
 * @param currentDate - Optional current date (for demo mode). If not provided, uses real current date.
 * @returns Number of days remaining (0 if past grace period, negative if expired)
 */
export function getGracePeriodDaysRemaining(
    gracePeriodEnd: Date | string | null,
    currentDate?: Date | string | null
): number | null {
    if (!gracePeriodEnd) return null;
    
    const graceEnd = typeof gracePeriodEnd === 'string' ? new Date(gracePeriodEnd) : gracePeriodEnd;
    const now = currentDate 
        ? (typeof currentDate === 'string' ? new Date(currentDate) : currentDate)
        : new Date();
    const diffTime = graceEnd.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
}

/**
 * Check if membership should transition to grace period
 * @param status - Current membership status
 * @param endDate - The membership end date
 * @param gracePeriodEnd - The grace period end date (if already set)
 * @param currentDate - Optional current date (for demo mode). If not provided, uses real current date.
 */
export function shouldTransitionToGracePeriod(
    status: string,
    endDate: Date | string | null,
    gracePeriodEnd: Date | string | null,
    currentDate?: Date | string | null
): boolean {
    if (status !== 'active') return false;
    if (!endDate) return false;
    
    const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
    const now = currentDate 
        ? (typeof currentDate === 'string' ? new Date(currentDate) : currentDate)
        : new Date();
    
    // Transition if past end_date and not already in grace period
    return end <= now && !gracePeriodEnd;
}

/**
 * Get grace period notification milestones
 * @param gracePeriodEnd - The grace period end date
 * @param currentDate - Optional current date (for demo mode). If not provided, uses real current date.
 */
export function getGracePeriodNotificationMilestones(
    gracePeriodEnd: Date | string,
    currentDate?: Date | string | null
): {
    daysRemaining: number;
    shouldNotify: boolean;
}[] {
    const graceEnd = typeof gracePeriodEnd === 'string' ? new Date(gracePeriodEnd) : gracePeriodEnd;
    const daysRemaining = getGracePeriodDaysRemaining(gracePeriodEnd, currentDate);
    
    if (!daysRemaining || daysRemaining <= 0) return [];
    
    const milestones = [15, 7, 2, 1]; // Notification days
    const notifications = milestones
        .filter(days => daysRemaining === days)
        .map(days => ({
            daysRemaining: days,
            shouldNotify: true
        }));
    
    return notifications;
}

/**
 * Check if a renewal payment should reactivate the same membership
 * (only during grace period)
 */
export function shouldReactivateMembership(
    status: string,
    gracePeriodEnd: Date | string | null
): boolean {
    return status === 'grace_period' && Boolean(gracePeriodEnd) && 
           getGracePeriodDaysRemaining(gracePeriodEnd) !== null &&
           (getGracePeriodDaysRemaining(gracePeriodEnd) || 0) > 0;
}

