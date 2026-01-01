// src/app/admin/settings/page.tsx
'use client';

import { useState, useEffect } from 'react';
import {
    Settings, QrCode, Upload, Save, Loader2,
    Building2, Mail, Phone, MapPin, Clock, CreditCard, Lock, XCircle
} from 'lucide-react';
import Toast from '@/components/Toast/Toast';
import { useToast } from '@/hooks/useToast';
import styles from './settings.module.css';

interface AdminSetting {
    setting_key: string;
    setting_value: string;
    description?: string;
}

export default function SettingsPage() {
    const [loading, setLoading] = useState(true);
    const [savingPayment, setSavingPayment] = useState(false);
    const [savingGeneral, setSavingGeneral] = useState(false);

    // Payment Settings
    const [paymentQrCode, setPaymentQrCode] = useState<string>('');
    const [qrCodeFile, setQrCodeFile] = useState<File | null>(null);
    const [qrCodePreview, setQrCodePreview] = useState<string>('');
    const [uploadingQr, setUploadingQr] = useState(false);

    // General Settings - Load from database only
    const [gymName, setGymName] = useState<string>('');
    const [contactEmail, setContactEmail] = useState<string>('');
    const [contactPhone, setContactPhone] = useState<string>('');
    const [gymAddress, setGymAddress] = useState<string>('');
    const [businessHours, setBusinessHours] = useState<string>('');

    // Password Change
    const [currentPassword, setCurrentPassword] = useState<string>('');
    const [newPassword, setNewPassword] = useState<string>('');
    const [confirmPassword, setConfirmPassword] = useState<string>('');
    const [changingPassword, setChangingPassword] = useState<boolean>(false);

    const { toast, toastType, showToast, hideToast } = useToast();

    useEffect(() => {
        fetchSettings();
    }, []);

    const getSettingValue = (settings: AdminSetting[], key: string): string => {
        const setting = settings.find(s => s.setting_key === key);
        return setting?.setting_value || '';
    };

    const fetchSettings = async () => {
        try {
            // First fetch from admin settings (database)
            const response = await fetch('/api/admin/settings', {
                credentials: 'include',
                cache: 'no-store'
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to fetch settings');
            }

            const data = await response.json();
            if (data.success && data.settings) {
                const settings = data.settings as AdminSetting[];

                // Payment Settings
                setPaymentQrCode(getSettingValue(settings, 'payment_qr_code_url'));
                setQrCodePreview(getSettingValue(settings, 'payment_qr_code_url'));

                // General Settings - Load from database, but if empty, fetch from public API to show current values
                let gymNameValue = getSettingValue(settings, 'gym_name');
                let contactEmailValue = getSettingValue(settings, 'contact_email');
                let contactPhoneValue = getSettingValue(settings, 'contact_phone');
                let gymAddressValue = getSettingValue(settings, 'gym_address');
                let businessHoursValue = getSettingValue(settings, 'business_hours');

                // If database values are empty, fetch from public API to show current values
                if (!gymNameValue || !contactEmailValue || !contactPhoneValue || !gymAddressValue || !businessHoursValue) {
                    try {
                        const publicResponse = await fetch('/api/settings/general');
                        const publicData = await publicResponse.json();
                        if (publicData.success && publicData.settings) {
                            if (!gymNameValue) gymNameValue = publicData.settings.gymName;
                            if (!contactEmailValue) contactEmailValue = publicData.settings.contactEmail;
                            if (!contactPhoneValue) contactPhoneValue = publicData.settings.contactPhone;
                            if (!gymAddressValue) gymAddressValue = publicData.settings.gymAddress;
                            if (!businessHoursValue) businessHoursValue = publicData.settings.businessHours;
                        }
                    } catch (err) {
                        // Ignore error, use empty values
                    }
                }

                setGymName(gymNameValue);
                setContactEmail(contactEmailValue);
                setContactPhone(contactPhoneValue);
                setGymAddress(gymAddressValue);
                setBusinessHours(businessHoursValue);
            }
        } catch (error: any) {
            showToast(`Failed to load settings: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleQrCodeFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showToast('Please upload an image file (JPEG, PNG, WebP).', 'error');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            showToast('File size too large. Please choose an image under 5MB.', 'error');
            return;
        }

        setQrCodeFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
            setQrCodePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const uploadQrCode = async (): Promise<string | null> => {
        if (!qrCodeFile) {
            return paymentQrCode || null;
        }

        try {
            setUploadingQr(true);
            const formData = new FormData();
            formData.append('file', qrCodeFile);
            formData.append('type', 'payment-qr');

            const response = await fetch('/api/admin/upload-photo', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to upload QR code');
            }

            return data.imageUrl;
        } catch (error: any) {
            showToast(`Failed to upload QR code: ${error.message}`, 'error');
            return null;
        } finally {
            setUploadingQr(false);
        }
    };

    const saveSetting = async (key: string, value: string) => {
        const response = await fetch('/api/admin/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                setting_key: key,
                setting_value: value
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `Failed to save ${key}`);
        }

        return response.json();
    };

    const handleSavePayment = async () => {
        setSavingPayment(true);

        try {
            // Upload QR code if a new file is selected
            let finalQrCodeUrl = paymentQrCode;
            if (qrCodeFile) {
                const uploadedUrl = await uploadQrCode();
                if (!uploadedUrl) {
                    setSavingPayment(false);
                    return;
                }
                finalQrCodeUrl = uploadedUrl;
            }

            // Save payment settings
            await saveSetting('payment_qr_code_url', finalQrCodeUrl);

            setPaymentQrCode(finalQrCodeUrl);
            setQrCodeFile(null);
            showToast('Payment settings saved successfully!', 'success');
        } catch (error: any) {
            showToast(`Failed to save payment settings: ${error.message}`, 'error');
        } finally {
            setSavingPayment(false);
        }
    };

    const handleSaveGeneral = async () => {
        setSavingGeneral(true);

        try {
            // Save all general settings
            await Promise.all([
                saveSetting('gym_name', gymName),
                saveSetting('contact_email', contactEmail),
                saveSetting('contact_phone', contactPhone),
                saveSetting('gym_address', gymAddress),
                saveSetting('business_hours', businessHours)
            ]);

            showToast('General settings saved successfully!', 'success');
        } catch (error: any) {
            showToast(`Failed to save general settings: ${error.message}`, 'error');
        } finally {
            setSavingGeneral(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!currentPassword || !newPassword || !confirmPassword) {
            showToast('All fields are required', 'error');
            return;
        }

        if (newPassword.length < 8) {
            showToast('New password must be at least 8 characters long', 'error');
            return;
        }

        if (newPassword !== confirmPassword) {
            showToast('New passwords do not match', 'error');
            return;
        }

        setChangingPassword(true);

        try {
            const response = await fetch('/api/admin/password/change', {
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

            showToast('Password changed successfully!', 'success');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error: any) {
            showToast(error.message || 'Failed to change password', 'error');
        } finally {
            setChangingPassword(false);
        }
    };

    if (loading) {
        return (
            <div className={styles.loadingState}>
                <Loader2 className={styles.spinner} size={32} />
                <p>Loading settings...</p>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>
                        <Settings size={24} />
                        Admin Settings
                    </h1>
                    <p className={styles.subtitle}>Manage payment QR code and gym contact information</p>
                </div>
            </div>

            <div className={styles.settingsGrid}>
                {/* Payment Settings */}
                <div className={styles.settingsCard}>
                    <div className={styles.cardHeader}>
                        <CreditCard size={20} />
                        <h2>Payment Settings</h2>
                    </div>
                    <div className={styles.cardBody}>
                        <p className={styles.description}>
                            Configure payment QR code that users will see on the payment page.
                        </p>

                        <div className={styles.qrCodeSection}>
                            {qrCodePreview ? (
                                <div className={styles.qrCodePreview}>
                                    <img src={qrCodePreview} alt="Payment QR Code" />
                                    <button
                                        type="button"
                                        className={styles.removeButton}
                                        onClick={() => {
                                            setQrCodeFile(null);
                                            setQrCodePreview(paymentQrCode || '');
                                        }}
                                    >
                                        <XCircle size={18} />
                                        Remove
                                    </button>
                                </div>
                            ) : (
                                <div className={styles.qrCodePlaceholder}>
                                    <QrCode size={48} />
                                    <p>No QR code uploaded</p>
                                </div>
                            )}

                            <label className={styles.uploadButton}>
                                <Upload size={18} />
                                {qrCodePreview ? 'Change QR Code' : 'Upload QR Code'}
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleQrCodeFileChange}
                                    style={{ display: 'none' }}
                                />
                            </label>
                        </div>

                        <div style={{ marginTop: '9rem' }}>
                            <button
                                type="button"
                                onClick={handleSavePayment}
                                className={styles.saveButton}
                                disabled={savingPayment || uploadingQr}
                            >
                                {savingPayment || uploadingQr ? (
                                    <>
                                        <Loader2 className={styles.spinnerSmall} size={18} />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Save size={18} />
                                        Save Settings
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* General Settings */}
                <div className={styles.settingsCard}>
                    <div className={styles.cardHeader}>
                        <Building2 size={20} />
                        <h2>General Settings</h2>
                    </div>
                    <div className={styles.cardBody}>
                        <p className={styles.description}>
                            Configure basic gym information and contact details.
                        </p>

                        <div className={styles.formGroup}>
                            <label>
                                <Building2 size={16} />
                                Gym Name
                            </label>
                            <input
                                type="text"
                                value={gymName}
                                onChange={(e) => setGymName(e.target.value)}
                                placeholder="24 Fitness Gym"
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label>
                                <Mail size={16} />
                                Contact Email
                            </label>
                            <input
                                type="email"
                                value={contactEmail}
                                onChange={(e) => setContactEmail(e.target.value)}
                                placeholder="contact@24fitness.com"
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label>
                                <Phone size={16} />
                                Contact Phone
                            </label>
                            <input
                                type="tel"
                                value={contactPhone}
                                onChange={(e) => setContactPhone(e.target.value)}
                                placeholder="+91 1234567890"
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label>
                                <MapPin size={16} />
                                Gym Address
                            </label>
                            <textarea
                                value={gymAddress}
                                onChange={(e) => setGymAddress(e.target.value)}
                                placeholder="Enter full gym address"
                                rows={3}
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label>
                                <Clock size={16} />
                                Business Hours
                            </label>
                            <input
                                type="text"
                                value={businessHours}
                                onChange={(e) => setBusinessHours(e.target.value)}
                                placeholder="Mon-Sat: 6:00 AM - 10:00 PM"
                            />
            </div>

                <button
                            type="button"
                            onClick={handleSaveGeneral}
                    className={styles.saveButton}
                            disabled={savingGeneral}
                >
                            {savingGeneral ? (
                        <>
                            <Loader2 className={styles.spinnerSmall} size={18} />
                            Saving...
                        </>
                    ) : (
                        <>
                            <Save size={18} />
                            Save Settings
                        </>
                    )}
                </button>
            </div>
                </div>

                {/* Password Change */}
                <div className={styles.settingsCard}>
                    <div className={styles.cardHeader}>
                        <Lock size={20} />
                        <h2>Change Password</h2>
                    </div>
                    <div className={styles.cardBody}>
                        <p className={styles.description}>
                            Update your admin account password. Make sure to use a strong password.
                        </p>

                        <form onSubmit={handleChangePassword}>
                            <div className={styles.formGroup}>
                                <label>
                                    <Lock size={16} />
                                    Current Password
                                </label>
                                <input
                                    type="password"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    placeholder="Enter current password"
                                    required
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label>
                                    <Lock size={16} />
                                    New Password
                                </label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Enter new password (min 8 characters)"
                                    required
                                    minLength={8}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label>
                                    <Lock size={16} />
                                    Confirm New Password
                                </label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Confirm new password"
                                    required
                                    minLength={8}
                                />
                            </div>

                            <button
                                type="submit"
                                className={styles.saveButton}
                                disabled={changingPassword}
                            >
                                {changingPassword ? (
                                    <>
                                        <Loader2 className={styles.spinnerSmall} size={18} />
                                        Changing Password...
                                    </>
                                ) : (
                                    <>
                                        <Lock size={18} />
                                        Change Password
                                    </>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            <Toast message={toast} type={toastType} onClose={hideToast} />
        </div>
    );
}
