// src/app/admin/memberships/page.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { CheckCircle, XCircle, Clock, Download, Eye, FileText, Image as ImageIcon, FileDown, AlertCircle, Trash2, ChevronDown, MessageSquare, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import styles from './memberships.module.css';
import cardStyles from '@/components/UserCard/UserCard.module.css';

interface MembershipAddon {
    id: number;
    addon_type: string;
    price: number;
    status: string;
    trainer_id?: string | null;
    trainer_name?: string | null;
}

interface Membership {
    id: number;
    user_id: string;
    plan_type: string;
    plan_name: string;
    duration_months: number;
    price: number;
    status: string;
    start_date: string | null;
    end_date: string | null;
    created_at: string;
    user_email?: string;
    user_name?: string;
    payment_screenshot_url?: string;
    transaction_id?: string;
    payment_date?: string;
    payment_amount?: number | null;
    total_amount?: number | null;
    form_data?: any; // Comprehensive form data
    addons?: MembershipAddon[];
    trainer_assigned?: boolean;
    trainer_id?: string | null;
    trainer_period_end?: string | null;
    trainer_addon?: boolean;
    membership_start_date?: string | null;
    membership_end_date?: string | null;
    plan_mode?: string;
    trainer_name?: string | null;
    all_payments?: any[];
}

interface UserGroup {
    user_id: string;
    user_name: string;
    user_email: string;
    memberships: Membership[];
}

interface Trainer {
    id: string;
    name: string;
    is_active: boolean;
}

