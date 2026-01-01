// src/app/classes/[id]/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Class } from '@/components/Classes/ClassList';
import styles from './ClassDetail.module.css';
import { Calendar, Clock, Users, ArrowLeft, Activity } from 'lucide-react';
import Footer from '@/components/Footer/Footer';
import Navbar from '@/components/Navbar/Navbar';
import Toast from '@/components/Toast/Toast';
import { useToast } from '@/hooks/useToast';

export default function ClassDetailPage() {
    const params = useParams();
    const router = useRouter();
    const classId = params.id as string;

    const [classItem, setClassItem] = useState<Class | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { toast, toastType, showToast, hideToast } = useToast();

    useEffect(() => {
        if (classId) {
            fetchClassDetails();
        }
    }, [classId]);

    const fetchClassDetails = async () => {
        try {
            setLoading(true);
            setError(null);

            // Fetch class details
            const { data: classData, error: classError } = await supabase
                .from('classes')
                .select('*')
                .eq('id', classId)
                .single();

            if (classError) throw classError;
            if (!classData) {
                setError('Class not found');
                return;
            }

            // Set class item
            setClassItem({
                ...classData,
                id: classId
            });

        } catch (error: any) {
            console.error('🚨 Error in fetchClassDetails:', error);
            setError('Failed to load class details');
        } finally {
            setLoading(false);
        }
    };


    const formatDateTime = (isoString: string) => {
        const date = new Date(isoString);
        return date.toLocaleString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });
    };

    if (loading) {
        return (
            <div className={styles.classDetailContainer}>
                <div className={styles.loadingState}>
                    <div className={styles.spinner}></div>
                    <p>Loading class details...</p>
                </div>
            </div>
        );
    }

    if (error || !classItem) {
        return (
            <div className={styles.classDetailContainer}>
                <div className={styles.errorState}>
                    <h2>{error || 'Class Not Found'}</h2>
                    <p>The class you're looking for doesn't exist or couldn't be loaded.</p>
                    <button
                        onClick={() => router.push('/features')}
                        className={styles.backButton}
                    >
                        Back to Gym Benefits
                    </button>
                </div>
            </div>
        );
    }

    return (
        <>
            <Navbar />
            <div className={styles.classDetailContainer}>
                {/* Back Button */}
                <button
                    onClick={() => router.push('/features')}
                    className={styles.backButton}
                >
                    <ArrowLeft size={20} />
                    Back to Gym Benefits
                </button>

                {/* Class Header */}
                <div className={styles.classHeader}>
                    <div className={styles.classInfo}>
                        <div className={styles.classTitleSection}>
                            <h1 className={styles.classTitle}>{classItem.name}</h1>
                            {classItem.category && classItem.category !== 'General' && (
                                <span className={styles.classCategory}>{classItem.category}</span>
                            )}
                        </div>

                        <div className={styles.classMeta}>
                            <div className={styles.metaItem}>
                                <Calendar size={18} />
                                <span>{formatDateTime(classItem.schedule)}</span>
                            </div>
                            <div className={styles.metaItem}>
                                <Clock size={18} />
                                <span>{classItem.duration_minutes} minutes</span>
                            </div>
                            <div className={styles.metaItem}>
                                <Users size={18} />
                                <span>
                                    Max Capacity: {classItem.max_capacity} spots
                                </span>
                            </div>
                            </div>
                        </div>

                    {/* Class Image */}
                    <div className={styles.classImageContainer}>
                        {classItem.image_url ? (
                            <img
                                src={classItem.image_url}
                                alt={classItem.name}
                                className={styles.classImage}
                            />
                        ) : (
                            <div className={styles.classImagePlaceholder}>
                                <Activity size={64} color="#f97316" />
                                <span>No Image Available</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Class Description */}
                <div className={styles.classDescription}>
                    <h3>About This Class</h3>
                    <p>{classItem.description}</p>
                </div>
            </div>
            <Toast message={toast} type={toastType} onClose={hideToast} />
            <Footer />
        </>
    );
}