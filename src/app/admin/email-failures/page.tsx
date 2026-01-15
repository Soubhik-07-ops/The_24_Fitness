'use client';

import { useState, useEffect, useMemo } from 'react';
import { Mail, AlertCircle, CheckCircle, XCircle, RefreshCw, Filter, Clock, User, CreditCard, Calendar } from 'lucide-react';
import styles from './email-failures.module.css';

interface EmailFailure {
    id: number;
    user_id: string;
    membership_id: number | null;
    event_type: string;
    email_address: string;
    error_message: string;
    retry_count: number;
    last_attempt_at: string;
    resolved_at: string | null;
    created_at: string;
    profiles?: { full_name: string } | null;
    memberships?: { id: number; plan_name: string; status: string } | null;
}

interface Summary {
    unresolved: number;
    resolved: number;
    total: number;
}

export default function EmailFailuresPage() {
    const [failures, setFailures] = useState<EmailFailure[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'unresolved' | 'resolved'>('unresolved');
    const [summary, setSummary] = useState<Summary>({ unresolved: 0, resolved: 0, total: 0 });
    const [error, setError] = useState<string | null>(null);
    const [resolvingId, setResolvingId] = useState<number | null>(null);

    const fetchFailures = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`/api/admin/email-failures?filter=${filter}&limit=200`, {
                credentials: 'include',
                cache: 'no-store'
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch email failures');
            }

            const data = await response.json();
            setFailures(data.failures || []);
            setSummary(data.summary || { unresolved: 0, resolved: 0, total: 0 });
        } catch (err: any) {
            setError(err.message || 'Failed to load email failures');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFailures();
    }, [filter]);

    const handleResolve = async (failureId: number, action: 'resolve' | 'unresolve') => {
        setResolvingId(failureId);
        try {
            const response = await fetch('/api/admin/email-failures', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    failureId,
                    action
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to update failure status');
            }

            // Refresh the list
            await fetchFailures();
        } catch (err: any) {
            setError(err.message || 'Failed to update failure status');
        } finally {
            setResolvingId(null);
        }
    };

    const formatEventType = (eventType: string): string => {
        const types: Record<string, string> = {
            'plan_expiry_reminder_5days': 'Plan Expiry Reminder (5 Days)',
            'plan_expiry_day': 'Plan Expiry Day',
            'grace_period_start': 'Grace Period Start',
            'grace_period_end': 'Grace Period End',
            'welcome_email': 'Welcome Email'
        };
        return types[eventType] || eventType;
    };

    const formatDate = (dateString: string): string => {
        const date = new Date(dateString);
        return date.toLocaleString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getTimeAgo = (dateString: string): string => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
        return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    };

    if (loading && failures.length === 0) {
        return (
            <div className={styles.pageContainer}>
                <div className={styles.loading}>
                    <RefreshCw size={24} className={styles.spinner} />
                    <p>Loading email failures...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.pageContainer}>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>
                        <Mail size={28} className={styles.titleIcon} />
                        Email Delivery Failures
                    </h1>
                    <p className={styles.pageSubtitle}>
                        Monitor and manage failed email delivery attempts
                    </p>
                </div>
                <button
                    onClick={fetchFailures}
                    disabled={loading}
                    className={styles.refreshButton}
                >
                    <RefreshCw size={18} className={loading ? styles.spinner : ''} />
                    Refresh
                </button>
            </div>

            {/* Summary Cards */}
            <div className={styles.summaryCards}>
                <div className={styles.summaryCard}>
                    <div className={styles.summaryCardHeader}>
                        <AlertCircle size={20} className={styles.unresolvedIcon} />
                        <span>Unresolved</span>
                    </div>
                    <div className={styles.summaryCardValue}>{summary.unresolved}</div>
                </div>
                <div className={styles.summaryCard}>
                    <div className={styles.summaryCardHeader}>
                        <CheckCircle size={20} className={styles.resolvedIcon} />
                        <span>Resolved</span>
                    </div>
                    <div className={styles.summaryCardValue}>{summary.resolved}</div>
                </div>
                <div className={styles.summaryCard}>
                    <div className={styles.summaryCardHeader}>
                        <Mail size={20} className={styles.totalIcon} />
                        <span>Total</span>
                    </div>
                    <div className={styles.summaryCardValue}>{summary.total}</div>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className={styles.filterTabs}>
                <button
                    className={`${styles.filterTab} ${filter === 'unresolved' ? styles.active : ''}`}
                    onClick={() => setFilter('unresolved')}
                >
                    <AlertCircle size={18} />
                    Unresolved ({summary.unresolved})
                </button>
                <button
                    className={`${styles.filterTab} ${filter === 'resolved' ? styles.active : ''}`}
                    onClick={() => setFilter('resolved')}
                >
                    <CheckCircle size={18} />
                    Resolved ({summary.resolved})
                </button>
                <button
                    className={`${styles.filterTab} ${filter === 'all' ? styles.active : ''}`}
                    onClick={() => setFilter('all')}
                >
                    <Filter size={18} />
                    All ({summary.total})
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

            {/* Failures Table */}
            {failures.length === 0 ? (
                <div className={styles.emptyState}>
                    <CheckCircle size={48} className={styles.emptyIcon} />
                    <h3>No Email Failures</h3>
                    <p>
                        {filter === 'unresolved'
                            ? 'All emails are being delivered successfully!'
                            : filter === 'resolved'
                            ? 'No resolved failures to display.'
                            : 'No email failures found.'}
                    </p>
                </div>
            ) : (
                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Email Type</th>
                                <th>Email Address</th>
                                <th>Error Message</th>
                                <th>Retries</th>
                                <th>Last Attempt</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {failures.map((failure) => (
                                <tr key={failure.id} className={failure.resolved_at ? styles.resolvedRow : ''}>
                                    <td>
                                        <div className={styles.userCell}>
                                            <User size={16} />
                                            <div>
                                                <div className={styles.userName}>
                                                    {failure.profiles?.full_name || 'Unknown User'}
                                                </div>
                                                {failure.memberships && (
                                                    <div className={styles.membershipInfo}>
                                                        <CreditCard size={12} />
                                                        {failure.memberships.plan_name}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <span className={styles.eventType}>
                                            {formatEventType(failure.event_type)}
                                        </span>
                                    </td>
                                    <td>
                                        <a
                                            href={`mailto:${failure.email_address}`}
                                            className={styles.emailLink}
                                        >
                                            {failure.email_address}
                                        </a>
                                    </td>
                                    <td>
                                        <div className={styles.errorMessageCell}>
                                            <AlertCircle size={14} />
                                            <span title={failure.error_message}>
                                                {failure.error_message.length > 60
                                                    ? `${failure.error_message.substring(0, 60)}...`
                                                    : failure.error_message}
                                            </span>
                                        </div>
                                    </td>
                                    <td>
                                        <span className={styles.retryCount}>
                                            {failure.retry_count}
                                        </span>
                                    </td>
                                    <td>
                                        <div className={styles.dateCell}>
                                            <Clock size={14} />
                                            <div>
                                                <div>{formatDate(failure.last_attempt_at)}</div>
                                                <div className={styles.timeAgo}>
                                                    {getTimeAgo(failure.last_attempt_at)}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        {failure.resolved_at ? (
                                            <span className={styles.statusBadgeResolved}>
                                                <CheckCircle size={14} />
                                                Resolved
                                            </span>
                                        ) : (
                                            <span className={styles.statusBadgeUnresolved}>
                                                <XCircle size={14} />
                                                Unresolved
                                            </span>
                                        )}
                                    </td>
                                    <td>
                                        {failure.resolved_at ? (
                                            <button
                                                onClick={() => handleResolve(failure.id, 'unresolve')}
                                                disabled={resolvingId === failure.id}
                                                className={styles.actionButton}
                                                title="Mark as unresolved for re-investigation"
                                            >
                                                Re-open
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleResolve(failure.id, 'resolve')}
                                                disabled={resolvingId === failure.id}
                                                className={styles.actionButtonResolve}
                                                title="Mark as resolved (email was sent successfully or issue is fixed)"
                                            >
                                                {resolvingId === failure.id ? 'Resolving...' : 'Resolve'}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

