'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import styles from './TrainerChatWindow.module.css';
import { Send } from 'lucide-react';
import Toast from '@/components/Toast/Toast';
import { useToast } from '@/hooks/useToast';
import { checkTrainerMessagingAccess } from '@/lib/trainerMessagingAccess';
import { logger } from '@/lib/logger';

interface ChatMessage {
    id: string;
    content: string;
    is_trainer: boolean;
    created_at: string;
}

interface TrainerChatWindowProps {
    trainerId: string;
    trainerName: string;
}

export default function TrainerChatWindow({ trainerId, trainerName }: TrainerChatWindowProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [typingTrainer, setTypingTrainer] = useState(false);
    const [hasTrainerAccess, setHasTrainerAccess] = useState<boolean | null>(null);
    const { toast, toastType, showToast, hideToast } = useToast();
    const [restrictionMessage, setRestrictionMessage] = useState<string | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const typingTimerRef = useRef<any>(null);

    const checkTrainerAccess = async () => {
        if (!userId || !trainerId) return false;

        try {
            // Check if user has active membership with this trainer assigned
            // Use the centralized access control utility to ensure consistent behavior
            const { data: membershipData } = await supabase
                .from('memberships')
                .select('id, trainer_assigned, trainer_id, trainer_period_end, trainer_grace_period_end, membership_end_date, end_date, plan_name, status')
                .eq('user_id', userId)
                .eq('trainer_id', trainerId)
                .eq('trainer_assigned', true)
                .eq('status', 'active')
                .limit(1)
                .maybeSingle();

            if (!membershipData) {
                setHasTrainerAccess(false);
                setRestrictionMessage('You can only message trainers when you have an active membership with trainer access assigned.');
                return false;
            }

            // Use the centralized access control utility
            // This ensures messaging is disabled after trainer expiry, even during grace period
            const accessStatus = checkTrainerMessagingAccess(
                membershipData.trainer_period_end,
                membershipData.trainer_grace_period_end,
                undefined, // Use real current date for frontend checks
                membershipData.membership_end_date || membershipData.end_date || null,
                membershipData.plan_name
            );

            const hasActiveAccess = accessStatus.canMessage;
            setHasTrainerAccess(hasActiveAccess);

            if (!hasActiveAccess) {
                // Set restriction message from access status
                setRestrictionMessage(accessStatus.reason);
            } else {
                setRestrictionMessage(null);
            }

            return hasActiveAccess;
        } catch (error) {
            console.error('Error checking trainer access:', error);
            setHasTrainerAccess(false);
            setRestrictionMessage('Error checking trainer access. Please try again.');
            return false;
        }
    };

    const loadMessages = async () => {
        try {
            // Get session token
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const response = await fetch(`/api/messages/trainer/${trainerId}`, {
                headers: token ? {
                    'Authorization': `Bearer ${token}`
                } : {},
                credentials: 'include'
            });
            const data = await response.json();

            if (response.ok) {
                setMessages(data.messages || []);
            } else {
                console.error('Error fetching messages:', data.error);
            }

            // Check trainer access status after loading messages
            await checkTrainerAccess();
        } catch (error) {
            console.error('Error fetching messages:', error);
        }
    };

    useEffect(() => {
        const load = async () => {
            const { data: userData, error: userError } = await supabase.auth.getUser();
            const currentUserId = userData.user?.id || null;
            setUserId(currentUserId);

            if (!userData.user) {
                setLoading(false);
                return;
            }

            await loadMessages();
            setLoading(false);
        };
        load();
    }, [trainerId]);

    useEffect(() => {
        if (!userId || !trainerId) return;

        // Message subscription
        const channel = supabase
            .channel(`trainer_messages_user_${trainerId}_${userId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'trainer_messages',
                filter: `trainer_id=eq.${trainerId} AND user_id=eq.${userId}`
            }, (payload) => {
                console.log('[USER MESSAGES] Received postgres_changes:', payload);
                const newMsg = payload.new as any;
                setMessages((prev) => {
                    if (prev.some(m => m.id === newMsg.id)) return prev;
                    console.log('[USER MESSAGES] Adding new message from postgres_changes:', newMsg.id);
                    return [...prev, newMsg as ChatMessage];
                });
            })
            .on('broadcast', { event: 'new_message' }, async () => {
                // Fallback refresh if DB changes don't come through (due to RLS)
                console.log('[USER MESSAGES] Received broadcast - refreshing messages');
                await loadMessages();
            })
            .on('broadcast', { event: 'message_deleted' }, (payload: any) => {
                // Remove deleted message from local state
                const { messageId } = payload.payload || {};
                if (messageId) {
                    console.log('[USER MESSAGES] Message deleted:', messageId);
                    setMessages(prev => prev.filter(m => m.id !== messageId));
                }
            })
            .on('broadcast', { event: 'trainer_unassigned' }, async (payload: any) => {
                // Trainer was unassigned - check status and update UI
                console.log('[USER MESSAGES] Trainer unassigned:', payload);
                await checkTrainerAccess();
            })
            .subscribe((status) => {
                console.log('[USER MESSAGES] Channel subscription status:', status);
            });

        channelRef.current = channel;

        // Typing indicator subscription - ensure it's subscribed before use
        const typingChannel = supabase
            .channel(`typing_trainer_${trainerId}_${userId}`)
            .on('broadcast', { event: 'typing' }, (payload: any) => {
                console.log('[USER TYPING] Received typing broadcast:', payload);
                const { by, isTyping } = payload.payload || {};
                console.log('[USER TYPING] Parsed - by:', by, 'isTyping:', isTyping);
                if (by === 'trainer') {
                    console.log('[USER TYPING] Setting trainer typing to:', !!isTyping);
                    setTypingTrainer(!!isTyping);
                }
            })
            .subscribe((status) => {
                console.log('[USER TYPING] Channel subscription status:', status);
                if (status === 'SUBSCRIBED') {
                    console.log('[USER TYPING] Successfully subscribed to typing channel');
                }
            });

        typingChannelRef.current = typingChannel;

        // Subscribe to membership changes to detect when trainer is unassigned
        const membershipChannel = supabase
            .channel(`memberships_user_${userId}_${trainerId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'memberships',
                filter: `user_id=eq.${userId} AND trainer_id=eq.${trainerId}`
            }, async () => {
                // Membership trainer assignment changed - check status
                console.log('[USER MEMBERSHIPS] Membership trainer assignment changed, checking status');
                await checkTrainerAccess();
            })
            .subscribe();

        return () => {
            if (channelRef.current) supabase.removeChannel(channelRef.current);
            if (typingChannelRef.current) supabase.removeChannel(typingChannelRef.current);
            supabase.removeChannel(membershipChannel);
            channelRef.current = null;
            typingChannelRef.current = null;
        };
    }, [trainerId, userId, trainerName]);

    useEffect(() => {
        if (listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
        }
    }, [messages, typingTrainer]);

    const onChange = (v: string) => {
        setInput(v);
        if (typingChannelRef.current && userId && trainerId) {
            try {
                console.log('[USER TYPING] Sending typing indicator - isTyping: true');
                const result = typingChannelRef.current.send({
                    type: 'broadcast',
                    event: 'typing',
                    payload: { by: 'user', isTyping: true }
                });
                console.log('[USER TYPING] Send result:', result);

                clearTimeout(typingTimerRef.current);
                typingTimerRef.current = setTimeout(() => {
                    console.log('[USER TYPING] Sending typing indicator - isTyping: false');
                    typingChannelRef.current?.send({
                        type: 'broadcast',
                        event: 'typing',
                        payload: { by: 'user', isTyping: false }
                    });
                }, 1200);
            } catch (error) {
                console.error('[USER TYPING] Error sending typing indicator:', error);
            }
        } else {
            logger.debug('[USER TYPING] Cannot send - channel not ready');
        }
    };

    const sendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !userId) return;

        // Check if user still has trainer access
        if (hasTrainerAccess === false) {
            showToast('You can no longer message this trainer. Your trainer access has expired or been removed.', 'warning');
            return;
        }

        // Stop typing indicator
        if (typingChannelRef.current) {
            typingChannelRef.current.send({
                type: 'broadcast',
                event: 'typing',
                payload: { by: 'user', isTyping: false }
            });
        }

        try {
            // Get session token
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const response = await fetch(`/api/messages/trainer/${trainerId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                credentials: 'include',
                body: JSON.stringify({ content: input.trim() })
            });

            const data = await response.json();

            if (!response.ok) {
                // If error is about booking/access, update state
                if (data.error && (data.error.includes('booking') || data.error.includes('access'))) {
                    await checkTrainerAccess();
                }
                throw new Error(data.error || 'Failed to send message');
            }

            // Notify trainer via broadcast and refresh messages
            if (channelRef.current) {
                channelRef.current.send({
                    type: 'broadcast',
                    event: 'new_message',
                    payload: { by: 'user' }
                });
            }

            // Immediately refresh messages to show the new one
            await loadMessages();

            setInput('');
        } catch (error: any) {
            console.error('Error sending message:', error);
            showToast(`Failed to send message: ${error.message}`, 'error');
        }
    };

    if (loading) {
        return (
            <div className={styles.wrapper}>
                <div className={styles.loading}>Loading messages...</div>
            </div>
        );
    }

    return (
        <div className={styles.wrapper}>
            <div className={styles.header}>Chat with {trainerName}</div>
            {restrictionMessage && (
                <div className={styles.restrictionMessage}>
                    <div className={styles.restrictionContent}>
                        ⚠️ {restrictionMessage}
                    </div>
                </div>
            )}
            <div className={styles.list} ref={listRef}>
                {messages.map((m) => {
                    const mine = !m.is_trainer;
                    return (
                        <div key={m.id} className={mine ? styles.bubbleMine : styles.bubbleOther}>
                            <div className={styles.content}>{m.content}</div>
                            <div className={styles.ts}>
                                {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                    );
                })}
                {typingTrainer && (
                    <div className={styles.typing}>{trainerName} is typing...</div>
                )}
            </div>
            <form onSubmit={sendMessage} className={styles.inputRow}>
                <input
                    className={styles.textInput}
                    value={input}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={hasTrainerAccess === false ? "You can no longer message this trainer" : "Type a message..."}
                    disabled={hasTrainerAccess === false}
                />
                <button className={styles.sendBtn} type="submit" disabled={hasTrainerAccess === false}>
                    <Send size={18} />
                </button>
            </form>
            <Toast message={toast} type={toastType} onClose={hideToast} />
        </div>
    );
}

