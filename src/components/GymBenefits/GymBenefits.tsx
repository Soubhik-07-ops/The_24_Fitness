'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import Toast from '@/components/Toast/Toast'
import { useToast } from '@/hooks/useToast'
import {
    Clock,
    Users,
    Dumbbell,
    Shield,
    Zap,
    Activity,
    Heart,
    Trophy,
    Calendar,
    Filter,
    X,
    ChevronRight,
    Maximize2,
    Info
} from 'lucide-react'
import styles from './GymBenefits.module.css'

// Core Benefits Data
const coreBenefits = [
    {
        icon: Clock,
        title: '24/7 Access',
        description: 'Train whenever you want with our smart access system. Your fitness journey never stops.',
        color: 'iconContainerBlue'
    },
    {
        icon: Users,
        title: 'Certified Trainers',
        description: 'Expert trainers with specialized certifications to guide your fitness journey.',
        color: 'iconContainerGreen'
    },
    {
        icon: Activity,
        title: 'Personalized Plans',
        description: 'Custom workout plans tailored to your goals, fitness level, and preferences.',
        color: 'iconContainerOrange'
    },
    {
        icon: Shield,
        title: 'Hygienic Environment',
        description: 'State-of-the-art cleaning protocols ensuring a safe and clean workout space.',
        color: 'iconContainerPurple'
    },
    {
        icon: Heart,
        title: 'Recovery Zone',
        description: 'Dedicated recovery facilities including massage chairs and relaxation areas.',
        color: 'iconContainerRed'
    },
    {
        icon: Trophy,
        title: 'Community Support',
        description: 'Join a vibrant community of fitness enthusiasts and stay motivated together.',
        color: 'iconContainerYellow'
    }
]

// Equipment Data (static for now, can be extended to fetch from DB)
const equipments = [
    {
        name: 'Treadmills',
        description: 'Premium cardio machines with advanced tracking',
        category: 'Cardio',
        image: '/Equipment/trademill.jpg'
    },
    {
        name: 'Weight Machines',
        description: 'Full range of strength training equipment',
        category: 'Strength',
        image: '/Equipment/Weight_Machines.jpg'
    },
    {
        name: 'Free Weights',
        description: 'Dumbbells, barbells, and kettlebells',
        category: 'Strength',
        image: '/Equipment/Free_Weights.jpg'
    },
    {
        name: 'Rowing Machines',
        description: 'Full-body cardio and strength training',
        category: 'Cardio',
        image: '/Equipment/Rowing_Machines.jpg'
    },
    {
        name: 'Ellipticals',
        description: 'Low-impact cardio equipment',
        category: 'Cardio',
        image: '/Equipment/Ellipticals.jpg'
    },
    {
        name: 'Cable Machines',
        description: 'Versatile functional training stations',
        category: 'Functional',
        image: '/Equipment/Cable_Machines.jpg'
    },
    {
        name: 'Smith Machines',
        description: 'Safe barbell training with guided motion',
        category: 'Strength',
        image: '/Equipment/Smith_Machines.jpg'
    },
    {
        name: 'Yoga Mats & Equipment',
        description: 'Complete yoga and stretching area',
        category: 'Flexibility',
        image: '/Equipment/Yoga_Mats_&_Equipment.jpg'
    }
]

interface Class {
    id: number
    name: string
    description: string
    schedule: string
    duration_minutes: number
    max_capacity: number
    current_bookings?: number
    category?: string
    image_url?: string
}

