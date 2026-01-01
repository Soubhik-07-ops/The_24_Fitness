// src/components/Classes/ClassList.tsx
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import styles from './ClassList.module.css';
import { Calendar, Clock, User as UserIcon, Users, Wifi, WifiOff, Loader2 } from 'lucide-react';
import StarRating from '../Reviews/StarRating';

// Define a type for our class data with capacity tracking
export type Class = {
    id: number;
    created_at: string;
    name: string;
    description: string;
    schedule: string;
    duration_minutes: number;
    trainer_name: string;
    max_capacity: number;
    // Booking system removed
    category?: string;
    image_url?: string;
    review_stats?: {
        average_rating: number;
        total_reviews: number;
    };
};

export default function ClassList() {
    const [classes, setClasses] = useState<Class[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isOnline, setIsOnline] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [categories, setCategories] = useState<string[]>(['All']);

    useEffect(() => {
        const fetchClassesWithCapacity = async () => {
            setLoading(true);
            try {
                const { data: classesData, error: classesError } = await supabase
                    .from('classes')
                    .select('*')
                    .order('schedule', { ascending: true });

                if (classesError) throw classesError;

                const classesWithCapacity = await Promise.all(
                    (classesData || []).map(async (classItem) => {
                        // Normalize id (Postgres bigint may come as string)
                        const classId = Number(classItem.id);

                        const reviewStats = await fetchReviewStats(classId);

                        return {
                            ...classItem,
                            id: classId,
                            category: classItem.category || 'General',
                            review_stats: reviewStats || {
                                average_rating: 0,
                                total_reviews: 0
                            }
                        };
                    })
                );

                setClasses(classesWithCapacity);
            } catch (error: any) {
                console.error('Error fetching classes:', error.message);
                setError('Could not fetch classes. Please try again later.');
            } finally {
                setLoading(false);
            }
        };

        fetchClassesWithCapacity();
        setupRealtimeSubscriptions();
    }, []);


    // Function to fetch review statistics for a class
    const fetchReviewStats = async (classId: number) => {
        try {
            const { data, error } = await supabase
                .from('reviews')
                .select('rating')
                .eq('class_id', classId)
                .eq('is_approved', true);

            if (error) {
                console.error('Error fetching review stats:', error);
                return null;
            }

            const totalReviews = data.length;
            const averageRating = totalReviews > 0
                ? data.reduce((sum, review) => sum + review.rating, 0) / totalReviews
                : 0;

            return {
                average_rating: averageRating,
                total_reviews: totalReviews
            };
        } catch (error) {
            console.error('Error in fetchReviewStats:', error);
            return null;
        }
    };

    // Extract unique categories from classes
    useEffect(() => {
        if (classes.length > 0) {
            const uniqueCategories = ['All', ...new Set(classes.map(cls => cls.category || 'General'))];
            setCategories(uniqueCategories);
        }
    }, [classes]);

    // Real-time subscription for reviews
    const setupRealtimeSubscriptions = () => {
        const reviewsSubscription = supabase
            .channel('reviews-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'reviews'
                },
                async (payload) => {
                    console.log('Reviews change received:', payload);
                    await refreshAllData();
                }
            )
            .subscribe((status) => {
                console.log('Subscription status:', status);
                setIsOnline(status === 'SUBSCRIBED');
            });

        return () => {
            reviewsSubscription.unsubscribe();
        };
    };

    const refreshAllData = async () => {
        // Refresh classes data with review stats
        const { data: classesData } = await supabase
            .from('classes')
            .select('*')
            .order('schedule', { ascending: true });

        if (classesData) {
            const classesWithCapacity = await Promise.all(
                classesData.map(async (classItem) => {
                    const classId = Number(classItem.id);
                    const reviewStats = await fetchReviewStats(classId);

                    return {
                        ...classItem,
                        id: classId,
                        category: classItem.category || 'General',
                        review_stats: reviewStats || {
                            average_rating: 0,
                            total_reviews: 0
                        }
                    };
                })
            );
            setClasses(classesWithCapacity);
        }
    };


    // Helper to format the date
    const formatDateTime = (isoString: string) => {
        const date = new Date(isoString);
        return date.toLocaleString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });
    };


    // Filter classes by category
    const filteredClasses = selectedCategory === 'All'
        ? classes
        : classes.filter(cls => cls.category === selectedCategory);

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loadingState}>
                    <Loader2 className={styles.spinner} size={48} />
                    <p>Loading classes...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.container}>
                <p className={styles.errorState}>{error}</p>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.headerTop}>
                    <h1 className={styles.title}>
                        Class <span className={styles.gradientText}>Schedule</span>
                    </h1>
                    <div className={`${styles.connectionStatus} ${isOnline ? styles.online : styles.offline}`}>
                        {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
                        <span>{isOnline ? 'Live' : 'Offline'}</span>
                    </div>
                </div>
                <p className={styles.subtitle}>
                    Explore our class schedule and find your perfect fit.
                    {isOnline && <span className={styles.liveBadge}> • Live Updates</span>}
                </p>
            </div>

            {/* Category Filter */}
            <div className={styles.categoryFilter}>
                {categories.map(category => (
                    <button
                        key={category}
                        className={`${styles.categoryButton} ${selectedCategory === category ? styles.active : ''
                            }`}
                        onClick={() => setSelectedCategory(category)}
                    >
                        {category}
                    </button>
                ))}
            </div>

            <div className={styles.grid}>
                {filteredClasses.map((classItem) => {
                    const hasReviews = classItem.review_stats && classItem.review_stats.total_reviews > 0;

                    return (
                        <div key={classItem.id} className={styles.classCard}>
                            {/* Clickable Class Link */}
                            <a href={`/classes/${classItem.id}`} className={styles.classLink}>
                                <div className={styles.cardHeader}>
                                    <div>
                                        <h2 className={styles.cardTitle}>{classItem.name}</h2>
                                        {classItem.category && classItem.category !== 'General' && (
                                            <span className={styles.categoryTag}>{classItem.category}</span>
                                        )}
                                    </div>
                                    <span className={styles.cardTrainer}>
                                        <UserIcon size={16} /> {classItem.trainer_name}
                                    </span>
                                </div>
                                <p className={styles.cardDescription}>{classItem.description}</p>

                                {/* Ratings Display */}
                                {hasReviews && (
                                    <div className={styles.ratingSection}>
                                        <div className={styles.ratingDisplay}>
                                            <StarRating
                                                rating={classItem.review_stats!.average_rating}
                                                size={16}
                                                readonly
                                            />
                                            <span className={styles.ratingText}>
                                                {classItem.review_stats!.average_rating.toFixed(1)}
                                                <span className={styles.reviewCount}>
                                                    ({classItem.review_stats!.total_reviews})
                                                </span>
                                            </span>
                                        </div>
                                    </div>
                                )}

                                <div className={styles.cardInfo}>
                                    <div className={styles.infoItem}>
                                        <Calendar size={16} />
                                        <span>{formatDateTime(classItem.schedule)}</span>
                                    </div>
                                    <div className={styles.infoItem}>
                                        <Clock size={16} />
                                        <span>{classItem.duration_minutes} minutes</span>
                                    </div>
                                    <div className={styles.infoItem}>
                                        <Users size={16} />
                                        <span>Max Capacity: {classItem.max_capacity}</span>
                                    </div>
                                </div>
                            </a>
                        </div>
                    );
                })}
            </div>

        </div>
    );
}