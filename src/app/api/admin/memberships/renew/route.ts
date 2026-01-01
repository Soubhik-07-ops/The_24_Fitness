import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateAdminSession } from '@/lib/adminAuth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
})

export async function POST(request: NextRequest) {
    try {
        const token = request.cookies.get('admin_token')?.value
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
        }

        const admin = await validateAdminSession(token)
        if (!admin) {
            return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 })
        }

        const body = await request.json()
        const { membershipId, renewalType } = body // 'membership' or 'trainer'

        if (!membershipId || !renewalType) {
            return NextResponse.json(
                { error: 'Membership ID and renewal type are required' },
                { status: 400 }
            )
        }

        // Fetch membership
        const { data: membership, error: membershipError } = await supabaseAdmin
            .from('memberships')
            .select('*')
            .eq('id', membershipId)
            .single()

        if (membershipError || !membership) {
            return NextResponse.json(
                { error: 'Membership not found' },
                { status: 404 }
            )
        }

        if (renewalType === 'membership') {
            // Renew membership: extend end date
            const currentEndDate = membership.membership_end_date
                ? new Date(membership.membership_end_date)
                : new Date()

            const newEndDate = new Date(currentEndDate)
            newEndDate.setMonth(newEndDate.getMonth() + membership.duration_months)

            // Calculate renewal amount
            let renewalAmount = membership.price || 0
            if (membership.plan_mode === 'in_gym') {
                const { getInGymMonthlyFee } = await import('@/lib/adminSettings');
                const monthlyFee = await getInGymMonthlyFee();
                renewalAmount += monthlyFee; // Monthly fee for in-gym renewals
            }

            // Update membership
            const { error: updateError } = await supabaseAdmin
                .from('memberships')
                .update({
                    membership_end_date: newEndDate.toISOString(),
                    end_date: newEndDate.toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', membershipId)

            if (updateError) {
                return NextResponse.json(
                    { error: 'Failed to renew membership' },
                    { status: 500 }
                )
            }

            // Generate invoice
            try {
                const invoiceResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/invoices/generate`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        membershipId: membershipId,
                        paymentId: null,
                        invoiceType: 'membership_renewal',
                        amount: renewalAmount
                    })
                })

                if (invoiceResponse.ok) {
                    const invoiceData = await invoiceResponse.json()
                    console.log('[RENEW MEMBERSHIP] Invoice generated:', invoiceData.invoice?.invoiceNumber)
                }
            } catch (invoiceError) {
                console.error('[RENEW MEMBERSHIP] Error generating invoice:', invoiceError)
            }

            // Create notification for user
            await supabaseAdmin
                .from('notifications')
                .insert({
                    recipient_id: membership.user_id,
                    actor_role: 'admin',
                    type: 'membership_renewed',
                    content: `Your ${membership.plan_name} membership has been renewed until ${newEndDate.toLocaleDateString('en-IN')}.`,
                    is_read: false
                })

            return NextResponse.json({
                success: true,
                message: 'Membership renewed successfully',
                newEndDate: newEndDate.toISOString()
            })

        } else if (renewalType === 'trainer') {
            // Renew trainer: extend trainer period
            if (!membership.trainer_assigned || !membership.trainer_id) {
                return NextResponse.json(
                    { error: 'No trainer assigned to renew' },
                    { status: 400 }
                )
            }

            const currentTrainerEndDate = membership.trainer_period_end
                ? new Date(membership.trainer_period_end)
                : new Date()

            const newTrainerEndDate = new Date(currentTrainerEndDate)
            newTrainerEndDate.setMonth(newTrainerEndDate.getMonth() + 1) // Add 1 month

            // Get trainer addon price
            const { data: addons } = await supabaseAdmin
                .from('membership_addons')
                .select('price')
                .eq('membership_id', membershipId)
                .eq('addon_type', 'personal_trainer')
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(1)
                .single()

            const trainerPrice = addons?.price || 0

            // Update membership
            const { error: updateError } = await supabaseAdmin
                .from('memberships')
                .update({
                    trainer_period_end: newTrainerEndDate.toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', membershipId)

            if (updateError) {
                return NextResponse.json(
                    { error: 'Failed to renew trainer access' },
                    { status: 500 }
                )
            }

            // Generate invoice
            if (trainerPrice > 0) {
                try {
                    const invoiceResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/invoices/generate`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            membershipId: membershipId,
                            paymentId: null,
                            invoiceType: 'trainer_renewal',
                            amount: trainerPrice
                        })
                    })

                    if (invoiceResponse.ok) {
                        const invoiceData = await invoiceResponse.json()
                        console.log('[RENEW TRAINER] Invoice generated:', invoiceData.invoice?.invoiceNumber)
                    }
                } catch (invoiceError) {
                    console.error('[RENEW TRAINER] Error generating invoice:', invoiceError)
                }
            }

            // Create notification for user
            await supabaseAdmin
                .from('notifications')
                .insert({
                    recipient_id: membership.user_id,
                    actor_role: 'admin',
                    type: 'trainer_renewed',
                    content: `Your trainer access has been renewed until ${newTrainerEndDate.toLocaleDateString('en-IN')}.`,
                    is_read: false
                })

            return NextResponse.json({
                success: true,
                message: 'Trainer access renewed successfully',
                newTrainerEndDate: newTrainerEndDate.toISOString()
            })
        } else {
            return NextResponse.json(
                { error: 'Invalid renewal type' },
                { status: 400 }
            )
        }

    } catch (error: any) {
        console.error('Error renewing membership/trainer:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to process renewal' },
            { status: 500 }
        )
    }
}

