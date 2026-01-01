'use client'

import { motion } from 'framer-motion'
import { ArrowRight, Users, Star, Clock, Award } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import styles from './Hero.module.css'

const heroImages = [
    '/hero_section/img1.png',
    '/hero_section/img2.png',
    '/hero_section/img3.png'
]

export default function Hero() {
    const [currentImageIndex, setCurrentImageIndex] = useState(0)
    const router = useRouter()

    // Auto-slide images every 5 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentImageIndex((prevIndex) =>
                (prevIndex + 1) % heroImages.length
            )
        }, 5000)

        return () => clearInterval(interval)
    }, [])

    return (
        <section className={styles.hero}>
            {/* Image Carousel Background */}
            <div className={styles.imageCarousel}>
                {heroImages.map((image, index) => (
                    <div
                        key={index}
                        className={`${styles.carouselSlide} ${index === currentImageIndex ? styles.active : ''
                            }`}
                        style={{ backgroundImage: `url(${image})` }}
                    />
                ))}
                {/* Dark overlay for text readability */}
                <div className={styles.imageOverlay}></div>
            </div>

            {/* Background Elements */}
            <div className={styles.backgroundElements}>
                <div className={styles.orangeBlob}></div>
                <div className={styles.purpleBlob}></div>
            </div>

            {/* Carousel Indicators */}
            <div className={styles.carouselIndicators}>
                {heroImages.map((_, index) => (
                    <button
                        key={index}
                        className={`${styles.indicator} ${index === currentImageIndex ? styles.active : ''
                            }`}
                        onClick={() => setCurrentImageIndex(index)}
                        aria-label={`Go to slide ${index + 1}`}
                    />
                ))}
            </div>

            <div className={styles.container}>
                {/* Badge */}
                <motion.div
                    className={styles.badge}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                >
                    <Star size={16} color="#f97316" className={styles.badgeIcon} />
                    <span className={styles.badgeText}>#1 Rated Gym in Dhanbad</span>
                </motion.div>

                {/* Main Heading */}
                <motion.h1
                    className={styles.mainHeading}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                >
                    <span className={styles.gradientText}>THE 24</span>
                    <br />
                    FITNESS GYM
                </motion.h1>

                <motion.p
                    className={styles.subtitle}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.4 }}
                >
                    Transform your body, mind, and life at our premium{' '}
                    <span className={styles.highlight}>24 fitness sanctuary in Dhanbad</span>.
                    Where every hour is your hour to shine.
                </motion.p>

                {/* Stats */}
                <motion.div
                    className={styles.stats}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.6 }}
                >
                    <div className={styles.statItem}>
                        <Users className={styles.statIcon} size={24} color="#f97316" />
                        <div className={styles.statValue}>1924+</div>
                        <div className={styles.statLabel}>Happy Members</div>
                    </div>
                    <div className={styles.statItem}>
                        <Clock className={styles.statIcon} size={24} color="#f97316" />
                        <div className={styles.statValue}>24/6</div>
                        <div className={styles.statLabel}>Open Always</div>
                    </div>
                    <div className={styles.statItem}>
                        <Award className={styles.statIcon} size={24} color="#f97316" />
                        <div className={styles.statValue}>4+</div>
                        <div className={styles.statLabel}>Expert Trainers</div>
                    </div>
                </motion.div>

                {/* CTA Buttons */}
                <motion.div
                    className={styles.buttons}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.8 }}
                >
                    <button
                        className={styles.primaryButton}
                        onClick={() => router.push('/membership')}
                    >
                        View Plans
                        <ArrowRight className={styles.buttonIcon} size={18} />
                    </button>

                    <button
                        className={styles.secondaryButton}
                        onClick={() => router.push('/trainers')}
                    >
                        <Users className={styles.buttonIcon} size={18} />
                        Meet Trainers
                    </button>
                </motion.div>
            </div>
        </section>
    )
}