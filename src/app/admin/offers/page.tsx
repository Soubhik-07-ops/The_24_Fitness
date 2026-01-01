'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Calendar, Tag, Image as ImageIcon, Save, X, Loader2 } from 'lucide-react';
import Toast from '@/components/Toast/Toast';
import { useToast } from '@/hooks/useToast';
import styles from './offers.module.css';

interface Offer {
    id: number;
    title: string;
    description: string | null;
    discount_percentage: number | null;
    discount_amount: number | null;
    offer_type: string;
    image_url: string | null;
    start_date: string | null;
    end_date: string | null;
    is_active: boolean;
    priority: number;
    applicable_to: string;
    plan_name: string | null;
    created_at: string;
    updated_at: string;
}

export default function OffersManagement() {
    const [offers, setOffers] = useState<Offer[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
    const [saving, setSaving] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const { toast, toastType, showToast, hideToast } = useToast();

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        discount_percentage: '',
        discount_amount: '',
        offer_type: 'percentage',
        image_url: '',
        start_date: '',
        end_date: '',
        is_active: true,
        priority: 0,
        applicable_to: 'all',
        plan_name: ''
    });

    useEffect(() => {
        fetchOffers();
    }, []);

    const fetchOffers = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/admin/offers', {
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Failed to fetch offers');
            }

            const data = await response.json();
            setOffers(data.offers || []);
        } catch (error: any) {
            showToast(error.message || 'Failed to load offers', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (offer?: Offer) => {
        if (offer) {
            setEditingOffer(offer);
            setFormData({
                title: offer.title,
                description: offer.description || '',
                discount_percentage: offer.discount_percentage?.toString() || '',
                discount_amount: offer.discount_amount?.toString() || '',
                offer_type: offer.offer_type,
                image_url: offer.image_url || '',
                start_date: offer.start_date ? new Date(offer.start_date).toISOString().split('T')[0] : '',
                end_date: offer.end_date ? new Date(offer.end_date).toISOString().split('T')[0] : '',
                is_active: offer.is_active,
                priority: offer.priority,
                applicable_to: offer.applicable_to,
                plan_name: offer.plan_name || ''
            });
            setImagePreview(offer.image_url || null);
            setImageFile(null);
        } else {
            setEditingOffer(null);
            setFormData({
                title: '',
                description: '',
                discount_percentage: '',
                discount_amount: '',
                offer_type: 'percentage',
                image_url: '',
                start_date: '',
                end_date: '',
                is_active: true,
                priority: 0,
                applicable_to: 'all',
                plan_name: ''
            });
            setImagePreview(null);
            setImageFile(null);
        }
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingOffer(null);
        setImageFile(null);
        setImagePreview(null);
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // Validate file type
            if (!file.type.startsWith('image/')) {
                showToast('Please select an image file', 'error');
                return;
            }

            // Validate file size (5MB)
            if (file.size > 5 * 1024 * 1024) {
                showToast('Image size must be less than 5MB', 'error');
                return;
            }

            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleImageUpload = async () => {
        if (!imageFile) {
            return null;
        }

        try {
            setUploadingImage(true);
            const uploadFormData = new FormData();
            uploadFormData.append('file', imageFile);
            if (editingOffer?.image_url) {
                uploadFormData.append('oldImageUrl', editingOffer.image_url);
            }

            const response = await fetch('/api/admin/offers/upload-image', {
                method: 'POST',
                credentials: 'include',
                body: uploadFormData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to upload image');
            }

            const data = await response.json();
            return data.imageUrl;
        } catch (error: any) {
            showToast(error.message || 'Failed to upload image', 'error');
            return null;
        } finally {
            setUploadingImage(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        try {
            // Upload image if a new file is selected
            let imageUrl = formData.image_url;
            if (imageFile) {
                const uploadedUrl = await handleImageUpload();
                if (uploadedUrl) {
                    imageUrl = uploadedUrl;
                } else {
                    setSaving(false);
                    return; // Don't proceed if image upload failed
                }
            }

            const payload: any = {
                ...formData,
                discount_percentage: formData.discount_percentage ? parseFloat(formData.discount_percentage) : null,
                discount_amount: formData.discount_amount ? parseFloat(formData.discount_amount) : null,
                priority: parseInt(formData.priority.toString()) || 0,
                start_date: formData.start_date || null,
                end_date: formData.end_date || null,
                plan_name: formData.plan_name || null,
                image_url: imageUrl || null
            };

            const url = editingOffer ? '/api/admin/offers' : '/api/admin/offers';
            const method = editingOffer ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(editingOffer ? { id: editingOffer.id, ...payload } : payload)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to save offer');
            }

            showToast(editingOffer ? 'Offer updated successfully!' : 'Offer created successfully!', 'success');
            handleCloseModal();
            fetchOffers();
        } catch (error: any) {
            showToast(error.message || 'Failed to save offer', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this offer?')) {
            return;
        }

        try {
            const response = await fetch(`/api/admin/offers?id=${id}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Failed to delete offer');
            }

            showToast('Offer deleted successfully!', 'success');
            fetchOffers();
        } catch (error: any) {
            showToast(error.message || 'Failed to delete offer', 'error');
        }
    };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return 'No date';
        return new Date(dateString).toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const getOfferDisplay = (offer: Offer) => {
        if (offer.offer_type === 'percentage' && offer.discount_percentage) {
            return `${offer.discount_percentage}% OFF`;
        } else if (offer.offer_type === 'amount' && offer.discount_amount) {
            return `₹${offer.discount_amount.toLocaleString()} OFF`;
        } else if (offer.offer_type === 'free_trial') {
            return 'FREE TRIAL';
        }
        return offer.offer_type.toUpperCase();
    };

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>Loading offers...</div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>Offers Management</h1>
                    <p className={styles.subtitle}>Create and manage special offers and promotions</p>
                </div>
                <button onClick={() => handleOpenModal()} className={styles.addButton}>
                    <Plus size={20} />
                    Add New Offer
                </button>
            </div>

            {offers.length === 0 ? (
                <div className={styles.emptyState}>
                    <Tag size={48} />
                    <h2>No Offers Yet</h2>
                    <p>Create your first offer to attract more members!</p>
                    <button onClick={() => handleOpenModal()} className={styles.addButton}>
                        <Plus size={20} />
                        Create Offer
                    </button>
                </div>
            ) : (
                <div className={styles.offersGrid}>
                    {offers.map((offer) => (
                        <div key={offer.id} className={`${styles.offerCard} ${!offer.is_active ? styles.inactive : ''}`}>
                            {offer.image_url && (
                                <div className={styles.offerImage}>
                                    <img src={offer.image_url} alt={offer.title} />
                                </div>
                            )}
                            <div className={styles.offerContent}>
                                <div className={styles.offerHeader}>
                                    <div>
                                        <h3 className={styles.offerTitle}>{offer.title}</h3>
                                        <div className={styles.offerBadge}>
                                            <Tag size={14} />
                                            {getOfferDisplay(offer)}
                                        </div>
                                    </div>
                                    <div className={styles.offerStatus}>
                                        <span className={`${styles.statusBadge} ${offer.is_active ? styles.active : styles.inactive}`}>
                                            {offer.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>
                                </div>

                                {offer.description && (
                                    <p className={styles.offerDescription}>{offer.description}</p>
                                )}

                                <div className={styles.offerDetails}>
                                    <div className={styles.detailItem}>
                                        <Calendar size={14} />
                                        <span>
                                            {offer.start_date ? formatDate(offer.start_date) : 'No start date'} - {offer.end_date ? formatDate(offer.end_date) : 'No end date'}
                                        </span>
                                    </div>
                                    <div className={styles.detailItem}>
                                        <span>Priority: {offer.priority}</span>
                                    </div>
                                    <div className={styles.detailItem}>
                                        <span>Applicable to: {offer.applicable_to}</span>
                                    </div>
                                    {offer.plan_name && (
                                        <div className={styles.detailItem}>
                                            <span>Plan: {offer.plan_name}</span>
                                        </div>
                                    )}
                                </div>

                                <div className={styles.offerActions}>
                                    <button onClick={() => handleOpenModal(offer)} className={styles.editButton}>
                                        <Edit size={16} />
                                        Edit
                                    </button>
                                    <button onClick={() => handleDelete(offer.id)} className={styles.deleteButton}>
                                        <Trash2 size={16} />
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className={styles.modalOverlay} onClick={handleCloseModal}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2>{editingOffer ? 'Edit Offer' : 'Create New Offer'}</h2>
                            <button onClick={handleCloseModal} className={styles.closeButton}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className={styles.modalForm}>
                            <div className={styles.formGroup}>
                                <label>Title *</label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    required
                                    placeholder="e.g., Summer Special Offer"
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label>Description</label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Offer description..."
                                    rows={3}
                                />
                            </div>

                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label>Offer Type *</label>
                                    <select
                                        value={formData.offer_type}
                                        onChange={(e) => setFormData({ ...formData, offer_type: e.target.value })}
                                        required
                                    >
                                        <option value="percentage">Percentage Discount</option>
                                        <option value="amount">Fixed Amount Discount</option>
                                        <option value="free_trial">Free Trial</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>

                                {formData.offer_type === 'percentage' && (
                                    <div className={styles.formGroup}>
                                        <label>Discount Percentage</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            max="100"
                                            value={formData.discount_percentage}
                                            onChange={(e) => setFormData({ ...formData, discount_percentage: e.target.value })}
                                            placeholder="e.g., 20"
                                        />
                                    </div>
                                )}

                                {formData.offer_type === 'amount' && (
                                    <div className={styles.formGroup}>
                                        <label>Discount Amount (₹)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={formData.discount_amount}
                                            onChange={(e) => setFormData({ ...formData, discount_amount: e.target.value })}
                                            placeholder="e.g., 1000"
                                        />
                                    </div>
                                )}
                            </div>

                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label>Start Date</label>
                                    <input
                                        type="date"
                                        value={formData.start_date}
                                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label>End Date</label>
                                    <input
                                        type="date"
                                        value={formData.end_date}
                                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label>Priority</label>
                                    <input
                                        type="number"
                                        value={formData.priority}
                                        onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                                        placeholder="Higher = shown first"
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label>Applicable To</label>
                                    <select
                                        value={formData.applicable_to}
                                        onChange={(e) => setFormData({ ...formData, applicable_to: e.target.value })}
                                    >
                                        <option value="all">All Members</option>
                                        <option value="new_members">New Members Only</option>
                                        <option value="existing_members">Existing Members Only</option>
                                        <option value="specific_plan">Specific Plan</option>
                                    </select>
                                </div>
                            </div>

                            {formData.applicable_to === 'specific_plan' && (
                                <div className={styles.formGroup}>
                                    <label>Plan Name</label>
                                    <input
                                        type="text"
                                        value={formData.plan_name}
                                        onChange={(e) => setFormData({ ...formData, plan_name: e.target.value })}
                                        placeholder="e.g., Premium Plan"
                                    />
                                </div>
                            )}

                            <div className={styles.formGroup}>
                                <label>Offer Image</label>
                                <div className={styles.imageUploadContainer}>
                                    {imagePreview && (
                                        <div className={styles.imagePreview}>
                                            <img src={imagePreview} alt="Preview" />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setImageFile(null);
                                                    setImagePreview(editingOffer?.image_url || null);
                                                }}
                                                className={styles.removeImageButton}
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    )}
                                    <label className={styles.fileInputLabel}>
                                        <ImageIcon size={20} />
                                        {imageFile ? 'Change Image' : imagePreview ? 'Change Image' : 'Upload Image'}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleImageChange}
                                            className={styles.fileInput}
                                        />
                                    </label>
                                    {uploadingImage && (
                                        <div className={styles.uploadingIndicator}>
                                            <Loader2 size={16} className={styles.spinner} />
                                            Uploading...
                                        </div>
                                    )}
                                    <p className={styles.imageHint}>Max size: 5MB. Supported: JPG, PNG, WebP, GIF</p>
                                </div>
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.checkboxLabel}>
                                    <input
                                        type="checkbox"
                                        checked={formData.is_active}
                                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                    />
                                    <span>Active</span>
                                </label>
                            </div>

                            <div className={styles.modalActions}>
                                <button type="button" onClick={handleCloseModal} className={styles.cancelButton}>
                                    Cancel
                                </button>
                                <button type="submit" className={styles.saveButton} disabled={saving || uploadingImage}>
                                    {saving || uploadingImage ? (
                                        <>
                                            <Loader2 size={16} className={styles.spinner} />
                                            {uploadingImage ? 'Uploading Image...' : 'Saving...'}
                                        </>
                                    ) : (
                                        <>
                                            <Save size={16} />
                                            {editingOffer ? 'Update' : 'Create'} Offer
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <Toast message={toast} type={toastType} onClose={hideToast} />
        </div>
    );
}

