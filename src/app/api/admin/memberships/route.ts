// src/app/api/admin/memberships/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

export async function GET(request: NextRequest) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });
        }

        // Check for userId query parameter
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');

        // Fetch all memberships with payment info and form data
        // IMPORTANT: Exclude 'awaiting_payment' status - admin should only see memberships after payment is submitted
        let query = supabaseAdmin
            .from('memberships')
            .select('*')
            .neq('status', 'awaiting_payment'); // Exclude memberships that haven't submitted payment yet

        // Filter by userId if provided
        if (userId) {
            query = query.eq('user_id', userId);
        }

        const { data: memberships, error: membershipsError } = await query
            .order('created_at', { ascending: false });

        if (membershipsError) {
            console.error('Error fetching memberships:', membershipsError);
            throw membershipsError;
        }

        // Debug logging
        console.log('Admin memberships API - Total memberships found:', memberships?.length || 0);
        if (memberships && memberships.length > 0) {
            console.log('Membership statuses:', memberships.map(m => ({ id: m.id, status: m.status })));
        }

        // Get unique user IDs
        const userIds = [...new Set(memberships?.map(m => m.user_id) || [])];

        // Get auth users data
        const { data: { users: authUsers }, error: authError } = await supabaseAdmin.auth.admin.listUsers();
        if (authError) throw authError;

        // Get profiles data
        const { data: profiles, error: profilesError } = await supabaseAdmin
            .from('profiles')
            .select('id, full_name')
            .in('id', userIds);

        if (profilesError) throw profilesError;

        // Get payment data for each membership (including pending renewal payments)
        const membershipIds = memberships?.map(m => m.id) || [];
        let payments: any[] = [];
        if (membershipIds.length > 0) {
            const { data: paymentsData, error: paymentsError } = await supabaseAdmin
                .from('membership_payments')
                .select('*')
                .in('membership_id', membershipIds)
                .order('created_at', { ascending: false });

            if (!paymentsError && paymentsData) {
                payments = paymentsData;
            }
        }

        // Get add-ons data for each membership
        let addons: any[] = [];
        if (membershipIds.length > 0) {
            const { data: addonsData, error: addonsError } = await supabaseAdmin
                .from('membership_addons')
                .select(`
                    *,
                    trainers (
                        id,
                        name
                    )
                `)
                .in('membership_id', membershipIds);

            if (addonsError) {
                console.error('Error fetching addons:', addonsError);
            } else if (addonsData) {
                addons = addonsData;
                console.log('Fetched addons:', addons.length, 'addons for', membershipIds.length, 'memberships');
            }
        }

        // Get trainer assignments data for each membership (for renewal detection)
        let trainerAssignments: any[] = [];
        if (membershipIds.length > 0) {
            const { data: assignmentsData, error: assignmentsError } = await supabaseAdmin
                .from('trainer_assignments')
                .select('id, membership_id, created_at, assignment_type, status')
                .in('membership_id', membershipIds)
                .order('created_at', { ascending: false });

            if (assignmentsError) {
                console.error('Error fetching trainer assignments:', assignmentsError);
            } else if (assignmentsData) {
                trainerAssignments = assignmentsData;
                console.log('Fetched trainer assignments:', trainerAssignments.length, 'assignments for', membershipIds.length, 'memberships');
            }
        }

        // Get all unique trainer IDs first
        const trainerIds = [...new Set(memberships?.filter(m => m.trainer_id).map(m => m.trainer_id) || [])];

        // Fetch all trainers in one query
        let trainersMap = new Map<string, string>();
        if (trainerIds.length > 0) {
            const { data: trainersData } = await supabaseAdmin
                .from('trainers')
                .select('id, name')
                .in('id', trainerIds);

            if (trainersData) {
                trainersMap = new Map(trainersData.map(t => [t.id, t.name]));
            }
        }

        // In-gym admission fee (fetch from database)
        const { getInGymAdmissionFee } = await import('@/lib/adminSettings');
        const inGymAdmissionFeeDefault = await getInGymAdmissionFee();

        // Map all data together
        const mappedMemberships = memberships?.map(membership => {
            const authUser = authUsers?.find(u => u.id === membership.user_id);
            const profile = profiles?.find(p => p.id === membership.user_id);
            // Get all payments for this membership, sorted by most recent first
            const allPayments = payments
                .filter(p => p.membership_id === membership.id)
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            const payment = allPayments[0]; // Most recent payment for backward compatibility
            const membershipAddons = addons.filter(a => a.membership_id === membership.id);

            // Calculate total amount (base price + ACTIVE addon prices + in-gym admission fee if applicable)
            // Only count addons that are active (not cancelled or pending)
            const basePrice = parseFloat(membership.price) || 0;
            const activeAddons = membershipAddons.filter(addon => addon.status === 'active');
            const addonTotal = activeAddons.reduce((sum, addon) => sum + (parseFloat(addon.price) || 0), 0);

            // For in-gym plans: if no active in-gym addon exists, add admission fee
            // EXCEPT for Regular Plans (plan_name contains "regular") - they already include admission in base price
            // If in-gym addon exists, it's already included in addonTotal
            const hasInGymAddon = activeAddons.some(addon => addon.addon_type === 'in_gym');
            const planName = String(membership.plan_name || '').toLowerCase();
            const isRegularPlan = planName.includes('regular');
            const isRegularMonthly = planName.includes('regular') && (planName.includes('monthly') || planName.includes('boys') || planName.includes('girls'));
            const inGymAdmissionFee = (membership.plan_type === 'in_gym' && !hasInGymAddon && !isRegularPlan) ? inGymAdmissionFeeDefault : 0;

            const totalAmount = basePrice + addonTotal + inGymAdmissionFee;

            // Get trainer name from map
            let trainerName = membership.trainer_id ? trainersMap.get(membership.trainer_id) || null : null;
            
            // CRITICAL: For Regular Monthly plans, hide trainer info if membership has expired
            // Trainer access is tightly bound to membership lifecycle - no carryover to grace period
            if (isRegularMonthly && membership.trainer_assigned) {
                const endDate = membership.membership_end_date || membership.end_date;
                // Use real current date for admin API (admin panel shows real state, not demo mode)
                const now = new Date();
                
                // If membership has expired (even if in grace period), hide trainer completely
                if (endDate && new Date(endDate) <= now) {
                    // Membership expired - trainer access should be hidden from admin view
                    trainerName = null;
                    // Note: We don't modify membership.trainer_id here as it's used for data integrity
                    // The frontend will filter based on trainer_name being null
                }
            }

            // Check for pending payments
            const pendingPayment = payments
                .filter(p => p.membership_id === membership.id && p.status === 'pending')
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

            // Check if this is the FIRST payment (initial purchase) or a renewal
            // Initial purchase: membership status is 'pending' or 'awaiting_payment', and no verified payments exist
            const verifiedPayments = payments.filter(p =>
                p.membership_id === membership.id && p.status === 'verified'
            );
            const isInitialPurchase = (
                (membership.status === 'pending' || membership.status === 'awaiting_payment') &&
                verifiedPayments.length === 0 &&
                pendingPayment // Has pending payment but no verified payments yet
            );

            // Only check for renewals if this is NOT an initial purchase
            // Renewal detection: must have at least one verified payment (proving it's not the first)
            const isRenewal = !isInitialPurchase && pendingPayment && verifiedPayments.length > 0;

            // Check if membership was actually renewed (has multiple verified payments)
            // A membership is only "renewed" if it has MORE than one verified payment
            // If it has only one verified payment, it's an initial purchase
            const hasRenewals = verifiedPayments.length > 1;

            // Old renewal detection logic removed - renewals now handled via contact page

            // For Regular Monthly plans with expired membership, hide trainer info
            const shouldHideTrainer = isRegularMonthly && trainerName === null && membership.trainer_assigned;
            
            return {
                ...membership,
                user_email: authUser?.email || 'No email',
                user_name: profile?.full_name || 'Unknown User',
                transaction_id: payment?.transaction_id || null,
                payment_date: payment?.payment_date || null,
                payment_amount: payment?.amount || null, // Full payment amount including addons
                payment_screenshot_url: payment?.payment_screenshot_url || null,
                form_data: membership.form_data || null, // Include form data
                trainer_name: trainerName, // Add trainer name (null for expired Regular Monthly plans)
                // For expired Regular Monthly plans, set trainer_assigned to false for UI consistency
                trainer_assigned: shouldHideTrainer ? false : membership.trainer_assigned,
                trainer_id: shouldHideTrainer ? null : membership.trainer_id,
                trainer_period_end: shouldHideTrainer ? null : membership.trainer_period_end,
                trainer_grace_period_end: shouldHideTrainer ? null : membership.trainer_grace_period_end,
                all_payments: allPayments, // Include all payments for this membership
                has_renewals: hasRenewals, // Flag to indicate if membership has been renewed
                addons: membershipAddons.map(addon => {
                    // Handle trainer data - it might be an object or array
                    let addonTrainerName = null
                    if (addon.trainers) {
                        if (Array.isArray(addon.trainers) && addon.trainers.length > 0) {
                            addonTrainerName = addon.trainers[0].name
                        } else if (typeof addon.trainers === 'object' && addon.trainers.name) {
                            addonTrainerName = addon.trainers.name
                        }
                    }
                    return {
                        id: addon.id,
                        addon_type: addon.addon_type,
                        price: parseFloat(addon.price) || 0, // Ensure price is a number
                        status: addon.status,
                        trainer_id: addon.trainer_id || null,
                        trainer_name: addonTrainerName
                    }
                }),
                total_amount: totalAmount // Total amount (base + addons)
            };
        }) || [];

        return NextResponse.json({ memberships: mappedMemberships });
    } catch (err: any) {
        console.error('Admin memberships list error:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to fetch memberships' },
            { status: 500 }
        );
    }
}

