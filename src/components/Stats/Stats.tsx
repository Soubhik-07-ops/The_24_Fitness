'use client'

import { motion } from 'framer-motion'
import { useInView } from 'framer-motion'
import { useRef } from 'react'
import styles from './Stats.module.css'

const stats = [
    { number: 1924, suffix: '+', label: 'Active Members' },
    { number: 24, suffix: '/6', label: 'Open Hours' },
    { number: 4, suffix: '+', label: 'Expert Trainers' },
    { number: 100, suffix: '%', label: 'Satisfaction Rate' }
]

export default function Stats() {
    const ref = useRef(null)
    const isInView = useInView(ref, { once: true, margin: '-100px' })

    return (
        <section ref={ref} className={styles.stats}>
            {/* Background Pattern */}
            <div className={styles.backgroundPattern}></div>

            {/* Floating Elements */}
            <div className={styles.floatingElement + ' ' + styles.floating1}></div>
            <div className={styles.floatingElement + ' ' + styles.floating2}></div>
            <div className={styles.floatingElement + ' ' + styles.floating3}></div>

            <div className={styles.container}>
                <div className={styles.statsGrid}>
                    {stats.map((stat, index) => (
                        <motion.div
                            key={stat.label}
                            className={styles.statItem}
                            initial={{ opacity: 0, y: 30 }}
                            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                            transition={{ duration: 0.6, delay: index * 0.1 }}
                        >
                            <motion.div
                                className={styles.statNumber}
                                initial={{ scale: 0 }}
                                animate={isInView ? { scale: 1 } : { scale: 0 }}
                                transition={{
                                    duration: 0.6,
                                    delay: index * 0.1 + 0.3,
                                    type: "spring",
                                    stiffness: 100
                                }}
                            >
                                {stat.number}
                                <span className={styles.statSuffix}>{stat.suffix}</span>
                            </motion.div>
                            <div className={styles.statLabel}>
                                {stat.label}
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    )
}