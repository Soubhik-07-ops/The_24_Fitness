import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateAdminSession } from '@/lib/adminAuth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables')
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
})

// GET invoice download (for admin)
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ invoiceId: string }> }
) {
    try {
        // Verify admin
        const token = request.cookies.get('admin_token')?.value
        if (!token) {
            return NextResponse.json(
                { success: false, error: 'Not authenticated' },
                { status: 401 }
            )
        }

        const admin = await validateAdminSession(token)
        if (!admin) {
            return NextResponse.json(
                { success: false, error: 'Invalid or expired admin session' },
                { status: 401 }
            )
        }

        const { invoiceId } = await context.params

        if (!invoiceId) {
            return NextResponse.json(
                { success: false, error: 'Invoice ID is required' },
                { status: 400 }
            )
        }

        // Fetch invoice details
        const { data: invoice, error: invoiceError } = await supabaseAdmin
            .from('invoices')
            .select('pdf_path')
            .eq('id', invoiceId)
            .single()

        if (invoiceError || !invoice) {
            return NextResponse.json(
                { success: false, error: invoiceError?.message || 'Invoice not found' },
                { status: 404 }
            )
        }

        if (!invoice.pdf_path) {
            return NextResponse.json(
                { success: false, error: 'Invoice PDF not found' },
                { status: 404 }
            )
        }

        // Generate signed URL (valid for 1 hour)
        const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
            .from('invoices')
            .createSignedUrl(invoice.pdf_path, 3600) // 1 hour expiry

        if (signedUrlError) {
            console.error('Error creating signed URL:', signedUrlError)

            // Check if bucket doesn't exist
            const errorMessage = signedUrlError.message || String(signedUrlError)
            if (errorMessage.includes('Bucket not found') || errorMessage.includes('404')) {
                return NextResponse.json(
                    {
                        success: false,
                        error: 'Storage bucket "invoices" not found',
                        details: 'Please create the "invoices" bucket in Supabase Dashboard > Storage'
                    },
                    { status: 500 }
                )
            }

            return NextResponse.json(
                { success: false, error: 'Failed to generate download URL', details: errorMessage },
                { status: 500 }
            )
        }

        // Return signed URL as JSON (client will handle the redirect)
        return NextResponse.json({
            success: true,
            downloadUrl: signedUrlData.signedUrl
        })

    } catch (error: any) {
        console.error('Error in admin invoice download:', error)
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to download invoice' },
            { status: 500 }
        )
    }
}

