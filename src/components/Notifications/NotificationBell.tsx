'use client';

import { useEffect, useRef, useState, memo, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import Toast from '@/components/Toast/Toast';
import { useToast } from '@/hooks/useToast';
import styles from './bell.module.css';

interface Notification {
    id: string;
    type: string;
    content: string;
    request_id: string | null;
    is_read: boolean;
    created_at: string;
}

interface AdminNotification {
    id: string;
    content: string;
    type: string; // 'new_message' | 'new_request' | 'new_booking' | 'booking_cancelled' | 'booking_deleted' | etc.
    created_at: string;
    is_read?: boolean;
}

interface TrainerNotification {
    id: string;
    type: string;
    content: string;
    created_at: string;
    is_read: boolean;
}

function NotificationBell({ mode }: { mode: 'user' | 'admin' | 'trainer' }) {
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [adminNotifications, setAdminNotifications] = useState<AdminNotification[]>([]);
    const [trainerNotifications, setTrainerNotifications] = useState<TrainerNotification[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast, toastType, showToast, hideToast } = useToast();
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const bellRef = useRef<HTMLDivElement | null>(null);
    const isLoadingRef = useRef<boolean>(false); // Ref to track loading state for trainer notifications
    const recentNotificationsRef = useRef<Set<string>>(new Set()); // Ref to track recent notification reloads for debouncing
    const [swipingId, setSwipingId] = useState<string | null>(null);
    const [swipeOffset, setSwipeOffset] = useState<number>(0);
    const swipeStartX = useRef<number>(0);
    const swipeCurrentX = useRef<number>(0);

    // Filter out notifications older than 24 hours
    const filterOldNotifications = <T extends { created_at: string }>(notifs: T[]): T[] => {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return notifs.filter(n => new Date(n.created_at) > twentyFourHoursAgo);
    };

    const filteredNotifications = filterOldNotifications(notifications);
    const filteredAdminNotifications = filterOldNotifications(adminNotifications);
    const filteredTrainerNotifications = filterOldNotifications(trainerNotifications);

    const unreadCount = mode === 'user'
        ? filteredNotifications.filter(n => !n.is_read).length
        : mode === 'trainer'
            ? filteredTrainerNotifications.filter(n => !n.is_read).length
            : filteredAdminNotifications.filter(n => !n.is_read).length;

    useEffect(() => {
        let refreshInterval: any = null;

        const load = async () => {
            if (mode === 'user') {
                const { data: userData } = await supabase.auth.getUser();
                const userId = userData.user?.id;
                if (!userId) {
                    setLoading(false);
                    return;
                }

                // Load notifications directly from Supabase (faster and more reliable)
                const { data, error } = await supabase
                    .from('notifications')
                    .select('*')
                    .eq('recipient_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(50);

                if (error) {
                    console.error('Error loading notifications:', error);
                    setLoading(false);
                    return;
                }

                // Filter out old notifications on load
                const allNotifications = (data as any) || [];
                const filtered = allNotifications.filter((n: Notification) => {
                    const notifDate = new Date(n.created_at);
                    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                    return notifDate > twentyFourHoursAgo;
                });
                setNotifications(filtered);
                console.log('[USER NOTIFICATIONS] Initial load - loaded', filtered.length, 'notifications');
                setLoading(false);

                // Cleanup old notifications via API (run once per hour)
                const cleanupInterval = setInterval(async () => {
                    try {
                        await fetch('/api/notifications/cleanup', { method: 'POST' });
                    } catch (err) {
                        console.error('Failed to cleanup notifications:', err);
                    }
                }, 60 * 60 * 1000); // Every hour

                // Store cleanup interval for cleanup
                (window as any).__notificationCleanupInterval = cleanupInterval;

                // Subscribe to new notifications - use a stable channel name
                const channelName = `notifications_bell_user_${userId}`;
                const ch = supabase
                    .channel(channelName)
                    .on('postgres_changes', {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'notifications',
                        filter: `recipient_id=eq.${userId}`
                    }, (payload: any) => {
                        console.log('[USER NOTIFICATIONS] New notification received via postgres_changes:', payload.new);
                        const newNotif = payload.new as Notification;
                        setNotifications(prev => {
                            // Check if already exists to avoid duplicates
                            if (prev.some(n => n.id === newNotif.id)) {
                                console.log('[USER NOTIFICATIONS] Duplicate notification detected, skipping');
                                return prev;
                            }
                            // Filter out old notifications when adding new one
                            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                            const filtered = [newNotif, ...prev].filter(n =>
                                new Date(n.created_at) > twentyFourHoursAgo
                            );
                            console.log('[USER NOTIFICATIONS] Added notification to state, new count:', filtered.length);
                            return filtered;
                        });
                    })
                    .on('postgres_changes', {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'notifications',
                        filter: `recipient_id=eq.${userId}`
                    }, (payload: any) => {
                        const updated = payload.new as Notification;
                        setNotifications(prev => prev.map(n => n.id === updated.id ? updated : n));
                    })
                    .on('postgres_changes', {
                        event: 'DELETE',
                        schema: 'public',
                        table: 'notifications',
                        filter: `recipient_id=eq.${userId}`
                    }, (payload: any) => {
                        // Notification was deleted (auto-deleted when message is read)
                        const deletedId = payload.old?.id;
                        if (deletedId) {
                            console.log('[USER NOTIFICATIONS] Notification deleted:', deletedId);
                            setNotifications(prev => prev.filter(n => n.id !== deletedId));
                        }
                    })
                    .on('broadcast', { event: 'membership_approved' }, async (payload: any) => {
                        // Handle membership approval broadcast
                        const { notificationId, content } = payload.payload || {};
                        console.log('[USER NOTIFICATIONS] Received membership_approved broadcast, reloading...', { notificationId });

                        // Reload notifications to ensure it appears in the bell
                        const { data, error } = await supabase
                            .from('notifications')
                            .select('*')
                            .eq('recipient_id', userId)
                            .order('created_at', { ascending: false })
                            .limit(50);
                        if (!error && data) {
                            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                            const filtered = (data as any[]).filter((n: Notification) =>
                                new Date(n.created_at) > twentyFourHoursAgo
                            );
                            setNotifications(filtered);
                        }
                    })
                    .on('broadcast', { event: 'membership_rejected' }, async (payload: any) => {
                        // Handle membership rejection broadcast
                        const { notificationId, content } = payload.payload || {};
                        console.log('[USER NOTIFICATIONS] Received membership_rejected broadcast, reloading...', { notificationId });

                        // Reload notifications to ensure it appears in the bell
                        const { data, error } = await supabase
                            .from('notifications')
                            .select('*')
                            .eq('recipient_id', userId)
                            .order('created_at', { ascending: false })
                            .limit(50);
                        if (!error && data) {
                            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                            const filtered = (data as any[]).filter((n: Notification) =>
                                new Date(n.created_at) > twentyFourHoursAgo
                            );
                            setNotifications(filtered);
                        }
                    })
                    .on('broadcast', { event: 'notification_inserted' }, async (payload: any) => {
                        // Fallback: if postgres_changes doesn't fire, reload notifications from DB
                        const { notificationId, type } = payload.payload || {};
                        console.log('[USER NOTIFICATIONS] Received notification_inserted broadcast, will reload...', { notificationId, type });

                        // Debounce: only reload if we haven't reloaded recently for this notification
                        const reloadKey = `reload_${notificationId || type}_${Date.now()}`;
                        if (recentNotificationsRef.current.has(reloadKey)) {
                            console.log('[USER NOTIFICATIONS] Duplicate reload detected, skipping');
                            return;
                        }
                        recentNotificationsRef.current.add(reloadKey);
                        setTimeout(() => recentNotificationsRef.current.delete(reloadKey), 2000);

                        // Reload immediately, then retry if needed
                        const reloadNotifications = async (delay: number) => {
                            await new Promise(resolve => setTimeout(resolve, delay));
                            const { data, error } = await supabase
                                .from('notifications')
                                .select('*')
                                .eq('recipient_id', userId)
                                .order('created_at', { ascending: false })
                                .limit(50);
                            if (!error && data) {
                                const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                                const filtered = (data as any[]).filter((n: Notification) =>
                                    new Date(n.created_at) > twentyFourHoursAgo
                                );
                                console.log(`[USER NOTIFICATIONS] Reloaded notifications after ${delay}ms, count:`, filtered.length);

                                // Only update if data actually changed
                                setNotifications(prev => {
                                    if (prev.length !== filtered.length ||
                                        prev.some((p, i) => p.id !== filtered[i]?.id)) {
                                        return filtered;
                                    }
                                    return prev;
                                });

                                // If notificationId provided and not found, retry once more
                                if (notificationId && !filtered.some(n => n.id === notificationId) && delay < 1000) {
                                    console.log('[USER NOTIFICATIONS] Notification not found, will retry...');
                                    reloadNotifications(1000);
                                }
                            } else if (error) {
                                console.error('[USER NOTIFICATIONS] Error reloading notifications:', error);
                            }
                        };

                        // Try immediately, then retry if needed
                        reloadNotifications(300);
                    })
                    .subscribe((status) => {
                        if (status === 'SUBSCRIBED') {
                            console.log('Successfully subscribed to notifications');
                        } else if (status === 'CHANNEL_ERROR') {
                            // Channel error might be due to RLS - fallback interval will handle it
                            console.log('Notification subscription error (using fallback refresh)');
                        }
                    });
                channelRef.current = ch;

                // Also subscribe to notify_user channel for membership broadcasts
                const notifyChannel = supabase
                    .channel(`notify_user_${userId}`)
                    .on('broadcast', { event: 'membership_approved' }, async (payload: any) => {
                        const { notificationId } = payload.payload || {};
                        const { logger } = await import('@/lib/logger');
                        logger.debug('[USER NOTIFICATIONS] Received membership_approved broadcast');

                        // Reload notifications immediately
                        const { data, error } = await supabase
                            .from('notifications')
                            .select('*')
                            .eq('recipient_id', userId)
                            .order('created_at', { ascending: false })
                            .limit(50);
                        if (!error && data) {
                            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                            const filtered = (data as any[]).filter((n: Notification) =>
                                new Date(n.created_at) > twentyFourHoursAgo
                            );
                            setNotifications(filtered);
                        }
                    })
                    .on('broadcast', { event: 'membership_rejected' }, async (payload: any) => {
                        const { notificationId } = payload.payload || {};
                        const { logger } = await import('@/lib/logger');
                        logger.debug('[USER NOTIFICATIONS] Received membership_rejected broadcast');

                        // Reload notifications immediately
                        const { data, error } = await supabase
                            .from('notifications')
                            .select('*')
                            .eq('recipient_id', userId)
                            .order('created_at', { ascending: false })
                            .limit(50);
                        if (!error && data) {
                            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                            const filtered = (data as any[]).filter((n: Notification) =>
                                new Date(n.created_at) > twentyFourHoursAgo
                            );
                            setNotifications(filtered);
                        }
                    })
                    .subscribe((status) => {
                        if (status === 'SUBSCRIBED') {
                            console.log('[USER NOTIFICATIONS] Successfully subscribed to notify_user channel for membership broadcasts');
                        }
                    });

                // Store the notify channel reference for cleanup
                (channelRef.current as any).notifyChannel = notifyChannel;

                // FALLBACK: Poll database every 60 seconds as backup (only if tab is visible)
                // This is a safety net - real-time subscriptions should handle most updates
                refreshInterval = setInterval(async () => {
                    // Skip polling if tab is hidden (don't waste resources)
                    if (document.hidden) {
                        return;
                    }

                    const { data: freshData, error } = await supabase
                        .from('notifications')
                        .select('*')
                        .eq('recipient_id', userId)
                        .order('created_at', { ascending: false })
                        .limit(50);
                    if (!error && freshData) {
                        // Filter out old notifications
                        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                        const filtered = (freshData as any[]).filter((n: Notification) =>
                            new Date(n.created_at) > twentyFourHoursAgo
                        );
                        // Only update if data actually changed (more strict comparison)
                        setNotifications(prev => {
                            const prevIds = prev.map(p => p.id).sort().join(',');
                            const filteredIds = filtered.map(f => f.id).sort().join(',');
                            if (prevIds !== filteredIds) {
                                console.log('[USER NOTIFICATIONS] Polling refresh - updating notifications, count:', filtered.length);
                                return filtered;
                            }
                            return prev;
                        });
                    }
                }, 60000); // Poll every 60 seconds as backup (reduced from 5 seconds to save resources)
            } else if (mode === 'trainer') {
                // Trainer: fetch from API
                const loadTrainerNotifications = async () => {
                    // Prevent multiple simultaneous calls using ref
                    if (isLoadingRef.current) {
                        console.log('[TRAINER NOTIFICATIONS] Already loading, skipping...');
                        return;
                    }

                    isLoadingRef.current = true;
                    try {
                        const response = await fetch('/api/trainer/notifications', {
                            credentials: 'include',
                            cache: 'no-store'
                        });
                        const data = await response.json();
                        if (response.ok && data.notifications) {
                            const filtered = filterOldNotifications(data.notifications as TrainerNotification[]);

                            // Only update state if data actually changed
                            setTrainerNotifications(prev => {
                                const prevIds = prev.map(p => p.id).sort().join(',');
                                const filteredIds = filtered.map(f => f.id).sort().join(',');
                                if (prevIds !== filteredIds) {
                                    console.log('[TRAINER NOTIFICATIONS] Notifications updated, count:', filtered.length);
                                    return filtered;
                                }
                                return prev;
                            });
                        }
                    } catch (error) {
                        console.error('Error loading trainer notifications:', error);
                    } finally {
                        isLoadingRef.current = false;
                        setLoading(false);
                    }
                };
                loadTrainerNotifications();

                // Get trainer ID for filtering
                const getTrainerId = async () => {
                    try {
                        const validateResponse = await fetch('/api/trainer/validate', {
                            credentials: 'include'
                        });
                        if (validateResponse.ok) {
                            const data = await validateResponse.json();
                            return data.trainer?.id;
                        }
                    } catch (error) {
                        console.error('Error getting trainer ID:', error);
                    }
                    return null;
                };

                const setupSubscription = async () => {
                    const trainerId = await getTrainerId();

                    // Debounce helper to prevent excessive reloads
                    let reloadTimeout: NodeJS.Timeout | null = null;
                    const debouncedReload = () => {
                        if (reloadTimeout) clearTimeout(reloadTimeout);
                        reloadTimeout = setTimeout(() => {
                            if (!isLoadingRef.current) {
                                loadTrainerNotifications();
                            }
                        }, 500); // Wait 500ms before reloading
                    };

                    // Subscribe to booking changes for this trainer
                    const ch = supabase
                        .channel('trainer_notifications_bell')
                        .on('postgres_changes', {
                            event: 'INSERT',
                            schema: 'public',
                            table: 'trainer_messages',
                            filter: trainerId ? `trainer_id=eq.${trainerId}` : undefined
                        }, () => {
                            // Reload when new message arrives (user sends message to trainer)
                            debouncedReload();
                        })
                        .on('postgres_changes', {
                            event: 'UPDATE',
                            schema: 'public',
                            table: 'trainer_messages',
                            filter: trainerId ? `trainer_id=eq.${trainerId}` : undefined
                        }, () => {
                            // Reload when message read status changes
                            debouncedReload();
                        })
                        .on('postgres_changes', {
                            event: 'INSERT',
                            schema: 'public',
                            table: 'trainer_notifications',
                            filter: trainerId ? `trainer_id=eq.${trainerId}` : undefined
                        }, () => {
                            // Reload when new notification records are created
                            debouncedReload();
                        })
                        .on('postgres_changes', {
                            event: 'UPDATE',
                            schema: 'public',
                            table: 'trainer_notifications',
                            filter: trainerId ? `trainer_id=eq.${trainerId}` : undefined
                        }, (payload: any) => {
                            // Update read status in real-time when notification is marked as read
                            const updated = payload.new as any;
                            if (updated.is_read) {
                                // Update local state immediately without reloading
                                setTrainerNotifications(prev => {
                                    const updatedNotifs = prev.map(n => {
                                        // Match by reference_id
                                        if (n.id === 'unread_messages' && updated.reference_id === 'unread_messages') {
                                            return { ...n, is_read: true };
                                        }
                                        // Match by notification id
                                        if (n.id === updated.reference_id || n.id === `notif_${updated.reference_id}_${updated.notification_type}`) {
                                            return { ...n, is_read: true };
                                        }
                                        return n;
                                    });
                                    return updatedNotifs;
                                });
                                // Don't reload immediately - let the state update handle it
                            } else {
                                // If notification was reset to unread (new message arrived), reload
                                if (updated.reference_id === 'unread_messages') {
                                    // New messages arrived - reload after a delay to avoid flickering
                                    setTimeout(() => loadTrainerNotifications(), 1000);
                                }
                            }
                        })
                        .on('broadcast', { event: 'trainer_notification' }, async (payload: any) => {
                            console.log('[TRAINER NOTIFICATIONS] Received trainer_notification broadcast:', payload);
                            // Also add to state immediately for faster UI update
                            const notif: TrainerNotification = {
                                id: payload.payload.notificationId || `trainer_${Date.now()}_${Math.random()}`,
                                type: payload.payload.type || 'info',
                                content: payload.payload.content || 'New notification',
                                created_at: new Date().toISOString(),
                                is_read: false
                            };
                            setTrainerNotifications(prev => {
                                // Check if notification already exists
                                if (prev.some(n => n.id === notif.id)) {
                                    console.log('[TRAINER NOTIFICATIONS] Notification already exists, skipping');
                                    return prev;
                                }
                                console.log('[TRAINER NOTIFICATIONS] Adding notification to state:', notif);
                                const filtered = filterOldNotifications([notif, ...prev]);
                                return filtered.slice(0, 50);
                            });
                            // Reload notifications from API to ensure we have the latest data (after a delay to let DB catch up)
                            // Use debounced reload to prevent excessive reloads
                            setTimeout(() => {
                                if (!isLoadingRef.current) {
                                    console.log('[TRAINER NOTIFICATIONS] Reloading from API after broadcast');
                                    loadTrainerNotifications();
                                }
                            }, 800); // Increased delay to ensure DB write completes
                        })
                        .on('broadcast', { event: 'client_assigned' }, async (payload: any) => {
                            // When admin assigns a client, refresh notifications
                            console.log('[TRAINER NOTIFICATIONS] Received client_assigned broadcast, reloading notifications');
                            const { trainerId: payloadTrainerId } = payload.payload || {};
                            // Check if this notification is for this trainer
                            const currentTrainerId = await getTrainerId();
                            if (!payloadTrainerId || !currentTrainerId || payloadTrainerId === currentTrainerId) {
                                if (!isLoadingRef.current) {
                                    console.log('[TRAINER NOTIFICATIONS] Reloading notifications after client_assigned');
                                    debouncedReload();
                                }
                            } else {
                                console.log('[TRAINER NOTIFICATIONS] Ignoring client_assigned - not for this trainer');
                            }
                        })
                        .on('broadcast', { event: 'new_message' }, (payload: any) => {
                            // When user sends message, refresh notifications
                            const { by } = payload.payload || {};
                            if (by === 'user' && !isLoadingRef.current) {
                                // User sent message to trainer - refresh notifications
                                debouncedReload();
                            }
                        })
                        .subscribe();
                    channelRef.current = ch;
                };

                setupSubscription();

                // FALLBACK: Poll API every 60 seconds as backup (only if tab is visible and subscription might have issues)
                // This is a safety net - real-time subscriptions should handle most updates
                refreshInterval = setInterval(() => {
                    // Only poll if:
                    // 1. Not currently loading
                    // 2. Tab is visible (don't waste resources on hidden tabs)
                    if (!isLoadingRef.current && !document.hidden) {
                        console.log('[TRAINER NOTIFICATIONS] Polling refresh - reloading notifications');
                        loadTrainerNotifications();
                    } else {
                        console.log('[TRAINER NOTIFICATIONS] Skipping poll - loading:', isLoadingRef.current, 'hidden:', document.hidden);
                    }
                }, 60000); // Poll every 60 seconds (reduced from 10 seconds to save resources)
            } else {
                // Admin: fetch from API (admin_notifications table)
                const loadAdminNotifications = async () => {
                    try {
                        const response = await fetch('/api/admin/notifications', {
                            credentials: 'include',
                            cache: 'no-store'
                        });
                        const data = await response.json();
                        if (response.ok && data.notifications) {
                            const filtered = filterOldNotifications(data.notifications as AdminNotification[]);
                            setAdminNotifications(filtered);
                        }
                    } catch (error) {
                        console.error('Error loading admin notifications:', error);
                    } finally {
                        setLoading(false);
                    }
                };
                loadAdminNotifications();

                // Subscribe to admin_notifications table changes
                const ch = supabase
                    .channel('admin_notifications_bell')
                    .on('postgres_changes', {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'admin_notifications'
                    }, (payload: any) => {
                        console.log('Admin notification INSERT detected:', payload);
                        // Reload when new notification is created
                        setTimeout(() => {
                            loadAdminNotifications();
                        }, 300);
                    })
                    .on('postgres_changes', {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'admin_notifications'
                    }, (payload: any) => {
                        // Only reload if is_read changed to true (to avoid reloading when we just marked as read)
                        // This prevents flickering when marking all as read
                        if (payload.new?.is_read === true && payload.old?.is_read === false) {
                            // Debounce the reload to prevent rapid updates
                            setTimeout(() => {
                                loadAdminNotifications();
                            }, 300);
                        }
                    })
                    .on('broadcast', { event: 'admin_notification' }, (payload: any) => {
                        console.log('Admin received notification broadcast:', payload);
                        const { notificationId, type, content } = payload.payload || {};
                        if (content) {
                            const notif: AdminNotification = {
                                id: notificationId || `admin_${Date.now()}_${Math.random()}`,
                                content: content,
                                type: type || 'info',
                                created_at: new Date().toISOString(),
                                is_read: false
                            };
                            setAdminNotifications(prev => {
                                // Check if already exists
                                if (prev.some(n => n.id === notif.id)) {
                                    return prev;
                                }
                                const filtered = filterOldNotifications([notif, ...prev]);
                                return filtered.slice(0, 50);
                            });
                            // Reload from API after delay to ensure DB consistency
                            setTimeout(() => loadAdminNotifications(), 800);
                        }
                    })
                    .on('broadcast', { event: 'new_message' }, (payload: any) => {
                        console.log('Admin received new message notification');
                        const notif: AdminNotification = {
                            id: `msg_${Date.now()}_${Math.random()}`,
                            content: 'New message from User',
                            type: 'new_message',
                            created_at: new Date().toISOString()
                        };
                        setAdminNotifications(prev => {
                            const filtered = filterOldNotifications([notif, ...prev]);
                            return filtered.slice(0, 50);
                        });
                    })
                    .on('broadcast', { event: 'new_request' }, (payload: any) => {
                        console.log('Admin received new request notification');
                        const notif: AdminNotification = {
                            id: `req_${Date.now()}_${Math.random()}`,
                            content: 'New message request received',
                            type: 'new_request',
                            created_at: new Date().toISOString()
                        };
                        setAdminNotifications(prev => {
                            const filtered = filterOldNotifications([notif, ...prev]);
                            return filtered.slice(0, 50);
                        });
                    })
                    .on('broadcast', { event: 'new_booking_request' }, (payload: any) => {
                        console.log('Admin received new booking request notification');
                        const { userName, className, action } = payload.payload || {};
                        let content: string;
                        let notifType: string;
                        if (action === 'cancelled') {
                            content = `${userName || 'A user'} has cancelled their booking for ${className || 'a class'}.`;
                            notifType = 'booking_cancelled';
                        } else if (action === 'deleted_by_trainer') {
                            const { trainerName } = payload.payload || {};
                            content = `${trainerName || 'A trainer'} has deleted ${userName || 'a user'}'s booking for ${className || 'a class'}.`;
                            notifType = 'booking_deleted';
                        } else {
                            content = `${userName || 'A user'} has booked ${className || 'a class'}. Please assign a trainer.`;
                            notifType = 'new_booking';
                        }
                        const notif: AdminNotification = {
                            id: `booking_${Date.now()}_${Math.random()}`,
                            content: content,
                            type: notifType,
                            created_at: new Date().toISOString(),
                            is_read: false
                        };
                        setAdminNotifications(prev => {
                            const filtered = filterOldNotifications([notif, ...prev]);
                            return filtered.slice(0, 50);
                        });
                        // Also reload from API to ensure DB notification is loaded
                        setTimeout(() => loadAdminNotifications(), 500);
                    })
                    .subscribe((status) => {
                        console.log('Admin notification subscription status:', status);
                    });
                channelRef.current = ch;

                // FALLBACK: Poll API every 60 seconds as backup (only if tab is visible)
                // This is a safety net - real-time subscriptions should handle most updates
                refreshInterval = setInterval(() => {
                    // Only poll if tab is visible (don't waste resources on hidden tabs)
                    if (!document.hidden) {
                        loadAdminNotifications();
                    }
                }, 60000); // Poll every 60 seconds (reduced from 10 seconds to save resources)
            }
        };
        load();

        return () => {
            if (refreshInterval) clearInterval(refreshInterval);
            if ((window as any).__notificationCleanupInterval) {
                clearInterval((window as any).__notificationCleanupInterval);
            }
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                // Also cleanup the notify channel if it exists
                const notifyChannel = (channelRef.current as any)?.notifyChannel;
                if (notifyChannel) {
                    supabase.removeChannel(notifyChannel);
                }
            }
        };
    }, [mode]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        if (open) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    const markAsRead = async (id: string) => {
        if (mode === 'user') {
            await supabase.from('notifications').update({ is_read: true }).eq('id', id);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        } else if (mode === 'trainer') {
            const notif = trainerNotifications.find(n => n.id === id);
            if (notif) {
                try {
                    // Determine referenceId based on notification type
                    let referenceId: string;
                    if (notif.id === 'unread_messages') {
                        referenceId = 'unread_messages';
                    } else {
                        referenceId = id;
                    }

                    await fetch('/api/trainer/notifications/mark-read', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                            notificationId: id,
                            notificationType: notif.type,
                            referenceId: referenceId
                        })
                    });
                } catch (error) {
                    console.error('Error marking notification as read:', error);
                }
            }
            setTrainerNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        }
    };

    const markAllRead = async () => {
        if (mode === 'user' && unreadCount > 0) {
            const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
            await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        } else if (mode === 'trainer' && unreadCount > 0) {
            try {
                const response = await fetch('/api/trainer/notifications/mark-read', {
                    method: 'PUT',
                    credentials: 'include'
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to mark all as read');
                }

                // Immediately update state to mark all as read
                setTrainerNotifications(prev => prev.map(n => ({ ...n, is_read: true })));

                // Don't reload immediately - let the real-time subscription handle updates
                // Only reload if needed after a delay to avoid flickering
                // The real-time subscription will update the state when the database changes
            } catch (error) {
                console.error('Error marking all notifications as read:', error);
                showToast('Failed to mark all notifications as read. Please try again.', 'error');
            }
        } else if (mode === 'admin' && unreadCount > 0) {
            try {
                // Immediately update state to mark all as read (optimistic update)
                setAdminNotifications(prev => prev.map(n => ({ ...n, is_read: true })));

                const response = await fetch('/api/admin/notifications', {
                    method: 'PATCH',
                    credentials: 'include'
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to mark all as read');
                }

                // Reload from API after a short delay to ensure DB consistency
                // But don't reload immediately to prevent flickering
                setTimeout(() => {
                    const loadAdminNotifications = async () => {
                        try {
                            const reloadResponse = await fetch('/api/admin/notifications', {
                                credentials: 'include',
                                cache: 'no-store'
                            });
                            const reloadData = await reloadResponse.json();
                            if (reloadResponse.ok && reloadData.notifications) {
                                const filtered = filterOldNotifications(reloadData.notifications as AdminNotification[]);
                                setAdminNotifications(filtered);
                            }
                        } catch (error) {
                            console.error('Error reloading admin notifications:', error);
                        }
                    };
                    loadAdminNotifications();
                }, 500);
            } catch (error) {
                console.error('Error marking all admin notifications as read:', error);
                showToast('Failed to mark all notifications as read. Please try again.', 'error');
                // Reload on error to restore correct state
                const loadAdminNotifications = async () => {
                    try {
                        const reloadResponse = await fetch('/api/admin/notifications', {
                            credentials: 'include',
                            cache: 'no-store'
                        });
                        const reloadData = await reloadResponse.json();
                        if (reloadResponse.ok && reloadData.notifications) {
                            const filtered = filterOldNotifications(reloadData.notifications as AdminNotification[]);
                            setAdminNotifications(filtered);
                        }
                    } catch (error) {
                        console.error('Error reloading admin notifications:', error);
                    }
                };
                loadAdminNotifications();
            }
        }
    };

    const handleAdminNotificationClick = async (notif: AdminNotification) => {
        // Mark as read in database
        if (!notif.is_read) {
            try {
                await fetch('/api/admin/notifications', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ id: notif.id })
                });
            } catch (error) {
                console.error('Error marking admin notification as read:', error);
            }
        }

        // Update local state
        setAdminNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));

        // Navigate based on notification type
        if (notif.type === 'new_request' || notif.type === 'new_message') {
            window.location.href = '/admin/messages';
        }
    };

    const handleTrainerNotificationClick = (notif: TrainerNotification) => {
        setTrainerNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
        if (notif.type === 'message') {
            window.location.href = '/trainer/messages';
        } else if (notif.type === 'client_added' || notif.type === 'client_deleted') {
            window.location.href = '/trainer/clients';
        } else if (notif.type === 'class_deleted') {
            // No specific page for class deletions, stay on current page
        }
    };

    // Auto-filter old notifications periodically (every minute)
    // MUST be before conditional return to follow Rules of Hooks
    useEffect(() => {
        const filterInterval = setInterval(() => {
            if (mode === 'user') {
                setNotifications(prev => filterOldNotifications(prev));
            } else if (mode === 'trainer') {
                setTrainerNotifications(prev => filterOldNotifications(prev));
            } else {
                setAdminNotifications(prev => filterOldNotifications(prev));
            }
        }, 60 * 1000); // Every minute

        return () => clearInterval(filterInterval);
    }, [mode]);

    const displayNotifications = mode === 'user'
        ? filteredNotifications
        : mode === 'trainer'
            ? filteredTrainerNotifications
            : filteredAdminNotifications;
    const showMarkAllRead = unreadCount > 0;
    const showClearAll = displayNotifications.length > 0;

    // Delete a single notification
    const deleteNotification = useCallback(async (id: string) => {
        try {
            let endpoint = '';
            let headers: HeadersInit = { 'Content-Type': 'application/json' };

            if (mode === 'user') {
                endpoint = '/api/notifications/clear';
                // Get Supabase session token for user authentication
                const { data: { session } } = await supabase.auth.getSession();
                const token = session?.access_token;
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }
            } else if (mode === 'trainer') {
                endpoint = '/api/trainer/notifications/clear';
            } else {
                endpoint = '/api/admin/notifications/clear';
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: headers,
                credentials: 'include',
                body: JSON.stringify({ id })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || 'Failed to delete notification');
            }

            // Update local state
            if (mode === 'user') {
                setNotifications(prev => prev.filter(n => n.id !== id));
            } else if (mode === 'trainer') {
                setTrainerNotifications(prev => prev.filter(n => n.id !== id));
            } else {
                setAdminNotifications(prev => prev.filter(n => n.id !== id));
            }
        } catch (error) {
            console.error('Error deleting notification:', error);
            showToast(error instanceof Error ? error.message : 'Failed to delete notification. Please try again.', 'error');
        }
    }, [mode]);

    // Clear all notifications
    const clearAllNotifications = async () => {
        if (!confirm('Are you sure you want to delete all notifications? This action cannot be undone.')) {
            return;
        }

        try {
            let endpoint = '';
            let headers: HeadersInit = {};

            if (mode === 'user') {
                endpoint = '/api/notifications/clear';
                // Get Supabase session token for user authentication
                const { data: { session } } = await supabase.auth.getSession();
                const token = session?.access_token;
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }
            } else if (mode === 'trainer') {
                endpoint = '/api/trainer/notifications/clear';
            } else {
                endpoint = '/api/admin/notifications/clear';
            }

            const response = await fetch(endpoint, {
                method: 'DELETE',
                headers: headers,
                credentials: 'include'
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || 'Failed to clear notifications');
            }

            // Clear local state
            if (mode === 'user') {
                setNotifications([]);
            } else if (mode === 'trainer') {
                setTrainerNotifications([]);
            } else {
                setAdminNotifications([]);
            }
        } catch (error) {
            console.error('Error clearing notifications:', error);
            showToast(error instanceof Error ? error.message : 'Failed to clear notifications. Please try again.', 'error');
        }
    };

    // Swipe handlers
    const handleTouchStart = (e: React.TouchEvent, id: string) => {
        swipeStartX.current = e.touches[0].clientX;
        swipeCurrentX.current = swipeStartX.current;
        setSwipingId(id);
        setSwipeOffset(0);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (swipingId === null) return;
        swipeCurrentX.current = e.touches[0].clientX;
        const diff = swipeStartX.current - swipeCurrentX.current;
        // Only allow swiping left (positive diff)
        if (diff > 0) {
            setSwipeOffset(Math.min(diff, 100)); // Max swipe distance 100px
        }
    };

    const handleTouchEnd = (id: string) => {
        if (swipingId === null) return;

        // If swiped more than 50px, delete the notification
        if (swipeOffset > 50) {
            deleteNotification(id);
        }

        // Reset swipe state
        setSwipingId(null);
        setSwipeOffset(0);
    };

    // Mouse handlers for desktop swipe simulation
    const handleMouseDown = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        swipeStartX.current = e.clientX;
        swipeCurrentX.current = swipeStartX.current;
        setSwipingId(id);
        setSwipeOffset(0);
    };

    // Global mouse move handler
    useEffect(() => {
        const handleGlobalMouseMove = (e: MouseEvent) => {
            if (swipingId === null) return;
            swipeCurrentX.current = e.clientX;
            const diff = swipeStartX.current - swipeCurrentX.current;
            if (diff > 0) {
                setSwipeOffset(Math.min(diff, 100));
            }
        };

        const handleGlobalMouseUp = () => {
            if (swipingId === null) return;

            const currentOffset = swipeStartX.current - swipeCurrentX.current;
            if (currentOffset > 50) { // Swiped left more than 50px
                deleteNotification(swipingId);
            }

            setSwipingId(null);
            setSwipeOffset(0);
        };

        if (swipingId !== null) {
            document.addEventListener('mousemove', handleGlobalMouseMove);
            document.addEventListener('mouseup', handleGlobalMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleGlobalMouseMove);
            document.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [swipingId, deleteNotification]);

    return (
        <div className={`${styles.wrapper} ${mode === 'admin' ? styles.adminWrapper : ''}`} ref={bellRef}>
            <button className={`${styles.bellButton} ${mode === 'admin' ? styles.adminBell : ''}`} onClick={() => setOpen(!open)}>
                <Bell size={20} />
                {!loading && unreadCount > 0 && <span className={styles.badge}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
            </button>
            {open && (
                <div className={styles.dropdown}>
                    <div className={styles.header}>
                        <span className={styles.title}>Notifications</span>
                        <div className={styles.headerButtons}>
                            {showMarkAllRead && (
                                <button className={styles.markAllRead} onClick={markAllRead}>Mark all read</button>
                            )}
                            {showClearAll && (
                                <button className={styles.clearAll} onClick={clearAllNotifications}>Clear all</button>
                            )}
                        </div>
                    </div>
                    <div className={styles.list}>
                        {displayNotifications.length === 0 ? (
                            <div className={styles.empty}>No notifications</div>
                        ) : (
                            displayNotifications.map(n => (
                                <div
                                    key={n.id}
                                    className={styles.itemWrapper}
                                    onTouchStart={(e) => handleTouchStart(e, n.id)}
                                    onTouchMove={handleTouchMove}
                                    onTouchEnd={() => handleTouchEnd(n.id)}
                                    onMouseDown={(e) => handleMouseDown(e, n.id)}
                                    onMouseLeave={() => {
                                        if (swipingId === n.id) {
                                            setSwipingId(null);
                                            setSwipeOffset(0);
                                        }
                                    }}
                                >
                                    <div
                                        className={`${styles.item} ${mode === 'user' && !(n as Notification).is_read
                                            ? styles.unread
                                            : mode === 'trainer' && !(n as TrainerNotification).is_read
                                                ? styles.unread
                                                : mode === 'admin' && !(n as AdminNotification).is_read
                                                    ? styles.unread
                                                    : ''
                                            } ${swipingId === n.id ? styles.swiping : ''}`}
                                        style={{
                                            transform: swipingId === n.id ? `translateX(-${swipeOffset}px)` : 'translateX(0)',
                                            transition: swipingId === n.id ? 'none' : 'transform 0.3s ease'
                                        }}
                                        onClick={() => {
                                            // Don't trigger click if swiping
                                            if (swipeOffset < 10) {
                                                if (mode === 'user') {
                                                    markAsRead((n as Notification).id);
                                                } else if (mode === 'trainer') {
                                                    handleTrainerNotificationClick(n as TrainerNotification);
                                                } else {
                                                    handleAdminNotificationClick(n as AdminNotification);
                                                }
                                            }
                                        }}
                                    >
                                        <div className={styles.content}>{n.content}</div>
                                        <div className={styles.time}>{new Date(n.created_at).toLocaleString()}</div>
                                    </div>
                                    <div
                                        className={styles.deleteButton}
                                        style={{
                                            opacity: swipingId === n.id && swipeOffset > 20 ? Math.min(swipeOffset / 100, 1) : 0,
                                            transform: swipingId === n.id && swipeOffset > 20 ? `translateX(${100 - swipeOffset}px)` : 'translateX(100px)'
                                        }}
                                    >
                                        Delete
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
            <Toast message={toast} type={toastType} onClose={hideToast} />
        </div>
    );
}

export default memo(NotificationBell);

