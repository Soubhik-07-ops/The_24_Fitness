'use client'

import { motion } from 'framer-motion'
import { useInView } from 'framer-motion'
import { useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Sparkles, Calendar, Phone, MapPin, Clock } from 'lucide-react'
import styles from './CTASection.module.css'

export default function CTASection() {
    const ref = useRef(null)
    const isInView = useInView(ref, { once: true, margin: '-100px' })
    const router = useRouter()

    const features = [
        {
            icon: Clock,
            title: '24/7 Access',
            description: 'Work out on your schedule, anytime day or night'
        },
        {
            icon: Calendar,
            title: 'Free Trial',
            description: '7-day free trial to experience everything'
        },
        {
            icon: Phone,
            title: 'Expert Support',
            description: 'Certified trainers available to help you'
        },
        {
            icon: MapPin,
            title: 'Prime Location',
            description: 'Easy access with ample parking space'
        }
    ]

    return (
        <section ref={ref} className={styles.cta}>
            {/* Background Elements */}
            <div className={styles.backgroundElements}>
                <div className={styles.floatingElement + ' ' + styles.element1}></div>
                <div className={styles.floatingElement + ' ' + styles.element2}></div>
                <div className={styles.floatingElement + ' ' + styles.element3}></div>
            </div>

            <div className={styles.container}>
                <div className={styles.content}>
                    <motion.div
                        className={styles.badge}
                        initial={{ opacity: 0, y: 30 }}
                        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                        transition={{ duration: 0.8 }}
                    >
                        <span className={styles.badgeText}>Limited Time Offer</span>
                    </motion.div>

                    <motion.h2
                        className={styles.title}
                        initial={{ opacity: 0, y: 30 }}
                        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                    >
                        Start Your <span className={styles.gradientText}>Transformation</span>{' '}
                        Today
                    </motion.h2>

                    <motion.p
                        className={styles.subtitle}
                        initial={{ opacity: 0, y: 30 }}
                        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                        transition={{ duration: 0.8, delay: 0.4 }}
                    >
                        Join thousands of members who have transformed their lives.
                        Your fitness journey starts with a single step. Let's take it together.
                    </motion.p>

                    <motion.div
                        className={styles.buttons}
                        initial={{ opacity: 0, y: 30 }}
                        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                        transition={{ duration: 0.8, delay: 0.6 }}
                    >
                        <button
                            className={styles.primaryButton}
                            onClick={() => router.push('/membership')}
                        >
                            Join Now
                            <ArrowRight size={20} />
                        </button>
                        <button
                            className={styles.secondaryButton}
                            onClick={() => router.push('/features')}
                        >
                            <Sparkles size={20} />
                            Explore Features
                        </button>
                    </motion.div>

                    <motion.div
                        className={styles.features}
                        initial={{ opacity: 0, y: 30 }}
                        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                        transition={{ duration: 0.8, delay: 0.8 }}
                    >
                        {features.map((feature, index) => (
                            <div key={feature.title} className={styles.feature}>
                                <div className={styles.featureIcon}>
                                    <feature.icon size={20} />
                                </div>
                                <div className={styles.featureTitle}>{feature.title}</div>
                                <div className={styles.featureDescription}>{feature.description}</div>
                            </div>
                        ))}
                    </motion.div>
                </div>
            </div>
        </section>
    )
}