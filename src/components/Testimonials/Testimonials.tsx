// src/components/Testimonials/Testimonials.tsx
'use client'

import { motion } from 'framer-motion'
import { useInView } from 'framer-motion'
import { useRef, useState, useEffect, useCallback } from 'react'
import { Star, Quote, Calendar, ChevronLeft, ChevronRight, Send, Loader2, MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { Review, ReviewFormData } from '@/types/review'
import StarRating from '@/components/Reviews/StarRating'
import { useRouter } from 'next/navigation'
import Toast from '@/components/Toast/Toast'
import { useToast } from '@/hooks/useToast'
import styles from './Testimonials.module.css'

interface Profile {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
}

interface Class {
    id: number;
    name: string;
}

export default function Testimonials() {
    const ref = useRef(null)
    const isInView = useInView(ref, { once: true, margin: '-50px' })
    const [reviews, setReviews] = useState<Review[]>([])
    const [classes, setClasses] = useState<Class[]>([])
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState({
        averageRating: 0,
        totalReviews: 0,
        totalMembers: 0
    })
    const [currentSlide, setCurrentSlide] = useState(0)
    const [cardsPerSlide, setCardsPerSlide] = useState(1)
    const [showReviewForm, setShowReviewForm] = useState(false)
    const [reviewFormData, setReviewFormData] = useState<ReviewFormData>({
        rating: 0,
        comment: ''
    })
    const [submittingReview, setSubmittingReview] = useState(false)
    const [user, setUser] = useState<any>(null)
    const router = useRouter()
    const { toast, toastType, showToast, hideToast } = useToast()

    // Check authentication
    useEffect(() => {
        const checkAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            setUser(session?.user || null)
        }
        checkAuth()
    }, [])

    // Fetch reviews, classes, and statistics from the database
    useEffect(() => {
        const fetchTestimonialData = async () => {
            try {
                console.log('🔄 Starting to fetch testimonial data...')

                // Fetch all classes first (for displaying class names if review has class_id)
                const { data: classesData, error: classesError } = await supabase
                    .from('classes')
                    .select('id, name')
                    .order('name', { ascending: true })

                console.log('📚 Classes data:', classesData)

                if (classesError) throw classesError

                // Normalize ids (Postgres bigint may be returned as string)
                const classesNormalized = (classesData || []).map((c: any) => ({ ...c, id: Number(c.id) }))
                setClasses(classesNormalized)

                // Fetch all approved reviews for carousel (both class-specific and general reviews)
                // Only show approved reviews to users
                const { data: reviewsData, error: reviewsError } = await supabase
                    .from('reviews')
                    .select('*')
                    .eq('is_approved', true)
                    .order('created_at', { ascending: false })

                console.log('📊 Reviews data:', reviewsData)

                if (reviewsError) throw reviewsError

                let reviewsWithUserData: Review[] = []

                // Fetch user profiles separately if we have reviews
                if (reviewsData && reviewsData.length > 0) {
                    // Filter out null user_ids and get unique user IDs
                    const userIds = [...new Set(reviewsData
                        .map(review => review.user_id)
                        .filter(userId => userId !== null)
                    )]

                    console.log('👤 User IDs to fetch:', userIds)

                    let profilesData: Profile[] = []
                    if (userIds.length > 0) {
                        const { data: profiles, error: profilesError } = await supabase
                            .from('profiles')
                            .select('id, full_name, avatar_url')
                            .in('id', userIds)

                        if (profilesError) {
                            console.error('❌ Profiles fetch error:', profilesError)
                        } else {
                            profilesData = profiles || []
                        }
                    }

                    console.log('👤 Profiles data found:', profilesData)

                    // Combine reviews with profiles and class names (only if class_id exists)
                    reviewsWithUserData = reviewsData.map((review): Review => {
                        const userProfile = profilesData?.find(profile => profile.id === review.user_id)

                        // Only get class info if class_id exists (for general reviews, class_id is null)
                        let classInfo = null
                        if (review.class_id) {
                        const reviewClassId = typeof review.class_id === 'string' ? Number(review.class_id) : review.class_id
                            classInfo = classesData?.find(cls => Number(cls.id) === Number(reviewClassId))
                        }

                        return {
                            ...review,
                            profiles: userProfile ? {
                                full_name: userProfile.full_name,
                                avatar_url: userProfile.avatar_url
                            } : {
                                full_name: 'Gym Member',
                                avatar_url: null
                            },
                            classes: classInfo ? {
                                name: classInfo.name
                            } : undefined // No class info for general website reviews
                        }
                    })
                }

                // Fetch statistics
                const { data: statsData, error: statsError } = await supabase
                    .from('reviews')
                    .select('rating, user_id')
                    .eq('is_approved', true)

                console.log('📈 Stats query result:', statsData)

                if (statsError) throw statsError

                // Calculate statistics
                const totalReviews = statsData?.length || 0
                const averageRating = totalReviews > 0
                    ? statsData!.reduce((sum, review) => sum + review.rating, 0) / totalReviews
                    : 0

                // Fetch actual active members from memberships table
                const { count: activeMembersCount, error: membersError } = await supabase
                    .from('memberships')
                    .select('*', { count: 'exact', head: true })
                    .eq('status', 'active')

                if (membersError) {
                    console.warn('⚠️ Error fetching active members:', membersError)
                }

                const totalMembers = activeMembersCount || 0

                console.log('✅ Final stats:', {
                    reviewsCount: reviewsWithUserData.length,
                    averageRating,
                    totalReviews,
                    totalMembers
                })

                setReviews(reviewsWithUserData)
                setStats({
                    averageRating,
                    totalReviews,
                    totalMembers
                })

            } catch (error: any) {
                console.error('🚨 Error fetching testimonial data:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchTestimonialData()

        // Set up real-time subscription for reviews
        const reviewsChannel = supabase
            .channel('testimonials-reviews')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'reviews',
                filter: 'is_approved=eq.true'
            }, () => {
                console.log('🔄 Reviews changed, refetching...')
                fetchTestimonialData()
            })
            .subscribe()

        // Set up real-time subscription for memberships (for active members count)
        const membershipsChannel = supabase
            .channel('testimonials-memberships')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'memberships',
                filter: 'status=eq.active'
            }, () => {
                console.log('🔄 Active memberships changed, refetching stats...')
                fetchTestimonialData()
            })
            .subscribe()

        return () => {
            supabase.removeChannel(reviewsChannel)
            supabase.removeChannel(membershipsChannel)
        }
    }, [])

    // Calculate cards per slide based on screen size
    useEffect(() => {
        const updateCardsPerSlide = () => {
            const width = window.innerWidth
            if (width >= 1024) {
                setCardsPerSlide(3) // Desktop: 3 cards
            } else if (width >= 768) {
                setCardsPerSlide(2) // Tablet: 2 cards
            } else {
                setCardsPerSlide(1) // Mobile: 1 card
            }
        }

        updateCardsPerSlide()
        window.addEventListener('resize', updateCardsPerSlide)
        return () => window.removeEventListener('resize', updateCardsPerSlide)
    }, [])

    const getInitials = (fullName: string | null) => {
        if (!fullName) return 'GM';
        return fullName
            .split(' ')
            .map(name => name[0])
            .join('')
            .toUpperCase()
            .slice(0, 2)
    }

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short'
        })
    }

    const totalSlides = Math.ceil(reviews.length / cardsPerSlide)
    const maxSlide = Math.max(0, totalSlides - 1)
    const carouselRef = useRef<HTMLDivElement>(null)

    // Carousel navigation - use useCallback to avoid dependency issues
    const scrollToSlide = useCallback((slideIndex: number) => {
        if (!carouselRef.current) return
        const cards = Array.from(carouselRef.current.querySelectorAll<HTMLElement>(`.${styles.testimonialCard}`))
        const cardIndex = slideIndex * cardsPerSlide
        const target = cards[cardIndex]
        if (!target) return
        const scrollLeft = target.offsetLeft - (carouselRef.current.clientWidth - target.clientWidth) / 2
        carouselRef.current.scrollTo({
            left: scrollLeft,
            behavior: 'smooth'
        })
        setCurrentSlide(slideIndex)
    }, [cardsPerSlide])

    const nextSlide = () => {
        scrollToSlide(currentSlide >= maxSlide ? 0 : currentSlide + 1)
    }

    const prevSlide = () => {
        scrollToSlide(currentSlide === 0 ? maxSlide : currentSlide - 1)
    }


    // Track scroll position to update active slide
    useEffect(() => {
        if (!carouselRef.current || reviews.length === 0) return

        const handleScroll = () => {
            if (!carouselRef.current) return
            const cards = Array.from(carouselRef.current.querySelectorAll<HTMLElement>(`.${styles.testimonialCard}`))
            if (cards.length === 0) return

            const scrollLeft = carouselRef.current.scrollLeft
            const containerWidth = carouselRef.current.clientWidth

            let closestCardIndex = 0
            let closestDistance = Infinity

            // Check only the first card of each slide
            for (let i = 0; i < cards.length; i += cardsPerSlide) {
                const card = cards[i]
                const cardLeft = card.offsetLeft
                const cardCenter = cardLeft + card.clientWidth / 2
                const containerCenter = scrollLeft + containerWidth / 2
                const distance = Math.abs(cardCenter - containerCenter)

                if (distance < closestDistance) {
                    closestDistance = distance
                    closestCardIndex = i
                }
            }

            const slideIndex = Math.floor(closestCardIndex / cardsPerSlide)
            if (slideIndex !== currentSlide && slideIndex < totalSlides) {
                setCurrentSlide(slideIndex)
            }
        }

        const carousel = carouselRef.current
        carousel.addEventListener('scroll', handleScroll, { passive: true })
        
        const handleResize = () => {
            handleScroll()
        }
        window.addEventListener('resize', handleResize)

        return () => {
            carousel.removeEventListener('scroll', handleScroll)
            window.removeEventListener('resize', handleResize)
        }
    }, [reviews.length, currentSlide, totalSlides, cardsPerSlide])

    const handleSubmitReview = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!user) {
            showToast('Please log in to submit a review', 'warning')
            setTimeout(() => router.push('/signup'), 2000)
            return
        }

        if (reviewFormData.rating === 0) {
            showToast('Please select a rating', 'error')
            return
        }

        setSubmittingReview(true)

        try {
            // Create new review (users can submit multiple reviews)
            // class_id is null for general website reviews
            const { error } = await supabase
                .from('reviews')
                .insert({
                    user_id: user.id,
                    class_id: null, // General website review, not tied to a specific class
                    rating: reviewFormData.rating,
                    comment: reviewFormData.comment,
                    is_approved: false // Reviews need admin approval
                })

            if (error) throw error
            showToast('Review submitted! It will be visible after admin approval.', 'success')

            // Reset form
            setReviewFormData({ rating: 0, comment: '' })
            setShowReviewForm(false)

            // Note: Review will appear in testimonials after admin approval
            // No need to reload - it will show once approved

        } catch (error: any) {
            console.error('Error submitting review:', error)
            showToast('Failed to submit review: ' + error.message, 'error')
        } finally {
            setSubmittingReview(false)
        }
    }

    if (loading) {
        return (
            <section className={styles.testimonials}>
                <div className={styles.container}>
                    <div className={styles.loadingState}>
                        <div className={styles.spinner}></div>
                        <p>Loading member stories...</p>
                    </div>
                </div>
            </section>
        )
    }

    return (
        <section ref={ref} className={styles.testimonials}>
            {/* Background Image */}
            <div className={styles.backgroundImage}></div>

            {/* Dark Overlay for Text Readability */}
            <div className={styles.overlay}></div>

            <div className={styles.backgroundDecoration}>
                <div className={styles.decorationCircle + ' ' + styles.circle1}></div>
                <div className={styles.decorationCircle + ' ' + styles.circle2}></div>
            </div>

            <div className={styles.container}>
                <div className={styles.header}>
                    <h2 className={styles.title}>
                        <span className={styles.gradientText}>Real Members</span>{' '}
                        Real Stories
                    </h2>
                    <p className={styles.subtitle}>
                        Hear what our members are saying about their fitness journey at The 24 Fitness Gym.
                    </p>

                    {/* Real Reviews Counter */}
                    {stats.totalReviews > 0 && (
                        <div className={styles.realReviewsCounter}>
                            <span className={styles.realReviewsBadge}>
                                {stats.totalReviews}+ Verified Member Reviews
                            </span>
                        </div>
                    )}
                </div>

                {reviews.length === 0 ? (
                    <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}>💬</div>
                        <h3>No Reviews Yet</h3>
                        <p>Be the first to share your fitness journey experience!</p>
                    </div>
                ) : (
                    <>
                        {/* Testimonials Carousel */}
                        <div className={styles.carouselWrapper}>
                            <div
                                ref={carouselRef}
                                className={styles.carouselTrack}
                            >
                                {reviews.map((review, index) => (
                                    <div
                                        key={review.id}
                                        className={styles.testimonialCard}
                                    >
                                        <div className={styles.quoteIcon}>
                                            <Quote size={20} />
                                            <div className={styles.verifiedBadge} title="Verified Member Review">
                                                ✓
                                            </div>
                                        </div>

                                        <div className={styles.content}>
                                            <p className={styles.quote}>"{review.comment || 'Great experience!'}"</p>

                                            <div className={styles.stars}>
                                                {[...Array(review.rating)].map((_, i) => (
                                                    <Star key={i} size={16} className={styles.star} fill="currentColor" />
                                                ))}
                                            </div>

                                            <div className={styles.author}>
                                                {/* Show actual avatar if available */}
                                                {review.profiles?.avatar_url ? (
                                                    <img
                                                        src={review.profiles.avatar_url}
                                                        alt={review.profiles.full_name || 'Member avatar'}
                                                        className={styles.avatarImage}
                                                    />
                                                ) : (
                                                    <div className={styles.avatar}>
                                                        {getInitials(review.profiles?.full_name || null)}
                                                    </div>
                                                )}
                                                <div className={styles.authorInfo}>
                                                    <div className={styles.authorName}>
                                                        {review.profiles?.full_name || 'Gym Member'}
                                                    </div>
                                                    {review.classes?.name && (
                                                    <div className={styles.classInfo}>
                                                            {review.classes.name}
                                                    </div>
                                                    )}
                                                    <div className={styles.reviewMeta}>
                                                        <Calendar size={12} />
                                                        <span>{formatDate(review.created_at)}</span>
                                                        <span className={styles.ratingBadge}>
                                                            {review.rating} Star{review.rating !== 1 ? 's' : ''}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {reviews.length > cardsPerSlide && (
                                <div className={styles.swipeControls}>
                                    <button
                                        className={styles.navButton}
                                        onClick={prevSlide}
                                        aria-label="Previous testimonials"
                                        disabled={currentSlide === 0 && totalSlides <= 1}
                                    >
                                        <ChevronLeft size={20} />
                                    </button>
                                    <div className={styles.dots}>
                                        {Array.from({ length: totalSlides }).map((_, i) => (
                                            <button
                                                key={i}
                                                className={`${styles.dot} ${i === currentSlide ? styles.dotActive : ''}`}
                                                onClick={() => scrollToSlide(i)}
                                                aria-label={`Go to slide ${i + 1}`}
                                            />
                                        ))}
                                    </div>
                                    <button
                                        className={styles.navButton}
                                        onClick={nextSlide}
                                        aria-label="Next testimonials"
                                        disabled={currentSlide >= maxSlide && totalSlides <= 1}
                                    >
                                        <ChevronRight size={20} />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Stats Bar - Always Horizontal */}
                        <div className={styles.statsBar}>
                            <div className={styles.stat}>
                                <div className={styles.statNumber}>
                                    {stats.averageRating > 0 ? stats.averageRating.toFixed(1) : '0.0'}
                                </div>
                                <div className={styles.statLabel}>Average Rating</div>
                            </div>
                            <div className={styles.stat}>
                                <div className={styles.statNumber}>{stats.totalReviews}</div>
                                <div className={styles.statLabel}>Member Reviews</div>
                            </div>
                            <div className={styles.stat}>
                                <div className={styles.statNumber}>{stats.totalMembers}</div>
                                <div className={styles.statLabel}>Active Members</div>
                            </div>
                        </div>
                    </>
                )}

                {/* Review Form Section */}
                <div className={styles.reviewFormSection}>
                    <div className={styles.reviewFormHeader}>
                        <h3 className={styles.reviewFormTitle}>
                            <MessageCircle size={24} />
                            Share Your Experience
                        </h3>
                        <p className={styles.reviewFormSubtitle}>
                            Share your overall experience with our gym, website, or workout programs
                        </p>
                    </div>

                    {!showReviewForm ? (
                        <button
                            onClick={() => {
                                if (!user) {
                                    showToast('Please log in to submit a review', 'warning')
                                    setTimeout(() => router.push('/signup'), 2000)
                                    return
                                }
                                setShowReviewForm(true)
                            }}
                            className={styles.showFormButton}
                        >
                            Write a Review
                            <MessageCircle size={18} />
                        </button>
                    ) : (
                        <form onSubmit={handleSubmitReview} className={styles.reviewForm}>
                            {/* Rating Section */}
                            <div className={styles.formField}>
                                <label className={styles.formLabel}>Your Rating</label>
                                <StarRating
                                    rating={reviewFormData.rating}
                                    onRatingChange={(rating) => setReviewFormData(prev => ({ ...prev, rating }))}
                                    size={32}
                                />
                            </div>

                            {/* Comment Section */}
                            <div className={styles.formField}>
                                <label htmlFor="reviewComment" className={styles.formLabel}>
                                    Your Review (Optional)
                                </label>
                                <textarea
                                    id="reviewComment"
                                    value={reviewFormData.comment}
                                    onChange={(e) => setReviewFormData(prev => ({ ...prev, comment: e.target.value }))}
                                    className={styles.formTextarea}
                                    placeholder="Share your overall experience with our gym, website, facilities, or workout programs..."
                                    rows={4}
                                    maxLength={500}
                                />
                                <div className={styles.charCount}>
                                    {reviewFormData.comment.length}/500 characters
                                </div>
                            </div>

                            {/* Form Actions */}
                            <div className={styles.formActions}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowReviewForm(false)
                                        setReviewFormData({ rating: 0, comment: '' })
                                    }}
                                    className={styles.cancelButton}
                                    disabled={submittingReview}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submittingReview || reviewFormData.rating === 0}
                                    className={styles.submitButton}
                                >
                                    {submittingReview ? (
                                        <>
                                            <Loader2 className={styles.spinner} size={16} />
                                            Submitting...
                                        </>
                                    ) : (
                                        <>
                                            <Send size={16} />
                                            Submit Review
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
            <Toast message={toast} type={toastType} onClose={hideToast} />
        </section>
    )
}