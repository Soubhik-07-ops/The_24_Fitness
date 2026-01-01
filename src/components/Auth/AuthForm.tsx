'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Loader2 } from 'lucide-react';
import { validatePassword, getPasswordRequirements } from '@/lib/passwordValidation';
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
    const [googleLoading, setGoogleLoading] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();

    // Check for OAuth callback errors
    useEffect(() => {
        const error = searchParams.get('error');
        if (error) {
            setMessage(`Error: ${decodeURIComponent(error)}`);
            // Clear the error from URL
            router.replace('/signup');
        }
    }, [searchParams, router]);

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

                // Check for duplicate email or phone
                const duplicateCheck = await fetch('/api/auth/check-duplicate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, phone: phoneDigits })
                });

                const duplicateData = await duplicateCheck.json();
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
                const { data, error } = await supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            full_name: fullName
                        }
                    }
                });

                if (error) throw error;

                // Create profile with phone number if user was created
                if (data.user?.id) {
                    try {
                        // Create/update profile with phone number
                        const phoneDigits = phone.replace(/\D/g, '');
                        const { error: profileError } = await supabase
                            .from('profiles')
                            .upsert({
                                id: data.user.id,
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
                                userId: data.user.id,
                                email: email,
                                fullName: fullName
                            })
                        });
                    } catch (notifErr) {
                        console.error('Failed to create signup notification:', notifErr);
                        // Don't fail signup if notification fails
                    }
                }

                setMessage('Account created successfully! Please log in.');
                setIsSigningUp(false);
                // Clear form
                setEmail('');
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

                setMessage('Logged in successfully! Redirecting...');

                // Smooth redirect with loading state
                setTimeout(() => {
                    router.push('/');
                    window.location.href = '/';
                }, 1500);
            }
        } catch (error: any) {
            console.error('Auth error:', error);
            setMessage(`Error: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setGoogleLoading(true);
        setMessage('');

        try {
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/auth/callback`,
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'consent',
                    }
                }
            });

            if (error) throw error;

            // The redirect will happen automatically
            // User will be redirected to Google, then back to /auth/callback
        } catch (error: any) {
            console.error('Google sign-in error:', error);
            setMessage(`Error: ${error.message || 'Failed to sign in with Google'}`);
            setGoogleLoading(false);
        }
    };

    return (
        <div className={styles.authContainer}>
            {(loading || googleLoading) && (
                <div className={styles.loadingOverlay}>
                    <div className={styles.loadingCard}>
                        <Loader2 className={styles.overlaySpinner} size={48} />
                        <p className={styles.loadingText}>
                            {googleLoading ? 'Redirecting to Google...' : isSigningUp ? 'Creating your account...' : 'Logging you in...'}
                        </p>
                    </div>
                </div>
            )}
            <div className={styles.authCard}>
                <h2 className={styles.title}>
                    {isSigningUp ? 'Create Your Account' : 'Welcome Back'}
                </h2>
                <p className={styles.subtitle}>
                    {isSigningUp
                        ? 'Join The 24 Fitness Gym and start your journey.'
                        : 'Log in to access your account.'}
                </p>

                {/* Google Sign In Button */}
                <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={loading || googleLoading}
                    className={styles.googleButton}
                >
                    {googleLoading ? (
                        <span className={styles.loadingContent}>
                            <Loader2 className={styles.spinner} size={18} />
                            Connecting...
                        </span>
                    ) : (
                        <>
                            <svg className={styles.googleIcon} viewBox="0 0 24 24" width="20" height="20">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                            </svg>
                            Continue with Google
                        </>
                    )}
                </button>

                <div className={styles.divider}>
                    <span>or</span>
                </div>

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