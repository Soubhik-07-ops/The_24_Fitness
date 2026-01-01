// src/app/trainer/page.tsx
'use client';

import { useState, useEffect } from 'react';
import {
    Users,
    FileText,
    MessageSquare,
    TrendingUp,
} from 'lucide-react';
import { useTrainerAuth } from '@/contexts/TrainerAuthContext';
import styles from './trainer.module.css';

interface TrainerStats {
    totalClients: number;
    totalCharts: number;
    unreadMessages: number;
}

export default function TrainerDashboard() {
    const [stats, setStats] = useState<TrainerStats>({
        totalClients: 0,
        totalCharts: 0,
        unreadMessages: 0,
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { trainer } = useTrainerAuth();

    useEffect(() => {
        fetchDashboardStats();
    }, []);

    const fetchDashboardStats = async () => {
        try {
            setLoading(true);
            setError(null);

            // Fetch clients from weekly charts API (which includes client info)
            const chartsResponse = await fetch('/api/trainer/weekly-charts', {
                credentials: 'include',
                cache: 'no-store'
            });

            const chartsData = await chartsResponse.json();

            if (!chartsResponse.ok) {
                throw new Error(chartsData.error || 'Failed to fetch data');
            }

            const clients = chartsData.clients || [];
            const allCharts = chartsData.charts || [];

            setStats({
                totalClients: clients.length,
                totalCharts: allCharts.length,
                unreadMessages: 0, // TODO: Implement message count if needed
            });
        } catch (error) {
            console.error('Error fetching dashboard stats:', error);
            setError(error instanceof Error ? error.message : 'Failed to fetch data');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className={styles.dashboard}>
                <div className={styles.loadingState}>
                    <div className={styles.spinner}></div>
                    <p>Loading dashboard data...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.dashboard}>
            <div className={styles.welcomeSection}>
                <div className={styles.welcomeHeader}>
                    <div>
                        <h1 className={styles.welcomeTitle}>
                            Welcome back, {trainer?.name}! 👋
                        </h1>
                        <p className={styles.welcomeSubtitle}>
                            Here's an overview of your training sessions and clients.
                        </p>
                    </div>
                </div>
            </div>

            {error && (
                <div className={styles.errorState}>
                    <h3>Error</h3>
                    <p>{error}</p>
                    <button className={styles.retryButton} onClick={fetchDashboardStats}>
                        <TrendingUp size={16} />
                        Retry
                    </button>
                </div>
            )}

            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Users size={24} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statNumber}>{stats.totalClients}</div>
                        <div className={styles.statLabel}>Total Clients</div>
                        <span className={styles.statSubtext}>Assigned clients</span>
                    </div>
                </div>

                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <FileText size={24} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statNumber}>{stats.totalCharts}</div>
                        <div className={styles.statLabel}>Weekly Charts</div>
                        <span className={styles.statSubtext}>Created charts</span>
                    </div>
                </div>

                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <MessageSquare size={24} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statNumber}>{stats.unreadMessages}</div>
                        <div className={styles.statLabel}>Messages</div>
                        <span className={styles.statSubtext}>Client messages</span>
                    </div>
                </div>
            </div>

            <div className={styles.quickActions}>
                <h2 className={styles.sectionTitle}>Quick Actions</h2>
                <div className={styles.actionGrid}>
                    <a href="/trainer/clients" className={styles.actionButton}>
                        <Users size={24} />
                        <span>Manage Clients</span>
                    </a>
                    <a href="/trainer/weekly-charts" className={styles.actionButton}>
                        <FileText size={24} />
                        <span>Weekly Charts</span>
                    </a>
                    <a href="/trainer/messages" className={styles.actionButton}>
                        <MessageSquare size={24} />
                        <span>Messages</span>
                    </a>
                </div>
            </div>
        </div>
    );
}

