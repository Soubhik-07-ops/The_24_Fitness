// Helper functions for trainer assignment logic based on membership plans

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

export interface TrainerAssignmentConfig {
    planName: string; // 'basic', 'premium', 'elite'
    planMode: string; // 'Online' or 'InGym'
    hasTrainerAddon: boolean;
    selectedTrainerId?: string | null;
    durationMonths?: number; // membership duration (needed for Regular plans)
}

/**
 * Calculate trainer period based on plan type and addons
 * Returns: { periodStart: Date, periodEnd: Date, isIncluded: boolean, isAddon: boolean }
 */
export function calculateTrainerPeriod(
    membershipStartDate: Date,
    config: TrainerAssignmentConfig
): { periodStart: Date; periodEnd: Date; isIncluded: boolean; isAddon: boolean } {
    const { planName, hasTrainerAddon } = config;
    const periodStart = new Date(membershipStartDate);

    let includedDays = 0;
    let includedMonths = 0;
    let addonMonths = 0;
    let isIncluded = false;
    let isAddon = false;

    const planLower = planName.toLowerCase();

    // Basic Plan: No trainer included, only if addon
    if (planLower === 'basic') {
        if (hasTrainerAddon) {
            addonMonths = 1; // 1 month
            isAddon = true;
        }
    }
    // Premium Plan: 1 week free + addon if selected
    else if (planLower === 'premium') {
        includedDays = 7; // 1 week free
        isIncluded = true;
        if (hasTrainerAddon) {
            addonMonths = 1; // 1 month addon
            isAddon = true;
        }
    }
    // Elite Plan: 1 month free + addon if selected
    else if (planLower === 'elite') {
        includedMonths = 1; // 1 month free
        isIncluded = true;
        if (hasTrainerAddon) {
            addonMonths = 1; // 1 month addon
            isAddon = true;
        }
    }
    // Any other plan (e.g. "Regular Monthly"): no trainer included, but addon should still grant trainer access.
    else {
        if (hasTrainerAddon) {
            // For Regular plans, trainer addon should match membership validity (duration_months).
            addonMonths = config.durationMonths && config.durationMonths > 0 ? config.durationMonths : 1;
            isAddon = true;
        }
    }

    const periodEnd = new Date(periodStart);
    // Add included days first (premium trial)
    if (includedDays > 0) {
        periodEnd.setDate(periodEnd.getDate() + includedDays);
    }
    // Add months (elite free month + addons)
    const totalMonths = includedMonths + addonMonths;
    if (totalMonths > 0) {
        periodEnd.setMonth(periodEnd.getMonth() + totalMonths);
    }

    return {
        periodStart,
        periodEnd,
        isIncluded: includedDays > 0 || includedMonths > 0,
        isAddon: addonMonths > 0
    };
}

/**
 * Create trainer assignment request in database
 */
