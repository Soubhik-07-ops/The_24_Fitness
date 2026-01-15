// API route to get all payment screenshots for a membership
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

        // Get membership details to determine payment types (need price, plan_name, plan_type, user_id, grace_period_end, end_date)
        const { data: membership } = await supabaseAdmin
            .from('memberships')
            .select('created_at, status, trainer_assigned, trainer_id, price, plan_name, plan_type, user_id, grace_period_end, membership_end_date, end_date')
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
        // Include price to determine if payment includes base plan or just trainer
        const { data: trainerAddons } = await supabaseAdmin
            .from('membership_addons')
            .select('id, created_at, status, addon_type, price')
            .eq('membership_id', membershipId)
            .eq('addon_type', 'personal_trainer')
            .order('created_at', { ascending: false });

        // Get trainer assignments to check for trainer renewals
        // CRITICAL: Include trainer price for accurate payment type detection
        const { data: trainerAssignments } = await supabaseAdmin
            .from('trainer_assignments')
            .select(`
                id,
                created_at,
                assignment_type,
                status,
                trainers (
                    id,
                    name,
                    price
                )
            `)
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
                // Use production-ready payment type detection utility
                // CRITICAL: For pending payments, use current membership status
                // For verified payments, membership status might have changed, but payment type should remain correct
                const paymentTypeResult = detectPaymentType(index, payments.length, {
                    paymentAmount: parseFloat(payment.amount) || 0,
                    paymentStatus: payment.status,
                    paymentCreatedAt: payment.created_at,
                    membershipStatus: membership?.status || 'unknown',
                    membershipPrice: parseFloat(membership?.price) || 0,
                    membershipEndDate: membership?.membership_end_date || membership?.end_date || null,
                    gracePeriodEnd: membership?.grace_period_end || null, // Include grace period end for accurate renewal detection
                    membershipPlanName: membership?.plan_name || '',
                    membershipPlanType: membership?.plan_type || '',
                    userGender: userGender,
                    trainerAddons: trainerAddons || [],
                    trainerAssignments: trainerAssignments?.map(ta => ({
                        id: ta.id,
                        created_at: ta.created_at,
                        status: ta.status,
                        assignment_type: ta.assignment_type,
                        trainer_id: (ta.trainers as any)?.id,
                        trainer_price: (ta.trainers as any)?.price ? parseFloat(String((ta.trainers as any).price)) : undefined
                    })) || [],
                    allPayments: payments.map(p => ({
                        id: p.id,
                        created_at: p.created_at,
                        amount: parseFloat(p.amount) || 0,
                        status: p.status
                    }))
                });

                // Use payment_purpose (explicit intent) as primary source, fallback to detected type
                let paymentType: string;
                let paymentTypeLabel: string;
                let paymentTypeColor: string;

                if (payment.payment_purpose) {
                    // Use explicit payment_purpose from payment record (source of truth)
                    if (payment.payment_purpose === 'initial_purchase') {
                        paymentType = 'initial';
                        paymentTypeLabel = 'Initial Purchase';
                        paymentTypeColor = '#3b82f6';
                    } else if (payment.payment_purpose === 'membership_renewal') {
                        paymentType = 'membership_renewal';
                        paymentTypeLabel = 'Membership Plan Renewal';
                        paymentTypeColor = '#f59e0b';
                    } else if (payment.payment_purpose === 'trainer_renewal') {
                        paymentType = 'trainer_renewal';
                        paymentTypeLabel = 'Trainer Access Renewal';
                        paymentTypeColor = '#10b981';
                    } else {
                        // Fallback to detected type if payment_purpose is invalid
                        paymentType = paymentTypeResult.type;
                        paymentTypeLabel = paymentTypeResult.label;
                        paymentTypeColor = paymentTypeResult.color;
                    }
                } else {
                    // Backward compatibility: use detected type if payment_purpose not set
                    paymentType = paymentTypeResult.type;
                    paymentTypeLabel = paymentTypeResult.label;
                    paymentTypeColor = paymentTypeResult.color;
                }

                // Debug logging for payment type detection
                if (payment.status === 'pending') {
                    console.log('[PAYMENT TYPE DETECTION]', {
                        paymentId: payment.id,
                        amount: payment.amount,
                        membershipStatus: membership?.status,
                        detectedType: paymentType,
                        confidence: paymentTypeResult.confidence,
                        hasTrainerAddon: (trainerAddons || []).some(a => a.addon_type === 'personal_trainer'),
                        trainerAddons: trainerAddons || [],
                        trainerAssignments: trainerAssignments || []
                    });
                }

                // Return payment with type information
                const paymentWithType = {
                    ...payment,
                    screenshotUrl: null,
                    paymentType,
                    paymentTypeLabel,
                    paymentTypeColor
                };

                if (!payment.payment_screenshot_url) {
                    return paymentWithType;
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

