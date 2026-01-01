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

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        // Authenticate admin
        const token = request.cookies.get('admin_token')?.value
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
        }

        const admin = await validateAdminSession(token)
        if (!admin) {
            return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 })
        }

        const { id } = await context.params

        // Fetch membership to get PDF path
        const { data: membership, error: membershipError } = await supabaseAdmin
            .from('memberships')
            .select('form_pdf_path')
            .eq('id', parseInt(id))
            .single()

        if (membershipError || !membership) {
            return NextResponse.json(
                { error: 'Membership not found' },
                { status: 404 }
            )
        }

        if (!membership.form_pdf_path) {
            return NextResponse.json(
                { error: 'PDF not found for this membership' },
                { status: 404 }
            )
        }

        // Generate signed URL for PDF (valid for 1 hour)
        const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin
            .storage
            .from('membership-forms')
            .createSignedUrl(membership.form_pdf_path, 3600) // 1 hour expiry

        if (signedUrlError || !signedUrlData) {
            return NextResponse.json(
                { error: 'Failed to generate PDF URL' },
                { status: 500 }
            )
        }

        return NextResponse.json({ url: signedUrlData.signedUrl })
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        )
    }
}

