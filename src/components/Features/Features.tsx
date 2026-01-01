'use client'

import { motion } from 'framer-motion'
import { useInView } from 'framer-motion'
import { useRef, useState, useEffect } from 'react'
import {
    Clock,
    Users,
    Dumbbell,
    Heart,
    Trophy,
    Shield,
    Zap,
    Activity,
    ChevronLeft,
    ChevronRight
} from 'lucide-react'
import styles from './Features.module.css'

const features = [
    {
        icon: Clock,
        title: '24/7 Smart Access',
        description: 'Biometric entry system with mobile app control. Work out whenever inspiration strikes.',
        color: 'iconContainerBlue'
    },
    {
        icon: Dumbbell,
        title: 'AI-Powered Equipment',
        description: 'Smart machines that track your progress and adjust resistance automatically.',
        color: 'iconContainerPurple'
    },
    {
        icon: Users,
        title: 'Elite Training Team',
        description: 'Certified experts with specialized training in strength, cardio, and rehabilitation.',
        color: 'iconContainerGreen'
    },
    {
        icon: Activity,
        title: 'Body Composition Scan',
        description: 'Advanced InBody scans to track muscle mass, body fat, and metabolic age.',
        color: 'iconContainerOrange'
    },
    {
        icon: Heart,
        title: 'Recovery Zone',
        description: 'Cryotherapy, massage chairs, and hydro-massage for optimal recovery.',
        color: 'iconContainerRed'
    },
    {
        icon: Trophy,
        title: 'Challenges & Community',
        description: 'Monthly fitness challenges with prizes and a supportive community.',
        color: 'iconContainerYellow'
    },
    {
        icon: Shield,
        title: 'Safety First',
        description: '24/7 security, emergency buttons, and certified staff always on site.',
        color: 'iconContainerGray'
    },
    {
        icon: Zap,
        title: 'Virtual Classes',
        description: 'Live-streamed and on-demand classes for when you cant make it in person.',
        color: 'iconContainerIndigo'
    }
]

export default function Features() {
    const ref = useRef(null)
    const isInView = useInView(ref, { once: true, margin: '-100px' })
    const gridRef = useRef<HTMLDivElement>(null)
    const [currentSlide, setCurrentSlide] = useState(0)
    const [isSwipeable, setIsSwipeable] = useState(false)

    const SWITCH_WIDTH = 1024

    useEffect(() => {
        const onResize = () => setIsSwipeable(window.innerWidth < SWITCH_WIDTH)
        onResize()
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [])

    const CARDS_PER_SLIDE = 2
    const totalSlides = Math.ceil(features.length / CARDS_PER_SLIDE)

    const scrollToIndex = (slideIndex: number) => {
        if (!gridRef.current) return
        const cards = Array.from(gridRef.current.querySelectorAll<HTMLElement>(`.${styles.featureCard}`))
        const cardIndex = slideIndex * CARDS_PER_SLIDE
        const target = cards[cardIndex]
        if (!target) return
        const scrollLeft = target.offsetLeft - (gridRef.current.clientWidth - target.clientWidth) / 2
        gridRef.current.scrollTo({
            left: scrollLeft,
            behavior: 'smooth'
        })
        setCurrentSlide(slideIndex)
    }

    const next = () => {
        const maxSlide = totalSlides - 1
        scrollToIndex(Math.min(currentSlide + 1, maxSlide))
    }

    const prev = () => {
        scrollToIndex(Math.max(currentSlide - 1, 0))
    }

    // Track scroll position to update active slide index
    useEffect(() => {
        if (!isSwipeable || !gridRef.current) return

        const handleScroll = () => {
            if (!gridRef.current) return
            const cards = Array.from(gridRef.current.querySelectorAll<HTMLElement>(`.${styles.featureCard}`))
            if (cards.length === 0) return

            const scrollLeft = gridRef.current.scrollLeft
            const containerWidth = gridRef.current.clientWidth

            // Find which card is most visible (first card of each slide)
            let closestCardIndex = 0
            let closestDistance = Infinity

            // Check only the first card of each slide (every 2nd card)
            for (let i = 0; i < cards.length; i += CARDS_PER_SLIDE) {
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

            // Convert card index to slide index
            const slideIndex = Math.floor(closestCardIndex / CARDS_PER_SLIDE)

            if (slideIndex !== currentSlide && slideIndex < totalSlides) {
                setCurrentSlide(slideIndex)
            }
        }

        const grid = gridRef.current
        grid.addEventListener('scroll', handleScroll, { passive: true })

        const handleResize = () => {
            handleScroll()
        }
        window.addEventListener('resize', handleResize)

        return () => {
            grid.removeEventListener('scroll', handleScroll)
            window.removeEventListener('resize', handleResize)
        }
    }, [isSwipeable, currentSlide, totalSlides])

    return (
        <section ref={ref} className={styles.features}>
            {/* Background Image */}
            <div className={styles.backgroundImage}></div>

            {/* Dark Overlay for Text Readability */}
            <div className={styles.overlay}></div>

            {/* Background Decoration */}
            <div className={styles.backgroundDecoration}>
                <div className={styles.decorationCircle + ' ' + styles.circle1}></div>
                <div className={styles.decorationCircle + ' ' + styles.circle2}></div>
            </div>

            <div className={styles.container}>
                <motion.div
                    className={styles.header}
                    initial={{ opacity: 0, y: 30 }}
                    animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                    transition={{ duration: 0.8 }}
                >
                    <h2 className={styles.title}>
                        <span className={styles.gradientText}>Revolutionary</span>{' '}
                        Fitness Experience
                    </h2>
                    <p className={styles.subtitle}>
                        We've reimagined everything about the gym experience with cutting-edge technology
                        and unparalleled member support.
                    </p>
                </motion.div>

                <div className={styles.carouselWrapper}>
                    <div
                        ref={gridRef}
                        className={`${styles.featuresGrid} ${isSwipeable ? styles.swipeMode : styles.gridMode}`}
                    >
                        {features.map((feature, index) => (
                            <motion.div
                                key={feature.title}
                                className={styles.featureCard}
                                initial={{ opacity: 0, y: 30 }}
                                animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                                transition={{ duration: 0.6, delay: index * 0.1 }}
                                whileHover={!isSwipeable ? { scale: 1.05 } : {}}
                            >
                                <div className={styles.featureContent}>
                                    <div className={`${styles.iconContainer} ${styles[feature.color]}`}>
                                        <feature.icon size={24} color="white" />
                                    </div>
                                    <h3 className={styles.featureTitle}>
                                        {feature.title}
                                    </h3>
                                    <p className={styles.featureDescription}>
                                        {feature.description}
                                    </p>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {isSwipeable && (
                        <div className={styles.swipeControls}>
                            <button
                                className={styles.navButton}
                                onClick={prev}
                                disabled={currentSlide === 0}
                                aria-label="Previous feature"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <div className={styles.dots}>
                                {Array.from({ length: totalSlides }).map((_, i) => (
                                    <button
                                        key={i}
                                        className={`${styles.dot} ${i === currentSlide ? styles.dotActive : ''}`}
                                        onClick={() => scrollToIndex(i)}
                                        aria-label={`Go to slide ${i + 1}`}
                                    />
                                ))}
                            </div>
                            <button
                                className={styles.navButton}
                                onClick={next}
                                disabled={currentSlide >= totalSlides - 1}
                                aria-label="Next feature"
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}