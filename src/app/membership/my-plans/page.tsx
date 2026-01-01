'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import Navbar from '@/components/Navbar/Navbar'
import Footer from '@/components/Footer/Footer'
import { ArrowLeft, CheckCircle, Clock, XCircle, Calendar, CreditCard } from 'lucide-react'
import styles from './my-plans.module.css'

interface MembershipAddon {
    id: number
    addon_type: string
    price: number
    status: string
    trainer_id: string | null
    trainers: {
        id: string
        name: string
    } | null
}

interface Membership {
    id: number
    plan_type: string
    plan_name: string
    duration_months: number
    price: number
    status: string
    start_date: string | null
    end_date: string | null
    created_at: string
    membership_start_date?: string | null
    addons?: MembershipAddon[]
    has_renewals?: boolean // Flag to indicate if membership has renewals
}

export default function MyMembershipsPage() {
    const [memberships, setMemberships] = useState<Membership[]>([])
    const [inGymAdmissionFee, setInGymAdmissionFee] = useState(1200)
    const [loading, setLoading] = useState(true)
    const router = useRouter()

    useEffect(() => {
        const fetchMemberships = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                router.push('/signup?redirect=/membership/my-plans')
                return
            }

            const { data, error } = await supabase
                .from('memberships')
                .select('*')
                .eq('user_id', session.user.id)
                .neq('status', 'awaiting_payment') // Exclude incomplete applications
                .order('created_at', { ascending: false })

            if (error) {
                console.error('Error fetching memberships:', error)
            } else {
                // Fetch addons and payments for each membership
                const membershipsWithAddons = await Promise.all(
                    (data || []).map(async (membership) => {
                        const { data: addonsData, error: addonsError } = await supabase
                            .from('membership_addons')
                            .select(`
                                *,
                                trainers (
                                    id,
                                    name
                                )
                            `)
                            .eq('membership_id', membership.id)

                        if (addonsError) {
                            console.error('Error fetching addons for membership', membership.id, ':', addonsError)
                        }

                        // Fetch payments to determine if membership was renewed
                        const { data: paymentsData, error: paymentsError } = await supabase
                            .from('membership_payments')
                            .select('id, status')
                            .eq('membership_id', membership.id)

                        if (paymentsError) {
                            console.error('Error fetching payments for membership', membership.id, ':', paymentsError)
                        }

                        // Check if membership has renewals (multiple verified payments)
                        const verifiedPayments = (paymentsData || []).filter((p: any) => p.status === 'verified')
                        const hasRenewals = verifiedPayments.length > 1

                        return {
                            ...membership,
                            addons: addonsData || [],
                            has_renewals: hasRenewals // Add flag to indicate if membership has renewals
                        }
                    })
                )

                setMemberships(membershipsWithAddons)
            }
            setLoading(false)
        }

        fetchMemberships()
        fetchInGymFees()
    }, [router])

    const fetchInGymFees = async () => {
        try {
            const response = await fetch('/api/fees')
            const data = await response.json()
            if (data.success && data.fees) {
                setInGymAdmissionFee(data.fees.admissionFee || 1200)
            }
        } catch (error) {
            console.error('Error fetching in-gym admission fee:', error)
        }
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active':
                return { icon: CheckCircle, text: 'Active', className: styles.statusActive }
            case 'approved':
                return { icon: CheckCircle, text: 'Approved', className: styles.statusApproved }
            case 'pending':
                return { icon: Clock, text: 'Pending Approval', className: styles.statusPending }
            case 'rejected':
                return { icon: XCircle, text: 'Rejected', className: styles.statusRejected }
            case 'expired':
                return { icon: XCircle, text: 'Expired', className: styles.statusRejected }
            default:
                return { icon: Clock, text: status, className: styles.statusPending }
        }
    }

    const formatDate = (dateString: string | null) => {
        if (!dateString) return 'Not set'
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        })
    }

    // Check if membership is expiring soon or expired (same logic as Dashboard)
    const getMembershipExpirationStatus = (membership: Membership): {
        isExpiringSoon: boolean;
        isExpired: boolean;
        daysRemaining: number | null
    } => {
        if (!membership.end_date) {
            return { isExpiringSoon: false, isExpired: false, daysRemaining: null };
        }

        const endDate = new Date(membership.end_date);
        const now = new Date();
        const diffTime = endDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return { isExpiringSoon: false, isExpired: true, daysRemaining: Math.abs(diffDays) };
        } else if (diffDays <= 7) {
            return { isExpiringSoon: true, isExpired: false, daysRemaining: diffDays };
        }

        return { isExpiringSoon: false, isExpired: false, daysRemaining: diffDays };
    }

    if (loading) {
        return (
            <>
                <Navbar />
                <div className={styles.container}>
                    <div className={styles.loading}>Loading...</div>
                </div>
                <Footer />
            </>
        )
    }

    return (
        <>
            <Navbar />
            <div className={styles.container}>
                <div className={styles.header}>
                    <button onClick={() => router.back()} className={styles.backButton}>
                        <ArrowLeft size={20} />
                        Back
                    </button>
                    <h1 className={styles.title}>My Memberships</h1>
                    <p className={styles.subtitle}>
                        View all your membership plans and their status
                    </p>
                </div>

                {memberships.length === 0 ? (
                    <div className={styles.emptyState}>
                        <CreditCard size={48} />
                        <h2>No Memberships Found</h2>
                        <p>You don't have any active or past memberships yet.</p>
                        <a href="/membership" className={styles.browseButton}>
                            Browse Membership Plans
                        </a>
                    </div>
                ) : (
                    <div className={styles.membershipsGrid}>
                        {memberships.map((membership) => {
                            const statusBadge = getStatusBadge(membership.status)
                            const StatusIcon = statusBadge.icon

                            const expirationStatus = getMembershipExpirationStatus(membership);

                            return (
                                <div key={membership.id} className={styles.membershipCard}>
                                    {/* Membership Expiration Warning */}
                                    {membership.status === 'active' && (expirationStatus.isExpired || expirationStatus.isExpiringSoon) && (
                                        <div style={{
                                            marginBottom: '1rem',
                                            padding: '0.75rem 1rem',
                                            background: expirationStatus.isExpired ? '#fee2e2' : '#fef3c7',
                                            border: `1px solid ${expirationStatus.isExpired ? '#dc2626' : '#f59e0b'}`,
                                            borderRadius: '0.5rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem'
                                        }}>
                                            <div style={{ color: expirationStatus.isExpired ? '#dc2626' : '#f59e0b' }}>
                                                {expirationStatus.isExpired ? <XCircle size={20} /> : <Clock size={20} />}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{
                                                    fontWeight: '600',
                                                    color: expirationStatus.isExpired ? '#dc2626' : '#f59e0b',
                                                    marginBottom: '0.25rem',
                                                    fontSize: '0.875rem'
                                                }}>
                                                    {expirationStatus.isExpired ? 'Plan Expired' : 'Plan Expiring Soon'}
                                                </div>
                                                <div style={{ fontSize: '0.8125rem', color: '#6b7280' }}>
                                                    {expirationStatus.isExpired
                                                        ? `Your plan expired ${expirationStatus.daysRemaining} day${expirationStatus.daysRemaining !== 1 ? 's' : ''} ago. Kindly renew it.`
                                                        : `Your plan is getting expire soon. It will expire in ${expirationStatus.daysRemaining} day${expirationStatus.daysRemaining !== 1 ? 's' : ''}. Kindly renew it.`}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className={styles.cardHeader}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                                <h3 className={styles.planName} style={{ margin: 0 }}>
                                                    {membership.plan_name.charAt(0).toUpperCase() + membership.plan_name.slice(1)} Plan
                                                </h3>
                                                <span style={{
                                                    padding: '0.125rem 0.5rem',
                                                    borderRadius: '0.375rem',
                                                    background: membership.has_renewals ? '#f59e0b' : '#3b82f6',
                                                    color: 'white',
                                                    fontSize: '0.75rem',
                                                    fontWeight: '600'
                                                }}>
                                                    {membership.has_renewals ? '🔄 Renewed' : '🎯 Initial'}
                                                </span>
                                            </div>
                                            <span className={styles.planType}>
                                                {membership.addons?.some((a: any) => a.addon_type === 'in_gym')
                                                    ? 'In-Gym Training'
                                                    : (membership.plan_type === 'online' ? 'Online Training' : 'In-Gym Training')}
                                            </span>
                                            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                                                Membership ID: #{membership.id} • Created: {new Date(membership.created_at).toLocaleDateString()}
                                            </div>
                                        </div>
                                        <span className={`${styles.statusBadge} ${statusBadge.className}`}>
                                            <StatusIcon size={16} />
                                            {statusBadge.text}
                                        </span>
                                    </div>

                                    <div className={styles.cardBody}>
                                        <div className={styles.detailRow}>
                                            <span className={styles.detailLabel}>Duration:</span>
                                            <span className={styles.detailValue}>{membership.duration_months} Months</span>
                                        </div>
                                        <div className={styles.detailRow}>
                                            <span className={styles.detailLabel}>Base Price:</span>
                                            <span className={styles.detailValue}>₹{membership.price.toLocaleString()}</span>
                                        </div>

                                        {/* Check if plan is in-gym type (selected directly from memberships page) */}
                                        {membership.plan_type === 'in_gym' && !membership.addons?.some((a: any) => a.addon_type === 'in_gym') && (
                                            <div className={styles.detailRow}>
                                                <span className={styles.detailLabel}>In-Gym Admission Fee:</span>
                                                <span className={styles.detailValue}>₹1,200</span>
                                            </div>
                                        )}

                                        {membership.addons && membership.addons.length > 0 && (
                                            <>
                                                <div className={styles.detailRow}>
                                                    <span className={styles.detailLabel}>Add-ons:</span>
                                                    <span className={styles.detailValue}>
                                                        {membership.addons.map((addon, idx) => {
                                                            const addonPrice = typeof addon.price === 'number' ? addon.price : parseFloat(addon.price) || 0
                                                            return (
                                                                <div key={addon.id} style={{ marginBottom: '4px' }}>
                                                                    {addon.addon_type === 'in_gym' ? 'In-Gym Access' :
                                                                        addon.addon_type === 'personal_trainer' ?
                                                                            `Personal Trainer${addon.trainers ? ` (${Array.isArray(addon.trainers) ? addon.trainers[0]?.name : addon.trainers.name})` : ''}` :
                                                                            addon.addon_type} - ₹{addonPrice.toLocaleString()}
                                                                </div>
                                                            )
                                                        })}
                                                    </span>
                                                </div>
                                            </>
                                        )}

                                        <div className={styles.detailRow}>
                                            <span className={styles.detailLabel} style={{ fontWeight: 'bold' }}>Total:</span>
                                            <span className={styles.detailValue} style={{ fontWeight: 'bold', color: '#22c55e' }}>
                                                ₹{(() => {
                                                    let total = membership.price
                                                    // Add in-gym admission fee if plan_type is in_gym and no active in_gym addon exists
                                                    const activeAddons = membership.addons?.filter((a: any) => a.status === 'active') || []
                                                    if (membership.plan_type === 'in_gym' && !activeAddons.some((a: any) => a.addon_type === 'in_gym')) {
                                                        total += inGymAdmissionFee
                                                    }
                                                    // Add only active addon prices
                                                    if (activeAddons.length > 0) {
                                                        total += activeAddons.reduce((sum: number, a: any) => {
                                                            const addonPrice = typeof a.price === 'number' ? a.price : parseFloat(a.price) || 0
                                                            return sum + addonPrice
                                                        }, 0)
                                                    }
                                                    return total.toLocaleString()
                                                })()}
                                            </span>
                                        </div>
                                        {membership.start_date && (
                                            <div className={styles.detailRow}>
                                                <span className={styles.detailLabel}>
                                                    <Calendar size={14} />
                                                    Start Date:
                                                </span>
                                                <span className={styles.detailValue}>{formatDate(membership.start_date)}</span>
                                            </div>
                                        )}
                                        {membership.end_date && (
                                            <div className={styles.detailRow}>
                                                <span className={styles.detailLabel}>
                                                    <Calendar size={14} />
                                                    End Date:
                                                </span>
                                                <span className={styles.detailValue}>{formatDate(membership.end_date)}</span>
                                            </div>
                                        )}
                                        <div className={styles.detailRow}>
                                            <span className={styles.detailLabel}>Applied On:</span>
                                            <span className={styles.detailValue}>{formatDate(membership.created_at)}</span>
                                        </div>
                                    </div>

                                    {membership.status === 'active' && (
                                        <div className={styles.activeBadge}>
                                            <CheckCircle size={16} />
                                            Currently Active
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}

                <div className={styles.actions}>
                    <a href="/membership" className={styles.browseButton}>
                        Browse More Plans
                    </a>
                </div>
            </div>
            <Footer />
        </>
    )
}

