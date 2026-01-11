import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createTrainerAssignmentRequest, type TrainerAssignmentConfig } from '@/lib/trainerAssignment'

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

        // Verify token and get user
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
        if (authError || !user) {
            return NextResponse.json(
                { error: 'Invalid authentication token' },
                { status: 401 }
            )
        }

        const membershipId = parseInt(id)

        // Verify membership exists and belongs to user
        const { data: membership, error: membershipError } = await supabaseAdmin
            .from('memberships')
            .select('id, user_id, status, plan_name, plan_type, duration_months')
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

        // Create payment record
        const { data: payment, error: paymentError } = await supabaseAdmin
            .from('membership_payments')
            .insert({
                membership_id: membershipId,
                transaction_id: transactionId,
                payment_date: paymentDate,
                amount: amount,
                payment_screenshot_url: screenshotPath,
                payment_method: 'qr_code',
                status: 'pending'
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

        // Update membership status from 'awaiting_payment' to 'pending' (using service role bypasses RLS)
        const { data: updatedMembership, error: updateError } = await supabaseAdmin
            .from('memberships')
            .update({
                status: 'pending',
                plan_mode: planMode,
                updated_at: new Date().toISOString()
            })
            .eq('id', membershipId)
            .select()
            .single()

        if (updateError) {
            console.error('Error updating membership status:', updateError)
            // Don't fail the whole request - payment was created
            // But log the error for debugging
        } else {
            console.log('Membership status updated successfully:', {
                id: membershipId,
                oldStatus: membership.status,
                newStatus: 'pending'
            })
        }

        // Create add-ons if selected
        if (addons?.inGym) {
            // In-gym admission fee (fetch from database)
            const { getInGymAdmissionFee } = await import('@/lib/adminSettings');
            const inGymPrice = await getInGymAdmissionFee();
            console.log('Creating in-gym addon with price:', inGymPrice, 'for membership:', membershipId)

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
                console.error('Error creating in-gym addon:', inGymError)
            } else {
                console.log('In-gym addon created successfully:', inGymAddon)
                console.log('In-gym addon price saved as:', inGymAddon.price, 'Type:', typeof inGymAddon.price)

                // Update membership plan_type from 'online' to 'in_gym' when in-gym addon is selected
                const { error: updatePlanTypeError } = await supabaseAdmin
                    .from('memberships')
                    .update({ plan_type: 'in_gym' })
                    .eq('id', membershipId)

                if (updatePlanTypeError) {
                    console.error('Error updating plan_type to in_gym:', updatePlanTypeError)
                } else {
                    console.log('Membership plan_type updated to in_gym')
                }
            }
        }

        // Handle trainer assignment logic
        let trainerAssignmentCreated = false
        if (addons?.personalTrainer && addons?.selectedTrainer) {
            // Fetch trainer from database using the trainer ID (not hardcoded names)
            // The frontend now sends the actual trainer UUID from database
            const { data: trainerData, error: trainerError } = await supabaseAdmin
                .from('trainers')
                .select('id, name, price')
                .eq('id', addons.selectedTrainer)
                .eq('is_active', true)
                .single()

            if (trainerError || !trainerData) {
                console.error('Error fetching trainer:', trainerError)
                return NextResponse.json(
                    { error: 'Invalid or inactive trainer selected' },
                    { status: 400 }
                )
            }

            // Use price from database, not hardcoded
            const trainerPrice = parseFloat(trainerData.price) || 0
            if (trainerPrice === 0) {
                console.warn(`Trainer ${trainerData.name} (ID: ${trainerData.id}) has no price in database`)
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
                console.error('Error creating personal trainer addon:', trainerAddonError)
            } else {
                console.log('Personal trainer addon created successfully:', trainerAddon)

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
                    console.log('Trainer assignment request created:', assignmentResult.assignmentId)
                } else {
                    console.error('Error creating trainer assignment request:', assignmentResult.error)
                }
            }
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
        console.error('Error in submit-payment route:', error)
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        )
    }
}