export async function createTrainerAssignmentRequest(
    membershipId: number,
    userId: string,
    trainerId: string,
    config: TrainerAssignmentConfig,
    membershipStartDate: Date
): Promise<{ success: boolean; assignmentId?: number; error?: string }> {
    try {
        const { periodStart, periodEnd, isIncluded, isAddon } = calculateTrainerPeriod(
            membershipStartDate,
            config
        );

        // Determine assignment type
        let assignmentType = 'addon';
        if (isIncluded && !isAddon) {
            assignmentType = 'included';
        } else if (isIncluded && isAddon) {
            assignmentType = 'included'; // Primary type is included, addon extends it
        }

        // For Premium and Elite, if user selected trainer, it's user-requested
        // For Basic, if addon is selected, it's user-requested
        const planLower = config.planName.toLowerCase();
        const requestedByUser = planLower === 'elite' ||
            (planLower === 'premium' && config.hasTrainerAddon) ||
            (planLower === 'basic' && config.hasTrainerAddon) ||
            // Regular/other plans: trainer access is always via addon (user-requested)
            (config.hasTrainerAddon && planLower !== 'premium' && planLower !== 'elite' && planLower !== 'basic');

        // Create trainer assignment record
        const { data: assignment, error: assignmentError } = await supabaseAdmin
            .from('trainer_assignments')
            .insert({
                membership_id: membershipId,
                trainer_id: trainerId,
                user_id: userId,
                assignment_type: assignmentType,
                status: requestedByUser ? 'pending' : 'pending', // Admin needs to assign for Premium (if no user selection)
                period_start: periodStart.toISOString(),
                period_end: periodEnd.toISOString(),
                requested_by_user: requestedByUser,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (assignmentError) {
            console.error('Error creating trainer assignment:', assignmentError);
            return { success: false, error: assignmentError.message };
        }

        return { success: true, assignmentId: assignment.id };
    } catch (error: any) {
        console.error('Error in createTrainerAssignmentRequest:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Assign trainer to membership (called by admin)
 */
export async function assignTrainerToMembership(
    membershipId: number,
    trainerId: string,
    adminId: string,
    periodStart: Date,
    periodEnd: Date
): Promise<{ success: boolean; error?: string }> {
    try {
        // Update membership with trainer assignment
        const { error: updateError } = await supabaseAdmin
            .from('memberships')
            .update({
                trainer_assigned: true,
                trainer_id: trainerId,
                trainer_period_end: periodEnd.toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', membershipId);

        if (updateError) {
            console.error('Error updating membership with trainer:', updateError);
            return { success: false, error: updateError.message };
        }

        // Get membership user_id for assignment record
        const { data: membershipData } = await supabaseAdmin
            .from('memberships')
            .select('user_id')
            .eq('id', membershipId)
            .single();

        if (!membershipData) {
            return { success: false, error: 'Membership not found' };
        }

        // Check if trainer assignment already exists
        const { data: existingAssignment } = await supabaseAdmin
            .from('trainer_assignments')
            .select('id')
            .eq('membership_id', membershipId)
            .eq('trainer_id', trainerId)
            .single();

        if (existingAssignment) {
            // Update existing assignment
            const { error: assignmentError } = await supabaseAdmin
                .from('trainer_assignments')
                .update({
                    status: 'assigned',
                    assigned_by: adminId,
                    assigned_at: new Date().toISOString(),
                    period_start: periodStart.toISOString(),
                    period_end: periodEnd.toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingAssignment.id);

            if (assignmentError) {
                console.error('Error updating trainer assignment:', assignmentError);
                // Don't fail - membership is already updated
            }
        } else {
            // Create new assignment record
            const { error: assignmentError } = await supabaseAdmin
                .from('trainer_assignments')
                .insert({
                    membership_id: membershipId,
                    trainer_id: trainerId,
                    user_id: membershipData.user_id,
                    assignment_type: 'included', // or 'addon' based on plan
                    status: 'assigned',
                    period_start: periodStart.toISOString(),
                    period_end: periodEnd.toISOString(),
                    assigned_by: adminId,
                    assigned_at: new Date().toISOString(),
                    requested_by_user: false,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });

            if (assignmentError) {
                console.error('Error creating trainer assignment:', assignmentError);
                // Don't fail - membership is already updated
            }
        }

        return { success: true };
    } catch (error: any) {
        console.error('Error in assignTrainerToMembership:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get trainer assignment info for a membership
 */
export async function getTrainerAssignmentInfo(membershipId: number) {
    try {
        const { data: assignment, error } = await supabaseAdmin
            .from('trainer_assignments')
            .select(`
                *,
                trainers (
                    id,
                    name
                )
            `)
            .eq('membership_id', membershipId)
            .eq('status', 'assigned')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
            console.error('Error fetching trainer assignment:', error);
            return null;
        }

        return assignment;
    } catch (error) {
        console.error('Error in getTrainerAssignmentInfo:', error);
        return null;
    }
}

