// src/app/trainer/clients/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User, Mail, Phone, MessageSquare, Trash2, Clock, AlertCircle } from 'lucide-react';
import Toast from '@/components/Toast/Toast';
import { useToast } from '@/hooks/useToast';
import styles from './clients.module.css';

interface Client {
    user_id: string;
    user_name: string;
    user_email: string;
    membership_id: number;
    plan_name: string;
    status: string;
    chart_count: number;
    trainer_period_end?: string | null;
    days_remaining?: number;
    is_expiring_soon?: boolean;
}

export default function TrainerClientsPage() {
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const { toast, toastType, showToast, hideToast } = useToast();

    useEffect(() => {
        fetchClients();
    }, []);

    const handleRemoveClient = async (userId: string, userName: string) => {
        if (!confirm(`Are you sure you want to remove ${userName}? This will remove them from your client list. This action cannot be undone.`)) {
            return;
        }

        try {
            // Use API endpoint to remove client (handles addon removal and notifications)
            const removeResponse = await fetch(`/api/trainer/clients/${userId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (!removeResponse.ok) {
                const removeData = await removeResponse.json();
                throw new Error(removeData.error || 'Failed to remove client');
            }

            // Refresh clients list
            await fetchClients();
            showToast('Client removed successfully', 'success');
        } catch (error: any) {
            console.error('Error removing client:', error);
            showToast(`Failed to remove client: ${error.message}`, 'error');
        }
    };

    const fetchClients = async () => {
        try {
            const response = await fetch('/api/trainer/weekly-charts', {
                credentials: 'include',
                cache: 'no-store'
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch clients');
            }

            // Get clients from weekly charts API response
            const clientsData = (data.clients || []).map((client: any) => ({
                user_id: client.user_id,
                user_name: client.user_name || 'Unknown User',
                user_email: client.user_email || 'No email',
                membership_id: client.membership_id,
                plan_name: client.plan_name || 'Unknown Plan',
                status: client.status || 'active',
                chart_count: (client.charts || []).length,
                trainer_period_end: client.trainer_period_end || null,
                days_remaining: client.days_remaining || null,
                is_expiring_soon: client.is_expiring_soon || false
            }));

            // Sort clients: expiring soon first, then by name
            clientsData.sort((a: Client, b: Client) => {
                if (a.is_expiring_soon && !b.is_expiring_soon) return -1;
                if (!a.is_expiring_soon && b.is_expiring_soon) return 1;
                return a.user_name.localeCompare(b.user_name);
            });

            setClients(clientsData);
        } catch (error) {
            console.error('Error fetching clients:', error);
            showToast('Failed to fetch clients', 'error');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loadingState}>
                    <div className={styles.spinner}></div>
                    <p>Loading clients...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>My Clients</h1>

            {clients.length === 0 ? (
                <div className={styles.emptyState}>
                    <User size={48} />
                    <h3>No clients yet</h3>
                    <p>Clients will appear here once they select you as their personal trainer in their membership plan.</p>
                </div>
            ) : (
                <div className={styles.clientsGrid}>
                    {clients.map((client) => (
                        <div key={`${client.user_id}-${client.membership_id}`} className={styles.clientCard}>
                            <div className={styles.clientHeader}>
                                <div className={styles.clientAvatar}>
                                    <User size={24} />
                                </div>
                                <div>
                                    <h3 className={styles.clientName}>{client.user_name}</h3>
                                    <p className={styles.clientMeta}>
                                        {client.plan_name} Plan
                                    </p>
                                </div>
                            </div>

                            <div className={styles.clientInfo}>
                                <div className={styles.infoRow}>
                                    <Mail size={16} />
                                    <span>{client.user_email}</span>
                                </div>
                                <div className={styles.infoRow}>
                                    <Phone size={16} />
                                    <span>{client.chart_count} chart{client.chart_count !== 1 ? 's' : ''} created</span>
                                </div>
                                {client.trainer_period_end && (
                                    <div className={styles.infoRow}>
                                        <Clock size={16} />
                                        <span>
                                            Trainer access {client.days_remaining !== null && client.days_remaining !== undefined
                                                ? client.days_remaining > 0
                                                    ? `expires in ${client.days_remaining} day${client.days_remaining !== 1 ? 's' : ''}`
                                                    : 'has expired'
                                                : 'expires ' + new Date(client.trainer_period_end).toLocaleDateString()}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {client.is_expiring_soon && (
                                <div style={{
                                    marginTop: '0.75rem',
                                    padding: '0.5rem 0.75rem',
                                    backgroundColor: '#fef3c7',
                                    border: '1px solid #fcd34d',
                                    borderRadius: '0.375rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    fontSize: '0.875rem',
                                    color: '#92400e'
                                }}>
                                    <AlertCircle size={16} />
                                    <span>Trainer access expiring soon</span>
                                </div>
                            )}

                            <div className={styles.cardActions}>
                                <button
                                    className={styles.messageButton}
                                    onClick={() => router.push(`/trainer/messages/${client.user_id}`)}
                                >
                                    <MessageSquare size={18} />
                                    Message Client
                                </button>
                                <button
                                    className={styles.removeButton}
                                    onClick={() => handleRemoveClient(client.user_id, client.user_name)}
                                >
                                    <Trash2 size={18} />
                                    Remove Client
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <Toast message={toast} type={toastType} onClose={hideToast} />
        </div>
    );
}

