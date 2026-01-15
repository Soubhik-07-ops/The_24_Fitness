// src/app/trainer/messages/[userId]/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { ArrowLeft, Send, User, RefreshCw } from 'lucide-react';
import Toast from '@/components/Toast/Toast';
import { useToast } from '@/hooks/useToast';
import { logger } from '@/lib/logger';
import styles from './chat.module.css';

interface ChatMessage {
    id: string;
    content: string;
    is_trainer: boolean;
    created_at: string;
}

export default function TrainerChatPage() {
    const params = useParams();
    const { toast, toastType, showToast, hideToast } = useToast();
    const router = useRouter();
    const userId = params?.userId as string;
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [userName, setUserName] = useState('Client');
    const [typingUser, setTypingUser] = useState<string | null>(null);
    const [trainerId, setTrainerId] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const listRef = useRef<HTMLDivElement | null>(null);
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const typingTimerRef = useRef<any>(null);

    // Define functions before using them
    const fetchMessages = async (showRefreshing = false) => {
        if (!userId) return;
        if (showRefreshing) setRefreshing(true);
        try {
            const response = await fetch(`/api/trainer/messages/${userId}`, {
                credentials: 'include',
                cache: 'no-store'
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch messages');
            }

            setMessages(data.messages || []);

            // Update user name if provided by API
            if (data.user_name) {
                setUserName(data.user_name);
            }
        } catch (error) {
            console.error('Error fetching messages:', error);
        } finally {
            setLoading(false);
            if (showRefreshing) setRefreshing(false);
        }
    };

    const handleRefresh = async () => {
        await fetchMessages(true);
    };


    const fetchUserName = async () => {
        if (!userId) return;
        try {
            // Get user name from the messages API (which has access to auth.admin)
            const response = await fetch(`/api/trainer/messages/${userId}`, {
                credentials: 'include',
                cache: 'no-store'
            });

            const data = await response.json();

            if (response.ok && data.user_name) {
                setUserName(data.user_name);
            } else {
                // Fallback: try profiles table directly
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('full_name')
                    .eq('id', userId)
                    .single();

                if (profile?.full_name) {
                    setUserName(profile.full_name);
                }
            }
        } catch (error) {
            console.error('Error fetching user name:', error);
        }
    };

    useEffect(() => {
        if (!userId) return;

        // Get trainer ID first
        const getTrainerId = async () => {
            try {
                const response = await fetch('/api/trainer/validate', { credentials: 'include' });
                const data = await response.json();
                if (data.trainer?.id) {
                    setTrainerId(data.trainer.id);
                }
            } catch (error) {
                console.error('Error fetching trainer ID:', error);
            }
        };

        getTrainerId();
        fetchMessages();
        fetchUserName();
    }, [userId]);

    useEffect(() => {
        if (listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
        }
    }, [messages, typingUser]);

    useEffect(() => {
        if (!userId || !trainerId) return;

        setupRealtimeSubscription();

        return () => {
            if (channelRef.current) supabase.removeChannel(channelRef.current);
            if (typingChannelRef.current) supabase.removeChannel(typingChannelRef.current);
            channelRef.current = null;
            typingChannelRef.current = null;
        };
    }, [userId, trainerId, userName]);

    const setupRealtimeSubscription = () => {
        if (!userId || !trainerId) return;

        // Message subscription - filter by trainer_id AND user_id to get messages for this specific conversation
        const channel = supabase
            .channel(`trainer_messages_${trainerId}_${userId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'trainer_messages',
                filter: `trainer_id=eq.${trainerId} AND user_id=eq.${userId}`
            }, (payload) => {
                console.log('[TRAINER MESSAGES] Received postgres_changes:', payload);
                const newMsg = payload.new as any;
                setMessages((prev) => {
                    if (prev.some(m => m.id === newMsg.id)) return prev;
                    console.log('[TRAINER MESSAGES] Adding new message:', newMsg.id);
                    return [...prev, newMsg as ChatMessage];
                });
            })
            .on('broadcast', { event: 'new_message' }, async () => {
                // Fallback refresh if DB changes don't come through
                console.log('[TRAINER MESSAGES] Received broadcast - refreshing messages');
                await fetchMessages();
            })
            .subscribe((status) => {
                console.log('[TRAINER MESSAGES] Channel subscription status:', status);
            });

        channelRef.current = channel;

        // Typing indicator subscription - use same channel name as user side
        const typingChannel = supabase
            .channel(`typing_trainer_${trainerId}_${userId}`)
            .on('broadcast', { event: 'typing' }, (payload: any) => {
                console.log('[TRAINER TYPING] Received typing broadcast:', payload);
                const { by, isTyping } = payload.payload || {};
                console.log('[TRAINER TYPING] Parsed - by:', by, 'isTyping:', isTyping);
                if (by === 'user') {
                    console.log('[TRAINER TYPING] Setting user typing to:', isTyping ? `${userName} is typing...` : null);
                    setTypingUser(isTyping ? `${userName} is typing...` : null);
                }
            })
            .subscribe((status) => {
                console.log('[TRAINER TYPING] Channel subscription status:', status);
                if (status === 'SUBSCRIBED') {
                    console.log('[TRAINER TYPING] Successfully subscribed to typing channel');
                }
            });

        typingChannelRef.current = typingChannel;
    };

    const onInputChange = (v: string) => {
        setInput(v);
        if (typingChannelRef.current && trainerId && userId) {
            try {
                console.log('[TRAINER TYPING] Sending typing indicator - isTyping: true');
                const result = typingChannelRef.current.send({
                    type: 'broadcast',
                    event: 'typing',
                    payload: { by: 'trainer', isTyping: true }
                });
                console.log('[TRAINER TYPING] Send result:', result);

                clearTimeout(typingTimerRef.current);
                typingTimerRef.current = setTimeout(() => {
                    console.log('[TRAINER TYPING] Sending typing indicator - isTyping: false');
                    typingChannelRef.current?.send({
                        type: 'broadcast',
                        event: 'typing',
                        payload: { by: 'trainer', isTyping: false }
                    });
                }, 1200);
            } catch (error) {
                console.error('[TRAINER TYPING] Error sending typing indicator:', error);
            }
        } else {
            logger.debug('[TRAINER TYPING] Cannot send - channel not ready');
        }
    };

    const sendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;

        // Stop typing indicator
        if (typingChannelRef.current) {
            typingChannelRef.current.send({
                type: 'broadcast',
                event: 'typing',
                payload: { by: 'trainer', isTyping: false }
            });
        }

        try {
            const response = await fetch(`/api/trainer/messages/${userId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ content: input.trim() })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to send message');
            }

            // Refresh messages immediately to show the new message
            await fetchMessages();

            // Notify user via broadcast
            if (channelRef.current) {
                channelRef.current.send({
                    type: 'broadcast',
                    event: 'new_message',
                    payload: { by: 'trainer' }
                });
            }

            setInput('');
        } catch (error: any) {
            console.error('Error sending message:', error);
            showToast(`Failed to send message: ${error.message}`, 'error');
        }
    };

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loadingState}>
                    <div className={styles.spinner}></div>
                    <p>Loading messages...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <button className={styles.backButton} onClick={() => router.push('/trainer/messages')}>
                    <ArrowLeft size={20} />
                </button>
                <div className={styles.headerInfo}>
                    <div className={styles.avatar}>
                        <User size={20} />
                    </div>
                    <h2 className={styles.userName}>{userName}</h2>
                </div>
                <button
                    className={styles.refreshButton}
                    onClick={handleRefresh}
                    disabled={refreshing}
                    title="Refresh messages"
                >
                    <RefreshCw size={18} className={refreshing ? styles.refreshing : ''} />
                </button>
            </div>

            <div className={styles.messagesList} ref={listRef}>
                {messages.length === 0 ? (
                    <div className={styles.emptyMessages}>
                        <p>No messages yet. Start the conversation!</p>
                    </div>
                ) : (
                    <>
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`${styles.message} ${msg.is_trainer ? styles.messageTrainer : styles.messageUser}`}
                            >
                                <div className={styles.messageContent}>{msg.content}</div>
                                <div className={styles.messageTime}>
                                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        ))}
                        {typingUser && (
                            <div className={styles.typing}>{typingUser}</div>
                        )}
                    </>
                )}
            </div>

            <form onSubmit={sendMessage} className={styles.inputForm}>
                <input
                    className={styles.textInput}
                    value={input}
                    onChange={(e) => onInputChange(e.target.value)}
                    placeholder="Type a message..."
                />
                <button className={styles.sendButton} type="submit">
                    <Send size={20} />
                </button>
            </form>
            <Toast message={toast} type={toastType} onClose={hideToast} />
        </div>
    );
}

