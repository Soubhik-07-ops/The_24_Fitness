'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useInView } from 'framer-motion'
import { Check, Star, ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import styles from './MembershipPlans.module.css'

interface Plan {
    id: string
    name: string
    planType: 'online'
    price: number
    duration: string
    features: string[]
    popular?: boolean
    gender?: 'boys' | 'girls'
}

const boysPlans: Plan[] = [
    {
        id: 'boys_basic',
        name: 'Basic',
        planType: 'online',
        price: 2200,
        duration: '3 Months',
        gender: 'boys',
        features: [
            '3 Months Workout Plan',
            'Weekly Updates',
            'Online Support',
            'Progress Tracking'
        ]
    },
    {
        id: 'boys_premium',
        name: 'Premium',
        planType: 'online',
        price: 4000,
        duration: '6 Months',
        gender: 'boys',
        features: [
            '6 Months Workout Plan',
            'Diet Plan Included',
            '1 Week Free Training by Certified Trainers',
            'Weekly Updates',
            'Online Support',
            'Progress Tracking'
        ],
        popular: true
    },
    {
        id: 'boys_elite',
        name: 'Elite',
        planType: 'online',
        price: 6800,
        duration: '12 Months',
        gender: 'boys',
        features: [
            '12 Months Workout Plan',
            'Diet Plan Included',
            '1 Month Free Training with Trainer of Your Choice',
            'Weekly Updates',
            'Online Support',
            'Priority Support',
            'Progress Tracking'
        ]
    }
]

const girlsPlans: Plan[] = [
    {
        id: 'girls_basic',
        name: 'Basic',
        planType: 'online',
        price: 2400,
        duration: '3 Months',
        gender: 'girls',
        features: [
            '3 Months Workout Plan',
            'Weekly Updates',
            'Online Support',
            'Progress Tracking'
        ]
    },
    {
        id: 'girls_premium',
        name: 'Premium',
        planType: 'online',
        price: 4400,
        duration: '6 Months',
        gender: 'girls',
        features: [
            '6 Months Workout Plan',
            'Diet Plan Included',
            '1 Week Free Training by Certified Trainers',
            'Weekly Updates',
            'Online Support',
            'Progress Tracking'
        ],
        popular: true
    },
    {
        id: 'girls_elite',
        name: 'Elite',
        planType: 'online',
        price: 7800,
        duration: '12 Months',
        gender: 'girls',
        features: [
            '12 Months Workout Plan',
            'Diet Plan Included',
            '1 Month Free Training with Trainer of Your Choice',
            'Weekly Updates',
            'Online Support',
            'Priority Support',
            'Progress Tracking'
        ]
    }
]

// In-gym plans removed - in-gym is now available as an addon option for online plans

export default function MembershipPlans() {
    const router = useRouter()
    const ref = useRef<HTMLElement | null>(null)
    const onlineGridRef = useRef<HTMLDivElement>(null)
    const isInView = useInView(ref, { once: true, margin: '-100px' })

    const SWITCH_WIDTH = 1024
    const [isSwipeable, setIsSwipeable] = useState(false)
    const [activeOnlineIndex, setActiveOnlineIndex] = useState(0)
    const [selectedGender, setSelectedGender] = useState<'boys' | 'girls'>('boys')

    const currentPlans = selectedGender === 'boys' ? boysPlans : girlsPlans

    useEffect(() => {
        const onResize = () => setIsSwipeable(window.innerWidth < SWITCH_WIDTH)
        onResize()
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [])

    const handleSelectPlan = (plan: Plan) => {
        // Redirect to form page with plan details
        const params = new URLSearchParams({
            planId: plan.id,
            planType: plan.planType,
            planName: plan.name,
            price: plan.price.toString(),
            duration: plan.duration,
            gender: plan.gender || selectedGender
        })
        router.push(`/membership/form?${params.toString()}`)
    }

    // Reset active index when gender changes
    useEffect(() => {
        setActiveOnlineIndex(0)
        if (onlineGridRef.current) {
            onlineGridRef.current.scrollTo({ left: 0, behavior: 'smooth' })
        }
    }, [selectedGender])

    const scrollToIndex = (idx: number) => {
        if (!onlineGridRef.current) return
        const cards = Array.from(onlineGridRef.current.querySelectorAll<HTMLElement>(`.${styles.planCard}`))
        const target = cards[idx]
        if (!target) return
        const scrollLeft = target.offsetLeft - (onlineGridRef.current.clientWidth - target.clientWidth) / 2
        onlineGridRef.current.scrollTo({
            left: scrollLeft,
            behavior: 'smooth'
        })
        setActiveOnlineIndex(idx)
    }

    // Track scroll position to update active index
    useEffect(() => {
        if (!isSwipeable || !onlineGridRef.current) return

        const handleScroll = () => {
            if (!onlineGridRef.current) return
            const cards = Array.from(onlineGridRef.current.querySelectorAll<HTMLElement>(`.${styles.planCard}`))
            if (cards.length === 0) return

            const scrollLeft = onlineGridRef.current.scrollLeft
            const containerWidth = onlineGridRef.current.clientWidth

            // Find which card is most visible
            let closestIndex = 0
            let closestDistance = Infinity

            cards.forEach((card, index) => {
                const cardLeft = card.offsetLeft
                const cardCenter = cardLeft + card.clientWidth / 2
                const containerCenter = scrollLeft + containerWidth / 2
                const distance = Math.abs(cardCenter - containerCenter)

                if (distance < closestDistance) {
                    closestDistance = distance
                    closestIndex = index
                }
            })

            if (closestIndex !== activeOnlineIndex) {
                setActiveOnlineIndex(closestIndex)
            }
        }

        const grid = onlineGridRef.current
        grid.addEventListener('scroll', handleScroll, { passive: true })

        // Also check on resize
        const handleResize = () => {
            handleScroll()
        }
        window.addEventListener('resize', handleResize)

        return () => {
            grid.removeEventListener('scroll', handleScroll)
            window.removeEventListener('resize', handleResize)
        }
    }, [isSwipeable, activeOnlineIndex])

    const next = () => {
        scrollToIndex(Math.min(activeOnlineIndex + 1, currentPlans.length - 1))
    }

    const prev = () => {
        scrollToIndex(Math.max(activeOnlineIndex - 1, 0))
    }

    return (
        <section ref={ref} className={styles.membership} id="membership">
            {/* Background Image */}
            <div className={styles.backgroundImage}></div>

            {/* Dark Overlay for Text Readability */}
            <div className={styles.overlay}></div>

            <div className={styles.backgroundElements}>
                <div className={`${styles.floatingCircle} ${styles.circle1}`} />
                <div className={`${styles.floatingCircle} ${styles.circle2}`} />
                <div className={`${styles.floatingCircle} ${styles.circle3}`} />
            </div>

            <div className={styles.container}>
                <motion.div
                    className={styles.header}
                    initial={{ opacity: 0, y: 20 }}
                    animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                    transition={{ duration: 0.6 }}
                >
                    <h2 className={styles.title}>Membership Plans</h2>
                    <p className={styles.subtitle}>
                        Choose the perfect plan that fits your fitness goals and budget. Start your transformation journey today.
                    </p>
                </motion.div>

                {/* Gender Toggle */}
                <motion.div
                    className={styles.sectionToggle}
                    initial={{ opacity: 0, y: 20 }}
                    animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                >
                    <button
                        className={`${styles.toggleButton} ${selectedGender === 'boys' ? styles.active : ''}`}
                        onClick={() => setSelectedGender('boys')}
                    >
                        <Users size={18} />
                        Boys Plans
                    </button>
                    <button
                        className={`${styles.toggleButton} ${selectedGender === 'girls' ? styles.active : ''}`}
                        onClick={() => setSelectedGender('girls')}
                    >
                        <Users size={18} />
                        Girls Plans
                    </button>
                </motion.div>

                {/* Plans Grid */}
                <div className={styles.controlsRow}>
                    <div
                        ref={onlineGridRef}
                        className={`${styles.plansGrid} ${isSwipeable ? styles.swipeMode : styles.gridMode}`}
                    >
                        {currentPlans.map((plan, idx) => (
                            <article
                                key={plan.id}
                                className={`${styles.planCard} ${plan.popular ? styles.planCardPopular : ''}`}
                            >
                                {plan.popular && (
                                    <div className={styles.popularBadge}>
                                        <Star size={16} fill="currentColor" />
                                        Most Popular
                                    </div>
                                )}
                                <div className={styles.planHeader}>
                                    <h3 className={styles.planName}>{plan.name}</h3>
                                    <div className={styles.planPrice}>
                                        <span className={styles.price}>₹{plan.price.toLocaleString()}</span>
                                    </div>
                                    <div className={styles.planDuration}>{plan.duration}</div>
                                </div>
                                <div className={styles.featuresList}>
                                    {plan.features.map((f, i) => (
                                        <div key={i} className={styles.featureItem}>
                                            <Check size={18} className={styles.featureIcon} />
                                            <span>{f}</span>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    className={`${styles.getStartedButton} ${plan.popular ? styles.buttonPopular : plan.name === 'Basic' ? styles.buttonBasic : styles.buttonElite
                                        }`}
                                    onClick={() => handleSelectPlan(plan)}
                                >
                                    Select Plan
                                </button>
                            </article>
                        ))}
                    </div>
                </div>

                {isSwipeable && (
                    <div className={styles.swipeControls}>
                        <button
                            className={styles.navButton}
                            onClick={prev}
                            disabled={activeOnlineIndex === 0}
                        >
                            <ChevronLeft />
                        </button>
                        <div className={styles.dots}>
                            {currentPlans.map((_, i) => (
                                <button
                                    key={i}
                                    className={`${styles.dot} ${i === activeOnlineIndex ? styles.dotActive : ''}`}
                                    onClick={() => scrollToIndex(i)}
                                />
                            ))}
                        </div>
                        <button
                            className={styles.navButton}
                            onClick={next}
                            disabled={activeOnlineIndex === currentPlans.length - 1}
                        >
                            <ChevronRight />
                        </button>
                    </div>
                )}
            </div>
        </section>
    )
}
