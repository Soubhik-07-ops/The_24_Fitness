'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { usePathname } from 'next/navigation';
import Toast from '@/components/Toast/Toast';
import { useToast } from '@/hooks/useToast';
import { logger } from '@/lib/logger';

export default function RealtimeNotifications({ mode }: { mode: 'user' | 'admin' | 'trainer' }) {
    const pathname = usePathname();
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const notifyChRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const recentNotificationsRef = useRef<Set<string>>(new Set()); // Track recent notifications to prevent duplicates
    const setupInProgressRef = useRef<boolean>(false); // Prevent double setup
    const { toast, toastType, showToast, hideToast } = useToast();

    useEffect(() => {
        async function setup() {
            // Don't setup user notifications if we're on trainer or admin pages
            if (mode === 'user') {
                if (pathname?.startsWith('/trainer/') || pathname?.startsWith('/admin/')) {
                    console.log('[USER NOTIFICATIONS] Skipping setup - on trainer/admin page:', pathname);
                    return;
                }

                const { data } = await supabase.auth.getUser();
                const userId = data.user?.id;
                if (!userId) {
                    return;
                }
                logger.debug('[USER NOTIFICATIONS] Setting up notifications');

                // Subscribe to DB notifications for this user
                const ch = supabase
                    .channel(`notifications_user_${userId}`)
                    .on('postgres_changes', {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'notifications',
                        filter: `recipient_id=eq.${userId}`
                    }, (payload: any) => {
                        const row = payload.new as { id: string; type: string; content: string; actor_role?: string; request_id?: string };
                        const onChat = pathname?.startsWith('/contact') ||
                            (pathname?.startsWith('/messages/trainer/') && row.actor_role === 'trainer');
                        // For message type, only show if not on chat
                        if (row.type === 'message' && onChat) return;

                        // For message notifications from trainers or admins, use content to prevent duplicates
                        // This key will match both DB insert and broadcast events
                        let notifKey: string;
                        if (row.type === 'message' && (row.actor_role === 'trainer' || row.actor_role === 'admin')) {
                            // Use content hash for message notifications
                            notifKey = `msg_${row.content?.substring(0, 50)}_${row.request_id || ''}_${Date.now()}`;
                        } else {
                            notifKey = `db_${row.id}`;
                        }

                        if (recentNotificationsRef.current.has(notifKey)) {
                            console.log('[USER NOTIFICATIONS] Duplicate DB notification detected, skipping');
                            return;
                        }
                        recentNotificationsRef.current.add(notifKey);
                        setTimeout(() => recentNotificationsRef.current.delete(notifKey), 3000); // Remove after 3 seconds

                        addToast(row.content || 'Notification');
                    })
                    .on('broadcast', { event: 'membership_approved' }, (payload: any) => {
                        const { content } = payload.payload || {};
                        if (content) {
                            const notifKey = `membership_approved_${Date.now()}`;
                            if (recentNotificationsRef.current.has(notifKey)) {
                                return;
                            }
                            recentNotificationsRef.current.add(notifKey);
                            setTimeout(() => recentNotificationsRef.current.delete(notifKey), 3000);
                            addToast(content);
                        }
                    })
                    .on('broadcast', { event: 'membership_rejected' }, (payload: any) => {
                        const { content } = payload.payload || {};
                        if (content) {
                            const notifKey = `membership_rejected_${Date.now()}`;
                            if (recentNotificationsRef.current.has(notifKey)) {
                                return;
                            }
                            recentNotificationsRef.current.add(notifKey);
                            setTimeout(() => recentNotificationsRef.current.delete(notifKey), 3000);
                            addToast(content);
                        }
                    })
                    .on('broadcast', { event: 'new_message' }, (payload: any) => {
                        // IMPORTANT: Show toast from broadcast as fallback if DB notification doesn't fire
                        // This ensures users always see notifications even if postgres_changes is delayed
                        console.log('[USER NOTIFICATIONS] Received broadcast:', payload);
                        const { trainerId, trainerName, by, requestId, notificationType } = payload.payload || {};

                        // For trainer_assigned, show toast from broadcast as fallback if DB notification doesn't fire
                        // This ensures users always see the notification even if postgres_changes is delayed or blocked
                        if (notificationType === 'trainer_assigned') {
                            const { content } = payload.payload || {};
                            if (content) {
                                // Check if we already showed a toast for this recently
                                const recentKeys = Array.from(recentNotificationsRef.current);
                                const recentToast = recentKeys.some(key =>
                                    key.includes('trainer_assigned') ||
                                    key.includes(trainerName || '')
                                );

                                if (!recentToast) {
                                    const notifKey = `trainer_assigned_${Date.now()}`;
                                    recentNotificationsRef.current.add(notifKey);
                                    setTimeout(() => recentNotificationsRef.current.delete(notifKey), 3000);
                                    console.log('[USER NOTIFICATIONS] Showing trainer_assigned toast from broadcast');
                                    addToast(content);
                                }
                            }
                            return;
                        }

                        // Skip booking_submitted - DB notification handles it
                        if (notificationType === 'booking_submitted') {
                            console.log(`[USER NOTIFICATIONS] Skipping ${notificationType} broadcast - DB notification handles it`);
                            return;
                        }

                        // Handle class_deleted notifications
                        if (notificationType === 'class_deleted') {
                            const { content } = payload.payload || {};
                            if (content) {
                                // Check if we already showed a toast for this recently
                                const recentKeys = Array.from(recentNotificationsRef.current);
                                const recentToast = recentKeys.some(key =>
                                    key.includes('class_deleted')
                                );

                                if (!recentToast) {
                                    const notifKey = `class_deleted_${Date.now()}`;
                                    recentNotificationsRef.current.add(notifKey);
                                    setTimeout(() => recentNotificationsRef.current.delete(notifKey), 3000);
                                    console.log('[USER NOTIFICATIONS] Showing class_deleted toast from broadcast');
                                    addToast(content);
                                }
                            }
                            return;
                        }

                        // Show if message is FROM a trainer or admin
                        if (by === 'trainer') {
                            if (!trainerId || !trainerName) {
                                console.log('[USER NOTIFICATIONS] Skipping - missing trainerId or trainerName');
                                return;
                            }
                            const onChat = pathname?.startsWith('/messages/trainer/') && pathname.includes(trainerId);
                            if (onChat) {
                                console.log('[USER NOTIFICATIONS] Suppressing notification - user is on chat page');
                                return;
                            }

                            // Check if we already showed a toast for this trainer recently (within 3 seconds)
                            const recentKeys = Array.from(recentNotificationsRef.current);
                            const recentTrainerToast = recentKeys.some(key =>
                                key.includes(`trainer_${trainerId}`) ||
                                key.includes(trainerName) ||
                                key.includes('New message from')
                            );

                            if (recentTrainerToast) {
                                console.log('[USER NOTIFICATIONS] Duplicate detected (recent trainer toast), skipping');
                                return;
                            }

                            const notifKey = `broadcast_trainer_${trainerId}_${Date.now()}`;
                            recentNotificationsRef.current.add(notifKey);
                            setTimeout(() => recentNotificationsRef.current.delete(notifKey), 3000);

                            console.log('[USER NOTIFICATIONS] Showing toast notification for trainer:', trainerName);
                            addToast(`New message from ${trainerName}`);
                        } else if (by === 'admin') {
                            // Handle admin messages
                            const onChat = pathname?.startsWith('/contact');
                            if (onChat) {
                                console.log('[USER NOTIFICATIONS] Suppressing notification - user is on contact page');
                                return;
                            }

                            // Check if we already showed a toast for admin recently (within 3 seconds)
                            const recentKeys = Array.from(recentNotificationsRef.current);
                            const recentAdminToast = recentKeys.some(key =>
                                key.includes('admin') ||
                                key.includes('Admin') ||
                                key.includes('New message from Admin')
                            );

                            if (recentAdminToast) {
                                console.log('[USER NOTIFICATIONS] Duplicate detected (recent admin toast), skipping');
                                return;
                            }

                            const notifKey = `broadcast_admin_${requestId || Date.now()}_${Date.now()}`;
                            recentNotificationsRef.current.add(notifKey);
                            setTimeout(() => recentNotificationsRef.current.delete(notifKey), 3000);

                            console.log('[USER NOTIFICATIONS] Showing toast notification for admin');
                            addToast('New message from Admin');
                        } else {
                            console.log('[USER NOTIFICATIONS] Skipping - by is not "trainer" or "admin", it is:', by);
                        }
                    })
                    .subscribe((status) => {
                        console.log('[USER NOTIFICATIONS] Channel subscription status:', status);
                        if (status === 'SUBSCRIBED') {
                            console.log('[USER NOTIFICATIONS] Successfully subscribed to notifications_user_ channel');
                        }
                    });
                channelRef.current = ch;

                // REMOVED: Duplicate channel subscription that was causing duplicate toasts
                // The notify_user_${userId} channel was redundant and causing duplicate notifications
                notifyChRef.current = null;
            } else if (mode === 'trainer') {
                // Trainer: subscribe to messages FROM users only
                // Trainers should NOT receive notifications when they send messages
                // CRITICAL: Get trainer ID first to subscribe to trainer-specific channel
                const getTrainerId = async () => {
                    try {
                        const response = await fetch('/api/trainer/validate', {
                            credentials: 'include'
                        });
                        if (response.ok) {
                            const data = await response.json();
                            return data.trainer?.id;
                        }
                    } catch (error) {
                        console.error('[TRAINER NOTIFICATIONS] Error getting trainer ID:', error);
                    }
                    return null;
                };

                const setupTrainerChannel = async () => {
                    // Prevent double setup (React Strict Mode runs effects twice in development)
                    if (setupInProgressRef.current) {
                        console.log('[TRAINER NOTIFICATIONS] Setup already in progress, skipping');
                        return;
                    }

                    // If channel already exists and is subscribed, don't recreate it
                    if (channelRef.current) {
                        const channelState = channelRef.current.state;
                        if (channelState === 'joined' || channelState === 'joining') {
                            console.log('[TRAINER NOTIFICATIONS] Channel already exists and is active, skipping setup');
                            return;
                        }
                        // If channel is in error state, clean it up
                        if (channelState === 'closed' || channelState === 'errored') {
                            console.log('[TRAINER NOTIFICATIONS] Cleaning up channel in error state');
                            try {
                                await supabase.removeChannel(channelRef.current);
                            } catch (err) {
                                console.error('[TRAINER NOTIFICATIONS] Error removing channel:', err);
                            }
                            channelRef.current = null;
                        }
                    }

                    setupInProgressRef.current = true;
                    
                    try {
                        const trainerId = await getTrainerId();
                        if (!trainerId) {
                            console.log('[TRAINER NOTIFICATIONS] No trainer ID found, skipping setup');
                            setupInProgressRef.current = false;
                            return;
                        }

                        console.log('[TRAINER NOTIFICATIONS] Setting up notifications for trainer:', trainerId);

                        // CRITICAL: Use trainer-specific channel to prevent notifications going to wrong trainers
                const ch = supabase
                            .channel(`notify_trainer_${trainerId}`)
                    .on('broadcast', { event: 'trainer_notification' }, (payload: any) => {
                                console.log('[TRAINER NOTIFICATIONS] Received trainer_notification broadcast:', payload);
                        const { content, type } = payload.payload || {};
                        if (content) {
                            // Show toast for all trainer notifications (booking_assigned, booking_cancelled, class_deleted, etc.)
                            addToast(content);
                        }
                    })
                            .on('broadcast', { event: 'client_assigned' }, (payload: any) => {
                                console.log('[TRAINER NOTIFICATIONS] Received client_assigned broadcast:', payload);
                                // Trainer notification when admin assigns a client
                                const { content, notificationId, userName } = payload.payload || {};
                                if (content) {
                                    addToast(content);
                                } else if (userName) {
                                    addToast(`${userName} has been assigned as your client.`);
                                }
                            })
                    .on('broadcast', { event: 'new_message' }, (payload: any) => {
                        logger.debug('[TRAINER NOTIFICATIONS] Received broadcast');
                        const { userId, userName, by, notificationType } = payload.payload || {};

                        // IMPORTANT: Skip if this is a user notification (trainer_assigned, booking_submitted, etc.)
                        // These are meant for users, not trainers
                        if (notificationType && (notificationType === 'trainer_assigned' || notificationType === 'booking_submitted')) {
                            logger.debug('[TRAINER NOTIFICATIONS] Skipping user notification type');
                            return;
                        }

                        // Only show if message is FROM a user (by='user' indicates user sent it)
                        if (by !== 'user') {
                            console.log('[TRAINER NOTIFICATIONS] Skipping - by is not "user", it is:', by);
                            return; // Don't show if trainer sent it
                        }
                                // Check current pathname dynamically (not from closure)
                                const currentPath = window.location.pathname;
                                const onChat = currentPath?.startsWith('/trainer/messages/') && currentPath.includes(userId);
                                console.log('[TRAINER NOTIFICATIONS] On chat page?', onChat, 'pathname:', currentPath);
                        if (!onChat && userName) {
                            console.log('[TRAINER NOTIFICATIONS] Showing toast notification for user:', userName);
                            addToast(`New message from ${userName}`);
                        } else {
                            console.log('[TRAINER NOTIFICATIONS] Suppressing notification - trainer is on chat page or missing userName');
                        }
                    })
                    .subscribe((status) => {
                        console.log('[TRAINER NOTIFICATIONS] Channel subscription status:', status);
                            if (status === 'SUBSCRIBED') {
                                console.log('[TRAINER NOTIFICATIONS] Successfully subscribed to notify_trainer_ channel');
                                setupInProgressRef.current = false;
                            } else if (status === 'CLOSED') {
                                console.warn('[TRAINER NOTIFICATIONS] Channel closed');
                                setupInProgressRef.current = false;
                                // Don't try to resubscribe immediately - let React handle it
                            } else if (status === 'CHANNEL_ERROR') {
                                console.error('[TRAINER NOTIFICATIONS] Channel error occurred');
                                setupInProgressRef.current = false;
                                // Try to resubscribe after a delay
                                setTimeout(() => {
                                    if (channelRef.current && channelRef.current.state !== 'joined') {
                                        console.log('[TRAINER NOTIFICATIONS] Attempting to resubscribe after error');
                                        // Clean up and let useEffect handle resubscription
                                        if (channelRef.current) {
                                            supabase.removeChannel(channelRef.current).catch(console.error);
                                            channelRef.current = null;
                                        }
                                    }
                                }, 2000);
                            } else if (status === 'TIMED_OUT') {
                                console.warn('[TRAINER NOTIFICATIONS] Channel subscription timed out');
                                setupInProgressRef.current = false;
                            } else if (status === 'JOINING') {
                                console.log('[TRAINER NOTIFICATIONS] Channel is joining...');
                            }
                        });
                        
                channelRef.current = ch;
                        console.log('[TRAINER NOTIFICATIONS] Channel stored in ref');
                    } catch (error) {
                        console.error('[TRAINER NOTIFICATIONS] Error setting up channel:', error);
                        setupInProgressRef.current = false;
                    }
                };

                setupTrainerChannel();
            } else {
                const ch = supabase.channel('notify_admin')
                    .on('broadcast', { event: 'new_message' }, () => {
                        if (!pathname?.startsWith('/admin/messages/')) addToast('New message from User');
                    })
                    .on('broadcast', { event: 'new_request' }, () => addToast('New message request received'))
                    .subscribe();
                channelRef.current = ch;
            }
        }
        setup();
        return () => {
            console.log('[TRAINER NOTIFICATIONS] Cleanup function called, mode:', mode);
            setupInProgressRef.current = false;
            if (channelRef.current) {
                console.log('[TRAINER NOTIFICATIONS] Removing channel');
                supabase.removeChannel(channelRef.current).then(() => {
                    console.log('[TRAINER NOTIFICATIONS] Channel removed');
                }).catch((err) => {
                    console.error('[TRAINER NOTIFICATIONS] Error removing channel:', err);
                });
                channelRef.current = null;
            }
            if (notifyChRef.current) {
                supabase.removeChannel(notifyChRef.current);
                notifyChRef.current = null;
            }
        };
    }, [mode]); // Removed pathname from dependencies - trainer notifications should persist across page navigation

    const addToast = (text: string) => {
        showToast(text, 'info');
    };

    return (
        <Toast message={toast} type={toastType} onClose={hideToast} />
    );
}


