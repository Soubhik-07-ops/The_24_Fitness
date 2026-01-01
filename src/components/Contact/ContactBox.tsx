'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import styles from './ContactBox.module.css';
import ChatWindow from '@/components/Contact/ChatWindow';

type RequestStatus = 'pending' | 'accepted' | 'declined';

interface ContactRequest {
    id: string;
    user_id: string;
    subject: string | null;
    message: string | null;
    status: RequestStatus;
    created_at: string;
}

export default function ContactBox({ isAuthed }: { isAuthed: boolean }) {
    const [loading, setLoading] = useState(true);
    const [existingRequest, setExistingRequest] = useState<ContactRequest | null>(null);
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError(null);
            const { data: userData } = await supabase.auth.getUser();
            const userId = userData.user?.id;
            if (!userId) {
                setExistingRequest(null);
                setLoading(false);
                return;
            }

            const { data, error } = await supabase
                .from('contact_requests')
                .select('*')
                .eq('user_id', userId)
                .in('status', ['pending', 'accepted'])
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) {
                setError('Failed to load contact status');
            }
            setExistingRequest(data || null);
            setLoading(false);
        };

        if (isAuthed) load();
        else {
            setExistingRequest(null);
            setLoading(false);
        }
    }, [isAuthed]);

    useEffect(() => {
        // subscribe to status updates for the latest request
        if (!existingRequest) return;
        const channel = supabase
            .channel(`contact_requests_status_${existingRequest.id}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contact_requests', filter: `id=eq.${existingRequest.id}` }, (payload) => {
                const updated = payload.new as ContactRequest;
                setExistingRequest(updated);
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'contact_requests', filter: `id=eq.${existingRequest.id}` }, () => {
                setExistingRequest(null);
            })
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, [existingRequest?.id]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;
        if (!userId) {
            setError('Please sign in to contact us.');
            return;
        }

        try {
            const { data, error } = await supabase
                .from('contact_requests')
                .insert({ user_id: userId, subject, message, status: 'pending' })
                .select('*')
                .single();

            if (error) throw error;
            setExistingRequest(data as any);
            setSuccess('Message sent. Waiting for admin approval.');
            setSubject('');
            setMessage('');
            // notify admin of new request
            supabase.channel('admin_notifications_bell').send({ type: 'broadcast', event: 'new_request', payload: { userId } });
            supabase.channel('notify_admin').send({ type: 'broadcast', event: 'new_request', payload: { userId } });
        } catch (err: any) {
            setError(err.message || 'Failed to send message');
        }
    };

    return (
        <section className={styles.container}>
            <div className={styles.card}>
                <h2 className={styles.title}>Contact The 24 Fitness Gym</h2>
                <p className={styles.subtitle}>Have questions? Send us a message.</p>

                {!isAuthed && (
                    <div className={styles.notice}>You must be signed in to send a message.</div>
                )}

                {isAuthed && loading && <div className={styles.loading}>Loading...</div>}

                {isAuthed && !loading && existingRequest && existingRequest.status === 'pending' && (
                    <div className={styles.pendingBox}>
                        <p className={styles.pendingText}>Waiting for admin approval</p>
                    </div>
                )}

                {isAuthed && !loading && existingRequest && existingRequest.status === 'accepted' && (
                    <ChatWindow requestId={existingRequest.id} />
                )}

                {isAuthed && !loading && !existingRequest && (
                    <form onSubmit={handleSubmit} className={styles.form}>
                        <div className={styles.inputGroup}>
                            <label htmlFor="subject">Subject</label>
                            <input
                                id="subject"
                                type="text"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                placeholder="How can we help?"
                                required
                            />
                        </div>
                        <div className={styles.inputGroup}>
                            <label htmlFor="message">Message</label>
                            <textarea
                                id="message"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="Write your message..."
                                rows={5}
                                required
                            />
                        </div>
                        <button className={styles.submitButton} type="submit">Send</button>
                        {error && <p className={styles.error}>{error}</p>}
                        {success && <p className={styles.success}>{success}</p>}
                    </form>
                )}
            </div>
        </section>
    );
}


