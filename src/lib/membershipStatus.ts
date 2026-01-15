/**
 * Membership status definitions and utilities
 * 
 * Status Flow:
 * 1. awaiting_payment - Form submitted, no payment yet
 * 2. pending - Payment submitted, awaiting admin approval
 * 3. active - Approved and activated (user has access)
 * 4. expired - Past end date (no access)
 * 5. rejected - Payment rejected by admin
 * 6. cancelled - Admin cancelled (optional status)
 */

export type MembershipStatus = 
    | 'awaiting_payment' 
    | 'pending' 
    | 'active' 
    | 'expired' 
    | 'rejected' 
    | 'cancelled'
    | 'grace_period'; // For future grace period implementation

/**
 * Valid status values
 */
export const MEMBERSHIP_STATUSES = {
    AWAITING_PAYMENT: 'awaiting_payment' as const,
    PENDING: 'pending' as const,
    ACTIVE: 'active' as const,
    EXPIRED: 'expired' as const,
    REJECTED: 'rejected' as const,
    CANCELLED: 'cancelled' as const,
    GRACE_PERIOD: 'grace_period' as const,
} as const;

/**
 * Check if a status is valid
 */
export function isValidMembershipStatus(status: string): status is MembershipStatus {
    return Object.values(MEMBERSHIP_STATUSES).includes(status as MembershipStatus);
}

/**
 * Check if membership status allows user access
 * Only 'active' status grants access to features
 */
export function hasActiveAccess(status: string): boolean {
    return status === MEMBERSHIP_STATUSES.ACTIVE;
}

/**
 * Check if membership status allows payment submission
 */
export function canSubmitPayment(status: string): boolean {
    return status === MEMBERSHIP_STATUSES.AWAITING_PAYMENT;
}

/**
 * Check if membership status allows admin approval
 */
export function canApprove(status: string): boolean {
    return status === MEMBERSHIP_STATUSES.PENDING;
}

