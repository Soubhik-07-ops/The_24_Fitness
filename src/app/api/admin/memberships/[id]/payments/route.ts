// API route to get all payment screenshots for a membership
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

        // Get membership details to determine payment types
        const { data: membership } = await supabaseAdmin
            .from('memberships')
            .select('created_at, status, trainer_assigned, trainer_id')
            .eq('id', membershipId)
            .single();

        // Get all payment records for this membership
        const { data: payments, error: paymentsError } = await supabaseAdmin
            .from('membership_payments')
            .select('*')
            .eq('membership_id', membershipId)
            .order('created_at', { ascending: false });

        if (paymentsError) {
            return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 });
        }

        if (!payments || payments.length === 0) {
            return NextResponse.json({ payments: [] });
        }

        // Get trainer addons to check for trainer renewals (both pending and active)
        const { data: trainerAddons } = await supabaseAdmin
            .from('membership_addons')
            .select('id, created_at, status, addon_type')
            .eq('membership_id', membershipId)
            .eq('addon_type', 'personal_trainer')
            .order('created_at', { ascending: false });

        // Get trainer assignments to check for trainer renewals
        const { data: trainerAssignments } = await supabaseAdmin
            .from('trainer_assignments')
            .select('id, created_at, assignment_type, status')
            .eq('membership_id', membershipId)
            .order('created_at', { ascending: false });

        // Determine payment types
        const sortedPayments = [...payments].sort((a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        
        // Get verified payments to determine last verified payment date
        const verifiedPayments = payments.filter(p => p.status === 'verified')
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        // Generate signed URLs for all payment screenshots and determine payment type
        const paymentsWithScreenshots = await Promise.all(
            payments.map(async (payment, index) => {
                // Determine payment type
                let paymentType = 'initial';
                let paymentTypeLabel = 'Initial Purchase';
                let paymentTypeColor = '#3b82f6'; // Blue for initial

                const paymentDate = new Date(payment.created_at);
                const isFirstPayment = index === payments.length - 1; // Last in descending order = first chronologically

                // Check if this is a renewal payment (not the first payment)
                if (!isFirstPayment) {
                    // SIMPLER APPROACH: Check if addon/assignment was created AFTER this payment (within 2 minutes)
                    // Trainer renewals create addon/assignment immediately after payment
                    // This ensures each payment only matches its own addon/assignment, not old ones
                    const matchingTrainerAddon = trainerAddons?.find(addon => {
                        if (addon.addon_type !== 'personal_trainer' || addon.status !== 'pending') {
                            return false;
                        }
                        const addonDate = new Date(addon.created_at);
                        // Addon must be created AFTER this payment (trainer renewals create addon after payment)
                        const isAfterPayment = addonDate > paymentDate;
                        // Addon must be created very close to payment (within 2 minutes = 120000 ms)
                        // This ensures we only match addons created for THIS specific payment
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

                    // If either addon or assignment matches, it's a trainer renewal
                    if (matchingTrainerAddon || matchingAssignment) {
                        paymentType = 'trainer_renewal';
                        paymentTypeLabel = 'Trainer Access Renewal';
                        paymentTypeColor = '#10b981'; // Green for trainer renewal
                        console.log('[PAYMENTS ROUTE] Trainer renewal detected for payment:', {
                            paymentId: payment.id,
                            membershipId: membershipId,
                            paymentDate: paymentDate.toISOString(),
                            hasMatchingAddon: !!matchingTrainerAddon,
                            hasMatchingAssignment: !!matchingAssignment,
                            addonDetails: matchingTrainerAddon ? {
                                id: matchingTrainerAddon.id,
                                created_at: matchingTrainerAddon.created_at,
                                status: matchingTrainerAddon.status,
                                isAfterPayment: new Date(matchingTrainerAddon.created_at) > paymentDate,
                                timeDiffSeconds: (new Date(matchingTrainerAddon.created_at).getTime() - paymentDate.getTime()) / 1000
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
                        // If no trainer addon/assignment matches, it's a membership renewal
                        // Membership renewals don't create trainer addons
                        paymentType = 'membership_renewal';
                        paymentTypeLabel = 'Membership Plan Renewal';
                        paymentTypeColor = '#f59e0b'; // Orange for membership renewal
                        console.log('[PAYMENTS ROUTE] Membership renewal detected for payment:', {
                            paymentId: payment.id,
                            membershipId: membershipId,
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

                if (!payment.payment_screenshot_url) {
                    return {
                        ...payment,
                        screenshotUrl: null,
                        paymentType,
                        paymentTypeLabel,
                        paymentTypeColor
                    };
                }

                // Extract file path from URL if needed
                let filePath = payment.payment_screenshot_url;
                if (filePath.includes('/storage/v1/object/')) {
                    const urlParts = filePath.split('/');
                    const bucketIndex = urlParts.findIndex((part: string) => part === 'payment-screenshots');
                    if (bucketIndex !== -1 && bucketIndex < urlParts.length - 1) {
                        filePath = urlParts.slice(bucketIndex + 1).join('/');
                    }
                }

                // Generate signed URL
                const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
                    .from('payment-screenshots')
                    .createSignedUrl(filePath, 3600); // 1 hour expiry

                return {
                    ...payment,
                    screenshotUrl: signedUrlError ? null : signedUrlData?.signedUrl || null,
                    paymentType,
                    paymentTypeLabel,
                    paymentTypeColor
                };
            })
        );

        return NextResponse.json({
            payments: paymentsWithScreenshots
        });
    } catch (err: any) {
        return NextResponse.json(
            { error: err.message || 'Failed to fetch payment screenshots' },
            { status: 500 }
        );
    }
}

