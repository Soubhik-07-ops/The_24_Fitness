// src/app/api/admin/memberships/[id]/screenshot/route.ts
// API route to get signed URL for payment screenshot (for admin access to private bucket)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';

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
        const token = request.cookies.get('admin_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });
        }

        const { id } = await context.params;
        const membershipId = parseInt(id);
        if (isNaN(membershipId)) {
            return NextResponse.json({ error: 'Invalid membership ID' }, { status: 400 });
        }

        // Check if this is a renewal payment request
        const { searchParams } = new URL(request.url);
        const isRenewal = searchParams.get('renewal') === 'true';

        // Get payment record - prioritize pending renewal payments if renewal flag is set
        let payment: any = null;
        let paymentError: any = null;

        if (isRenewal) {
            // Get pending renewal payment first
            const { data: renewalPayment, error: renewalError } = await supabaseAdmin
                .from('membership_payments')
                .select('payment_screenshot_url')
                .eq('membership_id', membershipId)
                .eq('status', 'pending')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (!renewalError && renewalPayment) {
                payment = renewalPayment;
            } else {
                // Fallback to any payment
                const { data: anyPayment, error: anyError } = await supabaseAdmin
                    .from('membership_payments')
                    .select('payment_screenshot_url')
                    .eq('membership_id', membershipId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();
                
                payment = anyPayment;
                paymentError = anyError;
            }
        } else {
            // Get the most recent payment (or verified payment)
            const { data: regularPayment, error: regularError } = await supabaseAdmin
                .from('membership_payments')
                .select('payment_screenshot_url')
                .eq('membership_id', membershipId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            payment = regularPayment;
            paymentError = regularError;
        }

        if (paymentError || !payment) {
            return NextResponse.json({ error: 'Payment record not found' }, { status: 404 });
        }

        if (!payment.payment_screenshot_url) {
            return NextResponse.json({ error: 'No screenshot available' }, { status: 404 });
        }

        // payment_screenshot_url is stored as file path (e.g., "user_id/membership_id/timestamp.ext")
        // If it's a full URL, extract the path; otherwise use it directly
        let filePath = payment.payment_screenshot_url;

        // Check if it's a full URL and extract path
        if (filePath.includes('/storage/v1/object/')) {
            const urlParts = filePath.split('/');
            const bucketIndex = urlParts.findIndex((part: string) => part === 'payment-screenshots');
            if (bucketIndex !== -1 && bucketIndex < urlParts.length - 1) {
                filePath = urlParts.slice(bucketIndex + 1).join('/');
            }
        }

        // Generate signed URL (valid for 1 hour)
        const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
            .from('payment-screenshots')
            .createSignedUrl(filePath, 3600); // 1 hour expiry

        if (signedUrlError) {
            return NextResponse.json({ error: 'Failed to generate access URL' }, { status: 500 });
        }

        return NextResponse.json({
            screenshotUrl: signedUrlData.signedUrl,
            expiresAt: new Date(Date.now() + 3600000).toISOString()
        });
    } catch (err: any) {
        return NextResponse.json(
            { error: err.message || 'Failed to access screenshot' },
            { status: 500 }
        );
    }
}

