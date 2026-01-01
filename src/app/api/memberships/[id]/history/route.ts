// API route to get complete membership history for users
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params;
        const membershipId = parseInt(id);
        if (isNaN(membershipId)) {
            return NextResponse.json({ error: 'Invalid membership ID' }, { status: 400 });
        }

        // Create Supabase client with service role for server-side access
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseServiceKey) {
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl || '', supabaseServiceKey || '', {
            auth: { autoRefreshToken: false, persistSession: false }
        });

        // Get user ID from request (will be validated against membership ownership)
        const authHeader = request.headers.get('authorization');
        let userId: string | null = null;

        if (authHeader) {
            const token = authHeader.replace('Bearer ', '');
            // Use service role client to verify the token
            const { data: { user }, error: authError } = await supabase.auth.getUser(token);
            if (!authError && user) {
                userId = user.id;
            }
        }

        // If no token in header, try to get from cookies (for browser requests)
        if (!userId) {
            const cookieHeader = request.headers.get('cookie');
            if (cookieHeader) {
                // Create a client with anon key to check session from cookies
                const clientSupabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
                // Note: This might not work in server-side API routes, but we'll validate ownership after fetching
            }
        }

        // Get membership details - exclude sensitive admin fields
        const { data: membership, error: membershipError } = await supabase
            .from('memberships')
            .select(`
                id,
                user_id,
                plan_type,
                plan_name,
                duration_months,
                price,
                status,
                start_date,
                end_date,
                created_at,
                updated_at,
                trainer_assigned,
                trainer_id,
                trainer_period_end,
                trainer_addon,
                membership_start_date,
                membership_end_date,
                plan_mode
            `)
            .eq('id', membershipId)
            .single();

        if (membershipError || !membership) {
            return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
        }

        // CRITICAL: Validate ownership - users can only see their own membership
        if (userId && membership.user_id !== userId) {
            return NextResponse.json({ error: 'Unauthorized - membership does not belong to user' }, { status: 403 });
        }

        // If no userId was extracted, try to get it from session and validate
        if (!userId) {
            const clientSupabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
            const { data: { session } } = await clientSupabase.auth.getSession();
            if (session?.user?.id) {
                if (membership.user_id !== session.user.id) {
                    return NextResponse.json({ error: 'Unauthorized - membership does not belong to user' }, { status: 403 });
                }
            } else {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
        }

        // Get all payments - exclude sensitive admin fields (verified_by, admin notes, etc.)
        const { data: payments, error: paymentsError } = await supabase
            .from('membership_payments')
            .select(`
                id,
                membership_id,
                transaction_id,
                payment_date,
                amount,
                payment_screenshot_url,
                payment_method,
                status,
                verified_at,
                created_at
            `)
            .eq('membership_id', membershipId)
            .order('created_at', { ascending: false });

        // Get all addons
        const { data: addons, error: addonsError } = await supabase
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

        if (addonsError) {
            console.error('Error fetching addons:', addonsError);
        }

        // Get trainer assignments for payment type detection
        const { data: trainerAssignments, error: assignmentsError } = await supabase
            .from('trainer_assignments')
            .select('id, created_at, assignment_type, status')
            .eq('membership_id', membershipId)
            .order('created_at', { ascending: false });

        if (assignmentsError) {
            console.error('Error fetching trainer assignments:', assignmentsError);
        }

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

            sortedPayments.forEach((payment, index) => {
                const isFirst = index === 0;
                let paymentType = 'initial';
                let paymentTitle = 'Initial Payment';
                let paymentColor = '#3b82f6';

                if (!isFirst) {
                    const paymentDate = new Date(payment.created_at);

                    // SIMPLER APPROACH: Check if addon/assignment was created AFTER this payment (within 2 minutes)
                    // Trainer renewals create addon/assignment immediately after payment
                    const matchingAddon = addons?.find(a => {
                        if (a.addon_type !== 'personal_trainer' || a.status !== 'pending') {
                            return false;
                        }
                        const addonDate = new Date(a.created_at);
                        // Addon must be created AFTER this payment
                        const isAfterPayment = addonDate > paymentDate;
                        // Addon must be created very close to payment (within 2 minutes)
                        const timeDiff = addonDate.getTime() - paymentDate.getTime();
                        const isCloseToPayment = timeDiff > 0 && timeDiff < 120000; // 2 minutes after payment
                        return isAfterPayment && isCloseToPayment;
                    });

                    // Also check trainer assignments
                    const matchingAssignment = trainerAssignments?.find(assignment => {
                        const assignmentDate = new Date(assignment.created_at);
                        const isAfterPayment = assignmentDate > paymentDate;
                        const timeDiff = assignmentDate.getTime() - paymentDate.getTime();
                        const isCloseToPayment = timeDiff > 0 && timeDiff < 120000; // 2 minutes after payment
                        return isAfterPayment && isCloseToPayment &&
                            assignment.assignment_type === 'addon' &&
                            assignment.status === 'pending';
                    });

                    if (matchingAddon || matchingAssignment) {
                        paymentType = 'trainer_renewal';
                        paymentTitle = 'Trainer Access Renewal Payment';
                        paymentColor = '#10b981';
                    } else {
                        paymentType = 'membership_renewal';
                        paymentTitle = 'Membership Renewal Payment';
                        paymentColor = '#f59e0b';
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

        // Fetch fees from database once (before map to avoid async issues)
        const { getInGymAdmissionFee, getInGymMonthlyFee } = await import('@/lib/adminSettings');
        const ADMISSION_FEE = await getInGymAdmissionFee();
        const MONTHLY_FEE = await getInGymMonthlyFee();

        // Add payment type and breakdown to payments array for frontend
        // IMPORTANT: Only include safe fields - exclude verified_by and other admin-sensitive data
        const finalPayments = payments && payments.length > 0 ? payments.map((payment) => {
            const sortedPayments = [...payments].sort((a, b) =>
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
            const paymentIndex = sortedPayments.findIndex(p => p.id === payment.id);
            const isFirst = paymentIndex === 0;
            let paymentType = 'initial';
            let paymentTypeColor = '#3b82f6';
            let paymentTypeLabel = 'Initial Purchase';

            if (!isFirst) {
                const paymentDate = new Date(payment.created_at);

                // SIMPLER APPROACH: Check if addon/assignment was created AFTER this payment (within 2 minutes)
                const matchingAddon = addons?.find(a => {
                    if (a.addon_type !== 'personal_trainer' || a.status !== 'pending') {
                        return false;
                    }
                    const addonDate = new Date(a.created_at);
                    // Addon must be created AFTER this payment
                    const isAfterPayment = addonDate > paymentDate;
                    // Addon must be created very close to payment (within 2 minutes)
                    const timeDiff = addonDate.getTime() - paymentDate.getTime();
                    const isCloseToPayment = timeDiff > 0 && timeDiff < 120000; // 2 minutes after payment
                    return isAfterPayment && isCloseToPayment;
                });

                // Also check trainer assignments
                const matchingAssignment = trainerAssignments?.find(assignment => {
                    const assignmentDate = new Date(assignment.created_at);
                    const isAfterPayment = assignmentDate > paymentDate;
                    const timeDiff = assignmentDate.getTime() - paymentDate.getTime();
                    const isCloseToPayment = timeDiff > 0 && timeDiff < 120000; // 2 minutes after payment
                    return isAfterPayment && isCloseToPayment &&
                        assignment.assignment_type === 'addon' &&
                        assignment.status === 'pending';
                });

                if (matchingAddon || matchingAssignment) {
                    paymentType = 'trainer_renewal';
                    paymentTypeColor = '#10b981';
                    paymentTypeLabel = 'Trainer Access Renewal';
                } else {
                    paymentType = 'membership_renewal';
                    paymentTypeColor = '#f59e0b';
                    paymentTypeLabel = 'Membership Plan Renewal';
                }
            }

            // Calculate payment breakdown dynamically
            // For in-gym plans: use fees fetched from database
            const paymentAmount = parseFloat(payment.amount) || 0;
            const planPrice = parseFloat(membership.price) || 0;
            const isInGym = membership.plan_type === 'in_gym';

            let admissionFee = 0;
            let monthlyFee = 0;
            let planPriceInPayment = planPrice;
            let admissionFeeStatus = 'pending'; // For renewal, this will be 'approved'

            if (isInGym) {
                if (isFirst) {
                    // First payment: plan price + admission fee (₹1200)
                    // Calculate admission fee from payment amount
                    admissionFee = paymentAmount - planPrice;
                    // If calculated fee is close to standard admission fee, use standard
                    if (Math.abs(admissionFee - ADMISSION_FEE) < 100) {
                        admissionFee = ADMISSION_FEE;
                    }
                    // Ensure admission fee is reasonable
                    if (admissionFee < 0) admissionFee = 0;
                    admissionFeeStatus = payment.status; // Use current payment status
                } else {
                    // Renewal payment: plan price + monthly fee (₹650)
                    // Calculate monthly fee from payment amount
                    monthlyFee = paymentAmount - planPrice;
                    // If calculated fee is close to standard monthly fee, use standard
                    if (Math.abs(monthlyFee - MONTHLY_FEE) < 100) {
                        monthlyFee = MONTHLY_FEE;
                    }
                    // Ensure monthly fee is reasonable
                    if (monthlyFee < 0) monthlyFee = 0;

                    // Get admission fee from first payment (already paid - always approved)
                    const firstPayment = sortedPayments[0];
                    if (firstPayment) {
                        const firstPaymentAmount = parseFloat(firstPayment.amount) || 0;
                        admissionFee = firstPaymentAmount - planPrice;
                        // If calculated fee is close to standard admission fee, use standard
                        if (Math.abs(admissionFee - ADMISSION_FEE) < 100) {
                            admissionFee = ADMISSION_FEE;
                        }
                        if (admissionFee < 0) admissionFee = 0;
                        // Admission fee from first payment is always approved (already paid)
                        admissionFeeStatus = 'verified';
                    } else {
                        // Fallback: use standard admission fee
                        admissionFee = ADMISSION_FEE;
                        admissionFeeStatus = 'verified';
                    }
                }
            }

            // Return only safe fields - explicitly exclude verified_by and other admin data
            return {
                id: payment.id,
                membership_id: payment.membership_id,
                transaction_id: payment.transaction_id,
                payment_date: payment.payment_date,
                amount: payment.amount,
                payment_screenshot_url: payment.payment_screenshot_url,
                payment_method: payment.payment_method,
                status: payment.status,
                verified_at: payment.verified_at, // Safe to show - just timestamp, not who verified
                created_at: payment.created_at,
                paymentType,
                paymentTypeColor,
                paymentTypeLabel,
                // Payment breakdown for display
                breakdown: {
                    planPrice: planPriceInPayment,
                    admissionFee: isInGym ? admissionFee : 0,
                    monthlyFee: isInGym && !isFirst ? monthlyFee : 0,
                    admissionFeeStatus: isInGym ? admissionFeeStatus : null, // Status of admission fee (for renewal, it's 'verified')
                    isInGym,
                    isFirst
                }
            };
        }) : [];

        // Calculate financial summary
        const totalPaid = payments?.filter(p => p.status === 'verified').reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
        const pendingAmount = payments?.filter(p => p.status === 'pending').reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
        const totalPayments = payments?.length || 0;
        const verifiedPayments = payments?.filter(p => p.status === 'verified').length || 0;

        return NextResponse.json({
            membership,
            timeline,
            payments: finalPayments,
            addons: addons || [],
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