export default function GymBenefits() {
    const [classes, setClasses] = useState<Class[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedEquipment, setSelectedEquipment] = useState<typeof equipments[0] | null>(null)
    const { toast, toastType, showToast, hideToast } = useToast()
    const router = useRouter()

    const heroRef = useRef(null)
    const benefitsRef = useRef(null)
    const classesRef = useRef(null)
    const equipmentRef = useRef(null)

    const heroInView = useInView(heroRef, { once: true, margin: '-100px' })
    const benefitsInView = useInView(benefitsRef, { once: true, margin: '-100px' })
    const classesInView = useInView(classesRef, { once: true, margin: '-100px' })
    const equipmentInView = useInView(equipmentRef, { once: true, margin: '-100px' })

    useEffect(() => {
        fetchClasses()
    }, [])

    const fetchClasses = async () => {
        try {
            setLoading(true)
            const { data: classesData, error: classesError } = await supabase
                .from('classes')
                .select('*')
                .order('schedule', { ascending: true })

            if (classesError) throw classesError

            const classesNormalized = (classesData || []).map((classItem) => ({
                ...classItem,
                id: Number(classItem.id),
                category: classItem.category || 'General'
            }))

            setClasses(classesNormalized)
        } catch (error: any) {
            console.error('Error fetching classes:', error.message)
        } finally {
            setLoading(false)
        }
    }

    const handleViewClassDetails = (classId: number) => {
        router.push(`/classes/${classId}`)
    }

    // Show all classes without filtering
    const filteredClasses = classes

    const formatSchedule = (schedule: string) => {
        try {
            const date = new Date(schedule)
            return date.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })
        } catch {
            return schedule
        }
    }

    return (
        <div className={styles.gymBenefits}>
            {/* Hero Section */}
            <section ref={heroRef} className={styles.hero}>
                <div className={styles.backgroundDecoration}>
                    <div className={styles.decorationCircle + ' ' + styles.circle1}></div>
                    <div className={styles.decorationCircle + ' ' + styles.circle2}></div>
                </div>
                <div className={styles.heroContainer}>
                    <motion.div
                        className={styles.heroContent}
                        initial={{ opacity: 0, y: 30 }}
                        animate={heroInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                        transition={{ duration: 0.8 }}
                    >
                        <h1 className={styles.heroTitle}>
                            Discover the Power of <span className={styles.gradientText}>The 24 Fitness Gym</span>
                        </h1>
                        <p className={styles.heroSubtitle}>
                            Train smarter, recover better, and unlock your full potential with world-class facilities and expert trainers.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* Classes & Programs Section */}
            <section ref={classesRef} className={styles.classesSection}>
                <div className={styles.container}>
                    <motion.div
                        className={styles.sectionHeader}
                        initial={{ opacity: 0, y: 30 }}
                        animate={classesInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                        transition={{ duration: 0.8 }}
                    >
                        <h2 className={styles.sectionTitle}>
                            Classes & <span className={styles.gradientText}>Programs</span>
                        </h2>
                        <p className={styles.sectionSubtitle}>
                            Join our diverse range of fitness classes designed for all levels
                        </p>
                    </motion.div>

                    {/* Classes Grid */}
                    {loading ? (
                        <div className={styles.loadingContainer}>
                            <div className={styles.loader}></div>
                            <p>Loading classes...</p>
                        </div>
                    ) : filteredClasses.length === 0 ? (
                        <div className={styles.emptyState}>
                            <p>No classes available in this category.</p>
                        </div>
                    ) : (
                        <div className={styles.classesGrid}>
                            {filteredClasses.map((classItem, index) => (
                                <motion.div
                                    key={classItem.id}
                                    className={styles.classCard}
                                    initial={{ opacity: 0, y: 30 }}
                                    animate={classesInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                                    transition={{ duration: 0.6, delay: index * 0.1 }}
                                    whileHover={{ scale: 1.03, y: -5, transition: { duration: 0.15 } }}
                                >
                                    <div className={styles.classImage}>
                                        {classItem.image_url ? (
                                            <img
                                                src={classItem.image_url}
                                                alt={classItem.name}
                                                className={styles.classImageImg}
                                            />
                                        ) : (
                                            <div className={styles.classImagePlaceholder}>
                                                <Activity size={48} color="#f97316" />
                                            </div>
                                        )}
                                        {classItem.category && (
                                            <span className={styles.classCategory}>{classItem.category}</span>
                                        )}
                                    </div>
                                    <div className={styles.classContent}>
                                        <div className={styles.classContentTop}>
                                            <h3 className={styles.classTitle}>{classItem.name}</h3>
                                            <p className={styles.classDescription}>
                                                {classItem.description || 'Join this amazing fitness class!'}
                                            </p>
                                            <div className={styles.classDetails}>
                                                <div className={styles.classDetailItem}>
                                                    <Calendar size={16} />
                                                    <span>{formatSchedule(classItem.schedule)}</span>
                                                </div>
                                                <div className={styles.classDetailItem}>
                                                    <Clock size={16} />
                                                    <span>{classItem.duration_minutes} min</span>
                                                </div>
                                                <div className={styles.classDetailItem}>
                                                    <Users size={16} />
                                                    <span>
                                                        Max Capacity: {classItem.max_capacity}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleViewClassDetails(classItem.id)}
                                            className={styles.detailsButton}
                                        >
                                            Class Details
                                            <Info size={18} />
                                        </button>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {/* Core Benefits Section */}
            <section ref={benefitsRef} className={styles.benefitsSection}>
                <div className={styles.container}>
                    <motion.div
                        className={styles.sectionHeader}
                        initial={{ opacity: 0, y: 30 }}
                        animate={benefitsInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                        transition={{ duration: 0.8 }}
                    >
                        <h2 className={styles.sectionTitle}>
                            Core <span className={styles.gradientText}>Benefits</span>
                        </h2>
                        <p className={styles.sectionSubtitle}>
                            Everything you need to achieve your fitness goals
                        </p>
                    </motion.div>

                    <div className={styles.benefitsGrid}>
                        {coreBenefits.map((benefit, index) => (
                            <motion.div
                                key={benefit.title}
                                className={styles.benefitCard}
                                initial={{ opacity: 0, y: 30 }}
                                animate={benefitsInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                                transition={{ duration: 0.6, delay: index * 0.1 }}
                                whileHover={{ scale: 1.05, y: -8, transition: { duration: 0.15 } }}
                            >
                                <div className={styles.benefitContent}>
                                    <div className={`${styles.iconContainer} ${styles[benefit.color]}`}>
                                        <benefit.icon size={24} color="white" />
                                    </div>
                                    <h3 className={styles.benefitTitle}>{benefit.title}</h3>
                                    <p className={styles.benefitDescription}>{benefit.description}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Equipment & Facilities Section */}
            <section ref={equipmentRef} className={styles.equipmentSection}>
                <div className={styles.container}>
                    <motion.div
                        className={styles.sectionHeader}
                        initial={{ opacity: 0, y: 30 }}
                        animate={equipmentInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                        transition={{ duration: 0.8 }}
                    >
                        <h2 className={styles.sectionTitle}>
                            Equipment & <span className={styles.gradientText}>Facilities</span>
                        </h2>
                        <p className={styles.sectionSubtitle}>
                            State-of-the-art equipment for every fitness goal
                        </p>
                    </motion.div>

                    <div className={styles.equipmentGrid}>
                        {equipments.map((equipment, index) => (
                            <motion.div
                                key={equipment.name}
                                className={styles.equipmentCard}
                                initial={{ opacity: 0, y: 30 }}
                                animate={equipmentInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                                transition={{ duration: 0.6, delay: index * 0.1 }}
                                whileHover={{ scale: 1.05, y: -8, transition: { duration: 0.15 } }}
                                onClick={() => setSelectedEquipment(equipment)}
                            >
                                <div className={styles.equipmentImage}>
                                    {equipment.image && equipment.image !== '/api/placeholder/300/200' ? (
                                        <img
                                            src={equipment.image}
                                            alt={equipment.name}
                                            className={styles.equipmentImageImg}
                                        />
                                    ) : (
                                        <div className={styles.equipmentImagePlaceholder}>
                                            <Dumbbell size={48} color="#f97316" />
                                        </div>
                                    )}
                                    <div className={styles.equipmentOverlay}>
                                        <Maximize2 size={24} color="white" />
                                    </div>
                                </div>
                                <div className={styles.equipmentContent}>
                                    <span className={styles.equipmentCategory}>{equipment.category}</span>
                                    <h3 className={styles.equipmentTitle}>{equipment.name}</h3>
                                    <p className={styles.equipmentDescription}>{equipment.description}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Equipment Modal */}
            {selectedEquipment && (
                <motion.div
                    className={styles.modalOverlay}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setSelectedEquipment(null)}
                >
                    <motion.div
                        className={styles.modalContent}
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            className={styles.modalClose}
                            onClick={() => setSelectedEquipment(null)}
                        >
                            <X size={24} />
                        </button>
                        <div className={styles.modalImage}>
                            {selectedEquipment.image && selectedEquipment.image !== '/api/placeholder/300/200' ? (
                                <img
                                    src={selectedEquipment.image}
                                    alt={selectedEquipment.name}
                                    className={styles.modalImageImg}
                                />
                            ) : (
                                <div className={styles.equipmentImagePlaceholder}>
                                    <Dumbbell size={64} color="#f97316" />
                                </div>
                            )}
                        </div>
                        <div className={styles.modalBody}>
                            <span className={styles.modalCategory}>{selectedEquipment.category}</span>
                            <h2 className={styles.modalTitle}>{selectedEquipment.name}</h2>
                            <p className={styles.modalDescription}>{selectedEquipment.description}</p>
                        </div>
                    </motion.div>
                </motion.div>
            )}
            <Toast message={toast} type={toastType} onClose={hideToast} />
        </div>
    )
}

