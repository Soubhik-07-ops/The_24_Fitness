'use client';

import { motion } from 'framer-motion';
import { Dumbbell } from 'lucide-react';
import styles from './ComingSoon.module.css';

export default function ComingSoonPage() {
    return (
        <div className={styles.container}>
            {/* Background Elements */}
            <div className={styles.backgroundElements}>
                <div className={styles.orangeBlob}></div>
                <div className={styles.purpleBlob}></div>
            </div>

            {/* Main Content */}
            <div className={styles.content}>
                {/* Logo */}
                <motion.div
                    className={styles.logo}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8 }}
                >
                    <Dumbbell size={64} color="#f97316" />
                    <h1 className={styles.gymName}>THE 24 FITNESS GYM</h1>
                </motion.div>

                {/* Coming Soon Text */}
                <motion.div
                    className={styles.comingSoonContainer}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                >
                    <h2 className={styles.comingSoon}>COMING SOON</h2>
                    <div className={styles.underline}></div>
                </motion.div>

                {/* Subtitle */}
                <motion.p
                    className={styles.subtitle}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.4 }}
                >
                    We're going online for the first time!
                    <br />
                    Experience THE 24 FITNESS GYM from anywhere, anytime.
                    <br />
                    Stay tuned for our online launch!
                </motion.p>

                {/* Animated Dots */}
                <motion.div
                    className={styles.dots}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.6 }}
                >
                    <span className={styles.dot}></span>
                    <span className={styles.dot}></span>
                    <span className={styles.dot}></span>
                </motion.div>
            </div>
        </div>
    );
}

