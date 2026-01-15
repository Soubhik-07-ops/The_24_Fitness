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
            addons
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
            .select('id, user_id, status, plan_name, plan_type, duration_months, end_date, membership_end_date')
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
        
        // Check if membership has expired
        const endDate = membership.membership_end_date || membership.end_date;
        const hasExpired = endDate ? new Date(endDate) <= now : false;
        
        // Validate membership status - allow payment submission for:
        // 1. 'awaiting_payment' (new purchase)
        // 2. 'grace_period' (renewal)
        // 3. 'active' BUT expired (cron job might not have transitioned to grace_period yet)
        const isEligibleForRenewal = membership.status === 'grace_period' || 
            (membership.status === 'active' && hasExpired);
        
        if (membership.status !== 'awaiting_payment' && !isEligibleForRenewal) {
            return NextResponse.json(
                { error: `Cannot submit payment. Membership is in '${membership.status}' status. Payment can only be submitted when membership status is 'awaiting_payment' (new purchase) or 'grace_period' (renewal), or if membership has expired (for renewals).` },
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
        // This must be calculated BEFORE determining payment_purpose
        const isRenewal = membership.status === 'grace_period' || (membership.status === 'active' && hasExpired);

        // Determine payment purpose based on membership status
        // This is the explicit intent set at payment creation time
        const paymentPurpose = isRenewal ? 'membership_renewal' : 'initial_purchase';

        // Create payment record with explicit payment_purpose
        const { data: payment, error: paymentError } = await supabaseAdmin
            .from('membership_payments')
            .insert({
                membership_id: membershipId,
                transaction_id: transactionId,
                payment_date: paymentDate,
                amount: amount,
                payment_screenshot_url: screenshotPath,
                payment_method: 'qr_code',
                status: 'pending',
                payment_purpose: paymentPurpose // Explicit intent: initial_purchase or membership_renewal
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

        // Update membership status based on current status
        // For 'awaiting_payment' (new purchase): update to 'pending'
        // For 'grace_period' (renewal): update to 'pending' (will be reactivated on approval)
        // For 'active' but expired (demo mode): treat as renewal, update to 'pending'
        // Note: isRenewal is already calculated above
        const updateData: any = {
            status: 'pending',
            plan_mode: planMode,
            updated_at: new Date().toISOString()
        };

        // For grace period renewals or expired active memberships, we keep the membership record but mark it as pending
        // The approval route will handle reactivation and date extension

        // Use conditional update to prevent race conditions
        // Allow 'active' status if expired (for demo mode)
        const statusCondition = isRenewal 
            ? (membership.status === 'grace_period' ? 'grace_period' : 'active')
            : 'awaiting_payment';
        const { data: updatedMembership, error: updateError } = await supabaseAdmin
            .from('memberships')
            .update(updateData)
            .eq('id', membershipId)
            .eq('status', statusCondition) // Only update if still in expected status (prevents race conditions)
            .select()
            .single()

        if (updateError || !updatedMembership) {
            console.error('Error updating membership status:', updateError)
            // If status update fails, we have a payment but membership is in wrong state
            // Try to clean up the payment to prevent orphan records
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
            // In-gym admission fee (fetch from database)
            const { getInGymAdmissionFee } = await import('@/lib/adminSettings');
            const inGymPrice = await getInGymAdmissionFee();
            logger.debug('Creating in-gym addon')

            const { data: inGymAddon, error: inGymError } = await supabaseAdmin
                .from('membership_addons')
                .insert({
                    membership_id: membershipId,
                    addon_type: 'in_gym',
                    price: inGymPrice, // Ensure this is a number, not string
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

