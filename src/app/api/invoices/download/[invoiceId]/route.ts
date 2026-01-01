import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables')
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
})

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ invoiceId: string }> }
) {
    try {
        const { invoiceId } = await context.params
        const invoiceIdParam = invoiceId

        // Get user session from request
        const authHeader = request.headers.get('authorization')
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

        if (authError || !user) {
            return NextResponse.json(
                { error: 'Invalid authentication token' },
                { status: 401 }
            )
        }

        // Fetch invoice details
        const { data: invoice, error: invoiceError } = await supabaseAdmin
            .from('invoices')
            .select('pdf_path, user_id')
            .eq('id', invoiceIdParam)
            .single()

        if (invoiceError || !invoice) {
            return NextResponse.json(
                { error: 'Invoice not found' },
                { status: 404 }
            )
        }

        // Verify user owns this invoice OR is an admin
        let isAdmin = false
        if (invoice.user_id !== user.id) {
            // Check if user is admin
            const { data: admin } = await supabaseAdmin
                .from('admins')
                .select('id')
                .eq('id', user.id)
                .eq('is_active', true)
                .single()
            
            if (!admin) {
                return NextResponse.json(
                    { error: 'Unauthorized - You can only download your own invoices' },
                    { status: 403 }
                )
            }
            isAdmin = true
        }

        if (!invoice.pdf_path) {
            return NextResponse.json(
                { error: 'Invoice PDF not found' },
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
                        error: 'Storage bucket "invoices" not found',
                        details: 'Please create the "invoices" bucket in Supabase Dashboard > Storage'
                    },
                    { status: 500 }
                )
            }

            return NextResponse.json(
                { error: 'Failed to generate download URL', details: errorMessage },
                { status: 500 }
            )
        }

        // Return signed URL as JSON (client will handle the redirect)
        return NextResponse.json({
            success: true,
            downloadUrl: signedUrlData.signedUrl
        })

    } catch (error: any) {
        console.error('Error in invoice download:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to download invoice' },
            { status: 500 }
        )
    }
}

