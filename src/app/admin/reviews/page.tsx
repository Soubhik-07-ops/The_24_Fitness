// src/app/admin/reviews/page.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Toast from '@/components/Toast/Toast';
import { useToast } from '@/hooks/useToast';
import { MessageSquare, Star, Trash2, Calendar, ChevronDown, Check, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import styles from './reviews.module.css';
import cardStyles from '@/components/UserCard/UserCard.module.css';

interface Review {
    id: number;
    rating: number;
    comment: string;
    created_at: string;
    updated_at: string;
    user_id: string;
    class_id: number | null;
    is_approved: boolean;
    user_email?: string;
    user_name?: string;
    class_name?: string;
}

interface UserGroup {
    user_id: string;
    user_name: string;
    user_email: string;
    reviews: Review[];
}

export default function ReviewsManagement() {
    const [reviews, setReviews] = useState<Review[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | '5' | '4' | '3' | '2' | '1'>('all');
    const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const { toast, toastType, showToast, hideToast } = useToast();
    const router = useRouter();

    useEffect(() => {
        fetchReviews();
        
        // Set up real-time subscription for reviews (using regular client for notifications)
        // The actual data fetch uses admin API which bypasses RLS
        const channel = supabase
            .channel('admin-reviews-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'reviews'
                },
                () => {
                    fetchReviews();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchReviews = async () => {
        try {
            setLoading(true);
            
            // Fetch reviews using admin API (bypasses RLS policies)
            const reviewsResponse = await fetch('/api/admin/reviews/list', {
                credentials: 'include',
                cache: 'no-store'
            });

            if (!reviewsResponse.ok) {
                const error = await reviewsResponse.json();
                throw new Error(error.error || 'Failed to fetch reviews');
            }

            const { reviews: reviewsData } = await reviewsResponse.json();

            if (!reviewsData || reviewsData.length === 0) {
                setReviews([]);
                setLoading(false);
                return;
            }

            // Get unique user IDs and class IDs (filter out null class_ids)
            const userIds = [...new Set(reviewsData.map(r => r.user_id).filter(Boolean))];
            const classIds = [...new Set(reviewsData.map(r => r.class_id).filter((id): id is number => id !== null))];

            // Fetch user data from admin API
            let allUsers: any[] = [];
            try {
                const usersResponse = await fetch('/api/admin/users/list', {
                    credentials: 'include',
                    cache: 'no-store'
                });
                if (usersResponse.ok) {
                    const response = await usersResponse.json();
                    allUsers = response.users || [];
                }
            } catch (userError) {
                console.error('Error fetching users:', userError);
                // Continue even if user fetch fails
            }

            // Filter users to only those who wrote reviews
            const usersData = userIds.map(userId => {
                const userData = allUsers?.find((u: any) => u.id === userId);
                return {
                    id: userId,
                    email: userData?.email || 'No email',
                    full_name: userData?.full_name || 'Unknown User'
                };
            });

            // Fetch classes (only if there are class IDs)
            let classesData: any[] = [];
            if (classIds.length > 0) {
                try {
                    const { data } = await supabase
                        .from('classes')
                        .select('id, name')
                        .in('id', classIds);
                    classesData = data || [];
                } catch (classError) {
                    console.error('Error fetching classes:', classError);
                    // Continue even if class fetch fails
                }
            }

            // Map data - ensure ALL reviews are included, even if user/class lookup fails
            const mappedReviews = reviewsData.map(review => {
                const user = review.user_id ? usersData?.find(u => u.id === review.user_id) : null;
                const classData = review.class_id ? classesData?.find(c => c.id === review.class_id) : null;

                return {
                    ...review,
                    user_email: user?.email || 'No email',
                    user_name: user?.full_name || 'Unknown User',
                    class_name: classData?.name || (review.class_id === null ? 'General Review' : 'Unknown Class')
                };
            });

            // Logs for debugging (can be removed in production)
            if (process.env.NODE_ENV === 'development') {
                console.log('📊 Total reviews fetched:', reviewsData.length);
                console.log('📊 Pending:', mappedReviews.filter(r => !r.is_approved).length);
                console.log('📊 Approved:', mappedReviews.filter(r => r.is_approved).length);
            }

            setReviews(mappedReviews);
        } catch (error: any) {
            console.error('Error fetching reviews:', error);
            showToast(`Failed to load reviews: ${error.message || 'Unknown error'}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (reviewId: number) => {
        try {
            const res = await fetch('/api/admin/reviews', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id: reviewId, is_approved: true })
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(json?.error || 'Failed to approve review');
            }

            showToast('Review approved successfully!', 'success');
            fetchReviews();
        } catch (error: any) {
            showToast(`Failed to approve review: ${error.message || 'Unknown error'}`, 'error');
        }
    };

    const handleReject = async (reviewId: number) => {
        if (!confirm('Are you sure you want to unapprove this review? It will no longer be visible to users.')) {
            return;
        }
        try {
            const res = await fetch('/api/admin/reviews', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id: reviewId, is_approved: false })
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(json?.error || 'Failed to unapprove review');
            }

            showToast('Review unapproved successfully!', 'success');
            fetchReviews();
        } catch (error: any) {
            showToast(`Failed to unapprove review: ${error.message || 'Unknown error'}`, 'error');
        }
    };

    const handleDelete = async (reviewId: number) => {
        if (!confirm('Are you sure you want to delete this review?')) {
            return;
        }
        try {
            const res = await fetch('/api/admin/reviews', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id: reviewId })
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(json?.error || 'Failed to delete review');
            }

            showToast('Review deleted successfully!', 'success');
            fetchReviews();
        } catch (error: any) {
            showToast(`Failed to delete review: ${error.message || 'Unknown error'}`, 'error');
        }
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const renderStars = (rating: number) => {
        return (
            <div className={styles.starRating}>
                {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                        key={star}
                        size={16}
                        fill={star <= rating ? '#f97316' : 'none'}
                        stroke={star <= rating ? '#f97316' : '#9ca3af'}
                    />
                ))}
            </div>
        );
    };

    // Group reviews by user
    const userGroups = useMemo(() => {
        let filtered = reviews;
        
        if (filter === 'pending') {
            filtered = reviews.filter(review => review.is_approved === false);
        } else if (filter === 'approved') {
            filtered = reviews.filter(review => review.is_approved === true);
        } else if (filter !== 'all') {
            filtered = reviews.filter(review => review.rating === parseInt(filter));
        }
        
        const grouped = new Map<string, UserGroup>();

        filtered.forEach(review => {
            // Use user_id if available, otherwise use a unique identifier per review
            const userId = review.user_id || `unknown_${review.id}`;
            if (!grouped.has(userId)) {
                grouped.set(userId, {
                    user_id: userId,
                    user_name: review.user_name || 'Unknown User',
                    user_email: review.user_email || 'No email',
                    reviews: []
                });
            }
            grouped.get(userId)!.reviews.push(review);
        });

        return Array.from(grouped.values()).sort((a, b) =>
            b.reviews[0].created_at.localeCompare(a.reviews[0].created_at)
        );
    }, [reviews, filter]);

    // Pagination
    const totalPages = Math.ceil(userGroups.length / itemsPerPage);
    const paginatedUsers = userGroups.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const toggleUserExpanded = (userId: string) => {
        setExpandedUsers(prev => {
            const newSet = new Set(prev);
            if (newSet.has(userId)) {
                newSet.delete(userId);
            } else {
                newSet.add(userId);
            }
            return newSet;
        });
    };

    const stats = useMemo(() => {
        return {
            total: reviews.length,
            pending: reviews.filter(r => r.is_approved === false).length,
            approved: reviews.filter(r => r.is_approved === true).length,
            averageRating: reviews.length > 0
                ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
                : '0',
            fiveStars: reviews.filter(r => r.rating === 5).length,
            fourStars: reviews.filter(r => r.rating === 4).length,
            threeStars: reviews.filter(r => r.rating === 3).length,
            twoStars: reviews.filter(r => r.rating === 2).length,
            oneStar: reviews.filter(r => r.rating === 1).length,
        };
    }, [reviews]);

    if (loading) {
        return (
            <div className={styles.loadingState}>
                <div className={styles.spinner}></div>
                <p>Loading reviews...</p>
            </div>
        );
    }

    return (
        <div className={styles.pageContainer}>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Reviews Management</h1>
                    <p className={styles.pageSubtitle}>
                        Manage and moderate user reviews ({reviews.length} total)
                    </p>
                </div>
                <button
                    onClick={() => fetchReviews()}
                    className={styles.primaryButton}
                    style={{ marginTop: '1rem' }}
                >
                    🔄 Refresh Reviews
                </button>
            </div>

            <div className={styles.statsRow}>
                <div className={styles.statBox}>
                    <h3>{stats.total}</h3>
                    <p>Total Reviews</p>
                </div>
                <div className={styles.statBox}>
                    <h3>{stats.averageRating} ★</h3>
                    <p>Average Rating</p>
                </div>
                <div className={styles.statBox}>
                    <h3>{stats.fiveStars}</h3>
                    <p>5-Star Reviews</p>
                </div>
                <div className={styles.statBox}>
                    <h3>{stats.fourStars}</h3>
                    <p>4-Star Reviews</p>
                </div>
            </div>

            <div className={styles.filterBar}>
                <button
                    onClick={() => setFilter('all')}
                    className={`${styles.filterButton} ${filter === 'all' ? styles.active : ''}`}
                >
                    All Reviews ({stats.total})
                </button>
                <button
                    onClick={() => setFilter('pending')}
                    className={`${styles.filterButton} ${filter === 'pending' ? styles.active : ''}`}
                >
                    Pending ({stats.pending})
                </button>
                <button
                    onClick={() => setFilter('approved')}
                    className={`${styles.filterButton} ${filter === 'approved' ? styles.active : ''}`}
                >
                    Approved ({stats.approved})
                </button>
                <button
                    onClick={() => setFilter('5')}
                    className={`${styles.filterButton} ${filter === '5' ? styles.active : ''}`}
                >
                    5 Stars ({stats.fiveStars})
                </button>
                <button
                    onClick={() => setFilter('4')}
                    className={`${styles.filterButton} ${filter === '4' ? styles.active : ''}`}
                >
                    4 Stars ({stats.fourStars})
                </button>
                <button
                    onClick={() => setFilter('3')}
                    className={`${styles.filterButton} ${filter === '3' ? styles.active : ''}`}
                >
                    3 Stars ({stats.threeStars})
                </button>
                <button
                    onClick={() => setFilter('2')}
                    className={`${styles.filterButton} ${filter === '2' ? styles.active : ''}`}
                >
                    2 Stars ({stats.twoStars})
                </button>
                <button
                    onClick={() => setFilter('1')}
                    className={`${styles.filterButton} ${filter === '1' ? styles.active : ''}`}
                >
                    1 Star ({stats.oneStar})
                </button>
            </div>

            {/* User-based Cards */}
            <div className={styles.cardsContainer}>
                {paginatedUsers.length === 0 ? (
                    <div className={cardStyles.emptyState}>
                        <MessageSquare className={cardStyles.emptyStateIcon} />
                        <div className={cardStyles.emptyStateTitle}>No reviews found</div>
                        <div className={cardStyles.emptyStateText}>
                            {filter === 'all'
                                ? 'No reviews have been submitted yet.'
                                : `No ${filter}-star reviews found.`}
                        </div>
                    </div>
                ) : (
                    paginatedUsers.map((userGroup) => {
                        const isExpanded = expandedUsers.has(userGroup.user_id);
                        const averageRating = userGroup.reviews.length > 0
                            ? (userGroup.reviews.reduce((sum, r) => sum + r.rating, 0) / userGroup.reviews.length).toFixed(1)
                            : '0';

                        return (
                            <div key={userGroup.user_id} className={cardStyles.userCard}>
                                <div
                                    className={`${cardStyles.userCardHeader} ${isExpanded ? cardStyles.userCardHeaderExpanded : ''}`}
                                    onClick={() => toggleUserExpanded(userGroup.user_id)}
                                >
                                    <div className={cardStyles.userInfo}>
                                        <div className={cardStyles.userAvatar}>
                                            {userGroup.user_name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className={cardStyles.userDetails}>
                                            <div className={cardStyles.userName}>{userGroup.user_name}</div>
                                            <div className={cardStyles.userEmail}>{userGroup.user_email}</div>
                                        </div>
                                    </div>
                                    <div className={cardStyles.userStats}>
                                        <div className={cardStyles.statItem}>
                                            <div className={cardStyles.statValue}>{userGroup.reviews.length}</div>
                                            <div className={cardStyles.statLabel}>Reviews</div>
                                        </div>
                                        <div className={cardStyles.statItem}>
                                            <div className={cardStyles.statValue} style={{ color: '#f97316' }}>
                                                {averageRating}★
                                            </div>
                                            <div className={cardStyles.statLabel}>Avg Rating</div>
                                        </div>
                                    </div>
                                    <ChevronDown
                                        className={`${cardStyles.expandIcon} ${isExpanded ? cardStyles.expandIconExpanded : ''}`}
                                    />
                                </div>

                                <div className={`${cardStyles.userCardContent} ${isExpanded ? cardStyles.userCardContentExpanded : ''}`}>
                                    <div className={cardStyles.itemsList}>
                                        {userGroup.reviews.map((review) => (
                                            <div key={review.id} className={cardStyles.itemCard}>
                                                <div className={cardStyles.itemHeader}>
                                                    <div>
                                                        <div className={cardStyles.itemTitle}>
                                                            {review.class_name || 'General Review'}
                                                        </div>
                                                        <div className={cardStyles.itemMeta}>
                                                            <span className={cardStyles.itemBadge} style={{
                                                                background: review.is_approved ? '#d1fae5' : '#fef3c7',
                                                                color: review.is_approved ? '#065f46' : '#92400e'
                                                            }}>
                                                                {review.is_approved ? 'Approved' : 'Pending'}
                                                            </span>
                                                            <span>•</span>
                                                            <span className={cardStyles.itemBadge} style={{
                                                                background: review.rating >= 4 ? '#d1fae5' : review.rating >= 3 ? '#fef3c7' : '#fee2e2',
                                                                color: review.rating >= 4 ? '#065f46' : review.rating >= 3 ? '#92400e' : '#991b1b'
                                                            }}>
                                                                {review.rating} Stars
                                                            </span>
                                                            <span>•</span>
                                                            <span>{formatDate(review.created_at)}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className={cardStyles.itemDetails}>
                                                    <div className={cardStyles.detailRow}>
                                                        <div className={cardStyles.detailLabel}>Rating</div>
                                                        <div className={cardStyles.detailValue}>
                                                            {renderStars(review.rating)}
                                                        </div>
                                                    </div>
                                                    <div className={cardStyles.detailRow}>
                                                        <div className={cardStyles.detailLabel}>Comment</div>
                                                        <div className={cardStyles.detailValue} style={{
                                                            fontStyle: review.comment ? 'normal' : 'italic',
                                                            color: review.comment ? '#111827' : '#9ca3af'
                                                        }}>
                                                            {review.comment || 'No comment provided'}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className={cardStyles.itemActions}>
                                                    {!review.is_approved ? (
                                                        <button
                                                            onClick={() => handleApprove(review.id)}
                                                            className={`${cardStyles.actionButton}`}
                                                            style={{ background: '#10b981', color: 'white' }}
                                                        >
                                                            <Check size={16} />
                                                            Approve
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleReject(review.id)}
                                                            className={`${cardStyles.actionButton}`}
                                                            style={{ background: '#ef4444', color: 'white' }}
                                                            title="Unapprove this review"
                                                        >
                                                            <X size={16} />
                                                            Unapprove
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleDelete(review.id)}
                                                        className={`${cardStyles.actionButton} ${cardStyles.actionButtonDanger}`}
                                                    >
                                                        <Trash2 size={16} />
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className={cardStyles.pagination}>
                    <button
                        className={cardStyles.paginationButton}
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                    >
                        ‹
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                        <button
                            key={page}
                            className={`${cardStyles.paginationButton} ${currentPage === page ? cardStyles.paginationButtonActive : ''}`}
                            onClick={() => setCurrentPage(page)}
                        >
                            {page}
                        </button>
                    ))}
                    <button
                        className={cardStyles.paginationButton}
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                    >
                        ›
                    </button>
                    <div className={cardStyles.paginationInfo}>
                        Page {currentPage} of {totalPages} ({userGroups.length} users)
                    </div>
                </div>
            )}
            <Toast message={toast} type={toastType} onClose={hideToast} />
        </div>
    );
}