'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft, Loader2, AlertCircle, CheckCircle, Clock } from 'lucide-react'
import Navbar from '@/components/Navbar/Navbar'
import Footer from '@/components/Footer/Footer'
import Toast from '@/components/Toast/Toast'
import { useToast } from '@/hooks/useToast'
import { isInGracePeriod, getGracePeriodDaysRemaining } from '@/lib/gracePeriod'
import styles from './renew.module.css'

function RenewMembershipContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [loading, setLoading] = useState(true)
    const [membership, setMembership] = useState<any>(null)
    const [renewalPrice, setRenewalPrice] = useState<number>(0) // Renewal price (650 for boys, 700 for girls for regular monthly)
    const { toast, toastType, showToast, hideToast } = useToast()

    const membershipId = searchParams.get('membershipId')

    useEffect(() => {
        const fetchData = async () => {
            if (!membershipId) {
                showToast('Membership ID is required', 'error')
                setTimeout(() => router.push('/dashboard'), 2000)
                return
            }

            // Use current date
            const now = new Date();

            try {
                const { data: membershipData, error: membershipError } = await supabase
                    .from('memberships')
                    .select('*')
                    .eq('id', membershipId)
                    .single()

                if (membershipError || !membershipData) {
                    showToast('Membership not found', 'error')
                    setTimeout(() => router.push('/dashboard'), 2000)
                    return
                }

                // Verify membership is in grace period
                const endDate = membershipData.end_date || membershipData.membership_end_date;
                
                // Check if membership has expired (end_date has passed)
                const hasExpired = endDate ? new Date(endDate) <= now : false;
                
                // Check if membership is in grace period
                // Two scenarios:
                // 1. Status is 'grace_period' AND grace_period_end exists AND is in the future AND has expired
                // 2. Status is 'active' BUT has expired (for demo mode - cron job might not have run yet)
                //    In this case, we'll allow renewal but the backend will handle the transition
                const isInGracePeriodStatus = membershipData.status === 'grace_period';
                const hasValidGracePeriod = membershipData.grace_period_end && 
                    new Date(membershipData.grace_period_end) >= now;
                
                // Allow renewal if:
                // - Status is grace_period AND grace_period_end is valid AND has expired
                // OR
                // - Status is active BUT has expired (for demo mode - will transition on approval)
                const isInMembershipGracePeriod = hasExpired && (
                    (isInGracePeriodStatus && hasValidGracePeriod) ||
                    (membershipData.status === 'active' && hasExpired) // Allow if expired but status not updated yet (demo mode)
                );

                console.log('[RENEW] Grace period eligibility check:', {
                    membershipId: membershipData.id,
                    status: membershipData.status,
                    grace_period_end: membershipData.grace_period_end,
                    currentDate: now.toISOString(),
                    end_date: membershipData.end_date,
                    membership_end_date: membershipData.membership_end_date,
                    hasExpired,
                    isInGracePeriodStatus,
                    hasValidGracePeriod,
                    isEligible: isInMembershipGracePeriod
                });

                if (!isInMembershipGracePeriod) {
                    showToast('This membership is not eligible for renewal. Only memberships in grace period can be renewed.', 'error')
                    setTimeout(() => router.push('/dashboard'), 2000)
                    return
                }

                setMembership(membershipData)

                // Determine gender accurately
                let determinedGender: 'boys' | 'girls' = 'boys'
                const formDataGender = (membershipData.form_data?.gender || '').toLowerCase()
                const planNameLower = (membershipData.plan_name || '').toLowerCase()
                if (formDataGender === 'female' || formDataGender === 'f' || formDataGender === 'girls' || formDataGender === 'girl') {
                    determinedGender = 'girls'
                } else if (planNameLower.includes('girls') || planNameLower.includes('girl')) {
                    determinedGender = 'girls'
                } else if ([700, 1400, 2400, 4400, 7800].includes(membershipData.price)) {
                    determinedGender = 'girls'
                }

                // Determine renewal price across all plan types for boys and girls
                const isFemale = determinedGender === 'girls'
                let finalRenewalPrice = membershipData.price

                if (planNameLower.includes('elite')) {
                    finalRenewalPrice = isFemale ? 7800 : 6800
                } else if (planNameLower.includes('premium')) {
                    finalRenewalPrice = isFemale ? 4400 : 4000
                } else if (planNameLower.includes('basic')) {
                    finalRenewalPrice = isFemale ? 2400 : 2200
                } else {
                    // Regular Monthly
                    finalRenewalPrice = isFemale ? 700 : 650
                }

                console.log('[RENEWAL] Plan:', planNameLower, 'Gender:', determinedGender, 'Price:', finalRenewalPrice)
                setRenewalPrice(finalRenewalPrice)
            } catch (error: any) {
                console.error('Error fetching membership:', error)
                showToast('Error loading membership: ' + error.message, 'error')
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [membershipId, router])

    // Use the EXACT same calculation logic as Dashboard
    // IMPORTANT: These hooks must be called BEFORE any conditional returns
    const now = useMemo(() => new Date(), []);
    const gracePeriodDaysRemaining = useMemo(() => {
        if (!membership) return null;
        
        const gracePeriodEnd = membership.grace_period_end ?? null;
        const endDate = membership.end_date || membership.membership_end_date || null;
        
        // Same eligibility checks as Dashboard:
        // 1. Status is 'grace_period'
        // 2. grace_period_end exists and is in the future
        // 3. Membership end_date has actually passed (expired)
        const hasExpired = endDate ? new Date(endDate) <= now : false;
        const isInMembershipGracePeriod = membership.status === 'grace_period' && 
            gracePeriodEnd && 
            new Date(gracePeriodEnd) >= now &&
            hasExpired;
        
        // Only calculate if actually in grace period (same as Dashboard)
        if (!isInMembershipGracePeriod || !gracePeriodEnd) return null;
        return getGracePeriodDaysRemaining(gracePeriodEnd, now);
    }, [membership, now]);

    const handleRenew = () => {
        const isGirl = membership.form_data?.gender === 'female' ||
            (membership.plan_name || '').toLowerCase().includes('girl') ||
            [700, 1400, 2400, 4400, 7800].includes(membership.price)
        const params = new URLSearchParams({
            membershipId: membership.id.toString(),
            renewalType: 'membership',
            newPlanName: membership.plan_name,
            newPlanType: membership.plan_type || 'in_gym',
            newDuration: `${membership.duration_months} Months`,
            newPrice: (renewalPrice || membership.price).toString(),
            gender: isGirl ? 'girls' : 'boys'
        })
        router.push(`/membership/payment?${params.toString()}`)
    }

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
        )
    }

    if (!membership) {
        return (
            <>
                <Navbar />
                <div className={styles.container}>
                    <div className={styles.error}>
                        <AlertCircle size={32} />
                        <p>Membership not found</p>
                        <a href="/dashboard" className={styles.backButton}>Back to Dashboard</a>
                    </div>
                </div>
                <Footer />
            </>
        )
    }
    const endDate = membership.end_date || membership.membership_end_date
    const endDateFormatted = endDate ? new Date(endDate).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }) : 'N/A'


    return (
        <>
            <Navbar />
            <div className={styles.container}>
                <div className={styles.header}>
                    <button onClick={() => router.back()} className={styles.backButton}>
                        <ArrowLeft size={20} />
                        Back
                    </button>
                    <h1>Renew Membership</h1>
                    <p>Extend your {membership.plan_name} membership</p>
                </div>

                {/* Grace Period Warning */}
                <div className={styles.statusCard}>
                    <div className={styles.statusHeader}>
                        <Clock size={24} style={{ color: '#f59e0b' }} />
                        <h3>Grace Period Active</h3>
                    </div>
                    <div className={styles.statusInfo}>
                        <div className={styles.statusItem}>
                            <span className={styles.statusLabel}>Status:</span>
                            <span className={styles.statusValue}>
                                <Clock size={16} style={{ color: '#f59e0b' }} />
                                Grace Period ({gracePeriodDaysRemaining} day{gracePeriodDaysRemaining !== 1 ? 's' : ''} remaining)
                            </span>
                        </div>
                        <div className={styles.statusItem}>
                            <span className={styles.statusLabel}>Plan:</span>
                            <span className={styles.statusValue}>
                                {membership.plan_name.charAt(0).toUpperCase() + membership.plan_name.slice(1)} Plan
                            </span>
                        </div>
                        <div className={styles.statusItem}>
                            <span className={styles.statusLabel}>Original End Date:</span>
                            <span className={styles.statusValue}>{endDateFormatted}</span>
                        </div>
                        <div className={styles.statusItem}>
                            <span className={styles.statusLabel}>Grace Period Ends:</span>
                            <span className={styles.statusValue}>
                                {membership.grace_period_end
                                    ? new Date(membership.grace_period_end).toLocaleDateString('en-IN', {
                                          year: 'numeric',
                                          month: 'long',
                                          day: 'numeric'
                                      })
                                    : 'N/A'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Renewal Info */}
                <div className={styles.infoCard}>
                    <CheckCircle size={24} style={{ color: '#10b981' }} />
                    <div>
                        <h3>Renewal Benefits</h3>
                        <ul>
                            <li>Reactivate your existing membership</li>
                            <li>Extend your membership period</li>
                            <li>Preserve your membership history</li>
                            <li>Keep your current plan and addons</li>
                        </ul>
                    </div>
                </div>

                {/* Price Summary */}
                <div className={styles.priceCard}>
                    <h3>Renewal Amount</h3>
                    <div className={styles.priceRow}>
                        <span>Membership Fee ({membership.duration_months} month{membership.duration_months !== 1 ? 's' : ''})</span>
                        <span>₹{(renewalPrice || membership.price).toLocaleString()}</span>
                    </div>
                    <div className={styles.priceTotal}>
                        <span>Total Amount</span>
                        <span>₹{(renewalPrice || membership.price).toLocaleString()}</span>
                    </div>
                </div>

                {/* Action Button */}
                <div className={styles.actions}>
                    <button
                        onClick={() => router.back()}
                        className={styles.cancelButton}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleRenew}
                        className={styles.renewButton}
                    >
                        Continue to Payment
                    </button>
                </div>
            </div>
            <Toast message={toast} type={toastType} onClose={hideToast} />
            <Footer />
        </>
    )
}

export default function RenewMembershipPage() {
    return (
        <Suspense fallback={
            <>
                <Navbar />
                <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
                <Footer />
            </>
        }>
            <RenewMembershipContent />
        </Suspense>
    )
}

