import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

// GET - Fetch active offers for users
export async function GET(request: NextRequest) {
    try {
        // Fetch all active offers
        const { data: offers, error } = await supabaseAdmin
            .from('offers')
            .select('*')
            .eq('is_active', true)
            .order('priority', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        // Filter offers that are currently valid based on dates
        // Compare dates as strings (YYYY-MM-DD) to avoid timezone issues
        const validOffers = (offers || []).filter(offer => {
            // Get today's date in YYYY-MM-DD format
            const today = new Date().toISOString().split('T')[0];
            
            // Extract date part from offer dates (handle both date-only and datetime strings)
            const startDate = offer.start_date ? offer.start_date.split('T')[0] : null;
            const endDate = offer.end_date ? offer.end_date.split('T')[0] : null;

            // If start date exists and is in the future, offer is not valid yet
            if (startDate && startDate > today) return false;

            // If end date exists and is in the past, offer has expired
            if (endDate && endDate < today) return false;

            return true;
        });

        return NextResponse.json({ success: true, offers: validOffers }, { status: 200 });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
    }
}

