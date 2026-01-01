'use client';

import { useState, useEffect } from 'react';
import { UserPlus, Trash2, Phone, Mail, User, Copy, Check, Edit, Upload, X, Award, FileText, Monitor, Building2, AlertCircle } from 'lucide-react';
import styles from './trainers.module.css';

interface Trainer {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    is_active: boolean;
    created_at: string;
    photo_url?: string | null;
    specialization?: string | null;
    bio?: string | null;
    online_training?: boolean;
    in_gym_training?: boolean;
    price?: number | null;
}

export default function AdminTrainersPage() {
    const [trainers, setTrainers] = useState<Trainer[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingTrainer, setEditingTrainer] = useState<Trainer | null>(null);
    const [newTrainer, setNewTrainer] = useState({
        name: '',
        phone: '',
        email: '',
        photo_url: '',
        specialization: '',
        bio: '',
        online_training: false,
        in_gym_training: false,
        price: ''
    });
    const [newTrainerImageFile, setNewTrainerImageFile] = useState<File | null>(null);
    const [newTrainerImagePreview, setNewTrainerImagePreview] = useState<string>('');
    const [editTrainer, setEditTrainer] = useState({
        name: '',
        phone: '',
        email: '',
        photo_url: '',
        specialization: '',
        bio: '',
        online_training: false,
        in_gym_training: false,
        price: ''
    });
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string>('');
    const [uploadingImage, setUploadingImage] = useState(false);
    const [processing, setProcessing] = useState<string | null>(null);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [generatedPassword, setGeneratedPassword] = useState<string>('');
    const [trainerName, setTrainerName] = useState<string>('');
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchTrainers();
    }, []);

    const fetchTrainers = async () => {
        try {
            const response = await fetch('/api/admin/trainers', {
                credentials: 'include',
                cache: 'no-store'
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch trainers');
            }

            setTrainers(data.trainers || []);
            setError(null);
        } catch (error: any) {
            setError(error.message || 'Failed to load trainers. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleNewTrainerImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

        setNewTrainerImageFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
            setNewTrainerImagePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleRemoveNewTrainerImage = () => {
        setNewTrainerImageFile(null);
        setNewTrainerImagePreview('');
        setNewTrainer({ ...newTrainer, photo_url: '' });
    };

    const uploadNewTrainerImage = async (): Promise<string | null> => {
        if (!newTrainerImageFile) {
            return newTrainer.photo_url || null;
        }

        try {
            setUploadingImage(true);
            const formData = new FormData();
            formData.append('file', newTrainerImageFile);
            formData.append('type', 'trainer');

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

    const handleAddTrainer = async (e: React.FormEvent) => {
        e.preventDefault();
        setProcessing('add');

        try {
            // Upload image first if a new file is selected
            let finalImageUrl: string | null = newTrainer.photo_url || null;
            if (newTrainerImageFile) {
                const uploadedUrl = await uploadNewTrainerImage();
                if (!uploadedUrl) {
                    setProcessing(null);
                    return;
                }
                finalImageUrl = uploadedUrl;
            }

            const response = await fetch('/api/admin/trainers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    ...newTrainer,
                    photo_url: finalImageUrl,
                    price: newTrainer.price ? parseFloat(newTrainer.price) : null
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to add trainer');
            }

            // Show password modal instead of alert
            setGeneratedPassword(data.password);
            setTrainerName(data.trainer.name);
            setShowAddModal(false);
            setShowPasswordModal(true);
            setNewTrainer({
                name: '',
                phone: '',
                email: '',
                photo_url: '',
                specialization: '',
                bio: '',
                online_training: false,
                in_gym_training: false,
                price: ''
            });
            setNewTrainerImageFile(null);
            setNewTrainerImagePreview('');
            await fetchTrainers();
        } catch (error: any) {
            setError(`Failed to add trainer: ${error.message}`);
        } finally {
            setProcessing(null);
        }
    };

    const handleCopyPassword = async () => {
        try {
            await navigator.clipboard.writeText(generatedPassword);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            // Fallback: select text
            const passwordElement = document.getElementById('password-display');
            if (passwordElement) {
                const range = document.createRange();
                range.selectNodeContents(passwordElement);
                const selection = window.getSelection();
                selection?.removeAllRanges();
                selection?.addRange(range);
            }
        }
    };

    const handleClosePasswordModal = () => {
        setShowPasswordModal(false);
        setGeneratedPassword('');
        setTrainerName('');
        setCopied(false);
    };

    const handleEditTrainer = (trainer: Trainer) => {
        setEditingTrainer(trainer);
        setEditTrainer({
            name: trainer.name,
            phone: trainer.phone,
            email: trainer.email || '',
            photo_url: trainer.photo_url || '',
            specialization: trainer.specialization || '',
            bio: trainer.bio || '',
            online_training: trainer.online_training || false,
            in_gym_training: trainer.in_gym_training || false,
            price: trainer.price?.toString() || ''
        });
        setImagePreview(trainer.photo_url || '');
        setImageFile(null);
        setShowEditModal(true);
    };

    const handleCloseEditModal = () => {
        setShowEditModal(false);
        setEditingTrainer(null);
        setImageFile(null);
        setImagePreview('');
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
        setEditTrainer({ ...editTrainer, photo_url: '' });
    };

    const uploadImage = async (): Promise<string | null> => {
        if (!imageFile) {
            return editTrainer.photo_url || null;
        }

        try {
            setUploadingImage(true);
            const formData = new FormData();
            formData.append('file', imageFile);
            formData.append('type', 'trainer');
            if (editingTrainer?.photo_url) {
                formData.append('oldImageUrl', editingTrainer.photo_url);
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

    const handleUpdateTrainer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingTrainer) return;

        setProcessing('edit');

        try {
            // Upload image first if a new file is selected
            let finalImageUrl: string | null = editTrainer.photo_url || null;
            if (imageFile) {
                const uploadedUrl = await uploadImage();
                if (!uploadedUrl) {
                    setProcessing(null);
                    return;
                }
                finalImageUrl = uploadedUrl;
            }

            const response = await fetch(`/api/admin/trainers/${editingTrainer.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    ...editTrainer,
                    photo_url: finalImageUrl,
                    price: editTrainer.price ? parseFloat(editTrainer.price) : null
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to update trainer');
            }

            setError(null);
            handleCloseEditModal();
            await fetchTrainers();
        } catch (error: any) {
            setError(`Failed to update trainer: ${error.message}`);
        } finally {
            setProcessing(null);
        }
    };

    const handleDeleteTrainer = async (trainerId: string, trainerName: string) => {
        if (!confirm(`Are you sure you want to delete trainer "${trainerName}"? This will also delete all their bookings, messages, and sessions. This action cannot be undone.`)) {
            return;
        }

        setProcessing(trainerId);

        try {
            const response = await fetch(`/api/admin/trainers/${trainerId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to delete trainer');
            }

            setError(null);
            await fetchTrainers();
        } catch (error: any) {
            setError(`Failed to delete trainer: ${error.message}`);
        } finally {
            setProcessing(null);
        }
    };

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loadingState}>
                    <div className={styles.spinner}></div>
                    <p>Loading trainers...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>Trainers Management</h1>
                    <p className={styles.subtitle}>Manage all trainers in the system ({trainers.length} total)</p>
                </div>
                <button
                    className={styles.addButton}
                    onClick={() => setShowAddModal(true)}
                >
                    <UserPlus size={20} />
                    Add New Trainer
                </button>
            </div>

            {/* Error Display */}
            {error && (
                <div className={styles.errorMessage}>
                    <AlertCircle size={20} />
                    <span>{error}</span>
                    <button onClick={() => setError(null)}>×</button>
                </div>
            )}

            {trainers.length === 0 ? (
                <div className={styles.emptyState}>
                    <User size={48} />
                    <h3>No trainers yet</h3>
                    <p>Add your first trainer to get started.</p>
                </div>
            ) : (
                <div className={styles.trainersGrid}>
                    {trainers.map((trainer) => (
                        <div key={trainer.id} className={styles.trainerCard}>
                            <div className={styles.cardHeader}>
                                <div className={styles.trainerAvatar}>
                                    {trainer.photo_url ? (
                                        <img src={trainer.photo_url} alt={trainer.name} loading="lazy" />
                                    ) : (
                                        <User size={24} />
                                    )}
                                </div>
                                <div className={styles.trainerInfo}>
                                    <h3 className={styles.trainerName}>{trainer.name}</h3>
                                    <span className={`${styles.statusBadge} ${trainer.is_active ? styles.active : styles.inactive}`}>
                                        {trainer.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </div>
                            </div>

                            <div className={styles.cardContent}>
                                <div className={styles.infoRow}>
                                    <Phone size={16} />
                                    <span>{trainer.phone}</span>
                                </div>
                                {trainer.email && (
                                    <div className={styles.infoRow}>
                                        <Mail size={16} />
                                        <span>{trainer.email}</span>
                                    </div>
                                )}
                                {trainer.specialization && (
                                    <div className={styles.infoRow}>
                                        <Award size={16} />
                                        <span>{trainer.specialization}</span>
                                    </div>
                                )}
                                <div className={styles.trainingOptions}>
                                    {trainer.online_training && (
                                        <span className={styles.trainingTag}>Online Training</span>
                                    )}
                                    {trainer.in_gym_training && (
                                        <span className={styles.trainingTag}>In-Gym Training</span>
                                    )}
                                </div>
                                {trainer.price && (
                                    <div className={styles.infoRow}>
                                        <span>Price: ₹{trainer.price.toLocaleString()}</span>
                                    </div>
                                )}
                                <div className={styles.infoRow}>
                                    <span className={styles.label}>Added:</span>
                                    <span>{new Date(trainer.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>

                            <div className={styles.cardActions}>
                                <button
                                    className={styles.editButton}
                                    onClick={() => handleEditTrainer(trainer)}
                                    disabled={processing === trainer.id}
                                >
                                    <Edit size={18} />
                                    Edit
                                </button>
                                <button
                                    className={styles.deleteButton}
                                    onClick={() => handleDeleteTrainer(trainer.id, trainer.name)}
                                    disabled={processing === trainer.id}
                                >
                                    {processing === trainer.id ? (
                                        <div className={styles.spinner}></div>
                                    ) : (
                                        <>
                                            <Trash2 size={18} />
                                            Delete
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showAddModal && (
                <div className={styles.modalOverlay} onClick={() => setShowAddModal(false)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2>Add New Trainer</h2>
                            <button
                                className={styles.closeButton}
                                onClick={() => setShowAddModal(false)}
                            >
                                ×
                            </button>
                        </div>

                        <form onSubmit={handleAddTrainer} className={styles.modalForm}>
                            <div className={styles.imageSection}>
                                <label className={styles.imageLabel}>Trainer Photo</label>
                                {newTrainerImagePreview ? (
                                    <div className={styles.imagePreview}>
                                        <img src={newTrainerImagePreview} alt="Preview" loading="eager" />
                                        <button
                                            type="button"
                                            className={styles.removeImageButton}
                                            onClick={handleRemoveNewTrainerImage}
                                        >
                                            <X size={18} />
                                            Remove
                                        </button>
                                    </div>
                                ) : (
                                    <div className={styles.imagePlaceholder}>
                                        <User size={32} />
                                    </div>
                                )}
                                <label className={styles.uploadButton}>
                                    <Upload size={18} />
                                    {newTrainerImagePreview ? 'Change Photo' : 'Upload Photo'}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleNewTrainerImageChange}
                                        style={{ display: 'none' }}
                                    />
                                </label>
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="name">Full Name *</label>
                                <input
                                    id="name"
                                    type="text"
                                    value={newTrainer.name}
                                    onChange={(e) => setNewTrainer({ ...newTrainer, name: e.target.value })}
                                    required
                                    placeholder="John Doe"
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="phone">Phone Number *</label>
                                <input
                                    id="phone"
                                    type="tel"
                                    value={newTrainer.phone}
                                    onChange={(e) => setNewTrainer({ ...newTrainer, phone: e.target.value })}
                                    required
                                    placeholder="1234567890"
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="email">Email (Optional)</label>
                                <input
                                    id="email"
                                    type="email"
                                    value={newTrainer.email}
                                    onChange={(e) => setNewTrainer({ ...newTrainer, email: e.target.value })}
                                    placeholder="trainer@example.com"
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="price">
                                    Price (₹) *
                                </label>
                                <input
                                    id="price"
                                    type="number"
                                    value={newTrainer.price}
                                    onChange={(e) => setNewTrainer({ ...newTrainer, price: e.target.value })}
                                    required
                                    min="0"
                                    step="0.01"
                                    placeholder="5000"
                                />
                                <small style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.25rem', display: 'block' }}>
                                    Monthly trainer service price in INR
                                </small>
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="specialization">
                                    <Award size={16} />
                                    Specialization
                                </label>
                                <input
                                    id="specialization"
                                    type="text"
                                    value={newTrainer.specialization}
                                    onChange={(e) => setNewTrainer({ ...newTrainer, specialization: e.target.value })}
                                    placeholder="e.g., Weight Training, Yoga, Cardio"
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="bio">
                                    <FileText size={16} />
                                    Bio / Description
                                </label>
                                <textarea
                                    id="bio"
                                    value={newTrainer.bio}
                                    onChange={(e) => setNewTrainer({ ...newTrainer, bio: e.target.value })}
                                    placeholder="Enter trainer bio or description..."
                                    rows={4}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label>Training Options</label>
                                <div className={styles.checkboxGroup}>
                                    <label className={styles.checkboxLabel}>
                                        <input
                                            type="checkbox"
                                            checked={newTrainer.online_training}
                                            onChange={(e) => setNewTrainer({ ...newTrainer, online_training: e.target.checked })}
                                        />
                                        <Monitor size={16} />
                                        Online Training
                                    </label>
                                    <label className={styles.checkboxLabel}>
                                        <input
                                            type="checkbox"
                                            checked={newTrainer.in_gym_training}
                                            onChange={(e) => setNewTrainer({ ...newTrainer, in_gym_training: e.target.checked })}
                                        />
                                        <Building2 size={16} />
                                        In-Gym Training
                                    </label>
                                </div>
                            </div>

                            <div className={styles.modalActions}>
                                <button
                                    type="button"
                                    className={styles.cancelButton}
                                    onClick={() => {
                                        setShowAddModal(false);
                                        setNewTrainerImageFile(null);
                                        setNewTrainerImagePreview('');
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className={styles.submitButton}
                                    disabled={processing === 'add' || uploadingImage}
                                >
                                    {processing === 'add' || uploadingImage ? (
                                        <div className={styles.spinner}></div>
                                    ) : (
                                        'Add Trainer'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showPasswordModal && (
                <div className={styles.modalOverlay} onClick={handleClosePasswordModal}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2>Trainer Added Successfully!</h2>
                            <button
                                className={styles.closeButton}
                                onClick={handleClosePasswordModal}
                            >
                                ×
                            </button>
                        </div>

                        <div className={styles.passwordModalContent}>
                            <div className={styles.successMessage}>
                                <p><strong>{trainerName}</strong> has been added successfully.</p>
                                <p className={styles.warningText}>Please share this password with the trainer securely. They should change it after first login.</p>
                            </div>

                            <div className={styles.passwordDisplay}>
                                <label className={styles.passwordLabel}>Generated Password:</label>
                                <div className={styles.passwordInputGroup}>
                                    <input
                                        id="password-display"
                                        type="text"
                                        value={generatedPassword}
                                        readOnly
                                        className={styles.passwordInput}
                                    />
                                    <button
                                        type="button"
                                        className={styles.copyButton}
                                        onClick={handleCopyPassword}
                                        title="Copy password"
                                    >
                                        {copied ? (
                                            <>
                                                <Check size={18} />
                                                <span>Copied!</span>
                                            </>
                                        ) : (
                                            <>
                                                <Copy size={18} />
                                                <span>Copy</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            <div className={styles.modalActions}>
                                <button
                                    type="button"
                                    className={styles.submitButton}
                                    onClick={handleClosePasswordModal}
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showEditModal && editingTrainer && (
                <div className={styles.modalOverlay} onClick={handleCloseEditModal}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2>Edit Trainer</h2>
                            <button
                                className={styles.closeButton}
                                onClick={handleCloseEditModal}
                            >
                                ×
                            </button>
                        </div>

                        <form onSubmit={handleUpdateTrainer} className={styles.modalForm}>
                            <div className={styles.imageSection}>
                                <label className={styles.imageLabel}>Trainer Photo</label>
                                {imagePreview ? (
                                    <div className={styles.imagePreview}>
                                        <img src={imagePreview} alt="Preview" loading="eager" />
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
                                        <User size={32} />
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

                            <div className={styles.formGroup}>
                                <label htmlFor="edit-name">Full Name *</label>
                                <input
                                    id="edit-name"
                                    type="text"
                                    value={editTrainer.name}
                                    onChange={(e) => setEditTrainer({ ...editTrainer, name: e.target.value })}
                                    required
                                    placeholder="John Doe"
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="edit-phone">Phone Number *</label>
                                <input
                                    id="edit-phone"
                                    type="tel"
                                    value={editTrainer.phone}
                                    onChange={(e) => setEditTrainer({ ...editTrainer, phone: e.target.value })}
                                    required
                                    placeholder="1234567890"
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="edit-email">Email (Optional)</label>
                                <input
                                    id="edit-email"
                                    type="email"
                                    value={editTrainer.email}
                                    onChange={(e) => setEditTrainer({ ...editTrainer, email: e.target.value })}
                                    placeholder="trainer@example.com"
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="edit-price">
                                    Price (₹) *
                                </label>
                                <input
                                    id="edit-price"
                                    type="number"
                                    value={editTrainer.price}
                                    onChange={(e) => setEditTrainer({ ...editTrainer, price: e.target.value })}
                                    required
                                    min="0"
                                    step="0.01"
                                    placeholder="5000"
                                />
                                <small style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.25rem', display: 'block' }}>
                                    Monthly trainer service price in INR
                                </small>
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="edit-specialization">
                                    <Award size={16} />
                                    Specialization
                                </label>
                                <input
                                    id="edit-specialization"
                                    type="text"
                                    value={editTrainer.specialization}
                                    onChange={(e) => setEditTrainer({ ...editTrainer, specialization: e.target.value })}
                                    placeholder="e.g., Weight Training, Yoga, Cardio"
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="edit-bio">
                                    <FileText size={16} />
                                    Bio / Description
                                </label>
                                <textarea
                                    id="edit-bio"
                                    value={editTrainer.bio}
                                    onChange={(e) => setEditTrainer({ ...editTrainer, bio: e.target.value })}
                                    placeholder="Enter trainer bio or description..."
                                    rows={4}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label>Training Options</label>
                                <div className={styles.checkboxGroup}>
                                    <label className={styles.checkboxLabel}>
                                        <input
                                            type="checkbox"
                                            checked={editTrainer.online_training}
                                            onChange={(e) => setEditTrainer({ ...editTrainer, online_training: e.target.checked })}
                                        />
                                        <Monitor size={16} />
                                        Online Training
                                    </label>
                                    <label className={styles.checkboxLabel}>
                                        <input
                                            type="checkbox"
                                            checked={editTrainer.in_gym_training}
                                            onChange={(e) => setEditTrainer({ ...editTrainer, in_gym_training: e.target.checked })}
                                        />
                                        <Building2 size={16} />
                                        In-Gym Training
                                    </label>
                                </div>
                            </div>

                            <div className={styles.modalActions}>
                                <button
                                    type="button"
                                    className={styles.cancelButton}
                                    onClick={handleCloseEditModal}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className={styles.submitButton}
                                    disabled={processing === 'edit' || uploadingImage}
                                >
                                    {processing === 'edit' || uploadingImage ? (
                                        <div className={styles.spinner}></div>
                                    ) : (
                                        'Update Trainer'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

