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

                // Calculate renewal price based on plan type and gender
                const planName = membershipData.plan_name?.toLowerCase() || ''
                const planType = membershipData.plan_type?.toLowerCase() || ''
                // Check if it's a regular monthly plan (either by name or plan_type)
                const isRegularMonthly = (planName.includes('regular') && planName.includes('monthly')) || 
                                        planType === 'in_gym' || 
                                        planName === 'regular monthly'
                
                console.log('[RENEWAL] Plan name:', planName, 'Plan type:', planType, 'Is regular monthly:', isRegularMonthly)
                
                if (isRegularMonthly) {
                    // For regular monthly plans, determine renewal price based on gender
                    // Try multiple methods to determine gender:
                    // 1. Check plan name for "boys" or "girls"
                    // 2. Check user profile gender field
                    // 3. Default to boys price (650) if cannot determine
                    
                    let determinedGender: string | null = null
                    
                    // Method 1: Check plan name
                    if (planName.includes('boys') || planName.includes('boy')) {
                        determinedGender = 'boys'
                    } else if (planName.includes('girls') || planName.includes('girl')) {
                        determinedGender = 'girls'
                    }
                    
                    // Method 2: Check user profile if plan name doesn't have gender
                    if (!determinedGender) {
                        try {
                            const { data: { user } } = await supabase.auth.getUser()
                            if (user) {
                                const { data: profile, error: profileError } = await supabase
                                    .from('profiles')
                                    .select('gender')
                                    .eq('id', user.id)
                                    .single()

                                console.log('[RENEWAL] Profile data:', profile, 'Error:', profileError)
                                
                                if (profile?.gender) {
                                    determinedGender = profile.gender.toLowerCase()
                                }
                            }
                        } catch (error) {
                            console.error('[RENEWAL] Error fetching user gender:', error)
                        }
                    }
                    
                    console.log('[RENEWAL] Determined gender:', determinedGender)
                    
                    // Set renewal price based on gender
                    if (determinedGender === 'boys' || determinedGender === 'male' || determinedGender === 'm') {
                        console.log('[RENEWAL] Setting price to 650 (boys)')
                        setRenewalPrice(650) // Boys renewal price
                    } else if (determinedGender === 'girls' || determinedGender === 'female' || determinedGender === 'f') {
                        console.log('[RENEWAL] Setting price to 700 (girls)')
                        setRenewalPrice(700) // Girls renewal price
                    } else {
                        // Fallback: If original price is 1200, assume boys (650), if 1400, assume girls (700)
                        if (membershipData.price === 1200) {
                            console.log('[RENEWAL] Price is 1200, assuming boys plan, setting to 650')
                            setRenewalPrice(650)
                        } else if (membershipData.price === 1400) {
                            console.log('[RENEWAL] Price is 1400, assuming girls plan, setting to 700')
                            setRenewalPrice(700)
                        } else {
                            console.log('[RENEWAL] Cannot determine gender, using original price:', membershipData.price)
                            setRenewalPrice(membershipData.price)
                        }
                    }
                } else {
                    // For non-regular plans, use original price
                    console.log('[RENEWAL] Not a regular monthly plan, using original price:', membershipData.price)
                    setRenewalPrice(membershipData.price)
                }
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
        if (!membership) return
        // Redirect to payment page with membership ID
        router.push(`/membership/payment?membershipId=${membership.id}&renewalType=membership`)
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

