'use client';

import { useState, useEffect } from 'react';
import { useTrainerAuth } from '@/contexts/TrainerAuthContext';
import {
    Lock,
    Eye,
    EyeOff,
    Shield,
    AlertCircle,
    CheckCircle2
} from 'lucide-react';
import styles from './settings.module.css';

export default function TrainerSettingsPage() {
    const { trainer } = useTrainerAuth();

    // Password change state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPasswords, setShowPasswords] = useState({
        current: false,
        new: false,
        confirm: false
    });
    const [passwordStrength, setPasswordStrength] = useState(0);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        if (newPassword) {
            calculatePasswordStrength(newPassword);
        } else {
            setPasswordStrength(0);
        }
    }, [newPassword]);

    const calculatePasswordStrength = (password: string) => {
        let strength = 0;
        if (password.length >= 8) strength += 1;
        if (password.length >= 12) strength += 1;
        if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength += 1;
        if (/\d/.test(password)) strength += 1;
        if (/[^a-zA-Z\d]/.test(password)) strength += 1;
        setPasswordStrength(strength);
    };

    const getPasswordStrengthLabel = () => {
        if (passwordStrength === 0) return { text: '', color: '' };
        if (passwordStrength <= 2) return { text: 'Weak', color: '#ef4444' };
        if (passwordStrength <= 3) return { text: 'Fair', color: '#f59e0b' };
        if (passwordStrength <= 4) return { text: 'Good', color: '#3b82f6' };
        return { text: 'Strong', color: '#22c55e' };
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);

        // Validation
        if (!currentPassword || !newPassword || !confirmPassword) {
            setMessage({ type: 'error', text: 'All fields are required' });
            return;
        }

        if (newPassword.length < 8) {
            setMessage({ type: 'error', text: 'New password must be at least 8 characters long' });
            return;
        }

        if (newPassword !== confirmPassword) {
            setMessage({ type: 'error', text: 'New passwords do not match' });
            return;
        }

        setLoading(true);

        try {
            const response = await fetch('/api/trainer/password/change', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    currentPassword,
                    newPassword
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to change password');
            }

            setMessage({ type: 'success', text: 'Password changed successfully!' });
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setPasswordStrength(0);
        } catch (error: any) {
            console.error('Error changing password:', error);
            setMessage({ type: 'error', text: error.message || 'Failed to change password' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Settings</h1>
            </div>

            {message && (
                <div className={`${styles.message} ${styles[message.type]}`}>
                    {message.type === 'success' ? (
                        <CheckCircle2 size={18} />
                    ) : (
                        <AlertCircle size={18} />
                    )}
                    <span>{message.text}</span>
                </div>
            )}

            <div className={styles.card}>
                <div className={styles.cardHeader}>
                    <div>
                        <h2 className={styles.cardTitle}>Change Password</h2>
                        <p className={styles.cardDescription}>Update your password to keep your account secure</p>
                    </div>
                    <Shield size={24} className={styles.headerIcon} />
                </div>

                <form onSubmit={handleChangePassword} className={styles.form}>
                    <div className={styles.formGroup}>
                        <label htmlFor="currentPassword">
                            <Lock size={16} />
                            Current Password
                        </label>
                        <div className={styles.passwordInputWrapper}>
                            <input
                                id="currentPassword"
                                type={showPasswords.current ? 'text' : 'password'}
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                placeholder="Enter your current password"
                                required
                            />
                            <button
                                type="button"
                                className={styles.eyeButton}
                                onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                            >
                                {showPasswords.current ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="newPassword">
                            <Lock size={16} />
                            New Password
                        </label>
                        <div className={styles.passwordInputWrapper}>
                            <input
                                id="newPassword"
                                type={showPasswords.new ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Enter your new password (min. 8 characters)"
                                required
                                minLength={8}
                            />
                            <button
                                type="button"
                                className={styles.eyeButton}
                                onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                            >
                                {showPasswords.new ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        {newPassword && (
                            <div className={styles.passwordStrength}>
                                <div className={styles.strengthBar}>
                                    <div
                                        className={styles.strengthFill}
                                        style={{
                                            width: `${(passwordStrength / 5) * 100}%`,
                                            backgroundColor: getPasswordStrengthLabel().color
                                        }}
                                    />
                                </div>
                                {passwordStrength > 0 && (
                                    <span
                                        className={styles.strengthLabel}
                                        style={{ color: getPasswordStrengthLabel().color }}
                                    >
                                        {getPasswordStrengthLabel().text}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="confirmPassword">
                            <Lock size={16} />
                            Confirm New Password
                        </label>
                        <div className={styles.passwordInputWrapper}>
                            <input
                                id="confirmPassword"
                                type={showPasswords.confirm ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Confirm your new password"
                                required
                                minLength={8}
                            />
                            <button
                                type="button"
                                className={styles.eyeButton}
                                onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                            >
                                {showPasswords.confirm ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        {confirmPassword && newPassword && (
                            <div className={styles.passwordMatch}>
                                {confirmPassword === newPassword ? (
                                    <span className={styles.matchSuccess}>
                                        <CheckCircle2 size={14} />
                                        Passwords match
                                    </span>
                                ) : (
                                    <span className={styles.matchError}>
                                        <AlertCircle size={14} />
                                        Passwords do not match
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    <button
                        type="submit"
                        className={styles.submitButton}
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <div className={styles.spinner}></div>
                                Changing Password...
                            </>
                        ) : (
                            <>
                                <Lock size={16} />
                                Change Password
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
