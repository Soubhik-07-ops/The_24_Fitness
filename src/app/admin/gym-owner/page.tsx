'use client';

import { useState, useEffect } from 'react';
import { Save, Upload, X, User, Phone, Mail, FileText, Award, Briefcase, AlertCircle, CheckCircle2 } from 'lucide-react';
import styles from './gym-owner.module.css';

interface GymOwner {
    id: string | null;
    full_name: string;
    photo_url: string | null;
    phone: string;
    email: string;
    bio: string;
    specialization: string;
    experience: string;
}

export default function GymOwnerPage() {
    const [owner, setOwner] = useState<GymOwner>({
        id: null,
        full_name: '',
        photo_url: null,
        phone: '',
        email: '',
        bio: '',
        specialization: '',
        experience: ''
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string>('');
    const [uploadingImage, setUploadingImage] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        fetchOwner();
    }, []);

    const fetchOwner = async () => {
        try {
            const response = await fetch('/api/admin/gym-owner', {
                credentials: 'include',
                cache: 'no-store'
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch gym owner');
            }

            setOwner(data.owner || {
                id: null,
                full_name: '',
                photo_url: null,
                phone: '',
                email: '',
                bio: '',
                specialization: '',
                experience: ''
            });
            setImagePreview(data.owner?.photo_url || '');
            setError(null);
        } catch (error: any) {
            setError(error.message || 'Failed to load gym owner information. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setError('Please upload an image file (JPEG, PNG, WebP).');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            setError('File size too large. Please choose an image under 5MB.');
            return;
        }

        setImageFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
            setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleRemoveImage = () => {
        setImageFile(null);
        setImagePreview('');
        setOwner({ ...owner, photo_url: null });
    };

    const uploadImage = async (): Promise<string | null> => {
        if (!imageFile) {
            return owner.photo_url || null;
        }

        try {
            setUploadingImage(true);

            // Use the dedicated photo upload endpoint
            const formData = new FormData();
            formData.append('file', imageFile);
            formData.append('type', 'admin');
            if (owner.photo_url) {
                formData.append('oldImageUrl', owner.photo_url);
            }

            const response = await fetch('/api/admin/upload-photo', {
                method: 'POST',
                credentials: 'include',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to upload image');
            }

            return data.imageUrl;
        } catch (error: any) {
            setError(`Failed to upload image: ${error.message}`);
            return null;
        } finally {
            setUploadingImage(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        try {
            // Upload image first if a new file is selected
            let finalImageUrl: string | null = owner.photo_url || null;
            if (imageFile) {
                const uploadedUrl = await uploadImage();
                if (!uploadedUrl) {
                    setSaving(false);
                    return;
                }
                finalImageUrl = uploadedUrl;
            }

            // Don't send email in the update request
            const { email, ...updateData } = owner;
            const response = await fetch('/api/admin/gym-owner', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    ...updateData,
                    photo_url: finalImageUrl
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to save gym owner information');
            }

            setError(null);
            setSuccess('Gym owner information updated successfully!');
            setOwner(data.owner);
            setImageFile(null);
            await fetchOwner();
            setTimeout(() => setSuccess(null), 3000);
        } catch (error: any) {
            setError(`Failed to save: ${error.message || 'Unknown error'}`);
            setSuccess(null);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loadingState}>
                    <div className={styles.spinner}></div>
                    <p>Loading gym owner information...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>My Profile (Gym Owner)</h1>
                <p className={styles.subtitle}>Edit your profile information displayed on the Training page</p>
            </div>

            {/* Error Display */}
            {error && (
                <div className={styles.errorMessage}>
                    <AlertCircle size={20} />
                    <span>{error}</span>
                    <button onClick={() => setError(null)}>×</button>
                </div>
            )}

            {/* Success Display */}
            {success && (
                <div className={styles.successMessage}>
                    <CheckCircle2 size={20} />
                    <span>{success}</span>
                    <button onClick={() => setSuccess(null)}>×</button>
                </div>
            )}

            <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Owner Photo</h2>
                    <div className={styles.imageSection}>
                        {imagePreview ? (
                            <div className={styles.imagePreview}>
                                <img src={imagePreview} alt="Owner" loading="eager" />
                                <button
                                    type="button"
                                    className={styles.removeImageButton}
                                    onClick={handleRemoveImage}
                                >
                                    <X size={18} />
                                    Remove
                                </button>
                            </div>
                        ) : (
                            <div className={styles.imagePlaceholder}>
                                <User size={48} />
                                <p>No photo uploaded</p>
                            </div>
                        )}
                        <label className={styles.uploadButton}>
                            <Upload size={18} />
                            {imagePreview ? 'Change Photo' : 'Upload Photo'}
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageChange}
                                style={{ display: 'none' }}
                            />
                        </label>
                    </div>
                </div>

                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Basic Information</h2>
                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <label htmlFor="full_name">
                                <User size={18} />
                                Full Name *
                            </label>
                            <input
                                id="full_name"
                                type="text"
                                value={owner.full_name}
                                onChange={(e) => setOwner({ ...owner, full_name: e.target.value })}
                                required
                                placeholder="Enter full name"
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label htmlFor="phone">
                                <Phone size={18} />
                                Phone Number
                            </label>
                            <input
                                id="phone"
                                type="tel"
                                value={owner.phone}
                                onChange={(e) => setOwner({ ...owner, phone: e.target.value })}
                                placeholder="Enter phone number"
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label htmlFor="email">
                                <Mail size={18} />
                                Email (Login Credential)
                            </label>
                            <input
                                id="email"
                                type="email"
                                value={owner.email}
                                disabled
                                className={styles.disabledInput}
                                placeholder="Email cannot be changed"
                            />
                            <small className={styles.helpText}>Email is used for login and cannot be modified</small>
                        </div>
                    </div>
                </div>

                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Professional Details</h2>
                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <label htmlFor="specialization">
                                <Award size={18} />
                                Specialization
                            </label>
                            <input
                                id="specialization"
                                type="text"
                                value={owner.specialization}
                                onChange={(e) => setOwner({ ...owner, specialization: e.target.value })}
                                placeholder="e.g., Weight Training, Yoga, Cardio"
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label htmlFor="experience">
                                <Briefcase size={18} />
                                Experience
                            </label>
                            <input
                                id="experience"
                                type="text"
                                value={owner.experience}
                                onChange={(e) => setOwner({ ...owner, experience: e.target.value })}
                                placeholder="e.g., 10+ years of experience"
                            />
                        </div>
                    </div>
                </div>

                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Bio / Description</h2>
                    <div className={styles.formGroup}>
                        <label htmlFor="bio">
                            <FileText size={18} />
                            Biography
                        </label>
                        <textarea
                            id="bio"
                            value={owner.bio}
                            onChange={(e) => setOwner({ ...owner, bio: e.target.value })}
                            placeholder="Enter a detailed biography or description about the gym owner..."
                            rows={6}
                        />
                    </div>
                </div>

                <div className={styles.formActions}>
                    <button
                        type="submit"
                        className={styles.saveButton}
                        disabled={saving || uploadingImage}
                    >
                        {saving || uploadingImage ? (
                            <>
                                <div className={styles.spinner}></div>
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save size={18} />
                                Save Changes
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}

