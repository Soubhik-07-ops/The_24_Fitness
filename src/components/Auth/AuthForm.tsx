'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Loader2, ArrowLeft, Info } from 'lucide-react';
import { validatePassword, getPasswordRequirements } from '@/lib/passwordValidation';
import { isRecommendedEmailProvider } from '@/lib/emailValidation';
import styles from './AuthForm.module.css';

export default function AuthForm() {
    const [isSigningUp, setIsSigningUp] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirectUrl = searchParams.get('redirect') || '/';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        try {
            if (isSigningUp) {
                // Validate confirm password
                if (password !== confirmPassword) {
                    setMessage('Error: Passwords do not match');
                    setLoading(false);
                    return;
                }

                // Validate password requirements
                const passwordValidation = validatePassword(password);
                if (!passwordValidation.isValid) {
                    setMessage(`Error: ${passwordValidation.error}`);
                    setLoading(false);
                    return;
                }

                // Validate phone number (must be exactly 10 digits)
                const phoneDigits = phone.replace(/\D/g, '');
                if (!phoneDigits || phoneDigits.length !== 10) {
                    setMessage('Error: Please enter a valid 10-digit phone number');
                    setLoading(false);
                    return;
                }

                // Check for duplicate email or phone (includes disposable email validation)
                const duplicateCheck = await fetch('/api/auth/check-duplicate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, phone: phoneDigits })
                });

                const duplicateData = await duplicateCheck.json();

                // Handle disposable email error (server-side validation)
                if (duplicateData.isDisposable || (duplicateData.error && duplicateData.isDisposable)) {
                    setMessage(`Error: ${duplicateData.error || 'Temporary or disposable email addresses are not allowed. Please use a permanent email address.'}`);
                    setLoading(false);
                    return;
                }

                // Handle other validation errors
                if (!duplicateCheck.ok && duplicateData.error) {
                    setMessage(`Error: ${duplicateData.error}`);
                    setLoading(false);
                    return;
                }

                if (duplicateData.emailExists) {
                    setMessage('Error: An account with this email already exists');
                    setLoading(false);
                    return;
                }
                if (duplicateData.phoneExists) {
                    setMessage('Error: An account with this phone number already exists');
                    setLoading(false);
                    return;
                }

                // Sign Up Logic
                // Note: Supabase signUp may create a session automatically, so we'll explicitly sign out after account creation
                const { data, error } = await supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            full_name: fullName
                        },
                        // Prevent automatic email confirmation redirect that might create a session
                        emailRedirectTo: undefined
                    }
                });

                if (error) throw error;

                // Store user ID BEFORE signout (needed for welcome email)
                const userId = data.user?.id;

                // Send welcome email IMMEDIATELY after signup (before signout)
                // This ensures we have the user ID before session is cleared
                if (userId) {
                    try {
                        const { logger } = await import('@/lib/logger');
                        logger.debug('[AUTH FORM] Sending welcome email');
                        // Send welcome email BEFORE signing out (user ID is still available)
                        const welcomeEmailResponse = await fetch('/api/auth/send-welcome-email', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId })
                        });
                        
                        const welcomeEmailData = await welcomeEmailResponse.json();
                        if (welcomeEmailResponse.ok) {
                            console.log('[AUTH FORM] Welcome email sent successfully:', welcomeEmailData);
                        } else {
                            console.error('[AUTH FORM] Welcome email failed:', welcomeEmailData);
                        }
                    } catch (welcomeEmailError) {
                        // Don't fail signup if welcome email fails
                        console.error('[AUTH FORM] Exception sending welcome email:', welcomeEmailError);
                    }
                }

                // Create profile with phone number if user was created
                if (userId) {
                    try {
                        // Create/update profile with phone number
                        const phoneDigits = phone.replace(/\D/g, '');
                        const { error: profileError } = await supabase
                            .from('profiles')
                            .upsert({
                                id: userId,
                                full_name: fullName,
                                phone: phoneDigits,
                                updated_at: new Date().toISOString()
                            });

                        if (profileError) {
                            console.error('Error creating profile:', profileError);
                        }

                        // Create signup notification
                        await fetch('/api/auth/signup-notification', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                userId: userId,
                                email: email,
                                fullName: fullName
                            })
                        });
                    } catch (notifErr) {
                        console.error('Failed to create signup notification:', notifErr);
                        // Don't fail signup if notification fails
                    }
                }

                // CRITICAL: Explicitly sign out to prevent auto-authentication
                // This ensures no session is persisted after signup
                // Users must explicitly log in to access their account
                try {
                    // Sign out from Supabase (clears server-side session)
                    await supabase.auth.signOut();
                } catch (signOutError) {
                    console.error('Error signing out after signup:', signOutError);
                    // Continue even if sign out fails - we'll clear session on client side
                }

                // Clear any local session storage/cookies that might persist
                // This ensures the user is treated as unauthenticated
                if (typeof window !== 'undefined') {
                    // Clear Supabase session from localStorage (Supabase uses specific keys)
                    // Supabase stores session in localStorage with keys like:
                    // - `sb-<project-ref>-auth-token`
                    // - `supabase.auth.token`
                    const supabaseKeys: string[] = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && (
                            key.includes('supabase') ||
                            key.includes('sb-') ||
                            key.startsWith('sb-')
                        )) {
                            supabaseKeys.push(key);
                        }
                    }
                    supabaseKeys.forEach(key => {
                        try {
                            localStorage.removeItem(key);
                        } catch (e) {
                            // Ignore errors when clearing storage
                        }
                    });

                    // Also clear sessionStorage
                    for (let i = 0; i < sessionStorage.length; i++) {
                        const key = sessionStorage.key(i);
                        if (key && (
                            key.includes('supabase') ||
                            key.includes('sb-') ||
                            key.startsWith('sb-')
                        )) {
                            try {
                                sessionStorage.removeItem(key);
                            } catch (e) {
                                // Ignore errors when clearing storage
                            }
                        }
                    }
                }

                // Verify no session exists after signup
                // This ensures the user is truly unauthenticated
                try {
                    const { data: { session: verifySession } } = await supabase.auth.getSession();
                    if (verifySession) {
                        // If session still exists, force sign out again
                        console.warn('Session still exists after signup, forcing sign out...');
                        await supabase.auth.signOut();
                    }
                } catch (verifyError) {
                    // Ignore verification errors - session check is best effort
                }

                setMessage('Account created successfully! Please log in.');
                setIsSigningUp(false);

                // Clear form (keep email for convenience)
                // setEmail(''); // Keep email so user can easily log in
                setPassword('');
                setConfirmPassword('');
                setFullName('');
                setPhone('');
            } else {
                // Log In Logic - Support Email or Phone Number
                let loginEmail = email;

                // Check if input is a phone number (contains only digits, 10 digits)
                const phoneDigits = email.replace(/\D/g, '');
                const isPhoneNumber = phoneDigits.length === 10 && /^[0-9]{10}$/.test(phoneDigits);

                if (isPhoneNumber) {
                    // Get email by phone number via API
                    const response = await fetch('/api/auth/get-email-by-phone', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone: phoneDigits })
                    });

                    const emailData = await response.json();
                    if (!response.ok || !emailData.email) {
                        setMessage(`Error: ${emailData.error || 'No account found with this phone number'}`);
                        setLoading(false);
                        return;
                    }
                    loginEmail = emailData.email;
                }

                // Log in with email
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: loginEmail,
                    password: password,
                });

                if (error) throw error;

                // Verify session was created after login
                const { data: { session: loginSession } } = await supabase.auth.getSession();
                if (!loginSession) {
                    throw new Error('Login failed: No session created. Please try again.');
                }

                // Welcome email is sent only on signup, not on login
                // Removed login-time welcome email to prevent duplicate sends

                setMessage('Logged in successfully! Redirecting...');

                // Smooth redirect with loading state - use redirect URL if available
                // Only redirect if we have a valid session
                setTimeout(() => {
                    router.push(redirectUrl);
                    window.location.href = redirectUrl;
                }, 1500);
            }
        } catch (error: any) {
            console.error('Auth error:', error);
            setMessage(`Error: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.authContainer}>
            {loading && (
                <div className={styles.loadingOverlay}>
                    <div className={styles.loadingCard}>
                        <Loader2 className={styles.overlaySpinner} size={48} />
                        <p className={styles.loadingText}>
                            {isSigningUp ? 'Creating your account...' : 'Logging you in...'}
                        </p>
                    </div>
                </div>
            )}
            <div className={styles.authCard}>
                {redirectUrl !== '/' && (
                    <button
                        onClick={() => router.push('/membership')}
                        className={styles.backButton}
                        type="button"
                    >
                        <ArrowLeft size={18} />
                        Back to Plans
                    </button>
                )}
                <h2 className={styles.title}>
                    {isSigningUp ? 'Create Your Account' : 'Welcome Back'}
                </h2>
                <p className={styles.subtitle}>
                    {isSigningUp
                        ? 'Join The 24 Fitness Gym and start your journey.'
                        : 'Log in to access your account.'}
                </p>

                <form onSubmit={handleSubmit} className={styles.form}>
                    {isSigningUp && (
                        <>
                            <div className={styles.inputGroup}>
                                <label htmlFor="fullName">Full Name</label>
                                <input
                                    id="fullName"
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    required
                                    placeholder="John Doe"
                                />
                            </div>

                            <div className={styles.inputGroup}>
                                <label htmlFor="phone">Mobile Number</label>
                                <input
                                    id="phone"
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => {
                                        // Only allow numbers
                                        const value = e.target.value.replace(/\D/g, '');
                                        if (value.length <= 10) {
                                            setPhone(value);
                                        }
                                    }}
                                    required
                                    placeholder="9876543210"
                                    maxLength={10}
                                    pattern="[0-9]{10}"
                                />
                            </div>
                        </>
                    )}

                    <div className={styles.inputGroup}>
                        <label htmlFor="email">{isSigningUp ? 'Email' : 'Email/Number'}</label>
                        <input
                            id="email"
                            type={isSigningUp ? 'email' : 'text'}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            placeholder={isSigningUp ? 'you@example.com' : 'Email or Phone Number'}
                        />
                        {isSigningUp && email && !isRecommendedEmailProvider(email) && (
                            <div className={styles.emailHint}>
                                <Info size={14} />
                                <span>We recommend using Gmail for better email delivery of verification emails, invoices, and notifications.</span>
                            </div>
                        )}
                    </div>

                    <div className={styles.inputGroup}>
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            placeholder="••••••••"
                            minLength={8}
                        />
                        <p className={styles.passwordHint}>
                            Password must contain: 8+ characters, uppercase, lowercase, number, and special character (!@#$%&*)
                        </p>
                    </div>

                    {isSigningUp && (
                        <div className={styles.inputGroup}>
                            <label htmlFor="confirmPassword">Confirm Password</label>
                            <input
                                id="confirmPassword"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                placeholder="••••••••"
                                minLength={8}
                            />
                        </div>
                    )}

                    <button
                        type="submit"
                        className={styles.submitButton}
                        disabled={loading}
                    >
                        {loading ? (
                            <span className={styles.loadingContent}>
                                <Loader2 className={styles.spinner} size={18} />
                                {isSigningUp ? 'Creating Account...' : 'Logging In...'}
                            </span>
                        ) : (
                            isSigningUp ? 'Sign Up' : 'Log In'
                        )}
                    </button>
                </form>

                {message && (
                    <p className={`${styles.message} ${message.includes('Error') ? styles.error : styles.success}`}>
                        {message}
                    </p>
                )}

                <div className={styles.toggleMode}>
                    <button
                        onClick={() => {
                            setIsSigningUp(!isSigningUp);
                            setMessage('');
                            setEmail('');
                            setPassword('');
                            setConfirmPassword('');
                            setFullName('');
                            setPhone('');
                        }}
                        className={styles.toggleButton}
                    >
                        {isSigningUp
                            ? 'Already have an account? Log In'
                            : "Don't have an account? Sign Up"}
                    </button>
                </div>
            </div>
        </div>
    );
}