import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');
    const next = requestUrl.searchParams.get('next') || '/';

    if (code) {
        const cookieStore = await cookies();
        const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
        
        try {
            const { data, error } = await supabase.auth.exchangeCodeForSession(code);

            if (error) {
                console.error('OAuth callback error:', error);
                return NextResponse.redirect(new URL(`/signup?error=${encodeURIComponent(error.message)}`, requestUrl.origin));
            }

            if (data?.user) {
                // Check if profile exists
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', data.user.id)
                    .single();

                // If profile doesn't exist, create it
                if (profileError && profileError.code === 'PGRST116') {
                    const fullName = data.user.user_metadata?.full_name || 
                                   data.user.user_metadata?.name || 
                                   data.user.email?.split('@')[0] || 
                                   'User';

                    const { error: createError } = await supabase
                        .from('profiles')
                        .upsert({
                            id: data.user.id,
                            full_name: fullName,
                            email: data.user.email,
                            updated_at: new Date().toISOString()
                        });

                    if (createError) {
                        console.error('Error creating profile:', createError);
                    } else {
                        // Create signup notification
                        try {
                            await fetch(`${requestUrl.origin}/api/auth/signup-notification`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    userId: data.user.id,
                                    email: data.user.email,
                                    fullName: fullName
                                })
                            });
                        } catch (notifErr) {
                            console.error('Failed to create signup notification:', notifErr);
                        }
                    }
                }

                // Redirect to home or dashboard
                return NextResponse.redirect(new URL(next, requestUrl.origin));
            }
        } catch (error: any) {
            console.error('OAuth callback error:', error);
            return NextResponse.redirect(new URL(`/signup?error=${encodeURIComponent(error.message || 'Authentication failed')}`, requestUrl.origin));
        }
    }

    // If no code, redirect to signup
    return NextResponse.redirect(new URL('/signup', requestUrl.origin));
}

