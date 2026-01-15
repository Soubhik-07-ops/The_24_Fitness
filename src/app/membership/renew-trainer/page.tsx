/**
 * Trainer Renewal Page
 * 
 * Allows users to renew their trainer access for an active membership.
 * Validates eligibility and guides through payment submission.
 */

'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Navbar from '@/components/Navbar/Navbar';
import Footer from '@/components/Footer/Footer';
import { checkTrainerRenewalEligibility, calculateMaxTrainerRenewalPeriod } from '@/lib/trainerRenewalEligibility';
import { getTrainerAccessStatus } from '@/lib/trainerAccess';
import { getTrainerGracePeriodDaysRemaining } from '@/lib/trainerGracePeriod';
import { Loader2, AlertCircle, CheckCircle, Clock, XCircle, User } from 'lucide-react';
import Toast from '@/components/Toast/Toast';
import { useToast } from '@/hooks/useToast';
import styles from './renew-trainer.module.css';

interface Trainer {
    id: string;
    name: string;
    price: number;
    photo_url?: string | null;
}

interface Membership {
    id: number;
    status: string;
    plan_name: string;
    membership_end_date: string | null;
    end_date: string | null;
    trainer_assigned: boolean;
    trainer_id: string | null;
    trainer_period_end: string | null;
    trainer_grace_period_end: string | null;
}

function RenewTrainerContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const membershipId = searchParams.get('membershipId');
    
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [membership, setMembership] = useState<Membership | null>(null);
    const [trainers, setTrainers] = useState<Trainer[]>([]);
    const [selectedTrainer, setSelectedTrainer] = useState<string | null>(null);
    const [selectedDuration] = useState<number>(1); // Fixed to 1 month only
    const [eligibility, setEligibility] = useState<any>(null);
    const [maxRenewalDays, setMaxRenewalDays] = useState<number | null>(null);
    const [hasPendingPayment, setHasPendingPayment] = useState(false);
    const [pendingPaymentError, setPendingPaymentError] = useState<string | null>(null);
    const { toast, toastType, showToast, hideToast } = useToast();

    useEffect(() => {
        const fetchData = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) {
                    router.push('/signup?redirect=' + encodeURIComponent(`/membership/renew-trainer?membershipId=${membershipId}`));
                    return;
                }

                if (!membershipId) {
                    showToast('Membership ID is required', 'error');
                    router.push('/dashboard');
                    return;
                }

                // Fetch membership
                const { data: membershipData, error: membershipError } = await supabase
                    .from('memberships')
                    .select('*')
                    .eq('id', membershipId)
                    .eq('user_id', session.user.id)
                    .single();

                if (membershipError || !membershipData) {
                    showToast('Membership not found or access denied', 'error');
                    router.push('/dashboard');
                    return;
                }

                setMembership(membershipData as Membership);

                // Check eligibility
                const membershipEndDate = membershipData.membership_end_date || membershipData.end_date;
                const eligibilityCheck = checkTrainerRenewalEligibility(
                    membershipData.status,
                    membershipEndDate
                );

                setEligibility(eligibilityCheck);

                if (!eligibilityCheck.isEligible) {
                    showToast(eligibilityCheck.reason || 'Not eligible for trainer renewal', 'error');
                    return;
                }

                // CRITICAL: Check for existing pending payments BEFORE allowing payment submission
                // This prevents bad UX where user fills form and then gets error
                const { data: existingPendingPayments, error: paymentCheckError } = await supabase
                    .from('membership_payments')
                    .select('id, created_at, amount')
                    .eq('membership_id', parseInt(membershipId || '0'))
                    .eq('status', 'pending');

                if (paymentCheckError) {
                    console.error('Error checking pending payments:', paymentCheckError);
                } else if (existingPendingPayments && existingPendingPayments.length > 0) {
                    // Block payment submission if pending payment exists
                    setHasPendingPayment(true);
                    setPendingPaymentError(
                        `A payment is already pending for this membership. Please wait for admin approval before submitting another payment.`
                    );
                    return; // Don't proceed with fetching trainers - show error instead
                }

                // No pending payment - proceed normally
                setHasPendingPayment(false);
                setPendingPaymentError(null);

                // Calculate max renewal period
                if (membershipEndDate) {
                    const maxPeriod = calculateMaxTrainerRenewalPeriod(membershipEndDate);
                    setMaxRenewalDays(maxPeriod.maxDays);
                }

                // Fetch available trainers
                const { data: trainersData, error: trainersError } = await supabase
                    .from('trainers')
                    .select('id, name, price, photo_url')
                    .eq('is_active', true)
                    .order('name');

                if (trainersError) {
                    console.error('Error fetching trainers:', trainersError);
                } else {
                    setTrainers(trainersData || []);
                    // Pre-select current trainer if exists
                    if (membershipData.trainer_id) {
                        setSelectedTrainer(membershipData.trainer_id);
                    }
                }

            } catch (error: any) {
                console.error('Error fetching data:', error);
                showToast('Error loading page: ' + error.message, 'error');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [membershipId, router]);

    // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
    const now = useMemo(() => new Date(), []);
    
    const trainerAccessStatus = useMemo(() => {
        if (!membership) return 'none' as const;
        return getTrainerAccessStatus(
            membership.trainer_assigned,
            membership.trainer_period_end,
            membership.trainer_grace_period_end,
            now
        );
    }, [membership?.trainer_assigned, membership?.trainer_period_end, membership?.trainer_grace_period_end, now]);

    // Calculate days remaining
    const daysRemaining = useMemo(() => {
        if (!membership?.trainer_grace_period_end) return null;
        return getTrainerGracePeriodDaysRemaining(
            membership.trainer_grace_period_end,
            now
        );
    }, [membership?.trainer_grace_period_end, now]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!membership || !selectedTrainer || !eligibility?.isEligible) return;

        setSubmitting(true);

        try {
            const selectedTrainerData = trainers.find(t => t.id === selectedTrainer);
            if (!selectedTrainerData) {
                showToast('Please select a trainer', 'error');
                setSubmitting(false);
                return;
            }

            const totalAmount = selectedTrainerData.price * selectedDuration;

            // Redirect to payment page with renewal parameters
            const params = new URLSearchParams({
                membershipId: membership.id.toString(),
                renewalType: 'trainer',
                trainerId: selectedTrainer,
                durationMonths: selectedDuration.toString(),
                amount: totalAmount.toString()
            });

            router.push(`/membership/payment?${params.toString()}`);
        } catch (error: any) {
            console.error('Error submitting renewal:', error);
            showToast('Error: ' + error.message, 'error');
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <>
                <Navbar />
                <div className={styles.container}>
                    <div className={styles.loading}>
                        <Loader2 size={32} className={styles.spinner} />
                        <p>Loading...</p>
                    </div>
                </div>
                <Footer />
            </>
        );
    }

    if (!membership) {
        return (
            <>
                <Navbar />
                <div className={styles.container}>
                    <div className={styles.error}>
                        <XCircle size={32} />
                        <p>Membership not found</p>
                    </div>
                </div>
                <Footer />
            </>
        );
    }

    if (!eligibility?.isEligible) {
        return (
            <>
                <Navbar />
                <div className={styles.container}>
                    <div className={styles.error}>
                        <AlertCircle size={32} />
                        <h2>Not Eligible for Trainer Renewal</h2>
                        <p>{eligibility?.reason || 'You are not eligible to renew trainer access at this time.'}</p>
                        <a href="/dashboard" className={styles.backButton}>Back to Dashboard</a>
                    </div>
                </div>
                <Footer />
            </>
        );
    }

    // Show error if pending payment exists (prevents bad UX - user sees error BEFORE filling form)
    if (hasPendingPayment) {
        return (
            <>
                <Navbar />
                <div className={styles.container}>
                    <div className={styles.error}>
                        <AlertCircle size={32} />
                        <h2>Payment Already Pending</h2>
                        <p>{pendingPaymentError || 'A payment is already pending for this membership. Please wait for admin approval before submitting another payment.'}</p>
                        <p style={{ marginTop: '1rem', fontSize: '0.875rem', opacity: 0.8 }}>
                            You can check your payment status in the Dashboard.
                        </p>
                        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                            <a href="/dashboard" className={styles.backButton}>Go to Dashboard</a>
                        </div>
                    </div>
                </div>
                <Footer />
            </>
        );
    }

    return (
        <>
            <Navbar />
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1>Renew Trainer Access</h1>
                    <p>Extend your trainer access period for your {membership.plan_name} membership</p>
                </div>

                {/* Current Status */}
                <div className={styles.statusCard}>
                    <h3>Current Trainer Access Status</h3>
                    <div className={styles.statusInfo}>
                        <div className={styles.statusItem}>
                            <span className={styles.statusLabel}>Status:</span>
                            <span className={styles.statusValue}>
                                {trainerAccessStatus === 'active' && (
                                    <>
                                        <CheckCircle size={16} style={{ color: '#10b981' }} />
                                        Active
                                    </>
                                )}
                                {trainerAccessStatus === 'grace_period' && (
                                    <>
                                        <Clock size={16} style={{ color: '#f59e0b' }} />
                                        Grace Period ({daysRemaining} days remaining)
                                    </>
                                )}
                                {trainerAccessStatus === 'expired' && (
                                    <>
                                        <XCircle size={16} style={{ color: '#dc2626' }} />
                                        Expired
                                    </>
                                )}
                            </span>
                        </div>
                        {membership.trainer_period_end && (
                            <div className={styles.statusItem}>
                                <span className={styles.statusLabel}>Period End:</span>
                                <span className={styles.statusValue}>
                                    {new Date(membership.trainer_period_end).toLocaleDateString()}
                                </span>
                            </div>
                        )}
                        {maxRenewalDays !== null && (
                            <div className={styles.statusItem}>
                                <span className={styles.statusLabel}>Max Renewal Period:</span>
                                <span className={styles.statusValue}>
                                    {Math.floor(maxRenewalDays / 30)} month(s) ({maxRenewalDays} days)
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Renewal Form */}
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.formSection}>
                        <label className={styles.label}>Select Trainer</label>
                        <div className={styles.trainerGrid}>
                            {trainers.map(trainer => (
                                <div
                                    key={trainer.id}
                                    className={`${styles.trainerCard} ${selectedTrainer === trainer.id ? styles.selected : ''}`}
                                    onClick={() => setSelectedTrainer(trainer.id)}
                                >
                                    {trainer.photo_url ? (
                                        <img src={trainer.photo_url} alt={trainer.name} className={styles.trainerPhoto} />
                                    ) : (
                                        <div className={styles.trainerPhotoPlaceholder}>
                                            <User size={24} />
                                        </div>
                                    )}
                                    <div className={styles.trainerInfo}>
                                        <div className={styles.trainerName}>{trainer.name}</div>
                                        <div className={styles.trainerPrice}>₹{trainer.price.toLocaleString()}/month</div>
                                    </div>
                                    {selectedTrainer === trainer.id && (
                                        <CheckCircle size={20} className={styles.checkIcon} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className={styles.formSection}>
                        <label className={styles.label}>Duration</label>
                        <div className={styles.durationInfo}>
                            <span className={styles.durationValue}>1 Month</span>
                            <p className={styles.helpText}>
                                Trainer renewal is available for 1 month only.
                            </p>
                        </div>
                        {/* Hidden input to maintain selectedDuration state */}
                        <input type="hidden" value={1} />
                    </div>

                    {/* Price Summary */}
                    {selectedTrainer && (
                        <div className={styles.priceSummary}>
                            <div className={styles.priceRow}>
                                <span>Trainer Fee ({selectedDuration} month{selectedDuration !== 1 ? 's' : ''})</span>
                                <span>₹{((trainers.find(t => t.id === selectedTrainer)?.price || 0) * selectedDuration).toLocaleString()}</span>
                            </div>
                            <div className={styles.priceTotal}>
                                <span>Total Amount</span>
                                <span>₹{((trainers.find(t => t.id === selectedTrainer)?.price || 0) * selectedDuration).toLocaleString()}</span>
                            </div>
                        </div>
                    )}

                    <div className={styles.formActions}>
                        <button
                            type="button"
                            onClick={() => router.back()}
                            className={styles.cancelButton}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className={styles.submitButton}
                            disabled={!selectedTrainer || submitting}
                        >
                            {submitting ? (
                                <>
                                    <Loader2 size={20} className={styles.spinner} />
                                    Processing...
                                </>
                            ) : (
                                'Continue to Payment'
                            )}
                        </button>
                    </div>
                </form>
            </div>
            <Toast message={toast} type={toastType} onClose={hideToast} />
            <Footer />
        </>
    );
}

export default function RenewTrainerPage() {
    return (
        <Suspense fallback={
            <>
                <Navbar />
                <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
                <Footer />
            </>
        }>
            <RenewTrainerContent />
        </Suspense>
    );
}

