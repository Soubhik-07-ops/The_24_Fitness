'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import styles from './Trainers.module.css';
import Navbar from '@/components/Navbar/Navbar';
import Footer from '@/components/Footer/Footer';
import { User, Phone, Mail, Award, Monitor, Building2, Briefcase, FileText, Crown } from 'lucide-react';

interface GymOwner {
    id: string | null;
    full_name: string;
    photo_url: string | null;
    phone: string;
    email: string;
    bio: string;
    specialization: string;
    experience: string;
}

interface Trainer {
    id: string;
    name: string;
    phone: string;
    email: string;
    photo_url?: string | null;
    specialization?: string | null;
    bio?: string | null;
    online_training?: boolean;
    in_gym_training?: boolean;
}

export default function TrainersPage() {
    const [owner, setOwner] = useState<GymOwner | null>(null);
    const [trainers, setTrainers] = useState<Trainer[]>([]);
    const [loading, setLoading] = useState(true);
    const [ownerLoading, setOwnerLoading] = useState(true);

    const ownerRef = useRef(null);
    const trainersRef = useRef(null);
    const featuresRef = useRef(null);

    const ownerInView = useInView(ownerRef, { once: true, margin: '-100px' });
    const trainersInView = useInView(trainersRef, { once: true, margin: '-100px' });
    const featuresInView = useInView(featuresRef, { once: true, margin: '-100px' });

    useEffect(() => {
        const initialize = async () => {
            await Promise.all([fetchOwner(), fetchTrainers()]);
        };
        initialize();
    }, []);

    const fetchOwner = async () => {
        try {
            const response = await fetch('/api/gym-owner');
            const data = await response.json();
            if (response.ok && data.owner && data.owner.id !== null && data.owner.id !== undefined) {
                setOwner(data.owner);
            }
        } catch (error) {
            console.error('Error fetching owner:', error);
        } finally {
            setOwnerLoading(false);
        }
    };

    const fetchTrainers = async () => {
        try {
            const response = await fetch('/api/trainers');
            const data = await response.json();
            if (data.trainers) {
                setTrainers(data.trainers);
            } else {
                setTrainers([]);
            }
        } catch (error) {
            console.error('Error fetching trainers:', error);
            setTrainers([]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Navbar />
            <main className={styles.trainersPage}>
                {/* Background Image */}
                <div className={styles.backgroundImage}></div>

                {/* Dark Overlay for Text Readability */}
                <div className={styles.overlay}></div>

                <div className={styles.container}>
                    {/* Gym Owner Section */}
                    <section ref={ownerRef} className={styles.ownerSection}>
                        {ownerLoading ? (
                            <div className={styles.ownerLoading}>
                                <div className={styles.spinner}></div>
                                <p>Loading owner information...</p>
                            </div>
                        ) : owner && owner.id !== null && owner.id !== undefined ? (
                            <>
                                <motion.div
                                    className={styles.ownerHeader}
                                    initial={{ opacity: 0, y: 30 }}
                                    animate={ownerInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                                    transition={{ duration: 0.8 }}
                                >
                                    <Crown className={styles.ownerHeaderIcon} size={32} />
                                    <h2 className={styles.ownerSectionTitle}>
                                        Meet Our <span className={styles.highlight}>Gym Owner</span>
                                    </h2>
                                    <p className={styles.ownerSectionSubtitle}>
                                        The visionary behind our fitness community
                                    </p>
                                </motion.div>
                                <motion.div
                                    className={styles.ownerCard}
                                    initial={{ opacity: 0, y: 30 }}
                                    animate={ownerInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                                    transition={{ duration: 0.8, delay: 0.2 }}
                                >
                                    <div className={styles.ownerPhoto}>
                                        {owner.photo_url ? (
                                            <img src={owner.photo_url} alt={owner.full_name || 'Gym Owner'} />
                                        ) : (
                                            <div className={styles.photoPlaceholder}>
                                                <User size={64} />
                                            </div>
                                        )}
                                    </div>
                                    <div className={styles.ownerInfo}>
                                        <div className={styles.ownerNameSection}>
                                            <h1 className={styles.ownerName}>{owner.full_name || 'Gym Owner'}</h1>
                                            <div className={styles.ownerBadges}>
                                                {owner.specialization && (
                                                    <div className={styles.ownerBadge}>
                                                        <Award size={18} />
                                                        <span>{owner.specialization}</span>
                                                    </div>
                                                )}
                                                {owner.experience && (
                                                    <div className={styles.ownerBadge}>
                                                        <Briefcase size={18} />
                                                        <span>{owner.experience}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {owner.bio && (
                                            <div className={styles.ownerBio}>
                                                <div className={styles.bioHeader}>
                                                    <FileText size={20} />
                                                    <h3 className={styles.bioTitle}>About</h3>
                                                </div>
                                                <p>{owner.bio}</p>
                                            </div>
                                        )}

                                        <div className={styles.ownerContactSection}>
                                            <h3 className={styles.contactTitle}>Get In Touch</h3>
                                            <div className={styles.ownerContact}>
                                                {owner.phone && (
                                                    <a href={`tel:${owner.phone}`} className={styles.contactLink}>
                                                        <Phone size={20} />
                                                        <span>{owner.phone}</span>
                                                    </a>
                                                )}
                                                {owner.email && (
                                                    <a href={`mailto:${owner.email}`} className={styles.contactLink}>
                                                        <Mail size={20} />
                                                        <span>{owner.email}</span>
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            </>
                        ) : null}
                    </section>

                    {/* Trainers Section */}
                    <section ref={trainersRef} className={styles.trainersSection}>
                        <motion.div
                            className={styles.header}
                            initial={{ opacity: 0, y: 30 }}
                            animate={trainersInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                            transition={{ duration: 0.8 }}
                        >
                            <h1 className={styles.title}>
                                Meet Our <span className={styles.highlight}>Expert Trainers</span>
                            </h1>
                            <p className={styles.subtitle}>
                                Our certified and experienced trainers are here to guide you on your fitness journey.
                                Each trainer brings unique expertise, personalized training approaches, and a commitment
                                to helping you achieve your health and fitness goals. Whether you're looking for strength
                                training, cardio, flexibility, or specialized programs, our trainers are equipped to provide
                                the support and motivation you need.
                            </p>
                        </motion.div>

                        <div ref={featuresRef} className={styles.featuresSection}>
                            {[
                                {
                                    icon: Award,
                                    title: 'Certified Professionals',
                                    description: 'All our trainers hold recognized certifications and continuously update their knowledge with the latest fitness trends and techniques.'
                                },
                                {
                                    icon: Monitor,
                                    title: 'Flexible Training Options',
                                    description: 'Choose between in-gym training for hands-on guidance or online training for convenience and flexibility.'
                                },
                                {
                                    icon: Building2,
                                    title: 'Personalized Programs',
                                    description: 'Each trainer creates customized workout plans tailored to your fitness level, goals, and preferences.'
                                }
                            ].map((feature, index) => (
                                <motion.div
                                    key={feature.title}
                                    className={styles.featureBox}
                                    initial={{ opacity: 0, y: 30 }}
                                    animate={featuresInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                                    transition={{ duration: 0.6, delay: index * 0.1 }}
                                    whileHover={{ scale: 1.03, y: -5, transition: { duration: 0.15 } }}
                                >
                                    <feature.icon size={32} />
                                    <h3>{feature.title}</h3>
                                    <p>{feature.description}</p>
                                </motion.div>
                            ))}
                        </div>

                        {loading ? (
                            <div className={styles.loading}>
                                <div className={styles.spinner}></div>
                                <p>Loading trainers...</p>
                            </div>
                        ) : trainers.length === 0 ? (
                            <div className={styles.comingSoon}>
                                <h2>No Trainers Available</h2>
                                <p>Check back soon for our expert trainers!</p>
                            </div>
                        ) : (
                            <div className={styles.trainersGrid}>
                                {trainers.map((trainer, index) => (
                                    <motion.div
                                        key={trainer.id}
                                        className={styles.trainerCard}
                                        initial={{ opacity: 0, y: 30 }}
                                        animate={trainersInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                                        transition={{ duration: 0.6, delay: index * 0.1 }}
                                        whileHover={{ scale: 1.02, y: -5, transition: { duration: 0.15 } }}
                                    >
                                        <div className={styles.trainerHeader}>
                                            <div className={styles.trainerPhoto}>
                                                {trainer.photo_url ? (
                                                    <img src={trainer.photo_url} alt={trainer.name} />
                                                ) : (
                                                    <div className={styles.trainerIcon}>
                                                        <User size={32} />
                                                    </div>
                                                )}
                                            </div>
                                            <div className={styles.trainerTitleSection}>
                                                <h3 className={styles.trainerName}>{trainer.name}</h3>
                                                {trainer.specialization && (
                                                    <div className={styles.trainerSpecialization}>
                                                        <Award size={16} />
                                                        <span>{trainer.specialization}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {trainer.bio && (
                                            <div className={styles.trainerBio}>
                                                <h4 className={styles.bioLabel}>About</h4>
                                                <p>{trainer.bio}</p>
                                            </div>
                                        )}

                                        <div className={styles.trainerInfo}>
                                            <h4 className={styles.infoLabel}>Contact Information</h4>
                                            <div className={styles.infoItems}>
                                                <a href={`tel:${trainer.phone}`} className={styles.infoItem}>
                                                    <Phone size={18} />
                                                    <span>{trainer.phone}</span>
                                                </a>
                                                {trainer.email && (
                                                    <a href={`mailto:${trainer.email}`} className={styles.infoItem}>
                                                        <Mail size={18} />
                                                        <span>{trainer.email}</span>
                                                    </a>
                                                )}
                                            </div>
                                        </div>

                                        <div className={styles.trainerServices}>
                                            <h4 className={styles.servicesLabel}>Training Options</h4>
                                            <div className={styles.servicesList}>
                                                {trainer.online_training && (
                                                    <span className={styles.serviceTag}>
                                                        <Monitor size={14} />
                                                        Online Training
                                                    </span>
                                                )}
                                                {trainer.in_gym_training && (
                                                    <span className={styles.serviceTag}>
                                                        <Building2 size={14} />
                                                        In-Gym Training
                                                    </span>
                                                )}
                                                {!trainer.online_training && !trainer.in_gym_training && (
                                                    <span className={styles.serviceTag}>Training Available</span>
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </main>
            <Footer />
        </>
    );
}