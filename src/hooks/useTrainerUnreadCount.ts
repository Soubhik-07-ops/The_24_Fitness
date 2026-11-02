'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';

export function useTrainerUnreadCount(): number {
    const [unreadCount, setUnreadCount] = useState<number>(0);
    const channelRef = useRef<any>(null);
    const trainerIdRef = useRef<string | null>(null);

    useEffect(() => {
        let mounted = true;

        const fetchUnreadCount = async () => {
            try {
                const countResponse = await fetch('/api/trainer/messages/unread-count', {
                    credentials: 'include',
                    cache: 'no-store'
                });

                if (countResponse.ok && mounted) {
                    const countData = await countResponse.json();
                    setUnreadCount(countData.count || 0);
                }
            } catch (error) {
                console.error('Error fetching unread count:', error);
            }
        };

        const initialize = async () => {
            try {
                // Get trainer ID first
                const response = await fetch('/api/trainer/validate', {
                    credentials: 'include'
                });
                if (!response.ok || !mounted) {
                    return;
                }

                const data = await response.json();
                const trainerId = data.trainer?.id;

                if (!trainerId || !mounted) {
                    return;
                }

                trainerIdRef.current = trainerId;

                // Fetch initial count
                await fetchUnreadCount();

                // Set up real-time subscription for unread messages
                const channel = supabase
                    .channel(`trainer_messages_count_${trainerId}`)
                    .on('postgres_changes', {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'trainer_messages',
                        filter: `trainer_id=eq.${trainerId}`
                    }, (payload: any) => {
                        const row = payload.new as any;
                        if (!row || row.is_trainer === false) {
                            if (mounted) fetchUnreadCount();
                        }
                    })
                    .on('postgres_changes', {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'trainer_messages',
                        filter: `trainer_id=eq.${trainerId}`
                    }, (payload: any) => {
                        const row = payload.new as any;
                        if (!row || row.is_trainer === false) {
                            if (mounted) fetchUnreadCount();
                        }
                    })
                    .on('broadcast', { event: 'new_message' }, () => {
                        if (mounted) fetchUnreadCount();
                    })
                    .on('broadcast', { event: 'conversation_updated' }, () => {
                        if (mounted) fetchUnreadCount();
                    })
                    .subscribe();

                // Also subscribe to trainer's notification channel for message events
                const notifyChannel = supabase
                    .channel(`notify_trainer_${trainerId}`)
                    .on('broadcast', { event: 'new_message' }, () => {
                        if (mounted) fetchUnreadCount();
                    })
                    .on('broadcast', { event: 'conversation_updated' }, () => {
                        if (mounted) fetchUnreadCount();
                    })
                    .subscribe();

                channelRef.current = channel;
                (channelRef.current as any).notifyChannel = notifyChannel;
            } catch (error) {
                console.error('Error initializing message count:', error);
            }
        };

        initialize();

        return () => {
            mounted = false;
            if (channelRef.current) {
                if ((channelRef.current as any).notifyChannel) {
                    supabase.removeChannel((channelRef.current as any).notifyChannel);
                }
                supabase.removeChannel(channelRef.current);
            }
        };
    }, []);

    return unreadCount;
}

