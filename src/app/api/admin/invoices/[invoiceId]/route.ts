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

// DELETE invoice
export async function DELETE(
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

        // Fetch invoice to get pdf_path before deletion
        const { data: invoice, error: fetchError } = await supabaseAdmin
            .from('invoices')
            .select('pdf_path')
            .eq('id', invoiceId)
            .single()

        if (fetchError || !invoice) {
            return NextResponse.json(
                { success: false, error: fetchError?.message || 'Invoice not found' },
                { status: 404 }
            )
        }

        // Delete PDF from storage if it exists
        if (invoice.pdf_path) {
            try {
                const { error: storageError } = await supabaseAdmin.storage
                    .from('invoices')
                    .remove([invoice.pdf_path])

                if (storageError) {
                    console.warn('Error deleting invoice PDF from storage:', storageError)
                    // Continue with database deletion even if storage deletion fails
                }
            } catch (storageErr) {
                console.warn('Error deleting invoice PDF from storage:', storageErr)
                // Continue with database deletion even if storage deletion fails
            }
        }

        // Delete invoice from database
        const { error: deleteError } = await supabaseAdmin
            .from('invoices')
            .delete()
            .eq('id', invoiceId)

        if (deleteError) {
            return NextResponse.json(
                { success: false, error: deleteError.message || 'Failed to delete invoice' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            message: 'Invoice deleted successfully'
        })

    } catch (error: any) {
        console.error('Error deleting invoice:', error)
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to delete invoice' },
            { status: 500 }
        )
    }
}

// GET invoice details (for admin)
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

        // Fetch invoice
        const { data: invoice, error: fetchError } = await supabaseAdmin
            .from('invoices')
            .select('*')
            .eq('id', invoiceId)
            .single()

        if (fetchError || !invoice) {
            return NextResponse.json(
                { success: false, error: fetchError?.message || 'Invoice not found' },
                { status: 404 }
            )
        }

        return NextResponse.json({
            success: true,
            invoice
        })

    } catch (error: any) {
        console.error('Error fetching invoice:', error)
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to fetch invoice' },
            { status: 500 }
        )
    }
}

