/**
 * Membership access control utilities
 * 
 * Centralized functions for checking user access to membership features
 */

import { MEMBERSHIP_STATUSES } from './membershipStatus';

/**
 * Check if user has active membership access
 * Only 'active' status grants access
 */
export function hasActiveMembershipAccess(status: string): boolean {
    return status === MEMBERSHIP_STATUSES.ACTIVE;
}

/**
 * Check if user can purchase a new plan
 * Block purchases during grace period
 */
export function canPurchaseNewPlan(status: string): boolean {
    // Block purchases during grace period
    if (status === MEMBERSHIP_STATUSES.GRACE_PERIOD) {
        return false;
    }
    
    // Allow purchases if expired, rejected, or no membership exists
    return true;
}

/**
 * Check if membership allows feature access
 * Features are only available for active memberships
 */
export function canAccessFeatures(status: string): boolean {
    return hasActiveMembershipAccess(status);
}

