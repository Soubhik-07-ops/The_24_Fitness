/**
 * Addon Eligibility Utility
 * Determines addon availability based on plan configuration, not historical state
 * This ensures addons are consistently available on every renewal cycle
 */

export interface PlanConfiguration {
    planName: string;
    planType: string; // Current plan_type from membership (may be modified by previous addons)
    durationMonths?: number;
}

/**
 * Determine if In-Gym addon should be available for a plan
 * Rules:
 * - Available for plans that are NOT inherently in-gym (e.g., "Regular Monthly" is inherently in-gym)
 * - Available regardless of whether it was selected in previous renewals
 * - Based on plan name/type configuration, not current membership state
 */
export function isInGymAddonAvailable(config: PlanConfiguration): boolean {
    const planName = (config.planName || '').toLowerCase();
    const planType = (config.planType || '').toLowerCase();
    
    // Plans that are inherently in-gym (cannot add in-gym addon - they already have it)
    const inherentlyInGymPlans = [
        'regular monthly',
        'regular',
        'regular monthly boys',
        'regular monthly girls'
    ];
    
    // Check if plan name indicates it's inherently in-gym
    const isInherentlyInGym = inherentlyInGymPlans.some(inherentPlan => 
        planName.includes(inherentPlan.toLowerCase())
    );
    
    // If plan is inherently in-gym, addon is not available
    if (isInherentlyInGym) {
        return false;
    }
    
    // For other plans, check if they started as online plans
    // If plan_type is 'in_gym' but plan name doesn't indicate it's inherently in-gym,
    // it means it was converted by a previous addon selection - addon should still be available
    // This allows users to "renew" their in-gym access on subsequent renewals
    
    // Always available for plans that can support in-gym addon
    // (i.e., not inherently in-gym plans)
    return true;
}

/**
 * Determine if Trainer addon should be available for a plan
 * Rules:
 * - Available for all plan types
 * - Available regardless of previous trainer addon selections
 * - Based on plan configuration only
 */
export function isTrainerAddonAvailable(config: PlanConfiguration): boolean {
    // Trainer addon is available for all plans
    // No restrictions based on plan type or name
    return true;
}

/**
 * Get the base plan type for addon eligibility determination
 * This returns the "original" plan type before any addon modifications
 * 
 * For "Regular Monthly" plans, they're inherently in-gym
 * For other plans, they start as online unless explicitly configured otherwise
 */
export function getBasePlanType(config: PlanConfiguration): 'online' | 'in_gym' {
    const planName = (config.planName || '').toLowerCase();
    
    // Plans that are inherently in-gym
    const inherentlyInGymPlans = [
        'regular monthly',
        'regular',
        'regular monthly boys',
        'regular monthly girls'
    ];
    
    const isInherentlyInGym = inherentlyInGymPlans.some(inherentPlan => 
        planName.includes(inherentPlan.toLowerCase())
    );
    
    return isInherentlyInGym ? 'in_gym' : 'online';
}

/**
 * Check if a plan can have in-gym access added as an addon
 * This is different from isInGymAddonAvailable - it checks if the plan
 * can support adding in-gym access (not if it already has it)
 */
export function canAddInGymAccess(config: PlanConfiguration): boolean {
    // Can add in-gym access if:
    // 1. Plan is not inherently in-gym
    // 2. Plan supports addons (all plans do)
    return isInGymAddonAvailable(config);
}

