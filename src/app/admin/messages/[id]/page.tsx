'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import adminStyles from '../../admin.module.css';
import styles from './thread.module.css';
import { supabase } from '@/lib/supabaseClient';

interface ChatMessage {
    id: string;
    request_id: string;
    sender_id: string | null;
    is_admin?: boolean;
    content: string;
    created_at: string;
}

interface Membership {
    id: number;
    user_id: string;
    status: string;
    trainer_assigned: boolean;
    membership_end_date: string | null;
    trainer_period_end: string | null;
}

export default function AdminChatThreadPage() {
    const params = useParams();
    const requestId = params?.id as string;
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [typingUser, setTypingUser] = useState<string | null>(null);
    const [membership, setMembership] = useState<Membership | null>(null);
    const [renewing, setRenewing] = useState<string | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);
    const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const messageChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

    const load = async () => {
        const res = await fetch(`/api/admin/contact/requests/${requestId}/messages`, { cache: 'no-store', credentials: 'include' });
        const data = await res.json();
        if (res.ok) setMessages(data.messages || []);
    };

    const loadUserMembership = async () => {
        try {
            // Get user_id from contact request
            const reqRes = await fetch(`/api/admin/contact/requests/${requestId}`, { cache: 'no-store', credentials: 'include' });
            if (reqRes.ok) {
                const reqData = await reqRes.json();
                const userId = reqData.request?.user_id;
                if (userId) {
                    // Fetch user's active membership
                    const memRes = await fetch(`/api/admin/memberships?userId=${userId}`, { cache: 'no-store', credentials: 'include' });
                    if (memRes.ok) {
                        const memData = await memRes.json();
                        const activeMembership = memData.memberships?.find((m: Membership) => m.status === 'active');
                        setMembership(activeMembership || null);
                    }
                }
            }
        } catch (error) {
            console.error('Error loading user membership:', error);
        }
    };

    useEffect(() => {
        load();
        loadUserMembership();
    }, [requestId]);

    useEffect(() => {
        if (!requestId) return;

        const typingChannel = supabase
            .channel(`typing_request_${requestId}`)
            .on('broadcast', { event: 'typing' }, (payload: any) => {
                const { by, isTyping } = payload.payload || {};
                if (by === 'user') setTypingUser(isTyping ? 'User is typing…' : null);
            })
            .on('broadcast', { event: 'new_message' }, (payload: any) => {
                // Fallback when DB changes aren't delivered due to RLS
                // User sends messages via this channel
                const { by } = payload.payload || {};
                if (by === 'user') {
                    load();
                }
            })
            .subscribe();
        typingChannelRef.current = typingChannel;

        const changesChannel = supabase
            .channel(`contact_messages_${requestId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'contact_messages',
                filter: `request_id=eq.${requestId}`
            }, (payload) => {
                const newMsg = payload.new as ChatMessage;
                setMessages(prev => {
                    // Check if message already exists to prevent duplicates
                    if (prev.some(m => m.id === newMsg.id)) return prev;
                    return [...prev, newMsg];
                });
            })
            .on('broadcast', { event: 'new_message' }, () => {
                // Additional fallback for message updates
                load();
            })
            .subscribe();
        messageChannelRef.current = changesChannel;

        return () => {
            if (typingChannelRef.current) supabase.removeChannel(typingChannelRef.current);
            if (messageChannelRef.current) supabase.removeChannel(messageChannelRef.current);
            typingChannelRef.current = null;
            messageChannelRef.current = null;
        };
    }, [requestId]);

    useEffect(() => {
        if (listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
        }
    }, [messages, typingUser]);

    const typingTimerRef = useRef<any>(null);
    const onInputChange = (v: string) => {
        setInput(v);
        if (typingChannelRef.current) {
            typingChannelRef.current.send({ type: 'broadcast', event: 'typing', payload: { by: 'admin', isTyping: true } });
            clearTimeout(typingTimerRef.current);
            typingTimerRef.current = setTimeout(() => {
                typingChannelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { by: 'admin', isTyping: false } });
            }, 1200);
        }
    };

    const send = async (e: React.FormEvent) => {
        e.preventDefault();
        const content = input.trim();
        if (!content) return;
        setInput('');
        await fetch(`/api/admin/contact/requests/${requestId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ content })
        });
        await load();
    };

    const handleRenewal = async (renewalType: 'membership' | 'trainer') => {
        if (!membership) return;

        setRenewing(renewalType);
        try {
            const res = await fetch('/api/admin/memberships/renew', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    membershipId: membership.id,
                    renewalType
                })
            });

            const data = await res.json();
            if (res.ok) {
                alert(`Successfully renewed ${renewalType === 'membership' ? 'membership' : 'trainer access'}!`);
                await loadUserMembership();
                // Send confirmation message to user
                await fetch(`/api/admin/contact/requests/${requestId}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        content: `Your ${renewalType === 'membership' ? 'membership' : 'trainer access'} has been renewed successfully. An invoice has been generated and is available in your dashboard.`
                    })
                });
                await load();
            } else {
                alert(data.error || 'Failed to renew');
            }
        } catch (error) {
            console.error('Error renewing:', error);
            alert('An error occurred while processing renewal');
        } finally {
            setRenewing(null);
        }
    };

    return (
        <div className={adminStyles.content}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h1 className={adminStyles.pageTitle}>Chat</h1>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {membership && (
                        <>
                            <button
                                className={adminStyles.retryButton}
                                onClick={() => handleRenewal('membership')}
                                disabled={renewing !== null}
                                style={{
                                    background: '#3b82f6',
                                    opacity: renewing === 'membership' ? 0.6 : 1
                                }}
                            >
                                {renewing === 'membership' ? 'Renewing...' : 'Renew Membership'}
                            </button>
                            {membership.trainer_assigned && (
                                <button
                                    className={adminStyles.retryButton}
                                    onClick={() => handleRenewal('trainer')}
                                    disabled={renewing !== null}
                                    style={{
                                        background: '#10b981',
                                        opacity: renewing === 'trainer' ? 0.6 : 1
                                    }}
                                >
                                    {renewing === 'trainer' ? 'Renewing...' : 'Renew Trainer'}
                                </button>
                            )}
                        </>
                    )}
                    <button className={adminStyles.retryButton} onClick={async () => {
                        if (!confirm('Delete this chat? This will remove all messages.')) return;
                        try {
                            const res = await fetch(`/api/admin/contact/requests/${requestId}`, { method: 'DELETE', credentials: 'include' });
                            if (res.ok) {
                                window.location.href = '/admin/messages';
                            }
                        } catch (error) {
                            // Error handling - could add error state if needed
                        }
                    }}>Delete Chat</button>
                </div>
            </div>
            <div className={styles.wrapper}>
                <div className={styles.list} ref={listRef}>
                    {messages.map((m) => (
                        <div key={m.id} className={m.is_admin ? styles.bubbleMine : styles.bubbleOther}>
                            <div className={styles.content}>{m.content}</div>
                            <div className={styles.ts}>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                    ))}
                    {typingUser && <div className={styles.typing}>{typingUser}</div>}
                </div>
                <form onSubmit={send} className={styles.inputRow}>
                    <input className={styles.textInput} value={input} onChange={(e) => onInputChange(e.target.value)} placeholder="Type a message" />
                    <button className={styles.sendBtn} type="submit">Send</button>
                </form>
            </div>
        </div>
    );
}


