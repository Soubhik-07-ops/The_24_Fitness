'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Navbar from '@/components/Navbar/Navbar';
import Footer from '@/components/Footer/Footer';
import { Tag, Calendar, Sparkles, Loader2, MessageSquare } from 'lucide-react';
import styles from './offers.module.css';

interface Offer {
    id: number;
    title: string;
    description: string | null;
    discount_percentage: number | null;
    discount_amount: number | null;
    offer_type: string;
    image_url: string | null;
    start_date: string | null;
    end_date: string | null;
    priority: number;
    applicable_to: string;
    plan_name: string | null;
}

export default function OffersPage() {
    const [offers, setOffers] = useState<Offer[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchOffers();
    }, []);

    const fetchOffers = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/offers');

            if (!response.ok) {
                throw new Error('Failed to fetch offers');
            }

            const data = await response.json();
            setOffers(data.offers || []);
        } catch (error) {
            console.error('Error fetching offers:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return null;
        return new Date(dateString).toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const getOfferDisplay = (offer: Offer) => {
        if (offer.offer_type === 'percentage' && offer.discount_percentage) {
            return `${offer.discount_percentage}% OFF`;
        } else if (offer.offer_type === 'amount' && offer.discount_amount) {
            return `₹${offer.discount_amount.toLocaleString()} OFF`;
        } else if (offer.offer_type === 'free_trial') {
            return 'FREE TRIAL';
        }
        return offer.offer_type.toUpperCase();
    };

    if (loading) {
        return (
            <>
                <Navbar />
                <main className={styles.offersPage} style={{ paddingTop: '6rem' }}>
                    <div className={styles.backgroundImage}></div>
                    <div className={styles.overlay}></div>
                    <div className={styles.container}>
                        <div className={styles.loading}>
                            <Loader2 size={48} className={styles.spinner} />
                            <p>Loading offers...</p>
                        </div>
                    </div>
                </main>
                <Footer />
            </>
        );
    }

    return (
        <>
            <Navbar />
            <main className={styles.offersPage} style={{ paddingTop: '6rem' }}>
                {/* Background Image */}
                <div className={styles.backgroundImage}></div>

                {/* Dark Overlay for Text Readability */}
                <div className={styles.overlay}></div>

                <div className={styles.container}>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className={styles.header}
                    >
                        <h1 className={styles.title}>Special Offers</h1>
                        <p className={styles.subtitle}>
                            Don't miss out on these amazing deals and promotions!
                        </p>
                    </motion.div>

                    {offers.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.2 }}
                            className={styles.emptyState}
                        >
                            <Tag size={64} />
                            <h2>No Offers Available</h2>
                            <p>Check back soon for exciting offers and promotions!</p>
                        </motion.div>
                    ) : (
                        <div className={styles.offersGrid}>
                            {offers.map((offer, index) => (
                                <motion.div
                                    key={offer.id}
                                    initial={{ opacity: 0, y: 30 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5, delay: index * 0.1 }}
                                    className={styles.offerCard}
                                >
                                    {offer.image_url && (
                                        <div className={styles.offerImage}>
                                            <img src={offer.image_url} alt={offer.title} />
                                        </div>
                                    )}
                                    <div className={styles.offerContent}>
                                        <div className={styles.offerHeader}>
                                            <div className={styles.offerBadge}>
                                                <Tag size={18} />
                                                {getOfferDisplay(offer)}
                                            </div>
                                        </div>

                                        <h3 className={styles.offerTitle}>{offer.title}</h3>

                                        {offer.description && (
                                            <p className={styles.offerDescription}>{offer.description}</p>
                                        )}

                                        {(offer.start_date || offer.end_date) && (
                                            <div className={styles.offerDates}>
                                                <Calendar size={16} />
                                                <span>
                                                    {offer.start_date && formatDate(offer.start_date)}
                                                    {offer.start_date && offer.end_date && ' - '}
                                                    {offer.end_date && formatDate(offer.end_date)}
                                                </span>
                                            </div>
                                        )}

                                        {offer.applicable_to !== 'all' && (
                                            <div className={styles.offerApplicable}>
                                                <span>
                                                    {offer.applicable_to === 'new_members' && 'For New Members Only'}
                                                    {offer.applicable_to === 'existing_members' && 'For Existing Members Only'}
                                                    {offer.applicable_to === 'specific_plan' && offer.plan_name && `For ${offer.plan_name} Only`}
                                                </span>
                                            </div>
                                        )}

                                        <a href="/contact" className={styles.ctaButton}>
                                            <MessageSquare size={18} />
                                            Contact Admin for this Offer
                                        </a>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
            <Footer />
        </>
    );
}

