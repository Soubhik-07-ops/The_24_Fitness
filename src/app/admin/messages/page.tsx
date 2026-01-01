'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { ChevronDown, MessageSquare, User } from 'lucide-react';
import adminStyles from '../admin.module.css';
import styles from './Messages.module.css';
import cardStyles from '@/components/UserCard/UserCard.module.css';

interface PendingRequest {
    id: string;
    user_id: string;
    subject: string | null;
    message: string | null;
    status: 'pending' | 'accepted' | 'declined';
    created_at: string;
    profiles?: { full_name?: string | null; email?: string | null } | null;
    full_name?: string | null;
    email?: string | null;
}

interface UserGroup {
    user_id: string;
    user_name: string;
    user_email: string;
    requests: PendingRequest[];
}

export default function AdminMessagesPage() {
    const [loading, setLoading] = useState(true);
    const [requests, setRequests] = useState<PendingRequest[]>([]);
    const [accepted, setAccepted] = useState<PendingRequest[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
    const [expandedAcceptedUsers, setExpandedAcceptedUsers] = useState<Set<string>>(new Set());
    const [currentPage, setCurrentPage] = useState(1);
    const [currentAcceptedPage, setCurrentAcceptedPage] = useState(1);
    const itemsPerPage = 10;

    const router = useRouter();

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const [r1, r2] = await Promise.all([
                fetch('/api/admin/contact/requests/pending', { cache: 'no-store', credentials: 'include' }),
                fetch('/api/admin/contact/requests/accepted', { cache: 'no-store', credentials: 'include' })
            ]);
            const d1 = await r1.json();
            const d2 = await r2.json();
            if (!r1.ok) throw new Error(d1.error || 'Failed to load pending');
            if (!r2.ok) throw new Error(d2.error || 'Failed to load accepted');
            setRequests(d1.requests || []);
            setAccepted(d2.requests || []);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);
    useEffect(() => {
        // realtime: update lists when contact_requests change
        const channel = supabase
            .channel('contact_requests_admin_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_requests' }, (payload) => {
                const row = payload.new as any;
                if (!row) return;
                setRequests(prev => prev.filter(p => p.id !== row.id));
                setAccepted(prev => prev.filter(p => p.id !== row.id));
                if (row.status === 'pending') setRequests(prev => [row, ...prev]);
                if (row.status === 'accepted') setAccepted(prev => [row, ...prev]);
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, []);

    // Group pending requests by user
    const pendingUserGroups = useMemo(() => {
        const grouped = new Map<string, UserGroup>();

        requests.forEach(request => {
            const userId = request.user_id;
            const userName = request.full_name || request.profiles?.full_name || 'Unknown User';
            const userEmail = request.email || request.profiles?.email || 'No email';

            if (!grouped.has(userId)) {
                grouped.set(userId, {
                    user_id: userId,
                    user_name: userName,
                    user_email: userEmail,
                    requests: []
                });
            }
            grouped.get(userId)!.requests.push(request);
        });

        return Array.from(grouped.values()).sort((a, b) =>
            b.requests[0].created_at.localeCompare(a.requests[0].created_at)
        );
    }, [requests]);

    // Group accepted requests by user
    const acceptedUserGroups = useMemo(() => {
        const grouped = new Map<string, UserGroup>();

        accepted.forEach(request => {
            const userId = request.user_id;
            const userName = request.full_name || request.profiles?.full_name || 'Unknown User';
            const userEmail = request.email || request.profiles?.email || 'No email';

            if (!grouped.has(userId)) {
                grouped.set(userId, {
                    user_id: userId,
                    user_name: userName,
                    user_email: userEmail,
                    requests: []
                });
            }
            grouped.get(userId)!.requests.push(request);
        });

        return Array.from(grouped.values()).sort((a, b) =>
            b.requests[0].created_at.localeCompare(a.requests[0].created_at)
        );
    }, [accepted]);

    // Pagination
    const pendingTotalPages = Math.ceil(pendingUserGroups.length / itemsPerPage);
    const paginatedPendingUsers = pendingUserGroups.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const acceptedTotalPages = Math.ceil(acceptedUserGroups.length / itemsPerPage);
    const paginatedAcceptedUsers = acceptedUserGroups.slice(
        (currentAcceptedPage - 1) * itemsPerPage,
        currentAcceptedPage * itemsPerPage
    );

    const toggleUserExpanded = (userId: string, isAccepted: boolean = false) => {
        if (isAccepted) {
            setExpandedAcceptedUsers(prev => {
                const newSet = new Set(prev);
                if (newSet.has(userId)) {
                    newSet.delete(userId);
                } else {
                    newSet.add(userId);
                }
                return newSet;
            });
        } else {
            setExpandedUsers(prev => {
                const newSet = new Set(prev);
                if (newSet.has(userId)) {
                    newSet.delete(userId);
                } else {
                    newSet.add(userId);
                }
                return newSet;
            });
        }
    };

    const act = async (id: string, action: 'accept' | 'decline') => {
        const res = await fetch(`/api/admin/contact/requests/${id}/${action}`, { method: 'POST', credentials: 'include' });
        if (res.ok) {
            if (action === 'accept') router.push(`/admin/messages/${id}`);
            else load();
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className={adminStyles.content}>
            <div className={styles.headerRow}>
                <h1 className={styles.title}>Message Requests</h1>
                <button className={adminStyles.refreshButton} onClick={load}>Refresh</button>
            </div>
            {loading && <div className={adminStyles.loadingState}><div className={adminStyles.spinner}></div>Loading…</div>}
            {error && (
                <div className={adminStyles.errorState}>
                    <h3>Failed to load requests</h3>
                    <p>{error}</p>
                    <button className={adminStyles.retryButton} onClick={load}>Try again</button>
                </div>
            )}
            <div className={styles.section}>
                <div className={styles.sectionTitle}>Pending Requests ({requests.length})</div>
                {!loading && paginatedPendingUsers.length === 0 && (
                    <div className={cardStyles.emptyState}>
                        <MessageSquare className={cardStyles.emptyStateIcon} />
                        <div className={cardStyles.emptyStateTitle}>No pending requests</div>
                        <div className={cardStyles.emptyStateText}>No users have submitted message requests yet.</div>
                    </div>
                )}
                <div className={styles.cardsContainer}>
                    {paginatedPendingUsers.map((userGroup) => {
                        const isExpanded = expandedUsers.has(userGroup.user_id);
                        return (
                            <div key={userGroup.user_id} className={cardStyles.userCard}>
                                <div
                                    className={`${cardStyles.userCardHeader} ${isExpanded ? cardStyles.userCardHeaderExpanded : ''}`}
                                    onClick={() => toggleUserExpanded(userGroup.user_id, false)}
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
                                            <div className={cardStyles.statValue}>{userGroup.requests.length}</div>
                                            <div className={cardStyles.statLabel}>Requests</div>
                                        </div>
                                    </div>
                                    <ChevronDown
                                        className={`${cardStyles.expandIcon} ${isExpanded ? cardStyles.expandIconExpanded : ''}`}
                                    />
                                </div>

                                <div className={`${cardStyles.userCardContent} ${isExpanded ? cardStyles.userCardContentExpanded : ''}`}>
                                    <div className={cardStyles.itemsList}>
                                        {userGroup.requests.map((request) => (
                                            <div key={request.id} className={cardStyles.itemCard}>
                                                <div className={cardStyles.itemHeader}>
                                                    <div>
                                                        <div className={cardStyles.itemTitle}>
                                                            {request.subject || 'No subject'}
                                                        </div>
                                                        <div className={cardStyles.itemMeta}>
                                                            <span className={cardStyles.itemBadge} style={{
                                                                background: '#fef3c7',
                                                                color: '#92400e'
                                                            }}>
                                                                Pending
                                                            </span>
                                                            <span>•</span>
                                                            <span>{formatDate(request.created_at)}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className={cardStyles.itemDetails}>
                                                    <div className={cardStyles.detailRow}>
                                                        <div className={cardStyles.detailLabel}>Message</div>
                                                        <div className={cardStyles.detailValue} style={{
                                                            fontStyle: request.message ? 'normal' : 'italic',
                                                            color: request.message ? '#111827' : '#9ca3af'
                                                        }}>
                                                            {request.message || 'No message provided'}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className={cardStyles.itemActions}>
                                                    <button
                                                        onClick={() => act(request.id, 'accept')}
                                                        className={`${cardStyles.actionButton} ${cardStyles.actionButtonSuccess}`}
                                                    >
                                                        <MessageSquare size={16} />
                                                        Accept & Open Chat
                                                    </button>
                                                    <button
                                                        onClick={() => act(request.id, 'decline')}
                                                        className={`${cardStyles.actionButton} ${cardStyles.actionButtonDanger}`}
                                                    >
                                                        Decline
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Pagination for Pending */}
                {pendingTotalPages > 1 && (
                    <div className={cardStyles.pagination}>
                        <button
                            className={cardStyles.paginationButton}
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                        >
                            ‹
                        </button>
                        {Array.from({ length: pendingTotalPages }, (_, i) => i + 1).map(page => (
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
                            onClick={() => setCurrentPage(prev => Math.min(pendingTotalPages, prev + 1))}
                            disabled={currentPage === pendingTotalPages}
                        >
                            ›
                        </button>
                        <div className={cardStyles.paginationInfo}>
                            Page {currentPage} of {pendingTotalPages} ({pendingUserGroups.length} users)
                        </div>
                    </div>
                )}
            </div>

            <div className={styles.section}>
                <div className={styles.sectionTitle}>Active Chats ({accepted.length})</div>
                {!loading && paginatedAcceptedUsers.length === 0 && (
                    <div className={cardStyles.emptyState}>
                        <MessageSquare className={cardStyles.emptyStateIcon} />
                        <div className={cardStyles.emptyStateTitle}>No active chats</div>
                        <div className={cardStyles.emptyStateText}>No active chat conversations yet.</div>
                    </div>
                )}
                <div className={styles.cardsContainer}>
                    {paginatedAcceptedUsers.map((userGroup) => {
                        const isExpanded = expandedAcceptedUsers.has(userGroup.user_id);
                        return (
                            <div key={userGroup.user_id} className={cardStyles.userCard}>
                                <div
                                    className={`${cardStyles.userCardHeader} ${isExpanded ? cardStyles.userCardHeaderExpanded : ''}`}
                                    onClick={() => toggleUserExpanded(userGroup.user_id, true)}
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
                                            <div className={cardStyles.statValue}>{userGroup.requests.length}</div>
                                            <div className={cardStyles.statLabel}>Chats</div>
                                        </div>
                                    </div>
                                    <ChevronDown
                                        className={`${cardStyles.expandIcon} ${isExpanded ? cardStyles.expandIconExpanded : ''}`}
                                    />
                                </div>

                                <div className={`${cardStyles.userCardContent} ${isExpanded ? cardStyles.userCardContentExpanded : ''}`}>
                                    <div className={cardStyles.itemsList}>
                                        {userGroup.requests.map((request) => (
                                            <div key={request.id} className={cardStyles.itemCard}>
                                                <div className={cardStyles.itemHeader}>
                                                    <div>
                                                        <div className={cardStyles.itemTitle}>
                                                            {request.subject || 'No subject'}
                                                        </div>
                                                        <div className={cardStyles.itemMeta}>
                                                            <span className={cardStyles.itemBadge} style={{
                                                                background: '#d1fae5',
                                                                color: '#065f46'
                                                            }}>
                                                                Active
                                                            </span>
                                                            <span>•</span>
                                                            <span>{formatDate(request.created_at)}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className={cardStyles.itemDetails}>
                                                    <div className={cardStyles.detailRow}>
                                                        <div className={cardStyles.detailLabel}>Initial Message</div>
                                                        <div className={cardStyles.detailValue} style={{
                                                            fontStyle: request.message ? 'normal' : 'italic',
                                                            color: request.message ? '#111827' : '#9ca3af'
                                                        }}>
                                                            {request.message || 'No message provided'}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className={cardStyles.itemActions}>
                                                    <button
                                                        onClick={() => router.push(`/admin/messages/${request.id}`)}
                                                        className={`${cardStyles.actionButton} ${cardStyles.actionButtonPrimary}`}
                                                    >
                                                        <MessageSquare size={16} />
                                                        Open Chat
                                                    </button>
                                                    <button
                                                        onClick={async () => {
                                                            if (!confirm('Delete this chat? This will remove all messages.')) return;
                                                            try {
                                                                const res = await fetch(`/api/admin/contact/requests/${request.id}`, { method: 'DELETE', credentials: 'include' });
                                                                if (res.ok) load();
                                                            } catch (error) {
                                                                setError('Failed to delete chat');
                                                            }
                                                        }}
                                                        className={`${cardStyles.actionButton} ${cardStyles.actionButtonDanger}`}
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Pagination for Accepted */}
                {acceptedTotalPages > 1 && (
                    <div className={cardStyles.pagination}>
                        <button
                            className={cardStyles.paginationButton}
                            onClick={() => setCurrentAcceptedPage(prev => Math.max(1, prev - 1))}
                            disabled={currentAcceptedPage === 1}
                        >
                            ‹
                        </button>
                        {Array.from({ length: acceptedTotalPages }, (_, i) => i + 1).map(page => (
                            <button
                                key={page}
                                className={`${cardStyles.paginationButton} ${currentAcceptedPage === page ? cardStyles.paginationButtonActive : ''}`}
                                onClick={() => setCurrentAcceptedPage(page)}
                            >
                                {page}
                            </button>
                        ))}
                        <button
                            className={cardStyles.paginationButton}
                            onClick={() => setCurrentAcceptedPage(prev => Math.min(acceptedTotalPages, prev + 1))}
                            disabled={currentAcceptedPage === acceptedTotalPages}
                        >
                            ›
                        </button>
                        <div className={cardStyles.paginationInfo}>
                            Page {currentAcceptedPage} of {acceptedTotalPages} ({acceptedUserGroups.length} users)
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}


