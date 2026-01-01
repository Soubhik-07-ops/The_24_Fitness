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

// Get all invoices for a membership
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ membershipId: string }> }
) {
    try {
        const { membershipId } = await context.params
        const membershipIdNum = parseInt(membershipId)

        if (isNaN(membershipIdNum)) {
            return NextResponse.json(
                { error: 'Invalid membership ID' },
                { status: 400 }
            )
        }

        // Check authentication
        const authHeader = request.headers.get('authorization')
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json(
                { error: 'Not authenticated' },
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

        // Verify membership belongs to user
        const { data: membership, error: membershipError } = await supabaseAdmin
            .from('memberships')
            .select('user_id')
            .eq('id', membershipIdNum)
            .single()

        if (membershipError || !membership) {
            return NextResponse.json(
                { error: 'Membership not found' },
                { status: 404 }
            )
        }

        if (membership.user_id !== user.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 403 }
            )
        }

        // Fetch invoices
        const { data: invoices, error: invoicesError } = await supabaseAdmin
            .from('invoices')
            .select('*')
            .eq('membership_id', membershipIdNum)
            .order('created_at', { ascending: false })

        if (invoicesError) {
            return NextResponse.json(
                { error: 'Failed to fetch invoices' },
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
            { error: error.message || 'Failed to fetch invoices' },
            { status: 500 }
        )
    }
}

