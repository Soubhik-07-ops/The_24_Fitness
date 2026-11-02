/**
 * Chart Responsibility Logic
 * Determines who should upload charts (trainer vs admin) based on plan type, addons, and trainer period
 */

export interface ChartResponsibilityConfig {
    planName: string; // 'basic', 'premium', 'elite', 'regular monthly'
    hasTrainerAddon: boolean;
    hasInGymAddon: boolean;
    trainerPeriodEnd: Date | null;
    membershipStartDate: Date;
    membershipEndDate: Date;
    currentDate: Date;
}

export interface ChartResponsibility {
    shouldUpload: 'trainer' | 'admin' | 'none';
    reason: string;
    canTrainerUpload: boolean;
    canAdminUpload: boolean;
}

/**
 * Determine chart responsibility based on plan type and trainer period
 */
export function getChartResponsibility(config: ChartResponsibilityConfig): ChartResponsibility {
    const {
        planName,
        hasTrainerAddon,
        hasInGymAddon,
        trainerPeriodEnd,
        membershipStartDate,
        membershipEndDate,
        currentDate
    } = config;

    const planLower = (planName || '').toLowerCase().trim();
    const isRegular = planLower.includes('regular') || planLower.includes('monthly');
    const isBasic = planLower.includes('basic') || planLower.includes('3 month') || planLower.includes('3-month');
    const isPremium = planLower.includes('premium') || planLower.includes('6 month') || planLower.includes('6-month');
    const isElite = planLower.includes('elite') || planLower.includes('12 month') || planLower.includes('12-month') || planLower.includes('annual') || planLower.includes('yearly');

    // Regular Plan Logic
    if (isRegular) {
        if (!hasTrainerAddon && !trainerPeriodEnd) {
            return {
                shouldUpload: 'none',
                reason: 'Regular plans without trainer addon do not require charts',
                canTrainerUpload: false,
                canAdminUpload: false
            };
        }
        
        // CRITICAL: For Regular Monthly plans, trainer access expires with membership expiry
        // Check if membership has expired - if so, no chart access
        if (membershipEndDate) {
            const membershipEnd = typeof membershipEndDate === 'string' ? new Date(membershipEndDate) : membershipEndDate;
            const now = currentDate || new Date();
            
            // If membership has expired, trainer has no chart access (even if trainer_period_end hasn't passed)
            if (membershipEnd <= now) {
                return {
                    shouldUpload: 'none',
                    reason: 'Regular Monthly membership has expired. Trainer access and chart uploads are no longer available. Please renew membership and add trainer access as an addon.',
                    canTrainerUpload: false,
                    canAdminUpload: false
                };
            }
        }
        
        // Regular with trainer addon or assigned trainer: Trainer uploads workout+diet for entire period
        if (trainerPeriodEnd && currentDate <= trainerPeriodEnd) {
            return {
                shouldUpload: 'trainer',
                reason: 'Regular plan with trainer access - trainer uploads workout+diet charts',
                canTrainerUpload: true,
                canAdminUpload: false
            };
        } else {
            return {
                shouldUpload: 'admin',
                reason: 'Regular plan trainer period expired - admin can view but no new charts needed',
                canTrainerUpload: false,
                canAdminUpload: false
            };
        }
    }

    // Basic Plan Logic (3 months)
    if (isBasic) {
        // If trainer is assigned and period is active, trainer can upload workout and diet charts
        if (trainerPeriodEnd && currentDate <= trainerPeriodEnd) {
            return {
                shouldUpload: 'trainer',
                reason: 'Basic plan with active trainer - trainer uploads workout and diet charts',
                canTrainerUpload: true,
                canAdminUpload: false
            };
        }
        // No trainer or trainer expired: Admin uploads
        return {
            shouldUpload: 'admin',
            reason: hasTrainerAddon
                ? 'Basic plan trainer period expired - admin uploads workout charts until trainer renewal'
                : 'Basic plan without trainer - admin uploads workout charts for 3 months',
            canTrainerUpload: false,
            canAdminUpload: true
        };
    }

    // Premium Plan Logic (6 months)
    if (isPremium) {
        if (trainerPeriodEnd && currentDate <= trainerPeriodEnd) {
            return {
                shouldUpload: 'trainer',
                reason: 'Premium plan with active trainer - trainer uploads workout+diet charts',
                canTrainerUpload: true,
                canAdminUpload: false
            };
        } else {
            return {
                shouldUpload: 'admin',
                reason: 'Premium plan trainer period ended or not assigned - admin uploads workout+diet charts',
                canTrainerUpload: false,
                canAdminUpload: true
            };
        }
    }

    // Elite Plan Logic (12 months)
    if (isElite) {
        if (trainerPeriodEnd && currentDate <= trainerPeriodEnd) {
            return {
                shouldUpload: 'trainer',
                reason: 'Elite plan with active trainer - trainer uploads workout+diet charts',
                canTrainerUpload: true,
                canAdminUpload: false
            };
        } else {
            return {
                shouldUpload: 'admin',
                reason: 'Elite plan free trainer period ended or not assigned - admin uploads workout+diet charts',
                canTrainerUpload: false,
                canAdminUpload: true
            };
        }
    }

    // Dynamic fallback for any other custom, corporate, or special membership plan
    if (trainerPeriodEnd && currentDate <= trainerPeriodEnd) {
        return {
            shouldUpload: 'trainer',
            reason: 'Assigned personal trainer is active - trainer uploads workout and diet charts',
            canTrainerUpload: true,
            canAdminUpload: false
        };
    }

    return {
        shouldUpload: 'admin',
        reason: 'General membership plan - admin uploads charts',
        canTrainerUpload: false,
        canAdminUpload: true
    };
}

/**
 * Check if a membership needs workout charts
 */
export function needsWorkoutCharts(planName: string, hasTrainerAddon: boolean): boolean {
    const planLower = (planName || '').toLowerCase().trim();
    const isRegular = planLower.includes('regular') || planLower.includes('monthly');
    
    // Regular plans only need charts if they have trainer addon
    if (isRegular) {
        return hasTrainerAddon;
    }
    
    // All other plans (Basic, Premium, Elite, Custom) always need workout charts
    return true;
}

/**
 * Check if a membership needs diet charts
 */
export function needsDietCharts(planName: string, hasTrainerAddon?: boolean): boolean {
    // If client has trainer addon or trainer assigned, diet charts are always enabled
    if (hasTrainerAddon) {
        return true;
    }

    const planLower = (planName || '').toLowerCase().trim();
    const isRegular = planLower.includes('regular') || planLower.includes('monthly');
    const isBasic = planLower.includes('basic') || planLower.includes('3 month') || planLower.includes('3-month');
    
    // Basic plans without trainer do not include diet charts
    if (isBasic) {
        return false;
    }
    
    // Regular plans without trainer addon do not include diet charts
    if (isRegular) {
        return false;
    }
    
    // Premium, Elite, and all customized plans support diet charts
    return true;
}


