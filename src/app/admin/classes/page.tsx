// src/app/admin/classes/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Calendar, Plus, Edit2, Trash2, Clock, Users, X, Image as ImageIcon } from 'lucide-react';
import Toast from '@/components/Toast/Toast';
import { useToast } from '@/hooks/useToast';
import styles from './classes.module.css';

interface Class {
    id: number;
    name: string;
    description: string;
    schedule: string;
    duration_minutes: number;
    max_capacity?: number;
    category?: string;
    image_url?: string;
    created_at: string;
}

export default function ClassesManagement() {
    const [classes, setClasses] = useState<Class[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingClass, setEditingClass] = useState<Class | null>(null);
    const { toast, toastType, showToast, hideToast } = useToast();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [schedule, setSchedule] = useState('');
    const [durationMinutes, setDurationMinutes] = useState('60');
    const [capacity, setCapacity] = useState('20');
    const [category, setCategory] = useState('General');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [categories, setCategories] = useState<string[]>(['All']);
    const [imageUrl, setImageUrl] = useState<string>('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string>('');
    const [uploadingImage, setUploadingImage] = useState(false);

    useEffect(() => {
        fetchClasses();
    }, []);

    const fetchClasses = async () => {
        try {
            const { data, error } = await supabase
                .from('classes')
                .select('*')
                .order('schedule', { ascending: true });

            if (error) {
                throw error;
            }

            setClasses(data || []);
            // derive categories for the admin filter
            const derived = ['All', ...new Set((data || []).map((c: any) => c.category || 'General'))];
            setCategories(derived as string[]);
        } catch (error) {
            // Error fetching classes - handle silently or show user-friendly message
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (classData?: Class) => {
        if (classData) {
            setEditingClass(classData);
            setName(classData.name);
            setDescription(classData.description);
            setSchedule(classData.schedule);
            setDurationMinutes(String(classData.duration_minutes));
            setCapacity(String(classData.max_capacity || 20));
            setCategory(classData.category || 'General');
            setImageUrl(classData.image_url || '');
            setImagePreview(classData.image_url || '');
            setImageFile(null);
        } else {
            setEditingClass(null);
            setName('');
            setDescription('');
            setSchedule('');
            setDurationMinutes('60');
            setCapacity('20');
            setCategory('General');
            setImageUrl('');
            setImagePreview('');
            setImageFile(null);
        }
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingClass(null);
        setImageUrl('');
        setImagePreview('');
        setImageFile(null);
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

        setImageFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
            setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleRemoveImage = async () => {
        // If there's an existing image URL, delete it from storage
        if (imageUrl && editingClass?.image_url) {
            try {
                const response = await fetch('/api/admin/classes/delete-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ imageUrl })
                });

                if (!response.ok) {
                    // Continue anyway - user can still remove the image reference
                }
            } catch (err) {
                // Continue anyway
            }
        }

        setImageFile(null);
        setImagePreview('');
        setImageUrl('');
    };

    const uploadImage = async (): Promise<string | null> => {
        if (!imageFile) {
            return imageUrl || null;
        }

        try {
            setUploadingImage(true);

            // Use API endpoint for upload (server-side with service role)
            const formData = new FormData();
            formData.append('file', imageFile);
            if (editingClass?.image_url && imageUrl) {
                formData.append('oldImageUrl', imageUrl);
            }

            const response = await fetch('/api/admin/classes/upload-image', {
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
            showToast(`Failed to upload image: ${error.message}`, 'error');
            return null;
        } finally {
            setUploadingImage(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Upload image first if a new file is selected
        let finalImageUrl: string | null = imageUrl || null;
        if (imageFile) {
            const uploadedUrl = await uploadImage();
            if (!uploadedUrl) {
                return; // Error already shown in uploadImage
            }
            finalImageUrl = uploadedUrl;
        }

        // If image was removed (no file and no URL), set to null
        // The API will handle deleting the old image from storage
        if (!imageFile && !imageUrl && editingClass?.image_url) {
            finalImageUrl = null;
        }

        const formData = {
            name,
            description,
            schedule,
            duration_minutes: parseInt(durationMinutes) || 60,
            max_capacity: parseInt(capacity) || 20,
            category: category || 'General',
            image_url: finalImageUrl
        };

        try {
            const url = '/api/admin/classes';
            const method = editingClass ? 'PUT' : 'POST';
            const payload = editingClass ? { id: editingClass.id, ...formData } : formData;

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(json?.error || 'Failed to save class');
            }

            showToast(editingClass ? 'Class updated successfully!' : 'Class created successfully!', 'success');
            handleCloseModal();
            fetchClasses();
        } catch (error: any) {
            showToast(`Failed to save class: ${error.message || 'Unknown error'}`, 'error');
        }
    };

    const handleDelete = async (classId: number) => {
        if (!confirm('Are you sure you want to delete this class? All reviews for this class will also be deleted.')) {
            return;
        }
        try {
            const res = await fetch('/api/admin/classes', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id: classId })
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(json?.error || 'Failed to delete class');
            }

            showToast('Class deleted successfully!', 'success');
            fetchClasses();
        } catch (error: any) {
            showToast(`Failed to delete class: ${error.message || 'Unknown error'}`, 'error');
        }
    };

    const formatDateTime = (dateString: string) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // filter classes by selected category (admin)
    const filteredClasses = selectedCategory === 'All'
        ? classes
        : classes.filter((c) => (c as any).category === selectedCategory);

    if (loading) {
        return (
            <div className={styles.loadingState}>
                <div className={styles.spinner}></div>
                <p>Loading classes...</p>
            </div>
        );
    }

    return (
        <div className={styles.pageContainer}>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Class Management</h1>
                    <p className={styles.pageSubtitle}>
                        Manage fitness classes ({classes.length} total)
                    </p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className={styles.primaryButton}
                >
                    <Plus size={20} />
                    Add New Class
                </button>
            </div>

            {/* Category filter for admin */}
            <div className={styles.categoryFilter} style={{ marginBottom: 16 }}>
                {categories.map((cat) => (
                    <button
                        key={cat}
                        className={`${styles.categoryButton || ''} ${selectedCategory === cat ? styles.active || '' : ''}`}
                        onClick={() => setSelectedCategory(cat)}
                        style={{ marginRight: 8 }}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            <div className={styles.cardsGrid}>
                {classes.length === 0 ? (
                    <div className={styles.emptyState}>
                        <Calendar size={64} />
                        <p>No classes found</p>
                        <button
                            onClick={() => handleOpenModal()}
                            className={styles.primaryButton}
                        >
                            Create First Class
                        </button>
                    </div>
                ) : (
                    filteredClasses.map((classItem) => (
                        <div key={classItem.id} className={styles.classCard}>
                            {/* Class Image */}
                            {classItem.image_url && (
                                <div className={styles.classCardImage}>
                                    <img src={classItem.image_url} alt={classItem.name} />
                                </div>
                            )}
                            
                            <div className={styles.classCardHeader}>
                                <h3>{classItem.name}</h3>
                                {classItem.category && (
                                    <small style={{ marginLeft: 8, color: '#666' }}>{classItem.category}</small>
                                )}
                                <div className={styles.cardActions}>
                                    <button
                                        onClick={() => handleOpenModal(classItem)}
                                        className={styles.iconButton}
                                        title="Edit"
                                    >
                                        <Edit2 size={18} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(classItem.id)}
                                        className={`${styles.iconButton} ${styles.deleteBtn}`}
                                        title="Delete"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>

                            <p className={styles.classDescription}>{classItem.description}</p>

                            <div className={styles.classDetails}>
                                <div className={styles.detailItem}>
                                    <Calendar size={16} />
                                    <span>{formatDateTime(classItem.schedule)}</span>
                                </div>
                                <div className={styles.detailItem}>
                                    <Clock size={16} />
                                    <span>{classItem.duration_minutes} min</span>
                                </div>
                                <div className={styles.detailItem}>
                                    <Users size={16} />
                                    <span>Capacity: {classItem.max_capacity || 20}</span>
                                </div>
                            </div>

                        </div>
                    ))
                )}
            </div>

            {showModal && (
                <div className={styles.modalOverlay} onClick={handleCloseModal}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2>{editingClass ? 'Edit Class' : 'Add New Class'}</h2>
                            <button onClick={handleCloseModal} className={styles.closeButton}>
                                ×
                            </button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className={styles.modalBody}>
                                <div className={styles.formGroup}>
                                    <label>Class Name *</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        required
                                        placeholder="e.g., Morning Yoga"
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label>Description *</label>
                                    <textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        required
                                        rows={3}
                                        placeholder="Describe the class..."
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label>Class Image</label>
                                    <div className={styles.imageUploadContainer}>
                                        {imagePreview ? (
                                            <div className={styles.imagePreview}>
                                                <img src={imagePreview} alt="Preview" loading="eager" />
                                                <button
                                                    type="button"
                                                    onClick={handleRemoveImage}
                                                    className={styles.removeImageButton}
                                                >
                                                    <X size={20} />
                                                </button>
                                            </div>
                                        ) : (
                                            <label className={styles.imageUploadLabel}>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleImageChange}
                                                    style={{ display: 'none' }}
                                                />
                                                <div className={styles.imageUploadPlaceholder}>
                                                    <ImageIcon size={32} />
                                                    <span>Click to upload image</span>
                                                    <small>PNG, JPG, WEBP up to 5MB</small>
                                                </div>
                                            </label>
                                        )}
                                    </div>
                                    {uploadingImage && (
                                        <p style={{ color: '#f97316', marginTop: '0.5rem' }}>Uploading image...</p>
                                    )}
                                </div>

                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}>
                                        <label>Schedule *</label>
                                        <input
                                            type="datetime-local"
                                            value={schedule}
                                            onChange={(e) => setSchedule(e.target.value)}
                                            required
                                        />
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>Duration (minutes) *</label>
                                        <input
                                            type="number"
                                            value={durationMinutes}
                                            onChange={(e) => setDurationMinutes(e.target.value)}
                                            required
                                            min="15"
                                            max="180"
                                        />
                                    </div>
                                </div>

                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}>
                                        <label>Capacity *</label>
                                        <input
                                            type="number"
                                            value={capacity}
                                            onChange={(e) => setCapacity(e.target.value)}
                                            required
                                            min="1"
                                            max="100"
                                        />
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>Category *</label>
                                        <input
                                            type="text"
                                            value={category}
                                            onChange={(e) => setCategory(e.target.value)}
                                            required
                                            placeholder="e.g., Yoga, Cardio, Strength, Online"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className={styles.modalFooter}>
                                <button
                                    type="button"
                                    onClick={handleCloseModal}
                                    className={styles.secondaryButton}
                                >
                                    Cancel
                                </button>
                                <button type="submit" className={styles.primaryButton}>
                                    {editingClass ? 'Update Class' : 'Create Class'}
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