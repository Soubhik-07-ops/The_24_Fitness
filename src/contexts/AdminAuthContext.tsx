// src/contexts/AdminAuthContext.tsx
'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface Admin {
    id: string;
    email: string;
    full_name: string | null;
    role: string;
}

interface AdminAuthContextType {
    admin: Admin | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
    const [admin, setAdmin] = useState<Admin | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        // Only check session if we're on admin pages
        if (pathname?.startsWith('/admin')) {
            checkSession();
        } else {
            // Not on admin pages, just set loading to false
            setLoading(false);
        }
    }, [pathname]);

    const checkSession = async () => {
        try {
            // Don't check session on login page
            if (pathname === '/admin/login') {
                setLoading(false);
                return;
            }

            // Only validate if on admin pages
            if (!pathname?.startsWith('/admin')) {
                setLoading(false);
                return;
            }

            const response = await fetch('/api/admin/validate', {
                credentials: 'include',
                cache: 'no-store'
            });

            if (response.ok) {
                const data = await response.json();
                setAdmin(data.admin);
            } else {
                setAdmin(null);
                // Only redirect if we're on a protected admin page (not login page)
                if (pathname?.startsWith('/admin')) {
                    router.push('/admin/login');
                }
            }
        } catch (error) {
            console.error('Session check error:', error);
            setAdmin(null);
            // Redirect to login on error (except if already on login)
            if (pathname?.startsWith('/admin')) {
                router.push('/admin/login');
            }
        } finally {
            setLoading(false);
        }
    };

    const signIn = async (email: string, password: string) => {
        try {
            const response = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
                credentials: 'include',
                cache: 'no-store'
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Login failed');
            }

            // Set admin state
            setAdmin(data.admin);

            // Verify session is properly set before redirecting
            const verifyResponse = await fetch('/api/admin/validate', {
                credentials: 'include',
                cache: 'no-store'
            });

            if (verifyResponse.ok) {
                // Use router for smoother navigation
                router.push('/admin');
            } else {
                throw new Error('Session validation failed');
            }
        } catch (error: any) {
            console.error('❌ Login error:', error);
            throw new Error(error.message || 'Invalid email or password');
        }
    };

    const signOut = async () => {
        try {
            await fetch('/api/admin/logout', {
                method: 'POST',
                credentials: 'include'
            });

            setAdmin(null);
            window.location.href = '/admin/login';
        } catch (error) {
            console.error('Logout error:', error);
            setAdmin(null);
            window.location.href = '/admin/login';
        }
    };

    return (
        <AdminAuthContext.Provider value={{ admin, loading, signIn, signOut }}>
            {children}
        </AdminAuthContext.Provider>
    );
}

export function useAdminAuth() {
    const context = useContext(AdminAuthContext);
    if (!context) {
        throw new Error('useAdminAuth must be used within AdminAuthProvider');
    }
    return context;
}