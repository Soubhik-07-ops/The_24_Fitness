// src/app/api/payment-qr/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// GET - Fetch payment QR code URL, UPI ID and payment instructions (public access for users)
export async function GET() {
    try {
        const { data, error } = await supabaseAdmin
            .from('admin_settings')
            .select('setting_key, setting_value')
            .in('setting_key', ['payment_qr_code_url', 'upi_id', 'upi_merchant_name', 'upi_qr_notice']);

        if (error) {
            throw error;
        }

        const settingsMap: Record<string, string> = {};
        data?.forEach((row: any) => {
            if (row.setting_key) {
                settingsMap[row.setting_key] = row.setting_value ?? '';
            }
        });

        const qrCodeUrl = settingsMap['payment_qr_code_url']?.trim() || null;
        const upiId = settingsMap['upi_id']?.trim() || null;
        const upiMerchantName = settingsMap['upi_merchant_name']?.trim() || null;
        const instructions = settingsMap['upi_qr_notice']?.trim() || null;

        return NextResponse.json({
            success: true,
            qrCodeUrl,
            upiId,
            upiMerchantName,
            instructions
        });
    } catch (error: any) {
        console.error('Error fetching payment configuration:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch payment configuration' },
            { status: 500 }
        );
    }
}

