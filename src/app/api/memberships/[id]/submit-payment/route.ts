import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createTrainerAssignmentRequest, type TrainerAssignmentConfig } from '@/lib/trainerAssignment'
import { logger } from '@/lib/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables')
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
})

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params
        const body = await request.json()
        const {
            transactionId,
            paymentDate,
            amount,
            screenshotPath,
            addons,
            newPlan
        } = body

        // Get user from session token
        const authHeader = request.headers.get('authorization')
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json(
                { error: 'Not authenticated' },
                { status: 401 }
            )
        }

        const token = authHeader.replace('Bearer ', '')

        // Verify token and get user - also verify user still exists
        const { validateUserAuth } = await import('@/lib/userAuth');
        const user = await validateUserAuth(token);
        if (!user) {
            return NextResponse.json(
                { error: 'Invalid authentication token or user account has been deleted' },
                { status: 401 }
            )
        }

        const membershipId = parseInt(id)

        // Verify membership exists and belongs to user
        const { data: membership, error: membershipError } = await supabaseAdmin
            .from('memberships')
            .select('id, user_id, status, plan_name, plan_type, duration_months, end_date, membership_end_date, price, form_data')
            .eq('id', membershipId)
            .single()

        if (membershipError || !membership) {
            return NextResponse.json(
                { error: 'Membership not found' },
                { status: 404 }
            )
        }

        if (membership.user_id !== user.id) {
            return NextResponse.json(
                { error: 'Unauthorized - membership does not belong to user' },
                { status: 403 }
            )
        }

        // Get current date
        const now = new Date();
        
        // Check if membership has expired or is nearing expiration (within 15-day renewal window)
        const endDate = membership.membership_end_date || membership.end_date;
        const hasExpired = endDate ? new Date(endDate) <= now : false;
        const diffMs = endDate ? new Date(endDate).getTime() - now.getTime() : 0;
        const daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        
        // Validate membership status - allow payment submission for:
        // 1. 'awaiting_payment' (new purchase)
        // 2. 'grace_period' (renewal)
        // 3. 'expired' (reactivation beyond grace period)
        // 4. 'active' if expired OR within 15 days of expiration (renewal window)
        // 5. 'rejected' (allowing safe retry of payment)
        const isEligibleForRenewal = membership.status === 'grace_period' || 
            membership.status === 'expired' ||
            membership.status === 'rejected' ||
            (membership.status === 'active' && (hasExpired || daysUntilExpiry <= 15));
        
        if (membership.status !== 'awaiting_payment' && !isEligibleForRenewal) {
            return NextResponse.json(
                { error: `Cannot submit payment. Membership is in '${membership.status}' status. Payment can only be submitted when membership status is 'awaiting_payment' (new purchase), 'grace_period' (renewal), 'expired' (reactivation), or within 15 days of expiration for active memberships.` },
                { status: 400 }
            )
        }

        // Check for existing pending payment to prevent duplicates
        const { data: existingPendingPayment } = await supabaseAdmin
            .from('membership_payments')
            .select('id, created_at')
            .eq('membership_id', membershipId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

        if (existingPendingPayment) {
            return NextResponse.json(
                { error: 'A payment is already pending for this membership. Please wait for admin approval before submitting another payment.' },
                { status: 400 }
            )
        }

        // Determine if this is a renewal payment
        const isRenewal = membership.status === 'grace_period' || 
            membership.status === 'expired' ||
            membership.status === 'rejected' ||
            (membership.status === 'active' && (hasExpired || daysUntilExpiry <= 15));

        const paymentPurpose = isRenewal ? 'membership_renewal' : 'initial_purchase';

        // Authoritative Server-Side Price Validation
        // 1. Determine user gender from profile
        const { data: userProfile } = await supabaseAdmin
            .from('profiles')
            .select('gender')
            .eq('id', user.id)
            .maybeSingle();

        const genderStr = (userProfile?.gender || '').toLowerCase();
        const isFemale = genderStr === 'female' || genderStr === 'girls' || genderStr === 'girl' || genderStr === 'f';

        // 2. Fetch authoritative fee settings from admin_settings
        const { data: feeSettings } = await supabaseAdmin
            .from('admin_settings')
            .select('setting_key, setting_value')
            .in('setting_key', ['in_gym_admission_fee', 'in_gym_monthly_fee', 'in_gym_female_fee', 'admission_fee', 'monthly_fee']);

        const settingsMap: Record<string, number> = {};
        feeSettings?.forEach((row: any) => {
            if (row.setting_key) {
                settingsMap[row.setting_key] = parseFloat(row.setting_value) || 0;
            }
        });

        const authoritativeAdmissionFee = settingsMap['in_gym_admission_fee'] || settingsMap['admission_fee'] || 1200;
        const authoritativeMonthlyFee = settingsMap['in_gym_monthly_fee'] || settingsMap['monthly_fee'] || 650;
        const authoritativeFemaleFee = settingsMap['in_gym_female_fee'] || 700;

        // 3. Determine target plan and duration
        const targetPlanName = (newPlan?.planName || membership.plan_name || '').toLowerCase();
        const targetPlanType = (newPlan?.planType || membership.plan_type || 'in_gym').toLowerCase();
        let targetDuration = Number(newPlan?.durationMonths) || Number(membership.duration_months) || 1;
        if (targetPlanName.includes('regular') || targetPlanName.includes('monthly')) targetDuration = 1;
        else if (targetPlanName.includes('basic')) targetDuration = 3;
        else if (targetPlanName.includes('premium')) targetDuration = 6;
        else if (targetPlanName.includes('elite')) targetDuration = 12;

        // 4. Calculate authoritative base plan price
        let authoritativeBasePrice = 0;
        let isRegularMonthly = false;

        if (targetPlanName.includes('elite')) {
            authoritativeBasePrice = isFemale ? 7800 : 6800;
        } else if (targetPlanName.includes('premium')) {
            authoritativeBasePrice = isFemale ? 4400 : 4000;
        } else if (targetPlanName.includes('basic')) {
            authoritativeBasePrice = isFemale ? 2400 : 2200;
        } else if (targetPlanName.includes('regular') || targetPlanName.includes('monthly') || targetPlanType === 'in_gym') {
            isRegularMonthly = true;
            if (isRenewal) {
                // Renewal of Regular Monthly: admission fee waived (male ₹650 / female ₹700)
                authoritativeBasePrice = isFemale ? authoritativeFemaleFee : authoritativeMonthlyFee;
            } else {
                // Initial purchase of Regular Monthly: admission fee + 1st month
                authoritativeBasePrice = authoritativeAdmissionFee + (isFemale ? authoritativeFemaleFee : authoritativeMonthlyFee);
            }
        } else {
            // Fallback for custom tiers to existing recorded price
            authoritativeBasePrice = Number(membership.price) || 0;
        }

        // 5. Calculate authoritative add-on pricing
        // In-gym offline add-on price removed per specification
        const authoritativeInGymPrice = 0;

        let authoritativeTrainerPrice = 0;
        let verifiedTrainerData: any = null;
        if (addons?.personalTrainer && addons?.selectedTrainer) {
            const { data: trainerData, error: trainerError } = await supabaseAdmin
                .from('trainers')
                .select('id, name, price, is_active')
                .eq('id', addons.selectedTrainer)
                .single();

            if (trainerError || !trainerData || !trainerData.is_active) {
                return NextResponse.json(
                    { error: 'Selected personal trainer is invalid or inactive' },
                    { status: 400 }
                );
            }

            verifiedTrainerData = trainerData;
            authoritativeTrainerPrice = Number(trainerData.price) || 0;
        }

        // 6. Validate client-supplied amount against authoritative total
        const expectedTotal = authoritativeBasePrice + authoritativeInGymPrice + authoritativeTrainerPrice;
        const submittedAmount = Number(amount);

        if (isNaN(submittedAmount) || Math.abs(submittedAmount - expectedTotal) > 0.01) {
            return NextResponse.json(
                {
                    error: `Invalid payment amount. Authoritative total is ₹${expectedTotal.toFixed(2)} (Base plan: ₹${authoritativeBasePrice}, In-Gym: ₹${authoritativeInGymPrice}, Trainer: ₹${authoritativeTrainerPrice}), but received ₹${amount}. Price tampering rejected.`,
                    expectedTotal,
                    receivedAmount: amount
                },
                { status: 400 }
            );
        }

        // Create payment record with authoritative amount and explicit payment_purpose
        const { data: payment, error: paymentError } = await supabaseAdmin
            .from('membership_payments')
            .insert({
                membership_id: membershipId,
                transaction_id: transactionId,
                payment_date: paymentDate,
                amount: expectedTotal,
                payment_screenshot_url: screenshotPath,
                payment_method: 'qr_code',
                status: 'pending',
                payment_purpose: paymentPurpose
            })
            .select()
            .single()

        if (paymentError) {
            console.error('Error creating payment:', paymentError)
            return NextResponse.json(
                { error: paymentError.message || 'Failed to create payment record' },
                { status: 500 }
            )
        }

        // Determine plan mode (Online or InGym)
        const planMode = membership.plan_type === 'in_gym' || addons?.inGym ? 'InGym' : 'Online'

        // Prepare membership update:
        // CRITICAL FOR SAFE REVERSAL & REJECTION SEMANTICS:
        // Do NOT overwrite membership.plan_name, price, or duration before admin approval!
        // Instead, store requested renewal plan in form_data.renewal_pending_plan.
        const existingFormData = (typeof membership.form_data === 'object' && membership.form_data !== null) ? membership.form_data : {};
        const updatedFormData = {
            ...existingFormData,
            ...(newPlan ? {
                renewal_pending_plan: {
                    planName: targetPlanName,
                    planType: targetPlanType,
                    durationMonths: targetDuration,
                    price: authoritativeBasePrice,
                    submittedAt: new Date().toISOString()
                }
            } : {})
        };

        const updateData: any = {
            status: 'pending',
            plan_mode: planMode,
            form_data: updatedFormData,
            updated_at: new Date().toISOString()
        };

        // Use conditional update to prevent race conditions
        const statusCondition = membership.status;
        const { data: updatedMembership, error: updateError } = await supabaseAdmin
            .from('memberships')
            .update(updateData)
            .eq('id', membershipId)
            .eq('status', statusCondition) // Only update if still in expected status (prevents race conditions)
            .select()
            .single()

        if (updateError || !updatedMembership) {
            console.error('Error updating membership status:', updateError)
            // Cleanup payment record on failure to prevent orphans
            await supabaseAdmin
                .from('membership_payments')
                .delete()
                .eq('id', payment.id)
            return NextResponse.json(
                { error: 'Failed to update membership status. Payment was not processed. Please try again.' },
                { status: 500 }
            )
        } else {
            logger.debug('Membership status updated successfully')
        }

        // Create add-ons if selected
        if (addons?.inGym) {
            logger.debug('Creating in-gym addon with 0 price (fee removed)')

            const { data: inGymAddon, error: inGymError } = await supabaseAdmin
                .from('membership_addons')
                .insert({
                    membership_id: membershipId,
                    addon_type: 'in_gym',
                    price: 0, // In-gym offline addon price removed per specification
                    status: 'pending'
                })
                .select()
                .single()

            if (inGymError) {
                logger.error('Error creating in-gym addon:', inGymError)
            } else {
                logger.debug('In-gym addon created successfully')

                // Update membership plan_type from 'online' to 'in_gym' when in-gym addon is selected
                const { error: updatePlanTypeError } = await supabaseAdmin
                    .from('memberships')
                    .update({ plan_type: 'in_gym' })
                    .eq('id', membershipId)

                if (updatePlanTypeError) {
                    logger.error('Error updating plan_type to in_gym:', updatePlanTypeError)
                } else {
                    logger.debug('Membership plan_type updated to in_gym')
                }
            }
        }

        // Handle trainer assignment logic
        let trainerAssignmentCreated = false
        if (addons?.personalTrainer && addons?.selectedTrainer) {
            logger.debug('[SUBMIT PAYMENT] Processing trainer addon for renewal')

            // Fetch trainer from database using the trainer ID (not hardcoded names)
            // The frontend now sends the actual trainer UUID from database
            const { data: trainerData, error: trainerError } = await supabaseAdmin
                .from('trainers')
                .select('id, name, price')
                .eq('id', addons.selectedTrainer)
                .eq('is_active', true)
                .single()

            if (trainerError || !trainerData) {
                logger.error('[SUBMIT PAYMENT] Error fetching trainer:', trainerError)
                return NextResponse.json(
                    { error: 'Invalid or inactive trainer selected' },
                    { status: 400 }
                )
            }

            // Use price from database, not hardcoded
            const trainerPrice = parseFloat(trainerData.price) || 0
            if (trainerPrice === 0) {
                logger.warn('[SUBMIT PAYMENT] Trainer has no price in database')
            }

            // Create trainer addon record
            const { data: trainerAddon, error: trainerAddonError } = await supabaseAdmin
                .from('membership_addons')
                .insert({
                    membership_id: membershipId,
                    addon_type: 'personal_trainer',
                    trainer_id: trainerData.id,
                    price: trainerPrice, // Use price from database
                    status: 'pending'
                })
                .select()
                .single()

            if (trainerAddonError) {
                logger.error('[SUBMIT PAYMENT] Error creating personal trainer addon:', trainerAddonError)
            } else {
                logger.debug('[SUBMIT PAYMENT] Personal trainer addon created successfully')

                // Create trainer assignment request
                // Note: We'll use a future date for membership start (when admin approves)
                // For now, we create the assignment request with pending status
                const assignmentConfig: TrainerAssignmentConfig = {
                    planName: membership.plan_name,
                    planMode: planMode,
                    hasTrainerAddon: true,
                    selectedTrainerId: trainerData.id,
                    durationMonths: membership.duration_months
                }

                // Use current date as placeholder - will be updated when admin approves
                const placeholderStartDate = new Date()
                const assignmentResult = await createTrainerAssignmentRequest(
                    membershipId,
                    user.id,
                    trainerData.id,
                    assignmentConfig,
                    placeholderStartDate
                )

                if (assignmentResult.success) {
                    trainerAssignmentCreated = true
                    logger.debug('[SUBMIT PAYMENT] Trainer assignment request created')
                } else {
                    logger.error('[SUBMIT PAYMENT] Error creating trainer assignment request:', assignmentResult.error)
                }
            }
        } else {
            logger.debug('[SUBMIT PAYMENT] No trainer addon selected', {
                hasPersonalTrainer: addons?.personalTrainer,
                hasSelectedTrainer: Boolean(addons?.selectedTrainer),
                isRenewal
            });
        }

        // For Premium and Elite plans, check if they include trainer (even without addon)
        // Premium: 1 week free trainer (admin assigns)
        // Elite: 1 month free trainer (user can choose, but if not chosen, admin assigns)
        const planName = membership.plan_name.toLowerCase()
        if ((planName === 'premium' || planName === 'elite') && !addons?.personalTrainer) {
            // Create a pending trainer assignment request (admin will assign trainer)
            // This will be handled when admin approves the membership
            console.log(`Plan ${planName} includes trainer access - admin will assign trainer on approval`)
        }

        // Get user profile for notification
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .single()

        const userName = profile?.full_name || 'A user'

        // Create admin notification
        let notificationContent = `${userName} has submitted payment for ${membership.plan_name} membership. Please verify.`

        // Add trainer request info if applicable
        if (trainerAssignmentCreated && addons?.selectedTrainer) {
            // Fetch trainer name from database instead of hardcoded mapping
            const { data: trainerData } = await supabaseAdmin
                .from('trainers')
                .select('name')
                .eq('id', addons.selectedTrainer)
                .single()

            const trainerName = trainerData?.name || 'Selected Trainer'
            notificationContent = `${userName} has requested Trainer ${trainerName} for ${membership.plan_name} membership. Assign trainer.`
        } else if (planName === 'premium' || planName === 'elite') {
            notificationContent = `${userName} has submitted payment for ${membership.plan_name} membership (includes trainer access). Please verify and assign trainer.`
        }

        await supabaseAdmin
            .from('admin_notifications')
            .insert({
                notification_type: trainerAssignmentCreated ? 'trainer_assignment_request' : 'new_membership_payment',
                content: notificationContent,
                reference_id: payment.id.toString(),
                actor_role: 'user',
                actor_id: user.id,
                is_read: false
            })

        return NextResponse.json({
            success: true,
            payment,
            membership: updatedMembership || membership
        })
    } catch (error: any) {
        logger.error('Error in submit-payment route:', error)
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        )
    }
}

