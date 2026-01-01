// API route to get complete membership history
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });
        }

        const { id } = await context.params;
        const membershipId = parseInt(id);
        if (isNaN(membershipId)) {
            return NextResponse.json({ error: 'Invalid membership ID' }, { status: 400 });
        }

        // Get membership details
        const { data: membership, error: membershipError } = await supabaseAdmin
            .from('memberships')
            .select('*')
            .eq('id', membershipId)
            .single();

        if (membershipError || !membership) {
            return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
        }

        // Get all payments
        const { data: payments, error: paymentsError } = await supabaseAdmin
            .from('membership_payments')
            .select('*')
            .eq('membership_id', membershipId)
            .order('created_at', { ascending: false });

        // Get all addons
        const { data: addons, error: addonsError } = await supabaseAdmin
            .from('membership_addons')
            .select(`
                *,
                trainers (
                    id,
                    name,
                    price
                )
            `)
            .eq('membership_id', membershipId)
            .order('created_at', { ascending: false });

        // Get trainer assignment history
        const { data: trainerAssignments, error: assignmentsError } = await supabaseAdmin
            .from('trainer_assignments')
            .select(`
                *,
                trainers (
                    id,
                    name
                )
            `)
            .eq('membership_id', membershipId)
            .order('created_at', { ascending: false });

        // Build timeline events
        const timeline: any[] = [];

        // Membership creation
        timeline.push({
            type: 'membership_created',
            date: membership.created_at,
            title: 'Membership Created',
            description: `${membership.plan_name} plan (${membership.duration_months} months)`,
            icon: '🎯',
            color: '#3b82f6'
        });

        // Payments
        if (payments && payments.length > 0) {
            const sortedPayments = [...payments].sort((a, b) =>
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );

            // Get verified payments to determine last verified payment date
            const verifiedPayments = payments.filter(p => p.status === 'verified')
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

            sortedPayments.forEach((payment, index) => {
                const isFirst = index === 0;
                let paymentType = 'initial';
                let paymentTitle = 'Initial Payment';
                let paymentColor = '#3b82f6';

                if (!isFirst) {
                    const paymentDate = new Date(payment.created_at);
                    
                    // SIMPLER APPROACH: Check if addon/assignment was created AFTER this payment (within 2 minutes)
                    // Trainer renewals create addon/assignment immediately after payment
                    // This ensures each payment only matches its own addon/assignment, not old ones
                    const matchingAddon = addons?.find(a => {
                        if (a.addon_type !== 'personal_trainer' || a.status !== 'pending') {
                            return false;
                        }
                        const addonDate = new Date(a.created_at);
                        // Addon must be created AFTER this payment (trainer renewals create addon after payment)
                        const isAfterPayment = addonDate > paymentDate;
                        // Addon must be created very close to payment (within 2 minutes = 120000 ms)
                        const timeDiff = addonDate.getTime() - paymentDate.getTime();
                        const isCloseToPayment = timeDiff > 0 && timeDiff < 120000; // 2 minutes after payment
                        return isAfterPayment && isCloseToPayment;
                    });

                    // Also check trainer assignments - must be created AFTER this payment
                    const matchingAssignment = trainerAssignments?.find(assignment => {
                        const assignmentDate = new Date(assignment.created_at);
                        // Assignment must be created AFTER this payment
                        const isAfterPayment = assignmentDate > paymentDate;
                        // Assignment must be created very close to payment (within 2 minutes)
                        const timeDiff = assignmentDate.getTime() - paymentDate.getTime();
                        const isCloseToPayment = timeDiff > 0 && timeDiff < 120000; // 2 minutes after payment
                        // Trainer renewals create assignments with type 'addon' and status 'pending'
                        return isAfterPayment && isCloseToPayment && 
                               assignment.assignment_type === 'addon' && 
                               assignment.status === 'pending';
                    });

                    if (matchingAddon || matchingAssignment) {
                        paymentType = 'trainer_renewal';
                        paymentTitle = 'Trainer Access Renewal Payment';
                        paymentColor = '#10b981';
                        console.log('[HISTORY ROUTE] Trainer renewal detected for payment:', {
                            paymentId: payment.id,
                            membershipId: membership.id,
                            paymentDate: paymentDate.toISOString(),
                            hasMatchingAddon: !!matchingAddon,
                            hasMatchingAssignment: !!matchingAssignment,
                            addonDetails: matchingAddon ? {
                                id: matchingAddon.id,
                                created_at: matchingAddon.created_at,
                                status: matchingAddon.status,
                                isAfterPayment: new Date(matchingAddon.created_at) > paymentDate,
                                timeDiffSeconds: (new Date(matchingAddon.created_at).getTime() - paymentDate.getTime()) / 1000
                            } : null,
                            assignmentDetails: matchingAssignment ? {
                                id: matchingAssignment.id,
                                created_at: matchingAssignment.created_at,
                                isAfterPayment: new Date(matchingAssignment.created_at) > paymentDate,
                                status: matchingAssignment.status,
                                assignment_type: matchingAssignment.assignment_type,
                                timeDiffSeconds: (new Date(matchingAssignment.created_at).getTime() - paymentDate.getTime()) / 1000
                            } : null
                        });
                    } else {
                        paymentType = 'membership_renewal';
                        paymentTitle = 'Membership Renewal Payment';
                        paymentColor = '#f59e0b';
                        console.log('[HISTORY ROUTE] Membership renewal detected for payment:', {
                            paymentId: payment.id,
                            membershipId: membership.id,
                            paymentDate: paymentDate.toISOString(),
                            allAssignments: trainerAssignments?.map(a => {
                                const assignmentDate = new Date(a.created_at);
                                const timeDiff = assignmentDate.getTime() - paymentDate.getTime();
                                return {
                                    id: a.id,
                                    created_at: a.created_at,
                                    isAfterPayment: assignmentDate > paymentDate,
                                    status: a.status,
                                    assignment_type: a.assignment_type,
                                    timeDiffSeconds: timeDiff / 1000,
                                    within2Minutes: timeDiff > 0 && timeDiff < 120000
                                };
                            }) || []
                        });
                    }
                }

                timeline.push({
                    type: 'payment',
                    paymentType,
                    date: payment.created_at,
                    title: paymentTitle,
                    description: `₹${payment.amount?.toLocaleString() || '0'} - Status: ${payment.status}`,
                    amount: payment.amount,
                    status: payment.status,
                    transactionId: payment.transaction_id,
                    verifiedBy: payment.verified_by,
                    verifiedAt: payment.verified_at,
                    icon: paymentType === 'initial' ? '💳' : '🔄',
                    color: paymentColor
                });
            });
        }

        // Addons
        if (addons && addons.length > 0) {
            addons.forEach(addon => {
                if (addon.addon_type === 'personal_trainer' && addon.trainers) {
                    timeline.push({
                        type: 'trainer_addon',
                        date: addon.created_at,
                        title: `Trainer Addon: ${addon.trainers.name}`,
                        description: `Status: ${addon.status} - ₹${addon.price?.toLocaleString() || '0'}`,
                        trainerName: addon.trainers.name,
                        status: addon.status,
                        icon: '👤',
                        color: addon.status === 'active' ? '#10b981' : '#f59e0b'
                    });
                } else if (addon.addon_type === 'in_gym') {
                    timeline.push({
                        type: 'in_gym_addon',
                        date: addon.created_at,
                        title: 'In-Gym Access Addon',
                        description: `Status: ${addon.status} - ₹${addon.price?.toLocaleString() || '0'}`,
                        status: addon.status,
                        icon: '🏋️',
                        color: addon.status === 'active' ? '#10b981' : '#f59e0b'
                    });
                }
            });
        }

        // Trainer assignments
        if (trainerAssignments && trainerAssignments.length > 0) {
            trainerAssignments.forEach(assignment => {
                // Determine status color: 'assigned' or 'active' = green, 'pending' = orange, 'expired' = red
                let statusColor = '#f59e0b'; // Default orange for pending
                if (assignment.status === 'assigned' || assignment.status === 'active') {
                    statusColor = '#10b981'; // Green for assigned/active
                } else if (assignment.status === 'expired') {
                    statusColor = '#dc2626'; // Red for expired
                }
                
                // Use membership.trainer_assigned as source of truth if assignment status is pending but membership says assigned
                const isActuallyAssigned = membership.trainer_assigned && 
                    membership.trainer_id === assignment.trainer_id && 
                    assignment.status === 'pending';
                const displayStatus = isActuallyAssigned ? 'assigned' : assignment.status;
                
                timeline.push({
                    type: 'trainer_assignment',
                    date: assignment.created_at,
                    title: `Trainer Assigned: ${assignment.trainers?.[0]?.name || 'Unknown'}`,
                    description: `Status: ${displayStatus} - Period End: ${assignment.period_end ? new Date(assignment.period_end).toLocaleDateString() : 'N/A'}`,
                    trainerName: assignment.trainers?.[0]?.name,
                    status: displayStatus,
                    periodEnd: assignment.period_end,
                    icon: '👨‍🏫',
                    color: isActuallyAssigned ? '#10b981' : statusColor
                });
            });
        }

        // Status changes
        if (membership.membership_start_date) {
            timeline.push({
                type: 'membership_activated',
                date: membership.membership_start_date,
                title: 'Membership Activated',
                description: `Valid until ${membership.membership_end_date ? new Date(membership.membership_end_date).toLocaleDateString() : 'N/A'}`,
                icon: '✅',
                color: '#22c55e'
            });
        }

        // Sort timeline by date
        timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Calculate financial summary
        const totalPaid = payments?.filter(p => p.status === 'verified').reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
        const pendingAmount = payments?.filter(p => p.status === 'pending').reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
        const totalPayments = payments?.length || 0;
        const verifiedPayments = payments?.filter(p => p.status === 'verified').length || 0;

        return NextResponse.json({
            membership,
            timeline,
            payments: payments || [],
            addons: addons || [],
            trainerAssignments: trainerAssignments || [],
            financialSummary: {
                totalPaid,
                pendingAmount,
                totalPayments,
                verifiedPayments,
                currency: 'INR'
            }
        });
    } catch (err: any) {
        console.error('Error fetching membership history:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to fetch membership history' },
            { status: 500 }
        );
    }
}

