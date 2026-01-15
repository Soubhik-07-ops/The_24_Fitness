'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, Dumbbell, Loader2 } from 'lucide-react'
import styles from './Navbar.module.css'
import { supabase } from '@/lib/supabaseClient'
import { type User } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import NotificationBell from '@/components/Notifications/NotificationBell'
import { logger } from '@/lib/logger'

export default function Navbar() {
    const [isOpen, setIsOpen] = useState(false)
    const [mounted, setMounted] = useState(false)
    const [user, setUser] = useState<User | null>(null)
    const [isLoggingOut, setIsLoggingOut] = useState(false)
    const router = useRouter()

    const menuItems = [
        { name: 'Home', path: '/' },
        { name: 'Gym Benefits', path: '/features' },
        { name: 'Trainers', path: '/trainers' },
        { name: 'Membership', path: '/membership' },
        { name: 'Offers', path: '/offers' },
        { name: 'Contact Us', path: '/contact' }
    ]

    // ✅ Handle mount + auth + responsive behavior
    useEffect(() => {
        setMounted(true)

        const getSession = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            setUser(session?.user ?? null)
        }
        getSession()

        let profileChannel: ReturnType<typeof supabase.channel> | null = null
        let validationInterval: NodeJS.Timeout | null = null

        const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
            setUser(session?.user ?? null)

            // Clean up previous subscriptions
            if (profileChannel) {
                await supabase.removeChannel(profileChannel)
                profileChannel = null
            }
            if (validationInterval) {
                clearInterval(validationInterval)
                validationInterval = null
            }

            // Only set up deletion detection if user is signed in
            if (event === 'SIGNED_IN' && session?.user?.id) {
                const userId = session.user.id

                // Method 1: Real-time detection via Supabase Realtime
                // Listen for DELETE events on the profiles table for this user
                profileChannel = supabase
                    .channel(`user_deletion_${userId}`)
                    .on(
                        'postgres_changes',
                        {
                            event: 'DELETE',
                            schema: 'public',
                            table: 'profiles',
                            filter: `id=eq.${userId}`
                        },
                        async (payload) => {
                            // User profile was deleted - sign out immediately
                            logger.debug('[NAVBAR] User profile deleted detected via Realtime, signing out')
                            await supabase.auth.signOut()
                            setUser(null)
                            router.push('/')
                        }
                    )
                    .subscribe((status) => {
                        if (status === 'SUBSCRIBED') {
                            logger.debug('[NAVBAR] Subscribed to profile deletion events')
                        }
                    })

                // Method 2: Periodic validation check (every 30 seconds)
                // This is a fallback in case Realtime doesn't catch the deletion
                // Only signs out if user is actually deleted, not on network errors
                validationInterval = setInterval(async () => {
                    try {
                        const { data: { session: currentSession } } = await supabase.auth.getSession()
                        if (!currentSession?.access_token) {
                            return // No session, skip check
                        }

                        // Validate user still exists via API (checks both profile and auth user)
                        const response = await fetch('/api/notifications/check', {
                            headers: {
                                'Authorization': `Bearer ${currentSession.access_token}`
                            },
                            credentials: 'include',
                            cache: 'no-store'
                        })

                        // Only sign out if we get a specific "deleted" error, not network errors
                        if (response.status === 401) {
                            const errorData = await response.json().catch(() => ({}))
                            // Only sign out if explicitly told the user was deleted
                            if (errorData.error?.includes('deleted') || errorData.error?.includes('User was deleted')) {
                                logger.debug('[NAVBAR] User deleted detected via validation check, signing out')
                                await supabase.auth.signOut()
                                setUser(null)
                                router.push('/')
                            }
                        }
                        // If it's a network error or other error, ignore it (don't sign out)
                    } catch (err) {
                        // Silently fail - network errors should not trigger logout
                        logger.debug('[NAVBAR] Validation check error (non-critical):', err)
                    }
                }, 30000) // Check every 30 seconds
            }
        })

        // ✅ Listen for resize AFTER mount
        const handleResize = () => {
            if (window.innerWidth >= 1024 && isOpen) {
                setIsOpen(false)
            }
        }

        window.addEventListener('resize', handleResize)

        return () => {
            authListener.subscription.unsubscribe()
            window.removeEventListener('resize', handleResize)
            if (profileChannel) {
                supabase.removeChannel(profileChannel)
            }
            if (validationInterval) {
                clearInterval(validationInterval)
            }
        }
    }, [router, isOpen])

    const handleLogout = async () => {
        setIsLoggingOut(true)
        try {
            await supabase.auth.signOut()
            setIsOpen(false)
            // Small delay for smooth UX
            setTimeout(() => {
                router.push('/')
                window.location.href = '/'
            }, 500)
        } catch (error) {
            console.error('Logout error:', error)
            setIsLoggingOut(false)
        }
    }

    const handleNavClick = (path: string) => {
        setIsOpen(false)
        router.push(path)
    }

    if (!mounted) return null

    return (
        <>
            {isLoggingOut && (
                <div className={styles.logoutOverlay}>
                    <div className={styles.logoutLoadingCard}>
                        <Loader2 className={styles.logoutOverlaySpinner} size={40} />
                        <p className={styles.logoutLoadingText}>Logging you out...</p>
                    </div>
                </div>
            )}
            <nav className={styles.navbar}>
                <div className={styles.container}>
                    {/* Logo */}
                    <div className={styles.logo} onClick={() => router.push('/')}>
                        <Dumbbell size={28} color="#f97316" />
                        <span className={styles.logoText}> FITNESS</span>
                    </div>

                    {/* Desktop Menu */}
                    <div className={styles.desktopMenu}>
                        {menuItems.map((item) => (
                            <button
                                key={item.name}
                                onClick={() => handleNavClick(item.path)}
                                className={styles.menuItem}
                            >
                                {item.name}
                            </button>
                        ))}
                        {user && (
                            <button
                                onClick={() => handleNavClick('/dashboard')}
                                className={styles.menuItem}
                            >
                                Dashboard
                            </button>
                        )}
                        {user && <NotificationBell mode="user" />}
                        {user ? (
                            <button
                                onClick={handleLogout}
                                className={styles.joinButton}
                                disabled={isLoggingOut}
                            >
                                {isLoggingOut ? (
                                    <span className={styles.logoutLoading}>
                                        <Loader2 className={styles.logoutSpinner} size={16} />
                                        Logging Out...
                                    </span>
                                ) : (
                                    'Log Out'
                                )}
                            </button>
                        ) : (
                            <button
                                onClick={() => handleNavClick('/signup')}
                                className={styles.joinButton}
                            >
                                Join Now
                            </button>
                        )}
                    </div>

                    {/* Mobile Notification Bell & Toggle */}
                    <div className={styles.mobileRight}>
                        {user && <NotificationBell mode="user" />}
                        <button
                            className={styles.mobileMenuButton}
                            onClick={() => setIsOpen(!isOpen)}
                            aria-label="Toggle menu"
                        >
                            {isOpen ? <X size={26} /> : <Menu size={26} />}
                        </button>
                    </div>
                </div>

                {/* Mobile Dropdown */}
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.25 }}
                            className={styles.mobileMenu}
                        >
                            <div className={styles.mobileMenuInner}>
                                {menuItems.map((item) => (
                                    <button
                                        key={item.name}
                                        onClick={() => handleNavClick(item.path)}
                                        className={styles.mobileMenuItem}
                                    >
                                        {item.name}
                                    </button>
                                ))}
                                {user && (
                                    <button
                                        onClick={() => handleNavClick('/dashboard')}
                                        className={styles.mobileMenuItem}
                                    >
                                        Dashboard
                                    </button>
                                )}
                                <div className={styles.mobileButtonContainer}>
                                    {user ? (
                                        <button
                                            onClick={handleLogout}
                                            className={styles.mobileJoinButton}
                                            disabled={isLoggingOut}
                                        >
                                            {isLoggingOut ? (
                                                <span className={styles.logoutLoading}>
                                                    <Loader2 className={styles.logoutSpinner} size={16} />
                                                    Logging Out...
                                                </span>
                                            ) : (
                                                'Log Out'
                                            )}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleNavClick('/signup')}
                                            className={styles.mobileJoinButton}
                                        >
                                            Join Now
                                        </button>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </nav>
        </>
    )
}