export default function MembershipsManagement() {
    const [memberships, setMemberships] = useState<Membership[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'rejected'>('all');
    const [selectedMembership, setSelectedMembership] = useState<Membership | null>(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [processing, setProcessing] = useState<number | null>(null);
    const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
    const [loadingScreenshot, setLoadingScreenshot] = useState(false);
    const [allPayments, setAllPayments] = useState<any[]>([]);
    const [loadingPayments, setLoadingPayments] = useState(false);
    const [membershipHistory, setMembershipHistory] = useState<any>(null);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [membershipToReject, setMembershipToReject] = useState<number | null>(null);
    const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
    const [currentPage, setCurrentPage] = useState(1);
    const [trainers, setTrainers] = useState<Trainer[]>([]);
    const [selectedTrainerId, setSelectedTrainerId] = useState<string>('');
    const [assigningTrainer, setAssigningTrainer] = useState(false);
    const [inGymAdmissionFee, setInGymAdmissionFee] = useState(1200);
    const itemsPerPage = 10;
    const router = useRouter();

    useEffect(() => {
        fetchMemberships();
        fetchTrainers();
        fetchInGymFees();
    }, []);

    const fetchInGymFees = async () => {
        try {
            const response = await fetch('/api/admin/settings?key=in_gym_admission_fee', {
                credentials: 'include',
                cache: 'no-store'
            });
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.setting?.setting_value) {
                    setInGymAdmissionFee(parseFloat(data.setting.setting_value) || 1200);
                }
            }
        } catch (error) {
            console.error('Error fetching in-gym admission fee:', error);
        }
    };

    const fetchTrainers = async () => {
        try {
            const response = await fetch('/api/admin/trainers', {
                credentials: 'include',
                cache: 'no-store'
            });
            if (response.ok) {
                const data = await response.json();
                setTrainers(data.trainers || []);
            }
        } catch (error) {
            console.error('Error fetching trainers:', error);
        }
    };

    const fetchMemberships = async () => {
        try {
            const response = await fetch('/api/admin/memberships', {
                credentials: 'include',
                cache: 'no-store'
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to fetch memberships');
            }

            const data = await response.json();
            setMemberships(data.memberships || []);
            setError(null);
        } catch (error: any) {
            setError(`Failed to load memberships: ${error.message || 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (membershipId: number) => {
        if (!confirm('Are you sure you want to approve this membership? This will activate the user\'s plan.')) {
            return;
        }

        setProcessing(membershipId);
        try {
            const response = await fetch(`/api/admin/memberships/${membershipId}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to approve membership');
            }

            setError(null);
            await fetchMemberships();
            if (showDetailsModal) {
                setShowDetailsModal(false);
                setSelectedMembership(null);
            }
        } catch (error: any) {
            setError(`Failed to approve membership: ${error.message}`);
        } finally {
            setProcessing(null);
        }
    };



    const handleRejectClick = (membershipId: number) => {
        setMembershipToReject(membershipId);
        setRejectReason('');
        setShowRejectModal(true);
    };


    const handleReject = async () => {
        if (!membershipToReject || !rejectReason.trim()) {
            setError('Please provide a reason for rejection');
            return;
        }

        setProcessing(membershipToReject);
        setShowRejectModal(false);

        try {
            const response = await fetch(`/api/admin/memberships/${membershipToReject}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ reason: rejectReason.trim() })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to reject membership');
            }

            setError(null);
            setRejectReason('');
            setMembershipToReject(null);
            await fetchMemberships();
            if (showDetailsModal) {
                setShowDetailsModal(false);
                setSelectedMembership(null);
            }
        } catch (error: any) {
            setError(`Failed to reject membership: ${error.message}`);
        } finally {
            setProcessing(null);
        }
    };

    const handleViewDetails = async (membership: Membership) => {
        setSelectedMembership(membership);
        setShowDetailsModal(true);
        setScreenshotUrl(null);
        setAllPayments([]);
        setMembershipHistory(null);

        // Fetch all payments with screenshots
        setLoadingPayments(true);
        try {
            const response = await fetch(`/api/admin/memberships/${membership.id}/payments`, {
                credentials: 'include'
            });
            if (response.ok) {
                const data = await response.json();
                setAllPayments(data.payments || []);
                // Set the most recent payment screenshot for backward compatibility
                if (data.payments && data.payments.length > 0) {
                    const mostRecent = data.payments.find((p: any) => p.screenshotUrl) || data.payments[0];
                    setScreenshotUrl(mostRecent?.screenshotUrl || null);
                }
            }
        } catch (error) {
            console.error('Error fetching payments:', error);
        } finally {
            setLoadingPayments(false);
        }

        // Fetch complete membership history for timeline and financial tabs
        setLoadingHistory(true);
        try {
            const historyResponse = await fetch(`/api/admin/memberships/${membership.id}/history`, {
                credentials: 'include'
            });
            if (historyResponse.ok) {
                const historyData = await historyResponse.json();
                setMembershipHistory(historyData);
            } else {
                console.error('Failed to fetch membership history:', await historyResponse.text());
            }
        } catch (error) {
            console.error('Error fetching membership history:', error);
        } finally {
            setLoadingHistory(false);
        }

        // Fetch screenshot
        if (membership.payment_screenshot_url && !screenshotUrl) {
            setLoadingScreenshot(true);
            try {
                const response = await fetch(`/api/admin/memberships/${membership.id}/screenshot`, {
                    credentials: 'include'
                });
                if (response.ok) {
                    const data = await response.json();
                    setScreenshotUrl(data.screenshotUrl);
                }
            } catch (error) {
                // Error fetching screenshot - silently fail
            } finally {
                setLoadingScreenshot(false);
            }
        }
    };

    const handleDownloadForm = async (membership: Membership) => {
        try {
            // Fetch signed URL for PDF
            const response = await fetch(`/api/admin/memberships/${membership.id}/pdf`, {
                credentials: 'include'
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to fetch PDF');
            }

            const { url } = await response.json();

            // Download PDF
            const a = document.createElement('a');
            a.href = url;
            a.download = `membership_form_${membership.id}_${membership.user_name?.replace(/\s+/g, '_') || 'user'}.pdf`;
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (error: any) {
            setError(`Failed to download PDF: ${error.message}`);
        }
    };

    const handleAssignTrainer = async (membershipId: number) => {
        if (!selectedTrainerId) {
            setError('Please select a trainer');
            return;
        }

        setAssigningTrainer(true);
        try {
            const response = await fetch(`/api/admin/memberships/${membershipId}/assign-trainer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ trainerId: selectedTrainerId })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to assign trainer');
            }

            setError(null);
            setSelectedTrainerId('');
            await fetchMemberships();
            if (showDetailsModal) {
                // Refresh selected membership
                const updated = memberships.find(m => m.id === membershipId);
                if (updated) {
                    setSelectedMembership({ ...updated, trainer_id: selectedTrainerId });
                }
            }
        } catch (error: any) {
            setError(`Failed to assign trainer: ${error.message}`);
        } finally {
            setAssigningTrainer(false);
        }
    };

    const handleDelete = async (membershipId: number) => {
        const membership = memberships.find(m => m.id === membershipId);
        const isActive = membership?.status === 'active';

        const confirmMessage = isActive
            ? `Are you sure you want to delete this ACTIVE membership? The user will be notified of the cancellation. This action cannot be undone.`
            : `Are you sure you want to delete this membership? This action cannot be undone.`;

        if (!confirm(confirmMessage)) {
            return;
        }

        setProcessing(membershipId);
        try {
            const response = await fetch(`/api/admin/memberships/${membershipId}/delete`, {
                method: 'DELETE',
                credentials: 'include'
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to delete membership');
            }

            setError(null);
            await fetchMemberships();
            if (showDetailsModal && selectedMembership?.id === membershipId) {
                setShowDetailsModal(false);
                setSelectedMembership(null);
            }
        } catch (error: any) {
            setError(`Failed to delete membership: ${error.message}`);
        } finally {
            setProcessing(null);
        }
    };

    const exportToCSV = () => {
        const headers = ['ID', 'User Name', 'User Email', 'Plan Type', 'Plan Name', 'Duration', 'Price', 'Status', 'Created At'];
        const rows: any[] = [];

        userGroups.forEach(userGroup => {
            userGroup.memberships.forEach(m => {
                rows.push([
                    m.id,
                    m.user_name || 'N/A',
                    m.user_email || 'N/A',
                    m.plan_type,
                    m.plan_name,
                    `${m.duration_months} months`,
                    `₹${m.price.toLocaleString()}`,
                    m.status,
                    formatDate(m.created_at)
                ]);
            });
        });

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map((cell: any) => `"${cell}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `memberships_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    // Check if membership is expiring soon or expired
    const getMembershipExpirationStatus = (membership: Membership): {
        isExpiringSoon: boolean;
        isExpired: boolean;
        daysRemaining: number | null;
    } => {
        const endDateStr = membership.membership_end_date || membership.end_date;
        if (!endDateStr) {
            return { isExpiringSoon: false, isExpired: false, daysRemaining: null };
        }

        const endDate = new Date(endDateStr);
        const now = new Date();
        const diffTime = endDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return { isExpiringSoon: false, isExpired: true, daysRemaining: Math.abs(diffDays) };
        } else if (diffDays <= 4) {
            return { isExpiringSoon: true, isExpired: false, daysRemaining: diffDays };
        }

        return { isExpiringSoon: false, isExpired: false, daysRemaining: diffDays };
    };

    // Check if trainer period is expiring soon or expired
    // NOTE: Regular (In-Gym) plan + trainer addon should match membership validity (duration_months).
    // Older records may have trainer_period_end saved incorrectly (same day -> 0 days).
    const getEffectiveTrainerPeriodEnd = (membership: Membership): Date | null => {
        if (!membership.trainer_period_end) return null;

        const rawEnd = new Date(membership.trainer_period_end);

        try {
            const planLower = (membership.plan_name || '').toLowerCase();
            const isRegularLike = planLower.includes('regular');
            const hasAddon = Boolean(membership.trainer_addon);
            const startStr = membership.membership_start_date || membership.start_date;
            if (!isRegularLike || !hasAddon || !startStr) return rawEnd;

            const startDate = new Date(startStr);
            const diffDays = Math.ceil((rawEnd.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

            // If end date is same-day/next-day, treat as membership validity end
            if (diffDays <= 1) {
                const membershipEnd = membership.membership_end_date || membership.end_date;
                if (membershipEnd) return new Date(membershipEnd);
                if (membership.duration_months && membership.duration_months > 0) {
                    const fixedEnd = new Date(startDate);
                    fixedEnd.setMonth(fixedEnd.getMonth() + membership.duration_months);
                    return fixedEnd;
                }
                return rawEnd;
            }

            return rawEnd;
        } catch {
            return rawEnd;
        }
    };

    const getTrainerPeriodExpirationStatus = (membership: Membership): {
        isExpiringSoon: boolean;
        isExpired: boolean;
        daysRemaining: number | null;
    } => {
        if (!membership.trainer_assigned) {
            return { isExpiringSoon: false, isExpired: false, daysRemaining: null };
        }

        const endDate = getEffectiveTrainerPeriodEnd(membership);
        if (!endDate) {
            return { isExpiringSoon: false, isExpired: false, daysRemaining: null };
        }
        const now = new Date();
        const diffTime = endDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return { isExpiringSoon: false, isExpired: true, daysRemaining: Math.abs(diffDays) };
        } else if (diffDays <= 4) {
            return { isExpiringSoon: true, isExpired: false, daysRemaining: diffDays };
        }

        return { isExpiringSoon: false, isExpired: false, daysRemaining: diffDays };
    };

    // Group memberships by user
    const userGroups = useMemo(() => {
        const filtered = memberships.filter(m => {
            if (m.status === 'awaiting_payment') return false;
            if (filter === 'all') return true;
            return m.status === filter;
        });

        const grouped = new Map<string, UserGroup>();

        filtered.forEach(membership => {
            const userId = membership.user_id;
            if (!grouped.has(userId)) {
                grouped.set(userId, {
                    user_id: userId,
                    user_name: membership.user_name || 'Unknown User',
                    user_email: membership.user_email || 'No email',
                    memberships: []
                });
            }
            grouped.get(userId)!.memberships.push(membership);
        });

        return Array.from(grouped.values()).sort((a, b) =>
            b.memberships[0].created_at.localeCompare(a.memberships[0].created_at)
        );
    }, [memberships, filter]);

    // Pagination
    const totalPages = Math.ceil(userGroups.length / itemsPerPage);
    const paginatedUsers = userGroups.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const toggleUserExpanded = (userId: string) => {
        setExpandedUsers(prev => {
            const newSet = new Set(prev);
            if (newSet.has(userId)) {
                newSet.delete(userId);
            } else {
                newSet.add(userId);
            }
            return newSet;
        });
    };

    const stats = {
        total: memberships.length,
        pending: memberships.filter(m => m.status === 'pending').length,
        active: memberships.filter(m => m.status === 'active').length,
        rejected: memberships.filter(m => m.status === 'rejected').length
    };

    if (loading) {
        return (
            <div className={styles.loadingState}>
                <div className={styles.spinner}></div>
                <p>Loading memberships...</p>
            </div>
        );
    }

    return (
        <div className={styles.pageContainer}>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Memberships Management</h1>
                    <p className={styles.pageSubtitle}>
                        Review and manage all membership applications ({memberships.length} total)
                    </p>
                </div>
                <button onClick={exportToCSV} className={styles.primaryButton}>
                    <Download size={20} />
                    Export to CSV
                </button>
            </div>

            {/* Error Display */}
            {error && (
                <div className={styles.errorMessage}>
                    <AlertCircle size={20} />
                    <span>{error}</span>
                    <button onClick={() => setError(null)}>×</button>
                </div>
            )}

            <div className={styles.statsRow}>
                <div className={styles.statBox}>
                    <h3>{stats.total}</h3>
                    <p>Total</p>
                </div>
                <div className={styles.statBox}>
                    <h3>{stats.pending}</h3>
                    <p>Pending</p>
                </div>
                <div className={styles.statBox}>
                    <h3>{stats.active}</h3>
                    <p>Active</p>
                </div>
                <div className={styles.statBox}>
                    <h3>{stats.rejected}</h3>
                    <p>Rejected</p>
                </div>
            </div>

            <div className={styles.filterBar}>
                <button
                    onClick={() => setFilter('all')}
                    className={`${styles.filterButton} ${filter === 'all' ? styles.active : ''}`}
                >
                    All Memberships
                </button>
                <button
                    onClick={() => setFilter('pending')}
                    className={`${styles.filterButton} ${filter === 'pending' ? styles.active : ''}`}
                >
                    Pending ({stats.pending})
                </button>
                <button
                    onClick={() => setFilter('active')}
                    className={`${styles.filterButton} ${filter === 'active' ? styles.active : ''}`}
                >
                    Active ({stats.active})
                </button>
                <button
                    onClick={() => setFilter('rejected')}
                    className={`${styles.filterButton} ${filter === 'rejected' ? styles.active : ''}`}
                >
                    Rejected ({stats.rejected})
                </button>
            </div>

            {/* User-based Cards */}
            <div className={styles.cardsContainer}>
                {paginatedUsers.length === 0 ? (
                    <div className={cardStyles.emptyState}>
                        <FileText className={cardStyles.emptyStateIcon} />
                        <div className={cardStyles.emptyStateTitle}>No memberships found</div>
                        <div className={cardStyles.emptyStateText}>
                            {filter === 'all'
                                ? 'No membership applications have been submitted yet.'
                                : `No ${filter} memberships found.`}
                        </div>
                    </div>
                ) : (
                    paginatedUsers.map((userGroup) => {
                        const isExpanded = expandedUsers.has(userGroup.user_id);
                        const pendingCount = userGroup.memberships.filter(m => m.status === 'pending').length;
                        const activeCount = userGroup.memberships.filter(m => m.status === 'active').length;
                        // Calculate total: base price + active/pending addons for each membership
                        const totalAmount = userGroup.memberships.reduce((sum, m) => {
                            const basePrice = m.price || 0;
                            // Include both active and pending addons (pending ones are being paid for)
                            const relevantAddons = (m.addons || []).filter((a: any) =>
                                a.status === 'active' || a.status === 'pending'
                            );
                            const addonsTotal = relevantAddons
                                .reduce((addonSum: number, addon: any) => addonSum + (parseFloat(addon.price) || 0), 0);
                            // NOTE: For Regular Monthly (in_gym), the membership price already includes joining/admission.
                            // For online->in_gym addon, the admission fee is already captured as an addon row.
                            return sum + basePrice + addonsTotal;
                        }, 0);

                        return (
                            <div key={userGroup.user_id} className={cardStyles.userCard}>
                                <div
                                    className={`${cardStyles.userCardHeader} ${isExpanded ? cardStyles.userCardHeaderExpanded : ''}`}
                                    onClick={() => toggleUserExpanded(userGroup.user_id)}
                                >
                                    <div className={cardStyles.userInfo}>
                                        <div className={cardStyles.userAvatar}>
                                            {userGroup.user_name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className={cardStyles.userDetails}>
                                            <div className={cardStyles.userName}>{userGroup.user_name}</div>
                                            <div className={cardStyles.userEmail}>{userGroup.user_email}</div>
                                        </div>
                                    </div>
                                    <div className={cardStyles.userStats}>
                                        <div className={cardStyles.statItem}>
                                            <div className={cardStyles.statValue}>{userGroup.memberships.length}</div>
                                            <div className={cardStyles.statLabel}>Plans</div>
                                        </div>
                                        {pendingCount > 0 && (
                                            <div className={cardStyles.statItem}>
                                                <div className={cardStyles.statValue} style={{ color: '#f59e0b' }}>
                                                    {pendingCount}
                                                </div>
                                                <div className={cardStyles.statLabel}>Pending</div>
                                            </div>
                                        )}
                                        {activeCount > 0 && (
                                            <div className={cardStyles.statItem}>
                                                <div className={cardStyles.statValue} style={{ color: '#10b981' }}>
                                                    {activeCount}
                                                </div>
                                                <div className={cardStyles.statLabel}>Active</div>
                                            </div>
                                        )}
                                        <div className={cardStyles.statItem}>
                                            <div className={cardStyles.statValue} style={{ color: '#22c55e' }}>
                                                ₹{totalAmount.toLocaleString()}
                                            </div>
                                            <div className={cardStyles.statLabel}>Total</div>
                                        </div>
                                    </div>
                                    <ChevronDown
                                        className={`${cardStyles.expandIcon} ${isExpanded ? cardStyles.expandIconExpanded : ''}`}
                                    />
                                </div>

                                <div className={`${cardStyles.userCardContent} ${isExpanded ? cardStyles.userCardContentExpanded : ''}`}>
                                    <div className={cardStyles.itemsList}>
                                        {userGroup.memberships.map((membership) => {
                                            const expirationStatus = getMembershipExpirationStatus(membership);
                                            return (
                                                <div key={membership.id} style={{ marginBottom: '1.5rem' }}>
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
                                                                    marginBottom: '0.25rem'
                                                                }}>
                                                                    {expirationStatus.isExpired ? 'Membership Expired' : 'Membership Expiring Soon'}
                                                                </div>
                                                                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                                                                    {expirationStatus.isExpired
                                                                        ? `This user's membership expired ${expirationStatus.daysRemaining} day${expirationStatus.daysRemaining !== 1 ? 's' : ''} ago. Please remove or follow up.`
                                                                        : `This user's membership will expire in ${expirationStatus.daysRemaining} day${expirationStatus.daysRemaining !== 1 ? 's' : ''}.`}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {/* Trainer Period Expiration Warning */}
                                                    {membership.status === 'active' && membership.trainer_assigned && (() => {
                                                        const trainerExpiration = getTrainerPeriodExpirationStatus(membership);
                                                        if (trainerExpiration.isExpired || trainerExpiration.isExpiringSoon) {
                                                            return (
                                                                <div style={{
                                                                    marginBottom: '1rem',
                                                                    padding: '0.75rem 1rem',
                                                                    background: trainerExpiration.isExpired ? '#fee2e2' : '#fef3c7',
                                                                    border: `1px solid ${trainerExpiration.isExpired ? '#dc2626' : '#f59e0b'}`,
                                                                    borderRadius: '0.5rem',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.75rem'
                                                                }}>
                                                                    <div style={{ color: trainerExpiration.isExpired ? '#dc2626' : '#f59e0b' }}>
                                                                        {trainerExpiration.isExpired ? <XCircle size={20} /> : <Clock size={20} />}
                                                                    </div>
                                                                    <div style={{ flex: 1 }}>
                                                                        <div style={{
                                                                            fontWeight: '600',
                                                                            color: trainerExpiration.isExpired ? '#dc2626' : '#f59e0b',
                                                                            marginBottom: '0.25rem'
                                                                        }}>
                                                                            {trainerExpiration.isExpired ? 'Trainer Period Expired' : 'Trainer Period Expiring Soon'}
                                                                        </div>
                                                                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                                                                            {trainerExpiration.isExpired
                                                                                ? `Trainer access expired ${trainerExpiration.daysRemaining} day${trainerExpiration.daysRemaining !== 1 ? 's' : ''} ago.`
                                                                                : `Trainer access will expire in ${trainerExpiration.daysRemaining} day${trainerExpiration.daysRemaining !== 1 ? 's' : ''}.`}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    })()}

                                                    <div className={cardStyles.itemCard}>
                                                        <div className={cardStyles.itemHeader}>
                                                            <div>
                                                                <div className={cardStyles.itemTitle}>
                                                                    <span>{membership.plan_name.charAt(0).toUpperCase() + membership.plan_name.slice(1)} Plan</span>
                                                                </div>
                                                                <div className={cardStyles.itemMeta}>
                                                                    <span className={`${cardStyles.itemBadge} ${membership.status === 'active' ? cardStyles.badgeSuccess :
                                                                        membership.status === 'pending' ? cardStyles.badgeWarning :
                                                                            cardStyles.badgeDanger
                                                                        }`}>
                                                                        {membership.status.charAt(0).toUpperCase() + membership.status.slice(1)}
                                                                    </span>
                                                                    <span>ID: #{membership.id}</span>
                                                                    <span>•</span>
                                                                    <span>{membership.duration_months} months</span>
                                                                    <span>•</span>
                                                                    <span>Created: {formatDate(membership.created_at)}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className={cardStyles.itemDetails}>
                                                            <div className={cardStyles.detailRow}>
                                                                <div className={cardStyles.detailLabel}>Type</div>
                                                                <div className={cardStyles.detailValue}>
                                                                    {membership.addons?.some((a: any) => a.addon_type === 'in_gym')
                                                                        ? 'In-Gym Training'
                                                                        : (membership.plan_type === 'online' ? 'Online Training' : 'In-Gym Training')}
                                                                </div>
                                                            </div>
                                                            <div className={cardStyles.detailRow}>
                                                                <div className={cardStyles.detailLabel}>Base Price</div>
                                                                <div className={cardStyles.detailValue}>₹{membership.price.toLocaleString()}</div>
                                                            </div>
                                                            {membership.addons && membership.addons.length > 0 && (
                                                                <div className={cardStyles.detailRow}>
                                                                    <div className={cardStyles.detailLabel}>Add-ons</div>
                                                                    <div className={cardStyles.detailValue}>
                                                                        {membership.addons.map((addon: any, idx: number) => (
                                                                            <div key={idx} style={{ marginBottom: '4px' }}>
                                                                                {addon.addon_type === 'in_gym' ? 'In-Gym Access' :
                                                                                    addon.addon_type === 'personal_trainer' ? `Personal Trainer${addon.trainer_name ? ` (${addon.trainer_name})` : ''}` :
                                                                                        addon.addon_type} - ₹{addon.price?.toLocaleString() || '0'}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            <div className={cardStyles.detailRow}>
                                                                <div className={cardStyles.detailLabel}>Total Amount</div>
                                                                <div className={cardStyles.detailValue} style={{ fontWeight: 'bold', color: '#22c55e' }}>
                                                                    ₹{(() => {
                                                                        const basePrice = membership.price || 0;
                                                                        // Include both active and pending addons (pending ones are being paid for)
                                                                        const relevantAddons = (membership.addons || []).filter((a: any) =>
                                                                            a.status === 'active' || a.status === 'pending'
                                                                        );
                                                                        const addonsTotal = relevantAddons
                                                                            .reduce((sum: number, addon: any) => sum + (parseFloat(addon.price) || 0), 0);
                                                                        return (basePrice + addonsTotal).toLocaleString();
                                                                    })()}
                                                                </div>
                                                            </div>
                                                            {membership.transaction_id && (
                                                                <div className={cardStyles.detailRow}>
                                                                    <div className={cardStyles.detailLabel}>Transaction ID</div>
                                                                    <div className={cardStyles.detailValue}>{membership.transaction_id}</div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className={cardStyles.itemActions}>
                                                            <button
                                                                onClick={() => handleViewDetails(membership)}
                                                                className={`${cardStyles.actionButton} ${cardStyles.actionButtonSecondary}`}
                                                            >
                                                                <Eye size={16} />
                                                                View Details
                                                            </button>
                                                            {membership.status === 'pending' && (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleApprove(membership.id)}
                                                                        className={`${cardStyles.actionButton} ${cardStyles.actionButtonSuccess}`}
                                                                        disabled={processing === membership.id}
                                                                    >
                                                                        {processing === membership.id ? (
                                                                            <div className={styles.spinnerSmall}></div>
                                                                        ) : (
                                                                            <>
                                                                                <CheckCircle size={16} />
                                                                                Approve
                                                                            </>
                                                                        )}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleRejectClick(membership.id)}
                                                                        className={`${cardStyles.actionButton} ${cardStyles.actionButtonDanger}`}
                                                                        disabled={processing === membership.id}
                                                                    >
                                                                        <XCircle size={16} />
                                                                        Reject
                                                                    </button>
                                                                </>
                                                            )}
                                                            {membership.status !== 'pending' && (
                                                                <button
                                                                    onClick={() => handleDelete(membership.id)}
                                                                    className={`${cardStyles.actionButton} ${cardStyles.actionButtonDanger}`}
                                                                    disabled={processing === membership.id}
                                                                >
                                                                    {processing === membership.id ? (
                                                                        <div className={styles.spinnerSmall}></div>
                                                                    ) : (
                                                                        <>
                                                                            <Trash2 size={16} />
                                                                            Delete
                                                                        </>
                                                                    )}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className={cardStyles.pagination}>
                    <button
                        className={cardStyles.paginationButton}
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                    >
                        ‹
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                        <button
                            key={page}
                            className={`${cardStyles.paginationButton} ${currentPage === page ? cardStyles.paginationButtonActive : ''}`}
                            onClick={() => setCurrentPage(page)}
                        >
                            {page}
                        </button>
                    ))}
                    <button
                        className={cardStyles.paginationButton}
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                    >
                        ›
                    </button>
                    <div className={cardStyles.paginationInfo}>
                        Page {currentPage} of {totalPages} ({userGroups.length} users)
                    </div>
                </div>
            )}

            {/* Details Modal */}
            {showDetailsModal && selectedMembership && (
                <div className={styles.modalOverlay} onClick={() => {
                    setShowDetailsModal(false);
                    setSelectedMembership(null);
                }}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <div>
                                <h2>Membership Details</h2>
                                <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                                    ID: #{selectedMembership.id} • {selectedMembership.user_name || 'Unknown User'}
                                </div>
                            </div>
                            <button
                                className={styles.modalClose}
                                onClick={() => {
                                    setShowDetailsModal(false);
                                    setSelectedMembership(null);
                                }}
                            >
                                ×
                            </button>
                        </div>

                        <div className={styles.modalBody}>
                            {/* Simple Membership Details */}
                            <div className={styles.detailsGrid}>
                                <div className={styles.detailSection}>
                                    <h3>User Information</h3>
                                    <div className={styles.detailRow}>
                                        <span className={styles.detailLabel}>Name:</span>
                                        <span className={styles.detailValue}>{selectedMembership.user_name || 'N/A'}</span>
                                    </div>
                                    <div className={styles.detailRow}>
                                        <span className={styles.detailLabel}>Email:</span>
                                        <span className={styles.detailValue}>{selectedMembership.user_email || 'N/A'}</span>
                                    </div>
                                </div>

                                <div className={styles.detailSection}>
                                    <h3>Membership Plan</h3>
                                    <div className={styles.detailRow}>
                                        <span className={styles.detailLabel}>Membership ID:</span>
                                        <span className={styles.detailValue}>#{selectedMembership.id}</span>
                                    </div>
                                    <div className={styles.detailRow}>
                                        <span className={styles.detailLabel}>Plan:</span>
                                        <span className={styles.detailValue}>
                                            {selectedMembership.plan_name.charAt(0).toUpperCase() + selectedMembership.plan_name.slice(1)}
                                        </span>
                                    </div>
                                    <div className={styles.detailRow}>
                                        <span className={styles.detailLabel}>Membership Created:</span>
                                        <span className={styles.detailValue}>{formatDate(selectedMembership.created_at)}</span>
                                    </div>
                                    {selectedMembership.membership_start_date && (
                                        <div className={styles.detailRow}>
                                            <span className={styles.detailLabel}>Start Date:</span>
                                            <span className={styles.detailValue}>{formatDate(selectedMembership.membership_start_date)}</span>
                                        </div>
                                    )}
                                    {selectedMembership.membership_end_date && (
                                        <div className={styles.detailRow}>
                                            <span className={styles.detailLabel}>End Date:</span>
                                            <span className={styles.detailValue}>
                                                {formatDate(selectedMembership.membership_end_date)}
                                                {(() => {
                                                    const endDate = new Date(selectedMembership.membership_end_date);
                                                    const now = new Date();
                                                    const daysDiff = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                                                    if (daysDiff < 0) {
                                                        return <span style={{ marginLeft: '0.5rem', color: '#dc2626', fontSize: '0.875rem' }}>(Expired {Math.abs(daysDiff)} days ago)</span>;
                                                    } else if (daysDiff <= 4) {
                                                        return <span style={{ marginLeft: '0.5rem', color: '#f59e0b', fontSize: '0.875rem' }}>(Expires in {daysDiff} days)</span>;
                                                    }
                                                    return null;
                                                })()}
                                            </span>
                                        </div>
                                    )}
                                    {allPayments.length > 1 && (
                                        <div className={styles.detailRow} style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #e5e7eb' }}>
                                            <span className={styles.detailLabel} style={{ fontWeight: '600', color: '#1f2937' }}>Payment History:</span>
                                            <span className={styles.detailValue} style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                                                {allPayments.length} payment{allPayments.length !== 1 ? 's' : ''} total
                                                {allPayments.filter((p: any) => p.status === 'verified').length > 0 && (
                                                    <span style={{ marginLeft: '0.5rem', color: '#22c55e' }}>
                                                        ({allPayments.filter((p: any) => p.status === 'verified').length} verified)
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                    )}
                                    <div className={styles.detailRow} style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #e5e7eb' }}>
                                        <span className={styles.detailLabel} style={{ fontWeight: '600', color: '#1f2937' }}>Membership Type:</span>
                                        <span className={styles.detailValue} style={{
                                            color: allPayments.length > 1 ? '#f59e0b' : '#3b82f6',
                                            fontWeight: '600'
                                        }}>
                                            Payment History
                                        </span>
                                    </div>
                                    <div className={styles.detailRow}>
                                        <span className={styles.detailLabel}>Training Type:</span>
                                        <span className={styles.detailValue}>
                                            {selectedMembership.addons?.some((a: any) => a.addon_type === 'in_gym')
                                                ? 'In-Gym Training'
                                                : (selectedMembership.plan_type === 'online' ? 'Online Training' : 'In-Gym Training')}
                                        </span>
                                    </div>
                                    <div className={styles.detailRow}>
                                        <span className={styles.detailLabel}>Duration:</span>
                                        <span className={styles.detailValue}>{selectedMembership.duration_months} months</span>
                                    </div>
                                    <div className={styles.detailRow}>
                                        <span className={styles.detailLabel}>Price:</span>
                                        <span className={styles.detailValue}>₹{selectedMembership.price.toLocaleString()}</span>
                                    </div>
                                </div>

                                {selectedMembership.transaction_id && (
                                    <div className={styles.detailSection}>
                                        <h3>Payment Information</h3>
                                        <div className={styles.detailRow}>
                                            <span className={styles.detailLabel}>Transaction ID:</span>
                                            <span className={styles.detailValue}>{selectedMembership.transaction_id}</span>
                                        </div>
                                        {selectedMembership.payment_date && (
                                            <div className={styles.detailRow}>
                                                <span className={styles.detailLabel}>Payment Date:</span>
                                                <span className={styles.detailValue}>{formatDate(selectedMembership.payment_date)}</span>
                                            </div>
                                        )}
                                        <div className={styles.detailRow}>
                                            <span className={styles.detailLabel}>Base Plan Amount:</span>
                                            <span className={styles.detailValue}>₹{selectedMembership.price?.toLocaleString() || '0'}</span>
                                        </div>
                                        {selectedMembership.addons && selectedMembership.addons.length > 0 && (
                                            <>
                                                <div className={styles.detailRow}>
                                                    <span className={styles.detailLabel}>Add-ons:</span>
                                                    <span className={styles.detailValue}>
                                                        {selectedMembership.addons.map((addon: any, idx: number) => (
                                                            <div key={idx} style={{ marginBottom: '4px' }}>
                                                                {addon.addon_type === 'in_gym' ? 'In-Gym Add-On' :
                                                                    addon.addon_type === 'personal_trainer' ? `Personal Trainer (${addon.trainer_name || 'N/A'})` :
                                                                        addon.addon_type} - ₹{addon.price?.toLocaleString() || '0'}
                                                            </div>
                                                        ))}
                                                    </span>
                                                </div>
                                                <div className={styles.detailRow}>
                                                    <span className={styles.detailLabel}>Add-ons Total:</span>
                                                    <span className={styles.detailValue}>
                                                        ₹{(selectedMembership.addons || [])
                                                            .filter((a: any) => a.status === 'active' || a.status === 'pending')
                                                            .reduce((sum: number, addon: any) => sum + (parseFloat(addon.price) || 0), 0)
                                                            .toLocaleString()}
                                                    </span>
                                                </div>
                                            </>
                                        )}
                                        <div className={styles.detailRow}>
                                            <span className={styles.detailLabel} style={{ fontWeight: 'bold', fontSize: '1.1em' }}>Total Payment Amount:</span>
                                            <span className={styles.detailValue} style={{ fontWeight: 'bold', fontSize: '1.1em', color: '#22c55e' }}>
                                                ₹{(() => {
                                                    const basePrice = selectedMembership.price || 0;
                                                    // Include both active and pending addons (pending ones are being paid for)
                                                    const relevantAddons = (selectedMembership.addons || []).filter((a: any) =>
                                                        a.status === 'active' || a.status === 'pending'
                                                    );
                                                    const addonsTotal = relevantAddons
                                                        .reduce((sum: number, addon: any) => sum + (parseFloat(addon.price) || 0), 0);
                                                    return (basePrice + addonsTotal).toLocaleString();
                                                })()}
                                            </span>
                                        </div>
                                        {/* Show all payment screenshots */}
                                        <div className={styles.detailRow} style={{ flexDirection: 'column', alignItems: 'flex-start', marginTop: '1rem' }}>
                                            <div style={{ marginBottom: '0.75rem', width: '100%' }}>
                                                <span className={styles.detailLabel} style={{ fontWeight: '600', fontSize: '1rem', color: '#1f2937' }}>
                                                    💳 Payment History ({allPayments.length} {allPayments.length === 1 ? 'Payment' : 'Payments'}):
                                                </span>
                                                <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: '0.25rem' }}>
                                                    {allPayments.filter((p: any) => p.paymentType === 'initial').length > 0 && (
                                                        <span style={{ marginRight: '1rem' }}>
                                                            🎯 {allPayments.filter((p: any) => p.paymentType === 'initial').length} Initial Purchase
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {loadingPayments ? (
                                                <span>Loading payments...</span>
                                            ) : allPayments.length > 0 ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
                                                    {allPayments.map((payment, index) => (
                                                        <div key={payment.id} style={{
                                                            padding: '0.75rem',
                                                            border: `2px solid ${payment.paymentTypeColor || '#e5e7eb'}`,
                                                            borderRadius: '0.5rem',
                                                            background: '#f9fafb',
                                                            position: 'relative'
                                                        }}>
                                                            {/* Payment Type Badge */}
                                                            <div style={{
                                                                position: 'absolute',
                                                                top: '0.5rem',
                                                                right: '0.5rem',
                                                                padding: '0.25rem 0.5rem',
                                                                borderRadius: '0.375rem',
                                                                background: payment.paymentTypeColor || '#6b7280',
                                                                color: 'white',
                                                                fontSize: '0.75rem',
                                                                fontWeight: '600',
                                                                textTransform: 'uppercase'
                                                            }}>
                                                                {payment.paymentTypeLabel || 'Payment'}
                                                            </div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', paddingRight: '120px' }}>
                                                                <div>
                                                                    <div style={{ fontWeight: '600', fontSize: '0.875rem', color: '#1f2937', marginBottom: '0.25rem' }}>
                                                                        Payment #{index + 1}
                                                                    </div>
                                                                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                                                                        📅 Date: {payment.payment_date ? formatDate(payment.payment_date) : 'N/A'} •
                                                                        💰 Amount: ₹{payment.amount?.toLocaleString() || '0'} •
                                                                        Status: <span style={{
                                                                            color: payment.status === 'verified' ? '#22c55e' :
                                                                                payment.status === 'pending' ? '#f59e0b' : '#ef4444',
                                                                            fontWeight: '500'
                                                                        }}>{payment.status || 'pending'}</span>
                                                                    </div>
                                                                    {payment.transaction_id && (
                                                                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                                                                            🔑 Transaction ID: {payment.transaction_id}
                                                                        </div>
                                                                    )}
                                                                    {payment.paymentType === 'initial' && (
                                                                        <div style={{ fontSize: '0.75rem', color: '#3b82f6', marginTop: '0.25rem', fontStyle: 'italic' }}>
                                                                            This is the original membership purchase
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                {payment.screenshotUrl ? (
                                                                    <a
                                                                        href={payment.screenshotUrl}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className={styles.screenshotLink}
                                                                        style={{ marginLeft: 'auto' }}
                                                                    >
                                                                        <ImageIcon size={16} />
                                                                        View Screenshot
                                                                    </a>
                                                                ) : payment.payment_screenshot_url ? (
                                                                    <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>Screenshot unavailable</span>
                                                                ) : (
                                                                    <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>No screenshot</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>No payments found</span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className={styles.detailSection}>
                                    <h3>Status</h3>
                                    <div className={styles.detailRow}>
                                        <span className={styles.detailLabel}>Current Status:</span>
                                        <span className={`${styles.statusBadge} ${selectedMembership.status === 'active' ? styles.badgeSuccess :
                                            selectedMembership.status === 'pending' ? styles.badgeWarning :
                                                styles.badgeDanger
                                            }`}>
                                            {selectedMembership.status.charAt(0).toUpperCase() + selectedMembership.status.slice(1)}
                                        </span>
                                    </div>
                                    {selectedMembership.start_date && (
                                        <div className={styles.detailRow}>
                                            <span className={styles.detailLabel}>Start Date:</span>
                                            <span className={styles.detailValue}>{formatDate(selectedMembership.start_date)}</span>
                                        </div>
                                    )}
                                    {selectedMembership.end_date && (
                                        <div className={styles.detailRow}>
                                            <span className={styles.detailLabel}>End Date:</span>
                                            <span className={styles.detailValue}>{formatDate(selectedMembership.end_date)}</span>
                                        </div>
                                    )}
                                    {selectedMembership.membership_start_date && (
                                        <div className={styles.detailRow}>
                                            <span className={styles.detailLabel}>Membership Start:</span>
                                            <span className={styles.detailValue}>{formatDate(selectedMembership.membership_start_date)}</span>
                                        </div>
                                    )}
                                    {selectedMembership.membership_end_date && (
                                        <div className={styles.detailRow}>
                                            <span className={styles.detailLabel}>Membership End:</span>
                                            <span className={styles.detailValue}>{formatDate(selectedMembership.membership_end_date)}</span>
                                        </div>
                                    )}
                                </div>

                                <div className={styles.detailSection}>
                                    <h3>Trainer Assignment</h3>
                                    {selectedMembership.trainer_assigned && selectedMembership.trainer_id ? (
                                        <>
                                            <div className={styles.detailRow}>
                                                <span className={styles.detailLabel}>Assigned Trainer:</span>
                                                <span className={styles.detailValue}>
                                                    {selectedMembership.trainer_name || 'N/A'}
                                                </span>
                                            </div>
                                            {selectedMembership.trainer_period_end && (
                                                <div className={styles.detailRow}>
                                                    <span className={styles.detailLabel}>Trainer Period End:</span>
                                                    <span className={styles.detailValue}>
                                                        {(() => {
                                                            const effectiveEnd = getEffectiveTrainerPeriodEnd(selectedMembership);
                                                            return effectiveEnd ? formatDate(effectiveEnd.toISOString()) : formatDate(selectedMembership.trainer_period_end);
                                                        })()}
                                                        {(() => {
                                                            const trainerExpiration = getTrainerPeriodExpirationStatus(selectedMembership);
                                                            if (trainerExpiration.isExpiringSoon) {
                                                                return <span style={{ color: '#d97706', marginLeft: '0.5rem' }}>(Expiring in {trainerExpiration.daysRemaining} days)</span>;
                                                            } else if (trainerExpiration.isExpired) {
                                                                return <span style={{ color: '#dc2626', marginLeft: '0.5rem' }}>(Expired)</span>;
                                                            }
                                                            return null;
                                                        })()}
                                                    </span>
                                                </div>
                                            )}
                                            <div className={styles.detailRow}>
                                                <span className={styles.detailLabel}>Trainer Addon:</span>
                                                <span className={styles.detailValue}>
                                                    {selectedMembership.trainer_addon ? 'Yes' : 'No (Included in plan)'}
                                                </span>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className={styles.detailRow}>
                                                <span className={styles.detailLabel}>Trainer Status:</span>
                                                <span className={styles.detailValue}>Not Assigned</span>
                                            </div>
                                            {(selectedMembership.plan_name.toLowerCase() === 'premium' ||
                                                selectedMembership.plan_name.toLowerCase() === 'elite') &&
                                                selectedMembership.status === 'active' && (
                                                    <div className={styles.detailRow}>
                                                        <span className={styles.detailLabel}>Assign Trainer:</span>
                                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                            <select
                                                                value={selectedTrainerId}
                                                                onChange={(e) => setSelectedTrainerId(e.target.value)}
                                                                style={{
                                                                    padding: '0.5rem',
                                                                    border: '1px solid #e5e7eb',
                                                                    borderRadius: '0.375rem',
                                                                    fontSize: '0.875rem',
                                                                    minWidth: '200px'
                                                                }}
                                                            >
                                                                <option value="">Select a trainer...</option>
                                                                {trainers.filter(t => t.is_active).map(trainer => (
                                                                    <option key={trainer.id} value={trainer.id}>
                                                                        {trainer.name}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                            <button
                                                                onClick={() => handleAssignTrainer(selectedMembership.id)}
                                                                disabled={!selectedTrainerId || assigningTrainer}
                                                                style={{
                                                                    padding: '0.5rem 1rem',
                                                                    backgroundColor: '#3b82f6',
                                                                    color: 'white',
                                                                    border: 'none',
                                                                    borderRadius: '0.375rem',
                                                                    cursor: assigningTrainer || !selectedTrainerId ? 'not-allowed' : 'pointer',
                                                                    opacity: assigningTrainer || !selectedTrainerId ? 0.6 : 1,
                                                                    fontSize: '0.875rem'
                                                                }}
                                                            >
                                                                {assigningTrainer ? 'Assigning...' : 'Assign Trainer'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                        </>
                                    )}
                                </div>

                                {selectedMembership.form_data && (
                                    <div className={styles.detailSection}>
                                        <h3>Application Form Data</h3>
                                        <div className={styles.detailRow}>
                                            <span className={styles.detailLabel}>Form Submitted:</span>
                                            <span className={styles.detailValue}>Yes</span>
                                        </div>
                                        <div className={styles.detailRow}>
                                            <button
                                                onClick={() => handleDownloadForm(selectedMembership)}
                                                className={styles.downloadFormButton}
                                            >
                                                <FileDown size={16} />
                                                Download Form Data
                                            </button>
                                        </div>
                                        <div className={styles.formDataPreview}>
                                            <h4>Form Preview:</h4>
                                            <pre className={styles.formDataText}>
                                                {JSON.stringify(selectedMembership.form_data, null, 2)}
                                            </pre>
                                        </div>
                                    </div>
                                )}

                            </div>
                        </div>

                        <div className={styles.modalFooter}>
                            {selectedMembership.status === 'pending' && (
                                <>
                                    <button
                                        className={styles.modalButtonSecondary}
                                        onClick={() => {
                                            setShowDetailsModal(false);
                                            setSelectedMembership(null);
                                        }}
                                    >
                                        Close
                                    </button>
                                    <button
                                        className={styles.modalButtonDanger}
                                        onClick={() => handleRejectClick(selectedMembership.id)}
                                        disabled={processing === selectedMembership.id}
                                    >
                                        <XCircle size={18} />
                                        Reject
                                    </button>
                                    <button
                                        className={styles.modalButtonPrimary}
                                        onClick={() => handleApprove(selectedMembership.id)}
                                        disabled={processing === selectedMembership.id}
                                    >
                                        {processing === selectedMembership.id ? (
                                            <>
                                                <div className={styles.spinnerSmall}></div>
                                                Processing...
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle size={18} />
                                                Approve
                                            </>
                                        )}
                                    </button>
                                </>
                            )}
                            {selectedMembership.status !== 'pending' && (
                                <>
                                    <button
                                        className={styles.modalButtonSecondary}
                                        onClick={() => {
                                            setShowDetailsModal(false);
                                            setSelectedMembership(null);
                                        }}
                                    >
                                        Close
                                    </button>
                                    <button
                                        className={styles.modalButtonDanger}
                                        onClick={() => {
                                            handleDelete(selectedMembership.id);
                                        }}
                                        disabled={processing === selectedMembership.id}
                                    >
                                        {processing === selectedMembership.id ? (
                                            <>
                                                <div className={styles.spinnerSmall}></div>
                                                Deleting...
                                            </>
                                        ) : (
                                            <>
                                                <Trash2 size={18} />
                                                Delete Membership
                                            </>
                                        )}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Reject Modal */}
            {showRejectModal && (
                <div className={styles.modalOverlay} onClick={() => {
                    setShowRejectModal(false);
                    setRejectReason('');
                    setMembershipToReject(null);
                }}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2>Reject Membership</h2>
                            <button
                                className={styles.modalClose}
                                onClick={() => {
                                    setShowRejectModal(false);
                                    setRejectReason('');
                                    setMembershipToReject(null);
                                }}
                            >
                                ×
                            </button>
                        </div>

                        <div className={styles.modalBody}>
                            <p style={{ marginBottom: '1rem', color: '#6b7280' }}>
                                Please provide a reason for rejecting this membership. The user will be notified with this reason.
                            </p>
                            <div className={styles.formGroup}>
                                <label htmlFor="rejectReason">Rejection Reason *</label>
                                <textarea
                                    id="rejectReason"
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    placeholder="Enter the reason for rejection..."
                                    rows={4}
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        border: '1px solid #e5e7eb',
                                        borderRadius: '0.5rem',
                                        fontSize: '0.875rem',
                                        fontFamily: 'inherit',
                                        resize: 'vertical'
                                    }}
                                />
                            </div>
                        </div>

                        <div className={styles.modalFooter}>
                            <button
                                className={styles.modalButtonSecondary}
                                onClick={() => {
                                    setShowRejectModal(false);
                                    setRejectReason('');
                                    setMembershipToReject(null);
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                className={styles.modalButtonDanger}
                                onClick={handleReject}
                                disabled={!rejectReason.trim() || processing === membershipToReject}
                            >
                                {processing === membershipToReject ? (
                                    <>
                                        <div className={styles.spinnerSmall}></div>
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        <XCircle size={18} />
                                        Reject Membership
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

