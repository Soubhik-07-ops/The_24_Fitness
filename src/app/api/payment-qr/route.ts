// src/app/api/payment-qr/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// GET - Fetch payment QR code URL (public access for users)
export async function GET() {
    try {
        const { data, error } = await supabaseAdmin
            .from('admin_settings')
            .select('setting_value')
            .eq('setting_key', 'payment_qr_code_url')
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
            throw error;
        }

        return NextResponse.json({
            success: true,
            qrCodeUrl: data?.setting_value || null
        });
    } catch (error: any) {
        console.error('Error fetching payment QR code:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch QR code' },
            { status: 500 }
        );
    }
}

