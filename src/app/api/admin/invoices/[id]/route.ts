/**
 * Admin Invoice Management API
 * - GET: Fetch invoice details
 * - DELETE: Delete invoice (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

/**
 * GET: Fetch invoice details
 */
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });
        }

        const { id } = await context.params;
        const invoiceId = parseInt(id);

        if (isNaN(invoiceId)) {
            return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
        }

        const { data: invoice, error: invoiceError } = await supabaseAdmin
            .from('invoices')
            .select('*')
            .eq('id', invoiceId)
            .single();

        if (invoiceError || !invoice) {
            return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            invoice
        });

    } catch (error: any) {
        console.error('[INVOICE] Fetch error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch invoice', details: error.message },
            { status: 500 }
        );
    }
}

/**
 * DELETE: Delete invoice (admin only)
 */
export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });
        }

        const { id } = await context.params;
        const invoiceId = parseInt(id);

        if (isNaN(invoiceId)) {
            return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
        }

        // Get invoice to get file path
        const { data: invoice, error: invoiceError } = await supabaseAdmin
            .from('invoices')
            .select('file_path')
            .eq('id', invoiceId)
            .single();

        if (invoiceError || !invoice) {
            return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
        }

        // Delete file from storage
        if (invoice.file_path) {
            const { error: deleteFileError } = await supabaseAdmin.storage
                .from('invoices')
                .remove([invoice.file_path]);

            if (deleteFileError) {
                console.error('[INVOICE] File deletion error:', deleteFileError);
                // Continue with database deletion even if file deletion fails
            }
        }

        // Delete invoice record
        const { error: deleteError } = await supabaseAdmin
            .from('invoices')
            .delete()
            .eq('id', invoiceId);

        if (deleteError) {
            return NextResponse.json(
                { error: 'Failed to delete invoice', details: deleteError.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Invoice deleted successfully'
        });

    } catch (error: any) {
        console.error('[INVOICE] Delete error:', error);
        return NextResponse.json(
            { error: 'Failed to delete invoice', details: error.message },
            { status: 500 }
        );
    }
}

