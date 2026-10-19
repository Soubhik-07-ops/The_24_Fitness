'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useInView } from 'framer-motion'
import { Check, Star, ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import styles from './MembershipPlans.module.css'

interface Plan {
    id: string
    name: string
    planType: 'online' | 'in_gym'
    price: number
    duration: string
    features: string[]
    popular?: boolean
    gender?: 'boys' | 'girls'
    firstPayment?: number
    monthlyFee?: number
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

// Regular Plans (In-Gym Monthly Plans)
const regularBoysPlan: Plan = {
    id: 'regular_boys_monthly',
    name: 'Regular Monthly',
    planType: 'in_gym',
    price: 1200, // First payment: includes 1 month + admission
    firstPayment: 1200,
    monthlyFee: 650,
    duration: 'Monthly',
    gender: 'boys',
    features: [
        '24/6 Gym Access',
        'All Equipment Access',
        'Locker Facility',
        'Monthly Renewal',
        'No Long-term Commitment'
    ],
    popular: false
}

const regularGirlsPlan: Plan = {
    id: 'regular_girls_monthly',
    name: 'Regular Monthly',
    planType: 'in_gym',
    price: 1400, // First payment: includes 1 month + admission
    firstPayment: 1400,
    monthlyFee: 700,
    duration: 'Monthly',
    gender: 'girls',
    features: [
        '24/6 Gym Access',
        'All Equipment Access',
        'Locker Facility',
        'Monthly Renewal',
        'No Long-term Commitment'
    ],
    popular: false
}

export default function MembershipPlans() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const ref = useRef<HTMLElement | null>(null)
    const onlineGridRef = useRef<HTMLDivElement>(null)
    const regularGridRef = useRef<HTMLDivElement>(null)
    const isInView = useInView(ref, { once: true, margin: '-100px' })

    const SWITCH_WIDTH = 1024
    const [isSwipeable, setIsSwipeable] = useState(false)
    const [activeOnlineIndex, setActiveOnlineIndex] = useState(0)
    const [activeRegularIndex, setActiveRegularIndex] = useState(0)
    const hasUserManuallyToggledGender = useRef(false)

    const [selectedGender, setSelectedGender] = useState<'boys' | 'girls'>(() => {
        if (typeof window !== 'undefined') {
            const urlG = new URLSearchParams(window.location.search).get('gender')?.toLowerCase()
            if (urlG === 'girls' || urlG === 'female') return 'girls'
            if (urlG === 'boys' || urlG === 'male') return 'boys'
            const saved = sessionStorage.getItem('the24_selected_gender')
            if (saved === 'girls' || saved === 'boys') return saved
        }
        return 'boys'
    })
    const [userMembership, setUserMembership] = useState<any>(null)
    const [hasPendingPayment, setHasPendingPayment] = useState<boolean>(false)
    const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true)
    const [userGender, setUserGender] = useState<'boys' | 'girls'>('boys')
    const [isMounted, setIsMounted] = useState<boolean>(false)

    const handleGenderSelect = (gender: 'boys' | 'girls') => {
        hasUserManuallyToggledGender.current = true
        setSelectedGender(gender)
        try {
            sessionStorage.setItem('the24_selected_gender', gender)
        } catch {}
    }

    const currentPlans = selectedGender === 'boys' ? boysPlans : girlsPlans
    const regularPlans: Plan[] = [regularBoysPlan, regularGirlsPlan]

    useEffect(() => {
        setIsMounted(true)
        const onResize = () => setIsSwipeable(window.innerWidth < SWITCH_WIDTH)
        onResize()
        window.addEventListener('resize', onResize)

        // Read cached membership from sessionStorage immediately upon mounting
        try {
            const cached = sessionStorage.getItem('the24_user_membership')
            if (cached) {
                setUserMembership(JSON.parse(cached))
                setIsAuthChecking(false)
            }
            if (sessionStorage.getItem('the24_has_pending_payment') === 'true') {
                setHasPendingPayment(true)
            }
        } catch {}

        return () => window.removeEventListener('resize', onResize)
    }, [])

    // Load authenticated user's current membership & profile (parallelized & cached)
    useEffect(() => {
        let isMounted = true
        const fetchUserMembership = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession()
                if (!session?.user) {
                    if (isMounted) {
                        setUserMembership(null)
                        setHasPendingPayment(false)
                        setIsAuthChecking(false)
                    }
                    try {
                        sessionStorage.removeItem('the24_user_membership')
                        sessionStorage.removeItem('the24_has_pending_payment')
                    } catch {}
                    return
                }

                // Query profile & memberships concurrently with Promise.all to eliminate waterfall delay
                const [profileRes, membershipsRes] = await Promise.all([
                    supabase
                        .from('profiles')
                        .select('gender')
                        .eq('id', session.user.id)
                        .maybeSingle(),
                    supabase
                        .from('memberships')
                        .select('*')
                        .eq('user_id', session.user.id)
                        .order('created_at', { ascending: false })
                ])

                if (!isMounted) return

                const memberships = membershipsRes.data
                let detectedGender: 'boys' | 'girls' = 'boys'
                if (profileRes.data?.gender) {
                    const g = profileRes.data.gender.toLowerCase()
                    detectedGender = (g === 'female' || g === 'girls' || g === 'f') ? 'girls' : 'boys'
                } else if (memberships && memberships.length > 0) {
                    const latestMem = memberships[0]
                    const fg = (latestMem.form_data?.gender || '').toLowerCase()
                    const pName = (latestMem.plan_name || '').toLowerCase()
                    if (fg === 'female' || fg === 'girls' || fg === 'f' || pName.includes('girls') || pName.includes('girl') || [700, 1400, 2400, 4400, 7800].includes(latestMem.price)) {
                        detectedGender = 'girls'
                    }
                } else if (session.user?.user_metadata?.gender) {
                    const ug = (session.user.user_metadata.gender || '').toLowerCase()
                    if (ug === 'female' || ug === 'girls' || ug === 'f') {
                        detectedGender = 'girls'
                    }
                }
                setUserGender(detectedGender)
                if (!hasUserManuallyToggledGender.current) {
                    const urlG = searchParams?.get('gender')?.toLowerCase()
                    const saved = typeof window !== 'undefined' ? sessionStorage.getItem('the24_selected_gender') : null
                    if (!urlG && !saved) {
                        setSelectedGender(detectedGender)
                    }
                }
                if (!membershipsRes.error && memberships && memberships.length > 0) {
                    const currentSub = memberships.find(m => m.status === 'active' || m.status === 'approved')
                        || memberships.find(m => m.status === 'grace_period')
                        || memberships.find(m => m.status === 'pending')
                        || memberships[0]

                    setUserMembership(currentSub)
                    try {
                        sessionStorage.setItem('the24_user_membership', JSON.stringify(currentSub))
                    } catch {}

                    if (currentSub) {
                        const { data: pendingPayments } = await supabase
                            .from('membership_payments')
                            .select('id')
                            .eq('membership_id', currentSub.id)
                            .eq('status', 'pending')
                            .limit(1)

                        if (isMounted && pendingPayments && pendingPayments.length > 0) {
                            setHasPendingPayment(true)
                            try { sessionStorage.setItem('the24_has_pending_payment', 'true') } catch {}
                        } else if (isMounted) {
                            setHasPendingPayment(false)
                            try { sessionStorage.setItem('the24_has_pending_payment', 'false') } catch {}
                        }
                    }
                } else if (isMounted) {
                    setUserMembership(null)
                    try { sessionStorage.removeItem('the24_user_membership') } catch {}
                }
            } catch (err) {
                console.warn('[MembershipPlans] Error loading user membership:', err)
            } finally {
                if (isMounted) {
                    setIsAuthChecking(false)
                }
            }
        }

        void fetchUserMembership()
        return () => { isMounted = false }
    }, [])

    // Identify if a plan card matches the member's current active membership
    const isMatchingActivePlan = (plan: Plan): boolean => {
        if (!userMembership) return false
        if (userMembership.status !== 'active' && userMembership.status !== 'approved') return false

        const memPlan = (userMembership.plan_name || '').toLowerCase()
        const memType = (userMembership.plan_type || '').toLowerCase()

        if (plan.planType === 'in_gym') {
            const isMemRegular = memPlan.includes('regular') || memType === 'in_gym'
            const matchesGender = !plan.gender || plan.gender === userGender
            return isMemRegular && matchesGender
        } else {
            const planNameLower = plan.name.toLowerCase()
            const matchesName = memPlan.includes(planNameLower)
            const matchesGender = !plan.gender || plan.gender === userGender
            return matchesName && matchesGender
        }
    }

    // Server-authoritative eligibility computation
    const getEligibility = () => {
        if (!userMembership) {
            return {
                isRenewalEligible: false,
                isGracePeriod: false,
                isExpired: false,
                isPending: false,
                daysRemaining: 0
            }
        }

        const now = new Date()
        const endDateStr = userMembership.membership_end_date || userMembership.end_date
        const endDate = endDateStr ? new Date(endDateStr) : now
        const diffTime = endDate.getTime() - now.getTime()
        const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

        const graceEndStr = userMembership.grace_period_end
        const graceEnd = graceEndStr ? new Date(graceEndStr) : new Date(endDate.getTime() + 15 * 86400000)
        const isInGrace = daysRemaining < 0 && now <= graceEnd
        const isPastGrace = daysRemaining < 0 && now > graceEnd

        const isPending = userMembership.status === 'pending' || hasPendingPayment
        const isGrace = userMembership.status === 'grace_period' || isInGrace
        const isExpired = userMembership.status === 'expired' || isPastGrace
        const isRenewalEligible = (userMembership.status === 'active' && daysRemaining <= 15) || isGrace

        return {
            isRenewalEligible,
            isGracePeriod: isGrace,
            isExpired,
            isPending,
            daysRemaining
        }
    }

    // Determine button label, styling, and action based on exact eligibility
    const getButtonConfig = (plan: Plan) => {
        if (!isMounted || !userMembership) {
            if (!isMounted || isAuthChecking) {
                return {
                    text: 'Checking status...',
                    disabled: true,
                    className: styles.buttonDisabled,
                    actionType: 'loading'
                }
            }
            return {
                text: 'Select Plan',
                disabled: false,
                className: plan.popular ? styles.buttonPopular : plan.name === 'Basic' ? styles.buttonBasic : styles.buttonElite,
                actionType: 'initial'
            }
        }

        const isCurrent = isMatchingActivePlan(plan)
        const elig = getEligibility()

        if (elig.isPending) {
            return {
                text: 'Renewal Pending Approval',
                disabled: true,
                className: styles.buttonDisabled,
                actionType: 'pending'
            }
        }

        if (isCurrent) {
            if (elig.isExpired) {
                return {
                    text: 'Reactivate Plan',
                    disabled: false,
                    className: styles.buttonReactivate,
                    actionType: 'reactivate'
                }
            }
            if (elig.isGracePeriod) {
                return {
                    text: 'Renew Now (Grace Period)',
                    disabled: false,
                    className: styles.buttonRenew,
                    actionType: 'renew'
                }
            }
            if (elig.isRenewalEligible) {
                return {
                    text: 'Renew Now',
                    disabled: false,
                    className: styles.buttonRenew,
                    actionType: 'renew'
                }
            }
            // Active, not yet due for renewal (> 15 days)
            return {
                text: `Active Plan (${elig.daysRemaining}d left)`,
                disabled: true,
                className: styles.buttonDisabled,
                actionType: 'active'
            }
        } else {
            // Non-active plan card
            if (elig.isExpired) {
                return {
                    text: 'Switch & Reactivate',
                    disabled: false,
                    className: styles.buttonSwitch,
                    actionType: 'switch'
                }
            }
            if (elig.isRenewalEligible) {
                return {
                    text: 'Switch & Renew',
                    disabled: false,
                    className: styles.buttonSwitch,
                    actionType: 'switch'
                }
            }
            return {
                text: 'Current Plan Active',
                disabled: true,
                className: styles.buttonDisabled,
                actionType: 'locked'
            }
        }
    }

    const handleSelectPlan = async (plan: Plan) => {
        const btn = getButtonConfig(plan)
        if (btn.disabled || btn.actionType === 'loading') return

        const { data: { session } } = await supabase.auth.getSession()

        // New member initial registration path (preserved completely)
        if (!session || !userMembership) {
            const planPrice = plan.firstPayment || plan.price
            const params = new URLSearchParams({
                planId: plan.id,
                planType: plan.planType,
                planName: plan.name,
                price: planPrice.toString(),
                duration: plan.duration,
                gender: plan.gender || selectedGender
            })
            if (plan.monthlyFee) {
                params.set('monthlyFee', plan.monthlyFee.toString())
            }

            if (!session) {
                const redirectUrl = `/membership/form?${params.toString()}`
                router.push(`/signup?redirect=${encodeURIComponent(redirectUrl)}`)
                return
            }

            router.push(`/membership/form?${params.toString()}`)
            return
        }

        // Direct renewal / reactivation / plan switch path (NO re-registration)
        const renewalAmount = plan.monthlyFee || plan.price

        const params = new URLSearchParams({
            membershipId: userMembership.id.toString(),
            renewalType: 'membership',
            newPlanId: plan.id,
            newPlanName: plan.name,
            newPlanType: plan.planType,
            newDuration: plan.duration,
            newPrice: renewalAmount.toString(),
            gender: plan.gender || selectedGender
        })

        router.push(`/membership/payment?${params.toString()}`)
    }

    // Reset active index when gender changes
    useEffect(() => {
        setActiveOnlineIndex(0)
        setActiveRegularIndex(0)
        if (onlineGridRef.current) {
            onlineGridRef.current.scrollTo({ left: 0, behavior: 'smooth' })
        }
        if (regularGridRef.current) {
            regularGridRef.current.scrollTo({ left: 0, behavior: 'smooth' })
        }
    }, [selectedGender])

    const scrollToIndex = (idx: number) => {
        if (!onlineGridRef.current) return
        const cards = Array.from(onlineGridRef.current.querySelectorAll<HTMLElement>(`.${styles.planCard}`))
        const target = cards[idx]
        if (!target) return
        // More stable than manual offset math (avoids gap/scale rounding issues)
        target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
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

    const scrollToRegularIndex = (idx: number) => {
        if (!regularGridRef.current) return
        const cards = Array.from(regularGridRef.current.querySelectorAll<HTMLElement>(`.${styles.planCard}`))
        const target = cards[idx]
        if (!target) return
        // More stable than manual offset math (avoids gap/scale rounding issues)
        target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
        setActiveRegularIndex(idx)
    }

    // Track scroll position for regular plans
    useEffect(() => {
        if (!isSwipeable || !regularGridRef.current) return

        const handleScroll = () => {
            if (!regularGridRef.current) return
            const cards = Array.from(regularGridRef.current.querySelectorAll<HTMLElement>(`.${styles.planCard}`))
            if (cards.length === 0) return

            const scrollLeft = regularGridRef.current.scrollLeft
            const containerWidth = regularGridRef.current.clientWidth

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

            if (closestIndex !== activeRegularIndex) {
                setActiveRegularIndex(closestIndex)
            }
        }

        const grid = regularGridRef.current
        grid.addEventListener('scroll', handleScroll, { passive: true })

        const handleResize = () => {
            handleScroll()
        }
        window.addEventListener('resize', handleResize)

        return () => {
            grid.removeEventListener('scroll', handleScroll)
            window.removeEventListener('resize', handleResize)
        }
    }, [isSwipeable, activeRegularIndex])

    const nextRegular = () => {
        scrollToRegularIndex(Math.min(activeRegularIndex + 1, regularPlans.length - 1))
    }

    const prevRegular = () => {
        scrollToRegularIndex(Math.max(activeRegularIndex - 1, 0))
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
                        onClick={() => handleGenderSelect('boys')}
                    >
                        <Users size={18} />
                        Boys Plans
                    </button>
                    <button
                        className={`${styles.toggleButton} ${selectedGender === 'girls' ? styles.active : ''}`}
                        onClick={() => handleGenderSelect('girls')}
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
                        {currentPlans.map((plan, idx) => {
                            const isCurrentActive = isMatchingActivePlan(plan)
                            const btn = getButtonConfig(plan)
                            return (
                                <article
                                    key={plan.id}
                                    className={`${styles.planCard} ${plan.popular ? styles.planCardPopular : ''} ${isCurrentActive ? styles.planCardActive : ''}`}
                                >
                                    {isCurrentActive ? (
                                        <div className={styles.activeBadge}>
                                            <Check size={16} />
                                            Active Plan
                                        </div>
                                    ) : plan.popular ? (
                                        <div className={styles.popularBadge}>
                                            <Star size={16} fill="currentColor" />
                                            Most Popular
                                        </div>
                                    ) : null}
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
                                        suppressHydrationWarning
                                        className={`${styles.getStartedButton} ${btn.className}`}
                                        onClick={() => handleSelectPlan(plan)}
                                        disabled={btn.disabled}
                                    >
                                        {btn.text}
                                    </button>
                                </article>
                            )
                        })}
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

                {/* Regular Plans Section */}
                <motion.div
                    className={styles.regularSection}
                    initial={{ opacity: 0, y: 40 }}
                    animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
                    transition={{ duration: 0.8, delay: 0.4 }}
                >
                    <div className={styles.regularSectionHeader}>
                        <h3 className={styles.regularSectionTitle}>Regular Plans</h3>
                        <p className={styles.regularSectionSubtitle}>
                            Gym mein aakar workout karein. Monthly membership with flexible renewal.
                        </p>
                    </div>

                    <div className={styles.controlsRow}>
                        <div
                            ref={regularGridRef}
                            className={`${styles.regularPlansGrid} ${isSwipeable ? styles.swipeMode : styles.regularGridMode}`}
                        >
                            {regularPlans.map((plan) => {
                                const isCurrentActive = isMatchingActivePlan(plan)
                                const btn = getButtonConfig(plan)
                                return (
                                    <article
                                        key={plan.id}
                                        className={`${styles.planCard} ${styles.regularPlanCard} ${isCurrentActive ? styles.planCardActive : ''}`}
                                    >
                                        {isCurrentActive && (
                                            <div className={styles.activeBadge}>
                                                <Check size={16} />
                                                Active Plan
                                            </div>
                                        )}
                                        {/* Gender tag to remove ambiguity */}
                                        <div
                                            className={`${styles.genderBadge} ${plan.gender === 'boys' ? styles.boysBadge : styles.girlsBadge}`}
                                        >
                                            {plan.gender === 'boys' ? 'For Boys' : 'For Girls'}
                                        </div>
                                        <div className={styles.planHeader}>
                                            <h3 className={styles.planName}>{plan.name}</h3>
                                            <div className={styles.planPrice}>
                                                <span className={styles.price}>₹{plan.firstPayment?.toLocaleString()}</span>
                                            </div>
                                            <div className={styles.planDuration}>
                                                <div style={{ marginBottom: '0.5rem' }}>First Payment (Joining)</div>
                                                <div style={{ fontSize: '0.85rem', color: '#10b981', marginTop: '0.5rem' }}>
                                                    From 2nd Month: ₹{plan.monthlyFee?.toLocaleString()}/month
                                                </div>
                                            </div>
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
                                            suppressHydrationWarning
                                            className={`${styles.getStartedButton} ${btn.className}`}
                                            onClick={() => handleSelectPlan(plan)}
                                            disabled={btn.disabled}
                                        >
                                            {btn.text}
                                        </button>
                                    </article>
                                )
                            })}
                        </div>
                    </div>

                    {isSwipeable && (
                        <div className={styles.swipeControls}>
                            <button
                                className={styles.navButton}
                                onClick={prevRegular}
                                disabled={activeRegularIndex === 0}
                            >
                                <ChevronLeft />
                            </button>
                            <div className={styles.dots}>
                                {regularPlans.map((_, i) => (
                                    <button
                                        key={i}
                                        className={`${styles.dot} ${i === activeRegularIndex ? styles.dotActive : ''}`}
                                        onClick={() => scrollToRegularIndex(i)}
                                    />
                                ))}
                            </div>
                            <button
                                className={styles.navButton}
                                onClick={nextRegular}
                                disabled={activeRegularIndex === regularPlans.length - 1}
                            >
                                <ChevronRight />
                            </button>
                        </div>
                    )}
                </motion.div>
            </div>
        </section>
    )
}
