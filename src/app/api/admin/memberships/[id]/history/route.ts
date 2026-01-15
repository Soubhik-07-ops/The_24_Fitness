// API route to get complete membership history
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';
import { detectPaymentType } from '@/lib/paymentTypeDetection';

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

        // Fetch user gender from profiles for renewal price calculation
        let userGender: string | null = null;
        if (membership?.user_id) {
            try {
                const { data: profile } = await supabaseAdmin
                    .from('profiles')
                    .select('gender')
                    .eq('id', membership.user_id)
                    .single();
                userGender = profile?.gender || null;
            } catch (error) {
                console.error('Error fetching user gender:', error);
            }
        }

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

        // Get trainer assignment history (include trainer price for accurate payment type detection)
        const { data: trainerAssignments, error: assignmentsError } = await supabaseAdmin
            .from('trainer_assignments')
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
                // Use production-ready payment type detection utility
                // Note: sortedPayments is in ascending order (oldest first), so index 0 is first payment
                const paymentTypeResult = detectPaymentType(
                    sortedPayments.length - 1 - index, // Reverse index for utility (last = first payment)
                    sortedPayments.length,
                    {
                        paymentAmount: parseFloat(payment.amount) || 0,
                        paymentStatus: payment.status,
                        paymentCreatedAt: payment.created_at,
                        membershipStatus: membership.status,
                        membershipPrice: parseFloat(membership.price) || 0,
                        membershipEndDate: membership.membership_end_date || membership.end_date || null,
                        gracePeriodEnd: membership.grace_period_end || null,
                        membershipPlanName: membership.plan_name || '',
                        membershipPlanType: membership.plan_type || '',
                        userGender: userGender,
                        trainerAddons: addons?.filter(a => a.addon_type === 'personal_trainer').map(a => ({
                            id: a.id,
                            created_at: a.created_at,
                            status: a.status,
                            addon_type: a.addon_type,
                            price: parseFloat(a.price) || 0
                        })) || [],
                        trainerAssignments: trainerAssignments?.map(ta => ({
                            id: ta.id,
                            created_at: ta.created_at,
                            status: ta.status,
                            assignment_type: ta.assignment_type,
                            trainer_id: ta.trainer_id,
                            trainer_price: ta.trainers?.price ? parseFloat(ta.trainers.price) : undefined
                        })) || [],
                        allPayments: sortedPayments.map(p => ({
                            id: p.id,
                            created_at: p.created_at,
                            amount: parseFloat(p.amount) || 0,
                            status: p.status
                        }))
                    }
                );

                const paymentType = paymentTypeResult.type;
                const paymentTitle = paymentType === 'initial'
                    ? 'Initial Payment'
                    : paymentTypeResult.label + ' Payment';
                const paymentColor = paymentTypeResult.color;

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

