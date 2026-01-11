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

    const planLower = planName.toLowerCase();
    const isRegular = planLower.includes('regular');
    const isBasic = planLower === 'basic';
    const isPremium = planLower === 'premium';
    const isElite = planLower === 'elite';

    // Regular Plan Logic
    if (isRegular) {
        if (!hasTrainerAddon) {
            return {
                shouldUpload: 'none',
                reason: 'Regular plans without trainer addon do not require charts',
                canTrainerUpload: false,
                canAdminUpload: false
            };
        }
        // Regular with trainer addon: Trainer uploads workout+diet for entire period (1 month)
        if (trainerPeriodEnd && currentDate <= trainerPeriodEnd) {
            return {
                shouldUpload: 'trainer',
                reason: 'Regular plan with trainer addon - trainer uploads workout+diet charts',
                canTrainerUpload: true,
                canAdminUpload: false // Admin just views, doesn't upload
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
        // Basic plans always get workout charts (no diet)
        if (!hasTrainerAddon) {
            // No trainer addon: Admin uploads workout charts for 3 months
            return {
                shouldUpload: 'admin',
                reason: 'Basic plan without trainer - admin uploads workout charts for 3 months',
                canTrainerUpload: false,
                canAdminUpload: true
            };
        }
        // Has trainer addon: Trainer uploads for 1 month, then admin until trainer renewal
        // If trainer renews, trainer continues. If not, admin provides charts.
        if (trainerPeriodEnd && currentDate <= trainerPeriodEnd) {
            return {
                shouldUpload: 'trainer',
                reason: 'Basic plan with trainer addon - trainer uploads workout charts for 1 month',
                canTrainerUpload: true,
                canAdminUpload: false
            };
        } else {
            // Trainer period expired - admin uploads until trainer renewal
            return {
                shouldUpload: 'admin',
                reason: 'Basic plan trainer period expired - admin uploads workout charts until trainer renewal',
                canTrainerUpload: false,
                canAdminUpload: true
            };
        }
    }

    // Premium Plan Logic (6 months)
    // Premium gets workout + diet charts
    if (isPremium) {
        // Calculate free trainer period (1 week = 7 days)
        const freeTrainerPeriodEnd = new Date(membershipStartDate);
        freeTrainerPeriodEnd.setDate(freeTrainerPeriodEnd.getDate() + 7);
        freeTrainerPeriodEnd.setHours(23, 59, 59, 999);

        if (!hasTrainerAddon) {
            // No trainer addon: Trainer uploads for 1 week (free), then admin for remaining period
            // Check if trainer is actually assigned (trainer_period_end exists and covers free period)
            if (trainerPeriodEnd && currentDate <= trainerPeriodEnd && currentDate <= freeTrainerPeriodEnd) {
                return {
                    shouldUpload: 'trainer',
                    reason: 'Premium plan - trainer uploads workout+diet charts for free 1 week period',
                    canTrainerUpload: true,
                    canAdminUpload: false
                };
            } else {
                // Free period ended or no trainer assigned - admin uploads
                return {
                    shouldUpload: 'admin',
                    reason: 'Premium plan - free trainer period ended or no trainer assigned, admin uploads workout+diet charts',
                    canTrainerUpload: false,
                    canAdminUpload: true
                };
            }
        }
        // Has trainer addon: Trainer uploads for 1 week (free) + 1 month (addon), then admin until renewal
        if (trainerPeriodEnd && currentDate <= trainerPeriodEnd) {
            return {
                shouldUpload: 'trainer',
                reason: 'Premium plan with trainer addon - trainer uploads workout+diet charts for 1 week + 1 month',
                canTrainerUpload: true,
                canAdminUpload: false
            };
        } else {
            return {
                shouldUpload: 'admin',
                reason: 'Premium plan trainer period expired - admin uploads workout+diet charts until renewal',
                canTrainerUpload: false,
                canAdminUpload: true
            };
        }
    }

    // Elite Plan Logic (12 months)
    // Elite gets workout + diet charts
    if (isElite) {
        // Calculate free trainer period (1 month)
        const freeTrainerPeriodEnd = new Date(membershipStartDate);
        freeTrainerPeriodEnd.setMonth(freeTrainerPeriodEnd.getMonth() + 1);
        freeTrainerPeriodEnd.setHours(23, 59, 59, 999);

        if (!hasTrainerAddon) {
            // No trainer addon: Trainer uploads for 1 month (free), then admin for remaining period
            // Check if trainer is actually assigned (trainer_period_end exists and covers free period)
            if (trainerPeriodEnd && currentDate <= trainerPeriodEnd && currentDate <= freeTrainerPeriodEnd) {
                return {
                    shouldUpload: 'trainer',
                    reason: 'Elite plan - trainer uploads workout+diet charts for free 1 month period',
                    canTrainerUpload: true,
                    canAdminUpload: false
                };
            } else {
                // Free period ended or no trainer assigned - admin uploads
                return {
                    shouldUpload: 'admin',
                    reason: 'Elite plan - free trainer period ended or no trainer assigned, admin uploads workout+diet charts',
                    canTrainerUpload: false,
                    canAdminUpload: true
                };
            }
        }
        // Has trainer addon: Trainer uploads for 1 month (free) + 1 month (addon), then admin until renewal
        if (trainerPeriodEnd && currentDate <= trainerPeriodEnd) {
            return {
                shouldUpload: 'trainer',
                reason: 'Elite plan with trainer addon - trainer uploads workout+diet charts for 1 month + 1 month',
                canTrainerUpload: true,
                canAdminUpload: false
            };
        } else {
            return {
                shouldUpload: 'admin',
                reason: 'Elite plan trainer period expired - admin uploads workout+diet charts until renewal',
                canTrainerUpload: false,
                canAdminUpload: true
            };
        }
    }

    // Default case
    return {
        shouldUpload: 'admin',
        reason: 'Unknown plan type - defaulting to admin upload',
        canTrainerUpload: false,
        canAdminUpload: true
    };
}

/**
 * Check if a membership needs workout charts
 */
export function needsWorkoutCharts(planName: string, hasTrainerAddon: boolean): boolean {
    const planLower = planName.toLowerCase();
    const isRegular = planLower.includes('regular');
    
    // Regular plans only need charts if they have trainer addon
    if (isRegular) {
        return hasTrainerAddon;
    }
    
    // All other plans (Basic, Premium, Elite) always need workout charts
    return true;
}

/**
 * Check if a membership needs diet charts
 */
export function needsDietCharts(planName: string, hasTrainerAddon?: boolean): boolean {
    const planLower = planName.toLowerCase();
    const isRegular = planLower.includes('regular');
    const isBasic = planLower === 'basic';
    
    // Basic plans never need diet charts
    if (isBasic) {
        return false;
    }
    
    // Regular plans only need diet charts if they have trainer addon
    if (isRegular) {
        return hasTrainerAddon === true;
    }
    
    // Premium and Elite always need diet charts
    return true;
}

