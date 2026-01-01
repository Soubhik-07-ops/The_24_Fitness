// src/app/trainer/layout.tsx
'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    BarChart3,
    Users,
    MessageSquare,
    Settings,
    LogOut,
    Menu,
    X,
    Home,
    FileText,
} from 'lucide-react';
import { useTrainerAuth } from '@/contexts/TrainerAuthContext';
import { useTrainerUnreadCount } from '@/hooks/useTrainerUnreadCount';
import styles from './trainer.module.css';

const navigation = [
    { name: 'Dashboard', href: '/trainer', icon: BarChart3 },
    { name: 'Clients', href: '/trainer/clients', icon: Users },
    { name: 'Weekly Charts', href: '/trainer/weekly-charts', icon: FileText },
    { name: 'Messages', href: '/trainer/messages', icon: MessageSquare },
    { name: 'Settings', href: '/trainer/settings', icon: Settings },
];

export default function TrainerLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const pathname = usePathname();
    const { trainer, loading, signOut } = useTrainerAuth();
    const router = useRouter();
    const unreadCount = useTrainerUnreadCount();

    // If on login page, don't show the trainer layout
    if (pathname === '/trainer/login') {
        return <>{children}</>;
    }

    const handleSignOut = async () => {
        await signOut();
    };

    const goToWebsite = () => {
        router.push('/');
    };

    // Show loading screen
    if (loading) {
        return (
            <div className={styles.loadingFullscreen}>
                <div className={styles.spinner}></div>
                <p>Loading...</p>
            </div>
        );
    }

    // If not logged in and not on login page, show loading (will redirect)
    if (!trainer) {
        return (
            <div className={styles.loadingFullscreen}>
                <div className={styles.spinner}></div>
                <p>Redirecting to login...</p>
            </div>
        );
    }

    // Logged in - show full trainer layout
    return (
        <div className={styles.trainerLayout}>
            {/* Sidebar */}
            <div className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
                <div className={styles.sidebarHeader}>
                    <h2 className={styles.logo}>THE 24 FITNESS GYM TRAINER</h2>
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className={styles.closeButton}
                    >
                        <X size={20} />
                    </button>
                </div>

                <nav className={styles.navigation}>
                    {navigation.map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname === item.href;
                        const hasUnread = item.href === '/trainer/messages' && unreadCount > 0;
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                                onClick={() => setSidebarOpen(false)}
                            >
                                <div style={{ position: 'relative' }}>
                                    <Icon size={20} />
                                    {hasUnread && (
                                        <span
                                            style={{
                                                position: 'absolute',
                                                top: '-4px',
                                                right: '-4px',
                                                width: '8px',
                                                height: '8px',
                                                backgroundColor: '#ef4444',
                                                borderRadius: '50%',
                                                border: '2px solid white',
                                                display: 'block'
                                            }}
                                        />
                                    )}
                                </div>
                                <span>{item.name}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className={styles.sidebarFooter}>
                    <div className={styles.trainerInfo}>
                        <div className={styles.trainerName}>{trainer.name}</div>
                        <div className={styles.trainerPhone}>{trainer.phone}</div>
                    </div>

                    <div className={styles.sidebarActions}>
                        <button onClick={goToWebsite} className={styles.websiteButton}>
                            <Home size={20} />
                            <span>View Website</span>
                        </button>

                        <button onClick={handleSignOut} className={styles.logoutButton}>
                            <LogOut size={20} />
                            <span>Logout</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className={styles.mainContent}>
                {/* Top Header */}
                <header className={styles.header}>
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className={styles.menuButton}
                    >
                        <Menu size={24} />
                    </button>

                    <div className={styles.headerContent}>
                        <h1 className={styles.pageTitle}>
                            {navigation.find(item => item.href === pathname)?.name || 'Dashboard'}
                        </h1>

                        <div className={styles.headerActions}>
                            <span className={styles.welcomeText}>
                                Welcome, {trainer.name}
                            </span>
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <main className={styles.content}>
                    {children}
                </main>
            </div>
        </div>
    );
}

