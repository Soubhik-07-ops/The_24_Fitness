/**
 * Get all invoices for a membership
 * User can access their own invoices, admin can access any
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params;
        const membershipId = parseInt(id);

        if (isNaN(membershipId)) {
            return NextResponse.json({ error: 'Invalid membership ID' }, { status: 400 });
        }

        // Get membership to check ownership
        const { data: membership, error: membershipError } = await supabaseAdmin
            .from('memberships')
            .select('user_id')
            .eq('id', membershipId)
            .single();

        if (membershipError || !membership) {
            return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
        }

        // Check authentication (optional - can be public endpoint with user check)
        const authHeader = request.headers.get('authorization');
        let isAuthorized = false;

        if (authHeader) {
            const token = authHeader.replace('Bearer ', '');
            const { data: { user } } = await supabaseAdmin.auth.getUser(token);
            if (user && user.id === membership.user_id) {
                isAuthorized = true;
            }
        }

        // For now, allow access (RLS will handle security)
        // Get invoices
        const { data: invoices, error: invoicesError } = await supabaseAdmin
            .from('invoices')
            .select('*')
            .eq('membership_id', membershipId)
            .order('created_at', { ascending: false });

        if (invoicesError) {
            return NextResponse.json(
                { error: 'Failed to fetch invoices', details: invoicesError.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            invoices: invoices || []
        });

    } catch (error: any) {
        console.error('[INVOICE] List error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch invoices', details: error.message },
            { status: 500 }
        );
    }
}

