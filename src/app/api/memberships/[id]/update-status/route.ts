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

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params
        const body = await request.json()
        const { status } = body

        if (!status) {
            return NextResponse.json(
                { error: 'Status is required' },
                { status: 400 }
            )
        }

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

        // Verify membership exists and belongs to user
        const { data: membership, error: membershipError } = await supabaseAdmin
            .from('memberships')
            .select('id, user_id, status')
            .eq('id', parseInt(id))
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

        // Update membership status using service role (bypasses RLS)
        const { data: updatedMembership, error: updateError } = await supabaseAdmin
            .from('memberships')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', parseInt(id))
            .select()
            .single()

        if (updateError) {
            console.error('Error updating membership status:', updateError)
            return NextResponse.json(
                { error: updateError.message || 'Failed to update membership status' },
                { status: 500 }
            )
        }

        console.log('Membership status updated successfully:', { id, oldStatus: membership.status, newStatus: status })
        return NextResponse.json({ success: true, membership: updatedMembership })
    } catch (error: any) {
        console.error('Error in update-status route:', error)
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        )
    }
}

