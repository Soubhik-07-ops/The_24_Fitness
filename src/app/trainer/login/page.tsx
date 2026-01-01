// src/app/trainer/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTrainerAuth } from '@/contexts/TrainerAuthContext';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import styles from './login.module.css';

export default function TrainerLogin() {
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { signIn } = useTrainerAuth();
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await signIn(phone, password);
        } catch (error: any) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.loginContainer}>
            <div className={styles.loginCard}>
                <div className={styles.loginHeader}>
                    <h1 className={styles.logo}>THE 24 FITNESS GYM TRAINER</h1>
                    <p className={styles.subtitle}>Trainer Panel Access</p>
                </div>

                <form onSubmit={handleSubmit} className={styles.loginForm}>
                    {error && (
                        <div className={styles.errorBanner}>
                            {error}
                        </div>
                    )}

                    <div className={styles.formGroup}>
                        <label htmlFor="phone" className={styles.label}>
                            Phone Number
                        </label>
                        <input
                            id="phone"
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className={styles.input}
                            placeholder="8084548055"
                            required
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="password" className={styles.label}>
                            Password
                        </label>
                        <div className={styles.passwordInput}>
                            <input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className={styles.input}
                                placeholder="Enter your password"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className={styles.passwordToggle}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className={styles.loginButton}
                    >
                        {loading ? (
                            <div className={styles.spinner}></div>
                        ) : (
                            <>
                                <LogIn size={20} />
                                Sign In to Trainer Panel
                            </>
                        )}
                    </button>
                </form>

                <div className={styles.loginFooter}>
                    <p className={styles.footerText}>
                        Only authorized trainers can access this panel.
                    </p>
                </div>
            </div>
        </div>
    );
}

