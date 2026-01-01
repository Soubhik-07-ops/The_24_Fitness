// src/app/trainer/messages/page.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { MessageSquare, User, Clock, RefreshCw, Trash2, ChevronDown } from 'lucide-react';
import Toast from '@/components/Toast/Toast';
import { useToast } from '@/hooks/useToast';
import styles from './messages.module.css';
import cardStyles from '@/components/UserCard/UserCard.module.css';

interface Conversation {
    user_id: string;
    user_name: string;
    avatar_url: string | null;
    latest_message: string;
    latest_message_time: string;
    unread_count: number;
}

export default function TrainerMessagesPage() {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const router = useRouter();
    const { toast, toastType, showToast, hideToast } = useToast();

    useEffect(() => {
        fetchConversations();
        const cleanup = setupRealtimeSubscription();
        return cleanup;
    }, []);

    const fetchConversations = async (showRefreshing = false) => {
        if (showRefreshing) setRefreshing(true);
        try {
            const response = await fetch('/api/trainer/messages', {
                credentials: 'include',
                cache: 'no-store'
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch conversations');
            }

            setConversations(data.conversations || []);
        } catch (error) {
            console.error('Error fetching conversations:', error);
        } finally {
            setLoading(false);
            if (showRefreshing) setRefreshing(false);
        }
    };

    const handleRefresh = async () => {
        await fetchConversations(true);
    };

    const handleRemoveConversation = async (userId: string, userName: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent navigation when clicking remove button

        if (!confirm(`Are you sure you want to remove the conversation with ${userName}? This will delete all messages. This action cannot be undone.`)) {
            return;
        }

        try {
            const response = await fetch(`/api/trainer/messages/${userId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to remove conversation');
            }

            // Remove conversation from local state immediately
            setConversations(prev => prev.filter(conv => conv.user_id !== userId));
        } catch (error: any) {
            console.error('Error removing conversation:', error);
            showToast(`Failed to remove conversation: ${error.message}`, 'error');
        }
    };

    const setupRealtimeSubscription = () => {
        const channel = supabase
            .channel('trainer_messages_realtime')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'trainer_messages'
            }, (payload) => {
                console.log('[TRAINER MESSAGES LIST] Received postgres_changes:', payload);
                fetchConversations();
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'trainer_messages'
            }, (payload) => {
                console.log('[TRAINER MESSAGES LIST] Received update:', payload);
                fetchConversations();
            })
            .on('postgres_changes', {
                event: 'DELETE',
                schema: 'public',
                table: 'trainer_messages'
            }, (payload) => {
                console.log('[TRAINER MESSAGES LIST] Received delete:', payload);
                fetchConversations();
            })
            .on('broadcast', { event: 'conversation_deleted' }, () => {
                console.log('[TRAINER MESSAGES LIST] Conversation deleted, refreshing');
                fetchConversations();
            })
            .subscribe((status) => {
                console.log('[TRAINER MESSAGES LIST] Subscription status:', status);
            });

        return () => {
            supabase.removeChannel(channel);
        };
    };

    // Pagination
    const totalPages = Math.ceil(conversations.length / itemsPerPage);
    const paginatedConversations = conversations.slice(
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

    const formatTime = (dateString: string) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
        return date.toLocaleDateString();
    };

    const formatFullDate = (dateString: string) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loadingState}>
                    <div className={styles.spinner}></div>
                    <p>Loading conversations...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Messages</h1>
                <button
                    className={styles.refreshButton}
                    onClick={handleRefresh}
                    disabled={refreshing}
                    title="Refresh conversations"
                >
                    <RefreshCw size={18} className={refreshing ? styles.refreshing : ''} />
                </button>
            </div>

            {conversations.length === 0 ? (
                <div className={cardStyles.emptyState}>
                    <MessageSquare className={cardStyles.emptyStateIcon} />
                    <div className={cardStyles.emptyStateTitle}>No conversations yet</div>
                    <div className={cardStyles.emptyStateText}>
                        Start chatting with clients who have selected you as their personal trainer.
                    </div>
                </div>
            ) : (
                <>
                    <div className={styles.cardsContainer}>
                        {paginatedConversations.map((conv) => {
                            const isExpanded = expandedUsers.has(conv.user_id);
                            return (
                                <div key={conv.user_id} className={cardStyles.userCard}>
                                    <div
                                        className={`${cardStyles.userCardHeader} ${isExpanded ? cardStyles.userCardHeaderExpanded : ''}`}
                                        onClick={() => toggleUserExpanded(conv.user_id)}
                                    >
                                        <div className={cardStyles.userInfo}>
                                            <div className={cardStyles.userAvatar}>
                                                {conv.avatar_url ? (
                                                    <img
                                                        src={conv.avatar_url}
                                                        alt={conv.user_name}
                                                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                                                    />
                                                ) : (
                                                    conv.user_name.charAt(0).toUpperCase()
                                                )}
                                            </div>
                                            <div className={cardStyles.userDetails}>
                                                <div className={cardStyles.userName}>{conv.user_name}</div>
                                                <div className={cardStyles.userEmail} style={{ fontSize: '0.8rem' }}>
                                                    {formatTime(conv.latest_message_time)}
                                                </div>
                                            </div>
                                        </div>
                                        <div className={cardStyles.userStats}>
                                            {conv.unread_count > 0 && (
                                                <div className={cardStyles.statItem}>
                                                    <div className={cardStyles.statValue} style={{
                                                        color: '#ef4444',
                                                        background: '#fee2e2',
                                                        borderRadius: '50%',
                                                        width: '32px',
                                                        height: '32px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '0.875rem'
                                                    }}>
                                                        {conv.unread_count}
                                                    </div>
                                                    <div className={cardStyles.statLabel}>Unread</div>
                                                </div>
                                            )}
                                        </div>
                                        <ChevronDown
                                            className={`${cardStyles.expandIcon} ${isExpanded ? cardStyles.expandIconExpanded : ''}`}
                                        />
                                    </div>

                                    <div className={`${cardStyles.userCardContent} ${isExpanded ? cardStyles.userCardContentExpanded : ''}`}>
                                        <div className={cardStyles.itemCard} style={{ margin: 0 }}>
                                            <div className={cardStyles.itemHeader}>
                                                <div>
                                                    <div className={cardStyles.itemTitle}>
                                                        Latest Message
                                                    </div>
                                                    <div className={cardStyles.itemMeta}>
                                                        <span>{formatFullDate(conv.latest_message_time)}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className={cardStyles.itemDetails}>
                                                <div className={cardStyles.detailRow}>
                                                    <div className={cardStyles.detailLabel}>Message Preview</div>
                                                    <div className={cardStyles.detailValue} style={{
                                                        fontStyle: conv.latest_message ? 'normal' : 'italic',
                                                        color: conv.latest_message ? '#111827' : '#9ca3af'
                                                    }}>
                                                        {conv.latest_message || 'No messages yet'}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className={cardStyles.itemActions}>
                                                <button
                                                    onClick={() => {
                                                        setSelectedUserId(conv.user_id);
                                                        router.push(`/trainer/messages/${conv.user_id}`);
                                                    }}
                                                    className={`${cardStyles.actionButton} ${cardStyles.actionButtonPrimary}`}
                                                >
                                                    <MessageSquare size={16} />
                                                    Open Chat
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRemoveConversation(conv.user_id, conv.user_name, e);
                                                    }}
                                                    className={`${cardStyles.actionButton} ${cardStyles.actionButtonDanger}`}
                                                >
                                                    <Trash2 size={16} />
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
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
                                Page {currentPage} of {totalPages} ({conversations.length} conversations)
                            </div>
                        </div>
                    )}
                </>
            )}
            <Toast message={toast} type={toastType} onClose={hideToast} />
        </div>
    );
}

