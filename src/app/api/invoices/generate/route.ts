import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateInvoicePDF, generateInvoiceNumber } from '@/lib/invoiceGenerator'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables')
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
})

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const {
            membershipId,
            paymentId,
            invoiceType,
            amount,
            planPrice
        } = body

        if (!membershipId || !invoiceType || !amount) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            )
        }

        // Fetch membership details
        const { data: membership, error: membershipError } = await supabaseAdmin
            .from('memberships')
            .select(`
                *,
                trainers (
                    id,
                    name
                )
            `)
            .eq('id', membershipId)
            .single()

        if (membershipError || !membership) {
            return NextResponse.json(
                { error: 'Membership not found' },
                { status: 404 }
            )
        }

        // Fetch user profile
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('full_name, phone')
            .eq('id', membership.user_id)
            .single()

        if (profileError) {
            console.error('Error fetching profile:', profileError)
        }

        // Fetch user email from auth
        const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(membership.user_id)
        if (userError) {
            console.error('Error fetching user:', userError)
        }

        // Fetch payment details if paymentId provided
        let paymentDate = new Date().toISOString()
        if (paymentId) {
            const { data: payment } = await supabaseAdmin
                .from('membership_payments')
                .select('created_at, payment_date')
                .eq('id', paymentId)
                .single()

            if (payment) {
                paymentDate = payment.payment_date || payment.created_at
            }
        }

        // Fetch membership addons to get trainer addon price
        const { data: membershipAddons } = await supabaseAdmin
            .from('membership_addons')
            .select('addon_type, price, trainer_id, trainers (id, name)')
            .eq('membership_id', membershipId)
            .eq('status', 'active')

        // Find trainer addon
        const trainerAddon = membershipAddons?.find((addon: any) => addon.addon_type === 'personal_trainer')
        const trainerAddonPrice = trainerAddon ? (parseFloat(trainerAddon.price) || 0) : 0
        const trainerName = trainerAddon?.trainers?.[0]?.name || membership.trainers?.[0]?.name || membership.trainer_name || undefined

        // Calculate admission fee and monthly fee for in-gym plans
        let admissionFee = 0
        let monthlyFee = 0
        if (membership.plan_mode === 'in_gym') {
            // Check if this is the first payment
            const { data: previousPayments } = await supabaseAdmin
                .from('membership_payments')
                .select('id')
                .eq('membership_id', membershipId)
                .eq('status', 'verified')
                .order('created_at', { ascending: true })
                .limit(1)

            const isFirstPayment = !previousPayments || previousPayments.length === 0

            if (isFirstPayment) {
                const { getInGymAdmissionFee } = await import('@/lib/adminSettings');
                admissionFee = await getInGymAdmissionFee();
                monthlyFee = 0
            } else {
                admissionFee = 0
                const { getInGymMonthlyFee } = await import('@/lib/adminSettings');
                monthlyFee = await getInGymMonthlyFee();
            }
        }

        // Generate unique invoice number (with retry logic for uniqueness)
        let invoiceNumber = generateInvoiceNumber()
        let retryCount = 0
        const maxRetries = 5

        // Check if invoice number already exists and regenerate if needed
        while (retryCount < maxRetries) {
            const { data: existingInvoice } = await supabaseAdmin
                .from('invoices')
                .select('id')
                .eq('invoice_number', invoiceNumber)
                .single()

            if (!existingInvoice) {
                // Invoice number is unique, break the loop
                break
            }

            // Invoice number exists, generate a new one
            console.log(`Invoice number ${invoiceNumber} already exists, generating new one...`)
            invoiceNumber = generateInvoiceNumber()
            retryCount++
        }

        if (retryCount >= maxRetries) {
            return NextResponse.json(
                { error: 'Failed to generate unique invoice number after multiple attempts' },
                { status: 500 }
            )
        }

        // Prepare invoice data
        const invoiceData = {
            invoiceNumber,
            invoiceType: invoiceType as 'membership' | 'trainer_addon' | 'membership_renewal' | 'trainer_renewal',
            amount: parseFloat(amount),
            planPrice: planPrice !== undefined ? parseFloat(planPrice) : (membership.price || 0), // Base plan price
            planName: membership.plan_name,
            planType: membership.plan_type,
            planMode: membership.plan_mode,
            durationMonths: membership.duration_months,
            trainerName: trainerName,
            trainerAddonPrice: trainerAddonPrice > 0 ? trainerAddonPrice : undefined,
            userName: profile?.full_name || user?.email || 'User',
            userEmail: user?.email || '',
            userPhone: profile?.phone || undefined,
            userAddress: undefined, // Address not stored in profiles table
            paymentDate,
            membershipStartDate: membership.membership_start_date || membership.start_date,
            membershipEndDate: membership.membership_end_date || membership.end_date,
            trainerPeriodEnd: membership.trainer_period_end,
            admissionFee: admissionFee > 0 ? admissionFee : undefined,
            monthlyFee: monthlyFee > 0 ? monthlyFee : undefined
        }

        // Generate PDF
        const pdfDoc = generateInvoicePDF(invoiceData)
        const pdfBlob = pdfDoc.output('blob')
        const fileName = `${membership.user_id}/invoices/${invoiceNumber}.pdf`

        // Upload PDF to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from('invoices')
            .upload(fileName, pdfBlob, {
                contentType: 'application/pdf',
                upsert: false
            })

        if (uploadError) {
            console.error('Error uploading invoice PDF:', uploadError)

            // Check if bucket doesn't exist
            const errorMessage = uploadError.message || String(uploadError)
            const isBucketNotFound = errorMessage.includes('Bucket not found') ||
                errorMessage.includes('404') ||
                (uploadError as any)?.statusCode === '404' ||
                (uploadError as any)?.status === 404

            if (isBucketNotFound) {
                console.error('Storage bucket "invoices" does not exist. Please create it in Supabase Dashboard > Storage.')
                return NextResponse.json(
                    {
                        error: 'Storage bucket "invoices" not found. Please create it in Supabase Dashboard > Storage.',
                        details: 'Bucket name: invoices, Public: false, Allowed MIME types: application/pdf'
                    },
                    { status: 500 }
                )
            }

            return NextResponse.json(
                { error: 'Failed to upload invoice PDF', details: errorMessage },
                { status: 500 }
            )
        }

        // Get public URL (or signed URL)
        const { data: urlData } = supabaseAdmin.storage
            .from('invoices')
            .getPublicUrl(fileName)

        const pdfUrl = urlData.publicUrl

        // Save invoice to database
        const { data: invoice, error: invoiceError } = await supabaseAdmin
            .from('invoices')
            .insert({
                membership_id: membershipId,
                payment_id: paymentId || null,
                invoice_number: invoiceNumber,
                invoice_type: invoiceType,
                amount: parseFloat(amount),
                plan_name: membership.plan_name,
                plan_type: membership.plan_type,
                plan_mode: membership.plan_mode,
                duration_months: membership.duration_months,
                trainer_id: membership.trainer_id || null,
                trainer_name: membership.trainers?.[0]?.name || membership.trainer_name || null,
                user_id: membership.user_id,
                user_name: profile?.full_name || user?.email || 'User',
                user_email: user?.email || '',
                pdf_url: pdfUrl,
                pdf_path: fileName
            })
            .select()
            .single()

        if (invoiceError) {
            console.error('Error saving invoice:', invoiceError)
            
            // Check if it's a unique constraint violation (duplicate invoice number)
            const isDuplicateError = invoiceError.code === '23505' || 
                                    invoiceError.message?.includes('duplicate') ||
                                    invoiceError.message?.includes('unique')
            
            if (isDuplicateError) {
                console.error('Duplicate invoice number detected:', invoiceNumber)
                // Try to delete uploaded file
                await supabaseAdmin.storage
                    .from('invoices')
                    .remove([fileName])
                
                return NextResponse.json(
                    { error: 'Invoice number conflict detected. Please try again.' },
                    { status: 409 } // Conflict status
                )
            }
            
            // Try to delete uploaded file
            await supabaseAdmin.storage
                .from('invoices')
                .remove([fileName])

            return NextResponse.json(
                { error: 'Failed to save invoice', details: invoiceError.message },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            invoice: {
                id: invoice.id,
                invoiceNumber: invoice.invoice_number,
                pdfUrl: invoice.pdf_url,
                amount: invoice.amount
            }
        })

    } catch (error: any) {
        console.error('Error generating invoice:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to generate invoice' },
            { status: 500 }
        )
    }
}

