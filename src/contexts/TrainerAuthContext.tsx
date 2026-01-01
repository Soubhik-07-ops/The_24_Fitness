// src/contexts/TrainerAuthContext.tsx
'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface Trainer {
    id: string;
    name: string;
    phone: string;
    email: string;
    user_id: string | null;
    photo_url?: string | null;
}

interface TrainerAuthContextType {
    trainer: Trainer | null;
    loading: boolean;
    signIn: (phone: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
}

const TrainerAuthContext = createContext<TrainerAuthContextType | undefined>(undefined);

export function TrainerAuthProvider({ children }: { children: React.ReactNode }) {
    const [trainer, setTrainer] = useState<Trainer | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        // Only check session if we're on trainer dashboard pages (not /trainers public page)
        // /trainer = trainer dashboard (requires auth)
        // /trainers = public trainers page (no auth required)
        if (pathname?.startsWith('/trainer/') || pathname === '/trainer') {
            checkSession();
        } else {
            // Not on trainer dashboard pages, just set loading to false
            setLoading(false);
        }
    }, [pathname]);

    const checkSession = async () => {
        try {
            if (pathname === '/trainer/login') {
                setLoading(false);
                return;
            }

            // Only validate if on trainer dashboard pages (not /trainers public page)
            if (!pathname?.startsWith('/trainer/') && pathname !== '/trainer') {
                setLoading(false);
                return;
            }

            const response = await fetch('/api/trainer/validate', {
                credentials: 'include',
                cache: 'no-store'
            });

            if (response.ok) {
                const data = await response.json();
                setTrainer(data.trainer);
            } else {
                setTrainer(null);
                if (pathname?.startsWith('/trainer/') || pathname === '/trainer') {
                    router.push('/trainer/login');
                }
            }
        } catch (error) {
            console.error('Session check error:', error);
            setTrainer(null);
            if (pathname?.startsWith('/trainer/') || pathname === '/trainer') {
                router.push('/trainer/login');
            }
        } finally {
            setLoading(false);
        }
    };

    const signIn = async (phone: string, password: string) => {
        try {
            const response = await fetch('/api/trainer/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, password }),
                credentials: 'include',
                cache: 'no-store'
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Login failed');
            }

            setTrainer(data.trainer);

            const verifyResponse = await fetch('/api/trainer/validate', {
                credentials: 'include',
                cache: 'no-store'
            });

            if (verifyResponse.ok) {
                router.push('/trainer');
            } else {
                throw new Error('Session validation failed');
            }
        } catch (error: any) {
            console.error('Login error:', error);
            throw new Error(error.message || 'Invalid phone or password');
        }
    };

    const signOut = async () => {
        try {
            await fetch('/api/trainer/logout', {
                method: 'POST',
                credentials: 'include'
            });

            setTrainer(null);
            window.location.href = '/trainer/login';
        } catch (error) {
            console.error('Logout error:', error);
            setTrainer(null);
            window.location.href = '/trainer/login';
        }
    };

    return (
        <TrainerAuthContext.Provider value={{ trainer, loading, signIn, signOut }}>
            {children}
        </TrainerAuthContext.Provider>
    );
}

export function useTrainerAuth() {
    const context = useContext(TrainerAuthContext);
    if (!context) {
        throw new Error('useTrainerAuth must be used within TrainerAuthProvider');
    }
    return context;
}

