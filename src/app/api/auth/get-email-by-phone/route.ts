import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
    try {
        const { phone } = await request.json();

        if (!phone) {
            return NextResponse.json(
                { error: 'Phone number is required' },
                { status: 400 }
            );
        }

        // Clean phone number (remove non-digits)
        const phoneDigits = phone.replace(/\D/g, '');

        if (phoneDigits.length !== 10) {
            return NextResponse.json(
                { error: 'Invalid phone number format' },
                { status: 400 }
            );
        }

        // Find profile by phone number
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('phone', phoneDigits)
            .single();

        if (profileError || !profile) {
            return NextResponse.json(
                { error: 'No account found with this phone number' },
                { status: 404 }
            );
        }

        // Get user email from auth.users
        const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(profile.id);

        if (userError || !userData?.user?.email) {
            return NextResponse.json(
                { error: 'User email not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            email: userData.user.email,
            userId: profile.id
        });

    } catch (error: any) {
        console.error('Get email by phone error:', error);
        return NextResponse.json(
            { error: 'Failed to process request' },
            { status: 500 }
        );
    }
}

