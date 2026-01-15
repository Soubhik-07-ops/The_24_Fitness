/**
 * Invoice Download API
 * Allows users to download their own invoices
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
        const invoiceId = parseInt(id);

        if (isNaN(invoiceId)) {
            return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
        }

        // Get invoice with membership info
        const { data: invoice, error: invoiceError } = await supabaseAdmin
            .from('invoices')
            .select(`
                *,
                memberships!inner(user_id)
            `)
            .eq('id', invoiceId)
            .single();

        if (invoiceError || !invoice) {
            return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
        }

        // Check if user is authenticated and owns this invoice
        const authHeader = request.headers.get('authorization');
        if (authHeader) {
            const token = authHeader.replace('Bearer ', '');
            const { data: { user } } = await supabaseAdmin.auth.getUser(token);
            
            if (user && user.id === invoice.memberships.user_id) {
                // User owns this invoice - return file URL
                return NextResponse.json({
                    success: true,
                    invoice: {
                        id: invoice.id,
                        invoiceNumber: invoice.invoice_number,
                        fileUrl: invoice.file_url,
                        amount: invoice.amount,
                        invoiceType: invoice.invoice_type,
                        createdAt: invoice.created_at
                    }
                });
            }
        }

        // If not authenticated or doesn't own invoice, return 403
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    } catch (error: any) {
        console.error('[INVOICE] Download error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch invoice', details: error.message },
            { status: 500 }
        );
    }
}

