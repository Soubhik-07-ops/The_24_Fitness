'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { useTrainerAuth } from '@/contexts/TrainerAuthContext';
import styles from './The24FitBot.module.css';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

export default function The24FitBot() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: '1',
            role: 'assistant',
            content: 'Hello! I\'m The24FitBot, your virtual assistant 💪 How can I help you today?',
            timestamp: new Date()
        }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const { admin } = useAdminAuth();
    const { trainer } = useTrainerAuth();
    const [isUserBlocked, setIsUserBlocked] = useState(false);

    useEffect(() => {
        // Check if user is admin or trainer
        const checkUserType = async () => {
            // Check admin context
            if (admin) {
                setIsUserBlocked(true);
                return;
            }

            // Check trainer context
            if (trainer) {
                setIsUserBlocked(true);
                return;
            }

            // Additional check: verify via API (in case contexts haven't loaded yet)
            try {
                const [adminCheck, trainerCheck] = await Promise.all([
                    fetch('/api/admin/validate', { credentials: 'include' }).catch(() => ({ ok: false })),
                    fetch('/api/trainer/validate', { credentials: 'include' }).catch(() => ({ ok: false }))
                ]);

                if (adminCheck.ok || trainerCheck.ok) {
                    setIsUserBlocked(true);
                }
            } catch (error) {
                // If check fails, allow access (better UX - API route will also block)
                // Silently fail to avoid console noise
            }
        };

        checkUserType();
    }, [admin, trainer]);

    useEffect(() => {
        if (isOpen && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen]);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: input.trim(),
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const response = await fetch('/api/chatbot', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                credentials: 'include',
                body: JSON.stringify({
                    message: userMessage.content,
                    conversationHistory: messages.slice(-10).map(m => ({
                        role: m.role,
                        content: m.content
                    }))
                })
            });

            const data = await response.json();

            if (response.ok) {
                const assistantMessage: ChatMessage = {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: data.response,
                    timestamp: new Date()
                };
                setMessages(prev => [...prev, assistantMessage]);
            } else {
                throw new Error(data.error || 'Failed to get response');
            }
        } catch (error) {
            console.error('Chatbot error:', error);
            const errorMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: 'Sorry, I encountered an error. Please try again or contact support through the Contact page.',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    if (isUserBlocked) {
        return null; // Don't show chatbot to admins or trainers
    }

    return (
        <>
            {!isOpen && (
                <button
                    className={styles.chatButton}
                    onClick={() => setIsOpen(true)}
                    aria-label="Open chatbot"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="currentColor" />
                    </svg>
                </button>
            )}

            {isOpen && (
                <div className={styles.chatWindow}>
                    <div className={styles.chatHeader}>
                        <div className={styles.headerContent}>
                            <div className={styles.botAvatar}>💪</div>
                            <div>
                                <div className={styles.botName}>The24FitBot</div>
                                <div className={styles.botStatus}>Online</div>
                            </div>
                        </div>
                        <button
                            className={styles.closeButton}
                            onClick={() => setIsOpen(false)}
                            aria-label="Close chatbot"
                        >
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                        </button>
                    </div>

                    <div className={styles.messagesContainer}>
                        {messages.map((message) => (
                            <div
                                key={message.id}
                                className={`${styles.message} ${message.role === 'user' ? styles.userMessage : styles.assistantMessage}`}
                            >
                                <div className={styles.messageContent}>{message.content}</div>
                                <div className={styles.messageTime}>
                                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className={`${styles.message} ${styles.assistantMessage}`}>
                                <div className={styles.messageContent}>
                                    <span className={styles.typingIndicator}>Typing...</span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <form onSubmit={handleSend} className={styles.inputContainer}>
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Type your message..."
                            className={styles.input}
                            disabled={isLoading}
                        />
                        <button
                            type="submit"
                            className={styles.sendButton}
                            disabled={!input.trim() || isLoading}
                            aria-label="Send message"
                        >
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M18 2L9 11M18 2L12 18L9 11M18 2L2 8L9 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                    </form>
                </div>
            )}
        </>
    );
}

