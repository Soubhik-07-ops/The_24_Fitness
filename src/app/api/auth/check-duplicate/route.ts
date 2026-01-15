import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateEmail } from '@/lib/emailValidation';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
    try {
        const { email, phone } = await request.json();

        if (!email && !phone) {
            return NextResponse.json(
                { error: 'Email or phone is required' },
                { status: 400 }
            );
        }

        // Validate email format and check for disposable emails (server-side validation)
        if (email) {
            const emailValidation = validateEmail(email);
            if (!emailValidation.isValid) {
                return NextResponse.json(
                    {
                        error: emailValidation.error || 'Invalid email address',
                        isDisposable: emailValidation.isDisposable || false,
                        emailExists: false,
                        phoneExists: false,
                        exists: false
                    },
                    { status: 400 }
                );
            }
        }

        const phoneDigits = phone ? phone.replace(/\D/g, '') : null;

        // Check if email exists in auth.users
        let emailExists = false;
        if (email) {
            try {
                const { data: userData } = await supabaseAdmin.auth.admin.listUsers();
                emailExists = userData?.users?.some(user => user.email === email) || false;
            } catch (err) {
                console.error('Error checking email:', err);
            }
        }

        // Check if phone exists in profiles
        let phoneExists = false;
        if (phoneDigits && phoneDigits.length === 10) {
            const { data: profileData } = await supabaseAdmin
                .from('profiles')
                .select('id')
                .eq('phone', phoneDigits)
                .single();

            phoneExists = !!profileData;
        }

        return NextResponse.json({
            emailExists,
            phoneExists,
            exists: emailExists || phoneExists
        });

    } catch (error: any) {
        console.error('Check duplicate error:', error);
        return NextResponse.json(
            { error: 'Failed to check duplicates' },
            { status: 500 }
        );
    }
}

