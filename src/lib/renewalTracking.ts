/**
 * Renewal tracking utilities
 * 
 * This module provides functions to work with explicit renewal relationships
 * instead of inferring renewals from payment counts.
 */

export interface RenewalInfo {
    isRenewal: boolean;
    originalMembershipId: number | null;
}

/**
 * Check if a membership is a renewal based on renewal_of_membership_id
 * @param membership - Membership object with renewal_of_membership_id field
 * @returns Object indicating if it's a renewal and the original membership ID
 */
export function getRenewalInfo(membership: { renewal_of_membership_id?: number | null }): RenewalInfo {
    return {
        isRenewal: Boolean(membership.renewal_of_membership_id),
        originalMembershipId: membership.renewal_of_membership_id || null
    };
}

/**
 * Legacy function for backward compatibility
 * Checks renewal status using payment count (fallback) or explicit field (preferred)
 */
export function isRenewalBasedOnPayments(
    verifiedPaymentCount: number,
    membership?: { renewal_of_membership_id?: number | null }
): boolean {
    // Prefer explicit renewal tracking if available
    if (membership?.renewal_of_membership_id) {
        return true;
    }
    
    // Fallback to payment count (for backward compatibility with old data)
    return verifiedPaymentCount > 1;
}

