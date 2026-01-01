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

// GET all invoices for a membership (admin only)
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ membershipId: string }> }
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

        const { membershipId } = await context.params
        const membershipIdNum = parseInt(membershipId)

        if (isNaN(membershipIdNum)) {
            return NextResponse.json(
                { success: false, error: 'Invalid membership ID' },
                { status: 400 }
            )
        }

        // Verify membership exists
        const { data: membership, error: membershipError } = await supabaseAdmin
            .from('memberships')
            .select('id, user_id')
            .eq('id', membershipIdNum)
            .single()

        if (membershipError || !membership) {
            return NextResponse.json(
                { success: false, error: 'Membership not found' },
                { status: 404 }
            )
        }

        // Fetch invoices for this membership (admin can see all invoices)
        const { data: invoices, error: invoicesError } = await supabaseAdmin
            .from('invoices')
            .select('*')
            .eq('membership_id', membershipIdNum)
            .order('created_at', { ascending: false })

        if (invoicesError) {
            return NextResponse.json(
                { success: false, error: 'Failed to fetch invoices' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            invoices: invoices || []
        })

    } catch (error: any) {
        console.error('Error fetching invoices:', error)
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to fetch invoices' },
            { status: 500 }
        )
    }
}

