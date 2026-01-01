// src/components/Dashboard/Dashboard.tsx
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { type User as SupabaseUser } from '@supabase/supabase-js';
import styles from './Dashboard.module.css';
import { Edit3, User, Wifi, WifiOff, Calendar, FileText, CheckCircle, Clock, XCircle, MessageSquare, Download, ArrowRight, TrendingUp, CreditCard, Award, Activity, Bell, Target } from 'lucide-react';
import InvoiceSection from '@/components/Invoices/InvoiceSection';

// ----- Type definitions -----
interface UserProfile {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
}

interface Membership {
    id: number;
    plan_type: string;
    plan_name: string;
    duration_months: number;
    price: number;
    status: string;
    start_date: string | null;
    end_date: string | null;
    created_at: string;
    trainer_assigned?: boolean;
    trainer_id?: string | null;
    trainer_period_end?: string | null;
    trainer_addon?: boolean;
    membership_start_date?: string | null;
    membership_end_date?: string | null;
    trainer_name?: string | null;
}

interface WeeklyChart {
    id: number;
    membership_id: number;
    week_number: number;
    chart_type: string;
    title: string | null;
    content: string | null;
    file_url: string | null;
    created_at: string;
    created_by: string | null; // trainer_id if created by trainer, null if created by admin
    trainers?: {
        id: string;
        name: string;
    } | null;
}

interface MembershipAddon {
    id: number;
    addon_type: string;
    trainer_id: string | null;
    status: string;
    trainers?: {
        id: string;
        name: string;
    };
}

// ----- Component -----
export default function Dashboard() {
    const [user, setUser] = useState<SupabaseUser | null>(null);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [membership, setMembership] = useState<Membership | null>(null);
    const [allMemberships, setAllMemberships] = useState<Membership[]>([]);
    const [weeklyCharts, setWeeklyCharts] = useState<WeeklyChart[]>([]);
    const [addons, setAddons] = useState<MembershipAddon[]>([]);
    const [loading, setLoading] = useState(true);
    const [membershipLoading, setMembershipLoading] = useState(true);
    const [chartsLoading, setChartsLoading] = useState(true);
    const [profileLoading, setProfileLoading] = useState(true);
    const [isOnline, setIsOnline] = useState(true);
    const [membershipHistory, setMembershipHistory] = useState<any>(null);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [addonsExpanded, setAddonsExpanded] = useState(true); // Collapsible state for addons
    const router = useRouter();

    // Define all fetch functions first (before useEffect hooks that use them)
    const fetchMembershipHistory = useCallback(async (membershipId: number) => {
        setLoadingHistory(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                setLoadingHistory(false);
                return;
            }

            const response = await fetch(`/api/memberships/${membershipId}/history`, {
                credentials: 'include',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            });

            if (response.ok) {
                const historyData = await response.json();
                setMembershipHistory(historyData);
                // Update addons from history (includes ALL addons - current + previous from renewals)
                // Sort by created_at descending to show newest first, but keep all addons
                if (historyData.addons && Array.isArray(historyData.addons)) {
                    const sortedAddons = [...historyData.addons].sort((a: any, b: any) =>
                        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                    );
                    setAddons(sortedAddons);
                }
            } else {
                const errorData = await response.json();
                console.error('Error fetching membership history:', errorData);
            }
        } catch (error) {
            console.error('Error fetching membership history:', error);
        } finally {
            setLoadingHistory(false);
        }
    }, []);

    const fetchMembershipAddons = useCallback(async (membershipId: number) => {
        try {
            const { data, error } = await supabase
                .from('membership_addons')
                .select(`
                    *,
                    trainers (
                        id,
                        name
                    )
                `)
                .eq('membership_id', membershipId);

            if (error) {
                console.error('Error fetching addons:', error);
            } else {
                setAddons(data || []);
            }
        } catch (error) {
            console.error('Error fetching addons:', error);
        }
    }, []);

    const fetchAllWeeklyCharts = useCallback(async (membershipIds: number[]) => {
        try {
            setChartsLoading(true);
            console.log('[DASHBOARD] Fetching weekly charts for memberships:', membershipIds);

            if (membershipIds.length === 0) {
                setWeeklyCharts([]);
                setChartsLoading(false);
                return;
            }

            // Fetch charts for ALL active memberships
            const { data: charts, error: chartsError } = await supabase
                .from('weekly_charts')
                .select('*')
                .in('membership_id', membershipIds)
                .order('week_number', { ascending: false })
                .order('created_at', { ascending: false });

            if (chartsError) {
                console.error('[DASHBOARD] Error fetching weekly charts:', chartsError);
                console.error('[DASHBOARD] Error details:', {
                    message: chartsError.message,
                    code: chartsError.code,
                    details: chartsError.details,
                    hint: chartsError.hint
                });
                setWeeklyCharts([]);
                return;
            }

            console.log('[DASHBOARD] Fetched charts for all memberships:', charts?.length || 0, charts);

            // If there are charts with created_by (trainer IDs), fetch trainer names
            if (charts && charts.length > 0) {
                const trainerIds = charts
                    .map(chart => chart.created_by)
                    .filter((id): id is string => id !== null && id !== undefined);

                console.log('[DASHBOARD] Trainer IDs found:', trainerIds);

                if (trainerIds.length > 0) {
                    const { data: trainers, error: trainersError } = await supabase
                        .from('trainers')
                        .select('id, name')
                        .in('id', trainerIds);

                    if (trainersError) {
                        console.error('[DASHBOARD] Error fetching trainers:', trainersError);
                    }

                    console.log('[DASHBOARD] Fetched trainers:', trainers);

                    // Map trainer data to charts
                    const chartsWithTrainers = charts.map(chart => ({
                        ...chart,
                        trainers: chart.created_by
                            ? trainers?.find(t => t.id === chart.created_by) || null
                            : null
                    }));

                    console.log('[DASHBOARD] Setting charts with trainers:', chartsWithTrainers);
                    setWeeklyCharts(chartsWithTrainers);
                } else {
                    console.log('[DASHBOARD] Setting charts without trainers:', charts);
                    setWeeklyCharts(charts);
                }
            } else {
                console.log('[DASHBOARD] No charts found for memberships:', membershipIds);
                setWeeklyCharts([]);
            }
        } catch (error) {
            console.error('[DASHBOARD] Exception fetching weekly charts:', error);
            setWeeklyCharts([]);
        } finally {
            setChartsLoading(false);
        }
    }, []);

    const fetchUserProfile = useCallback(async (userId: string) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, avatar_url')
                .eq('id', userId)
                .single();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            setUserProfile(data);
        } catch (error) {
            console.error('Error fetching user profile:', error);
        } finally {
            setProfileLoading(false);
        }
    }, []);

    const fetchUserMembership = useCallback(async (userId: string) => {
        try {
            setMembershipLoading(true);
            // Get ALL active memberships (not just one)
            const { data: memberships, error } = await supabase
                .from('memberships')
                .select('*')
                .eq('user_id', userId)
                .in('status', ['pending', 'active'])
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching memberships:', error);
            } else if (memberships && memberships.length > 0) {
                console.log('[DASHBOARD] Memberships loaded:', memberships.length, memberships);

                // Fetch trainer names for memberships with trainers
                const membershipsWithTrainers = await Promise.all(
                    memberships.map(async (m: any) => {
                        if (m.trainer_id) {
                            const { data: trainer } = await supabase
                                .from('trainers')
                                .select('name')
                                .eq('id', m.trainer_id)
                                .single();
                            return { ...m, trainer_name: trainer?.name || null };
                        }
                        return m;
                    })
                );

                // Set the most recent one as the primary membership for display
                const primaryMembership = membershipsWithTrainers[0];
                setMembership(primaryMembership);
                setAllMemberships(membershipsWithTrainers);

                // Fetch membership history (this will also set addons from history - includes all addons from renewals)
                if (primaryMembership.id) {
                    fetchMembershipHistory(primaryMembership.id);
                } else {
                    // Fallback: fetch addons directly if no membership ID
                    fetchMembershipAddons(primaryMembership.id);
                }

                // Fetch charts for ALL active memberships
                const activeMemberships = membershipsWithTrainers.filter(m => m.status === 'active');
                if (activeMemberships.length > 0) {
                    console.log('[DASHBOARD] Found', activeMemberships.length, 'active memberships, fetching charts for all...');
                    fetchAllWeeklyCharts(activeMemberships.map(m => m.id));
                } else {
                    console.log('[DASHBOARD] No active memberships found');
                    setWeeklyCharts([]);
                }
            } else {
                setMembership(null);
                setAllMemberships([]);
                setWeeklyCharts([]);
            }
        } catch (error) {
            console.error('Error fetching user membership:', error);
        } finally {
            setMembershipLoading(false);
        }
    }, [fetchMembershipHistory, fetchMembershipAddons, fetchAllWeeklyCharts]);

    useEffect(() => {
        const fetchUser = async () => {
            const { data: { session }, error } = await supabase.auth.getSession();

            if (error) {
                console.error('Error fetching session:', error.message);
                router.push('/signup');
                return;
            }

            if (!session?.user) {
                router.push('/signup');
            } else {
                setUser(session.user);
                setLoading(false);
                fetchUserMembership(session.user.id);
                fetchUserProfile(session.user.id);
            }
        };

        fetchUser();
    }, [router, fetchUserMembership, fetchUserProfile]);

    // Real-time subscription for memberships
    useEffect(() => {
        if (!user) return;

        const channel = supabase
            .channel('dashboard-memberships')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'memberships',
                    filter: `user_id=eq.${user.id}`
                },
                () => {
                    console.log('Dashboard: Membership changed, refreshing...');
                    fetchUserMembership(user.id);
                }
            )
            .subscribe((status) => {
                console.log('Dashboard subscription status:', status);
                setIsOnline(status === 'SUBSCRIBED');
            });

        return () => {
            channel.unsubscribe();
        };
    }, [user, fetchUserMembership]);

    // Real-time subscription for weekly charts (for all active memberships)
    useEffect(() => {
        const activeMemberships = allMemberships.filter(m => m.status === 'active');
        if (activeMemberships.length === 0) return;

        const membershipIds = activeMemberships.map(m => m.id);
        console.log('[DASHBOARD] Setting up realtime subscriptions for memberships:', membershipIds);

        // Create a channel for each active membership
        const channels = membershipIds.map(membershipId => {
            return supabase
                .channel(`dashboard-weekly-charts-${membershipId}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'weekly_charts',
                        filter: `membership_id=eq.${membershipId}`
                    },
                    () => {
                        console.log('[DASHBOARD] Weekly chart changed for membership', membershipId, ', refreshing...');
                        fetchAllWeeklyCharts(membershipIds);
                    }
                )
                .subscribe();
        });

        return () => {
            channels.forEach(channel => channel.unsubscribe());
        };
    }, [allMemberships, fetchAllWeeklyCharts]);

    // Real-time subscription for user profile
    useEffect(() => {
        if (!user) return;

        const channel = supabase
            .channel('dashboard-profile')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'profiles',
                    filter: `id=eq.${user.id}`
                },
                () => {
                    console.log('Dashboard: Profile changed, refreshing...');
                    fetchUserProfile(user.id);
                }
            )
            .subscribe();

        return () => {
            channel.unsubscribe();
        };
    }, [user, fetchUserProfile]);

    // Real-time subscription for membership addons
    useEffect(() => {
        if (!membership?.id) return;

        const channel = supabase
            .channel('dashboard-addons')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'membership_addons',
                    filter: `membership_id=eq.${membership.id}`
                },
                () => {
                    console.log('Dashboard: Addon changed, refreshing...');
                    fetchMembershipHistory(membership.id);
                }
            )
            .subscribe();

        return () => {
            channel.unsubscribe();
        };
    }, [membership?.id, fetchMembershipHistory]);

    const formatDate = (dateString: string | null) => {
        if (!dateString) return 'Not set';
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    // Calculate the current week number based on membership start date
    const calculateCurrentWeek = (startDate: string | null): number | null => {
        if (!startDate) return null;
        const start = new Date(startDate);
        const now = new Date();

        // If start date is in the future, membership hasn't started yet
        if (start.getTime() > now.getTime()) {
            return null;
        }

        const diffTime = now.getTime() - start.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const weekNumber = Math.floor(diffDays / 7) + 1;

        // Ensure week number is at least 1
        return Math.max(1, weekNumber);
    };

    // Check if a chart exists for a specific week and type for a specific membership
    // This function properly handles type conversion and ensures accurate matching
    const hasChartForWeek = useCallback((weekNumber: number, chartType: string, membershipId: number): boolean => {
        // Ensure charts are loaded
        if (!weeklyCharts || weeklyCharts.length === 0) {
            console.log(`[CHART CHECK] No charts loaded for membership ${membershipId}, week ${weekNumber}, type ${chartType}`);
            return false;
        }

        // Convert membershipId to number for comparison (handle both string and number)
        const membershipIdNum = Number(membershipId);

        // Direct check - find exact match
        const foundChart = weeklyCharts.find(chart => {
            const chartMembershipId = Number(chart.membership_id);
            const weekMatch = Number(chart.week_number) === Number(weekNumber);
            const typeMatch = chart.chart_type === chartType;
            const membershipMatch = chartMembershipId === membershipIdNum;

            return membershipMatch && weekMatch && typeMatch;
        });

        if (foundChart) {
            console.log(`[CHART CHECK] ✓ FOUND ${chartType} chart for membership ${membershipIdNum}, week ${weekNumber}`, {
                chartId: foundChart.id,
                chartMembershipId: foundChart.membership_id,
                chartWeek: foundChart.week_number,
                chartType: foundChart.chart_type
            });
            return true;
        }

        console.log(`[CHART CHECK] ✗ NOT FOUND ${chartType} chart for membership ${membershipIdNum}, week ${weekNumber}`, {
            totalCharts: weeklyCharts.length,
            chartsForMembership: weeklyCharts.filter(c => Number(c.membership_id) === membershipIdNum).map(c => ({
                id: c.id,
                membership_id: c.membership_id,
                week: c.week_number,
                type: c.chart_type
            }))
        });
        return false;
    }, [weeklyCharts]);

    // Get the current week number that needs a chart (if missing)
    // Only shows reminder if we're actually in that week and chart is missing
    const getNextWeekNeedingChart = useCallback((membership: Membership): { week: number; types: string[] } | null => {
        // Don't check if charts are still loading
        if (chartsLoading) {
            return null;
        }

        if (!membership.start_date || membership.status !== 'active') {
            return null;
        }

        const currentWeek = calculateCurrentWeek(membership.start_date);

        // If membership hasn't started yet, don't show reminder
        if (currentWeek === null) {
            return null;
        }

        // Get all charts for this specific membership
        const membershipIdNum = Number(membership.id);
        const membershipCharts = weeklyCharts.filter(c => Number(c.membership_id) === membershipIdNum);

        // Get charts for current week
        const chartsForCurrentWeek = membershipCharts.filter(c => Number(c.week_number) === currentWeek);

        // Check if current week's charts are missing
        const missingTypes: string[] = [];

        const hasWorkout = chartsForCurrentWeek.some(c => c.chart_type === 'workout');
        const hasDiet = chartsForCurrentWeek.some(c => c.chart_type === 'diet');

        // Basic plan only includes workout, not diet
        const isBasicPlan = membership.plan_name.toLowerCase() === 'basic';

        // Always check for workout chart
        if (!hasWorkout) {
            missingTypes.push('workout');
        }

        // Only check for diet chart if it's NOT a basic plan (premium/elite include diet)
        if (!isBasicPlan && !hasDiet) {
            missingTypes.push('diet');
        }

        // Show reminder if at least one required chart type is missing for current week
        if (missingTypes.length > 0) {
            console.log(`[MISSING CHART CHECK] ⚠️ REMINDER: Membership ${membership.id} (${membership.plan_name}), Week ${currentWeek}, Missing: ${missingTypes.join(', ')}`, {
                hasWorkout,
                hasDiet,
                isBasicPlan,
                chartsForCurrentWeek: chartsForCurrentWeek.map(c => ({ week: c.week_number, type: c.chart_type, id: c.id })),
                allMembershipCharts: membershipCharts.map(c => ({ week: c.week_number, type: c.chart_type, id: c.id }))
            });
            return { week: currentWeek, types: missingTypes };
        }

        console.log(`[MISSING CHART CHECK] ✓ NO REMINDER: Membership ${membership.id} (${membership.plan_name}), Week ${currentWeek} - All required charts present`, {
            hasWorkout,
            hasDiet,
            isBasicPlan,
            chartsForCurrentWeek: chartsForCurrentWeek.map(c => ({ week: c.week_number, type: c.chart_type, id: c.id }))
        });
        return null;
    }, [weeklyCharts, chartsLoading]);

    // Check if membership is expiring soon or expired
    const getMembershipExpirationStatus = (membership: Membership): {
        isExpiringSoon: boolean;
        isExpired: boolean;
        daysRemaining: number | null
    } => {
        const endDateStr = membership.membership_end_date || membership.end_date;
        if (!endDateStr) {
            return { isExpiringSoon: false, isExpired: false, daysRemaining: null };
        }

        const endDate = new Date(endDateStr);
        const now = new Date();
        const diffTime = endDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return { isExpiringSoon: false, isExpired: true, daysRemaining: Math.abs(diffDays) };
        } else if (diffDays <= 4) {
            return { isExpiringSoon: true, isExpired: false, daysRemaining: diffDays };
        }

        return { isExpiringSoon: false, isExpired: false, daysRemaining: diffDays };
    };

    // Check if trainer period is expiring soon or expired
    const getTrainerPeriodExpirationStatus = (membership: Membership): {
        isExpiringSoon: boolean;
        isExpired: boolean;
        daysRemaining: number | null
    } => {
        if (!membership.trainer_period_end || !membership.trainer_assigned) {
            return { isExpiringSoon: false, isExpired: false, daysRemaining: null };
        }

        const endDate = new Date(membership.trainer_period_end);
        const now = new Date();
        const diffTime = endDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return { isExpiringSoon: false, isExpired: true, daysRemaining: Math.abs(diffDays) };
        } else if (diffDays <= 4) {
            return { isExpiringSoon: true, isExpired: false, daysRemaining: diffDays };
        }

        return { isExpiringSoon: false, isExpired: false, daysRemaining: diffDays };
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active':
                return { icon: CheckCircle, text: 'Active', className: styles.statusActive };
            case 'approved':
                return { icon: CheckCircle, text: 'Approved', className: styles.statusApproved };
            case 'pending':
                return { icon: Clock, text: 'Pending Approval', className: styles.statusPending };
            case 'rejected':
                return { icon: XCircle, text: 'Rejected', className: styles.statusRejected };
            default:
                return { icon: Clock, text: status, className: styles.statusPending };
        }
    };

    // Calculate dashboard stats
    const dashboardStats = useMemo(() => {
        const activeMemberships = allMemberships.filter(m => m.status === 'active');
        const expirationStatus = membership ? getMembershipExpirationStatus(membership) : null;
        const trainerExpiration = membership && membership.trainer_assigned ? getTrainerPeriodExpirationStatus(membership) : null;
        const totalPaid = membershipHistory?.financialSummary?.totalPaid || 0;
        const pendingAmount = membershipHistory?.financialSummary?.pendingAmount || 0;
        const workoutCharts = weeklyCharts.filter(c => c.chart_type === 'workout').length;
        const dietCharts = weeklyCharts.filter(c => c.chart_type === 'diet').length;

        return {
            activeMemberships: activeMemberships.length,
            totalCharts: weeklyCharts.length,
            workoutCharts,
            dietCharts,
            hasTrainer: membership?.trainer_assigned || false,
            daysRemaining: expirationStatus?.daysRemaining,
            trainerDaysRemaining: trainerExpiration?.daysRemaining,
            totalPaid,
            pendingAmount
        };
    }, [allMemberships, weeklyCharts, membership, membershipHistory]);

    if (loading) {
        return (
            <div className={styles.dashboardContainer}>
                <h1 className={styles.loading}>Loading...</h1>
            </div>
        );
    }

    const statusBadge = membership ? getStatusBadge(membership.status) : null;
    const StatusIcon = statusBadge?.icon || Clock;

    return (
        <div className={styles.dashboardContainer}>
            {/* Profile Header Section */}
            <div className={styles.profileHeader}>
                <div className={styles.profileInfo}>
                    <div className={styles.avatarContainer}>
                        {userProfile?.avatar_url ? (
                            <img
                                src={userProfile.avatar_url}
                                alt="Profile"
                                className={styles.avatar}
                            />
                        ) : (
                            <div className={styles.avatarPlaceholder}>
                                <User size={32} />
                            </div>
                        )}
                    </div>
                    <div className={styles.profileText}>
                        <h1 className={styles.welcomeTitle}>
                            Welcome back, <span className={styles.gradientText}>
                                {userProfile?.full_name || user?.email?.split('@')[0] || 'Member'}
                            </span>
                        </h1>
                        <p className={styles.welcomeSubtitle}>
                            This is your personal member dashboard. Manage your membership and track your progress.
                            {isOnline && <span className={styles.liveBadge}> • Live Updates</span>}
                        </p>
                    </div>
                </div>
                <a href="/profile" className={styles.editProfileButton}>
                    <Edit3 size={18} />
                    Edit Profile
                </a>
            </div>

            {/* Overview Stats Cards */}
            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <div className={styles.statIcon} style={{ background: 'rgba(249, 115, 22, 0.1)', color: '#f97316' }}>
                        <Award size={24} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{membership ? membership.plan_name.charAt(0).toUpperCase() + membership.plan_name.slice(1) : 'None'}</div>
                        <div className={styles.statLabel}>Current Plan</div>
                    </div>
                </div>

                <div className={styles.statCard}>
                    <div className={styles.statIcon} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                        <Activity size={24} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{dashboardStats.totalCharts}</div>
                        <div className={styles.statLabel}>Total Charts</div>
                    </div>
                </div>

                <div className={styles.statCard}>
                    <div className={styles.statIcon} style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                        <Target size={24} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{dashboardStats.workoutCharts}</div>
                        <div className={styles.statLabel}>Workout Plans</div>
                    </div>
                </div>

                <div className={styles.statCard}>
                    <div className={styles.statIcon} style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7' }}>
                        <CreditCard size={24} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>₹{dashboardStats.totalPaid.toLocaleString()}</div>
                        <div className={styles.statLabel}>Total Paid</div>
                    </div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className={styles.mainGrid}>
                {/* Membership Card */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <div className={styles.cardTitle}>
                            <Award size={20} />
                            <h3>My Membership</h3>
                        </div>
                        {membership && (
                            <a href="/membership/my-plans" className={styles.cardAction}>
                                View All <ArrowRight size={16} />
                            </a>
                        )}
                    </div>

                    {membershipLoading ? (
                        <div className={styles.cardContent}>
                            <p>Loading membership...</p>
                        </div>
                    ) : !membership ? (
                        <div className={styles.cardContent}>
                            <div className={styles.emptyState}>
                                <p>You don't have an active membership yet.</p>
                                <a href="/membership" className={styles.primaryButton}>
                                    Choose a Plan
                                </a>
                            </div>
                        </div>
                    ) : (
                        <div className={styles.cardContent}>
                            {/* Expiration Warnings */}
                            {(() => {
                                const expirationStatus = getMembershipExpirationStatus(membership);
                                if (expirationStatus.isExpired) {
                                    return (
                                        <div className={styles.alertCard} style={{ background: '#fee2e2', borderColor: '#dc2626' }}>
                                            <XCircle size={20} style={{ color: '#dc2626' }} />
                                            <div>
                                                <div className={styles.alertTitle} style={{ color: '#dc2626' }}>Membership Expired</div>
                                                <div className={styles.alertText}>
                                                    Your membership expired {expirationStatus.daysRemaining} day{expirationStatus.daysRemaining !== 1 ? 's' : ''} ago. <a href="/contact">Contact us</a> to renew.
                                                </div>
                                            </div>
                                        </div>
                                    );
                                } else if (expirationStatus.isExpiringSoon) {
                                    return (
                                        <div className={styles.alertCard} style={{ background: '#fef3c7', borderColor: '#f59e0b' }}>
                                            <Clock size={20} style={{ color: '#f59e0b' }} />
                                            <div>
                                                <div className={styles.alertTitle} style={{ color: '#f59e0b' }}>Expiring Soon</div>
                                                <div className={styles.alertText}>
                                                    Your membership expires in {expirationStatus.daysRemaining} day{expirationStatus.daysRemaining !== 1 ? 's' : ''}.
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            })()}

                            {membership.trainer_assigned && (() => {
                                const trainerExpiration = getTrainerPeriodExpirationStatus(membership);
                                if (trainerExpiration.isExpired) {
                                    return (
                                        <div className={styles.alertCard} style={{ background: '#fee2e2', borderColor: '#dc2626' }}>
                                            <XCircle size={20} style={{ color: '#dc2626' }} />
                                            <div>
                                                <div className={styles.alertTitle} style={{ color: '#dc2626' }}>Trainer Access Expired</div>
                                                <div className={styles.alertText}>
                                                    Your trainer access has expired. <a href="/contact">Contact us</a> to renew.
                                                </div>
                                            </div>
                                        </div>
                                    );
                                } else if (trainerExpiration.isExpiringSoon) {
                                    return (
                                        <div className={styles.alertCard} style={{ background: '#fef3c7', borderColor: '#f59e0b' }}>
                                            <Clock size={20} style={{ color: '#f59e0b' }} />
                                            <div>
                                                <div className={styles.alertTitle} style={{ color: '#f59e0b' }}>Trainer Access Expiring</div>
                                                <div className={styles.alertText}>
                                                    Trainer access expires in {trainerExpiration.daysRemaining} day{trainerExpiration.daysRemaining !== 1 ? 's' : ''}.
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            })()}

                            {/* Membership Details */}
                            <div className={styles.infoGrid}>
                                <div className={styles.infoItem}>
                                    <span className={styles.infoLabel}>Plan</span>
                                    <span className={styles.infoValue}>{membership.plan_name.charAt(0).toUpperCase() + membership.plan_name.slice(1)}</span>
                                </div>
                                <div className={styles.infoItem}>
                                    <span className={styles.infoLabel}>Status</span>
                                    <span className={`${styles.statusBadge} ${statusBadge?.className || ''}`}>
                                        <StatusIcon size={14} />
                                        {statusBadge?.text}
                                    </span>
                                </div>
                                <div className={styles.infoItem}>
                                    <span className={styles.infoLabel}>Duration</span>
                                    <span className={styles.infoValue}>{membership.duration_months} Months</span>
                                </div>
                                <div className={styles.infoItem}>
                                    <span className={styles.infoLabel}>Price</span>
                                    <span className={styles.infoValue}>₹{membership.price.toLocaleString()}</span>
                                </div>
                                {membership.membership_start_date && (
                                    <div className={styles.infoItem}>
                                        <span className={styles.infoLabel}>Start Date</span>
                                        <span className={styles.infoValue}>{formatDate(membership.membership_start_date)}</span>
                                    </div>
                                )}
                                {membership.membership_end_date && (
                                    <div className={styles.infoItem}>
                                        <span className={styles.infoLabel}>End Date</span>
                                        <span className={styles.infoValue}>
                                            {formatDate(membership.membership_end_date)}
                                            {(() => {
                                                const expirationStatus = getMembershipExpirationStatus(membership);
                                                if (expirationStatus.daysRemaining !== null) {
                                                    return <span className={styles.daysRemaining} style={{ color: expirationStatus.isExpired ? '#dc2626' : expirationStatus.isExpiringSoon ? '#f59e0b' : '#6b7280' }}>
                                                        ({expirationStatus.daysRemaining} days {expirationStatus.isExpired ? 'ago' : 'remaining'})
                                                    </span>;
                                                }
                                                return null;
                                            })()}
                                        </span>
                                    </div>
                                )}
                                {membership.trainer_assigned && membership.trainer_id && (
                                    <>
                                        <div className={styles.infoItem}>
                                            <span className={styles.infoLabel}>Trainer</span>
                                            <span className={styles.infoValue}>
                                                {membership.trainer_name || 'N/A'}
                                                <a href={`/messages/trainer/${membership.trainer_id}`} className={styles.messageLink}>
                                                    <MessageSquare size={14} />
                                                    Message
                                                </a>
                                            </span>
                                        </div>
                                        {membership.trainer_period_end && (
                                            <div className={styles.infoItem}>
                                                <span className={styles.infoLabel}>Trainer Access Until</span>
                                                <span className={styles.infoValue}>
                                                    {formatDate(membership.trainer_period_end)}
                                                    {(() => {
                                                        const trainerExpiration = getTrainerPeriodExpirationStatus(membership);
                                                        if (trainerExpiration.daysRemaining !== null) {
                                                            return <span className={styles.daysRemaining} style={{ color: trainerExpiration.isExpired ? '#dc2626' : trainerExpiration.isExpiringSoon ? '#f59e0b' : '#6b7280' }}>
                                                                ({trainerExpiration.daysRemaining} days {trainerExpiration.isExpired ? 'ago' : 'remaining'})
                                                            </span>;
                                                        }
                                                        return null;
                                                    })()}
                                                </span>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Payment Summary */}
                            {membershipHistory?.financialSummary && (
                                <div className={styles.paymentSummary}>
                                    <div className={styles.paymentItem}>
                                        <span>Total Paid</span>
                                        <span className={styles.paymentAmount}>₹{membershipHistory.financialSummary.totalPaid.toLocaleString()}</span>
                                    </div>
                                    <div className={styles.paymentItem}>
                                        <span>Pending</span>
                                        <span className={styles.paymentPending}>₹{membershipHistory.financialSummary.pendingAmount.toLocaleString()}</span>
                                    </div>
                                </div>
                            )}

                            {/* Invoice Section */}
                            {membership && membership.status === 'active' && (
                                <div className={styles.invoiceWrapper}>
                                    <InvoiceSection membershipId={membership.id} />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Weekly Charts Card */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <div className={styles.cardTitle}>
                            <FileText size={20} />
                            <h3>Weekly Charts</h3>
                        </div>
                        {weeklyCharts.length > 0 && (
                            <span className={styles.badge}>{weeklyCharts.length} Available</span>
                        )}
                    </div>

                    <div className={styles.cardContent}>
                        {allMemberships.filter(m => m.status === 'active').length === 0 ? (
                            <div className={styles.emptyState}>
                                <p>Weekly charts will appear here once your membership is activated.</p>
                            </div>
                        ) : chartsLoading ? (
                            <p>Loading charts...</p>
                        ) : (
                            <>
                                {/* Missing Chart Reminders */}
                                {allMemberships.filter(m => m.status === 'active').map((membership) => {
                                    const nextWeekInfo = getNextWeekNeedingChart(membership);
                                    if (!nextWeekInfo) return null;
                                    return (
                                        <div key={membership.id} className={styles.alertCard} style={{ background: '#eff6ff', borderColor: '#3b82f6', marginBottom: '1rem' }}>
                                            <Bell size={20} style={{ color: '#3b82f6' }} />
                                            <div>
                                                <div className={styles.alertTitle} style={{ color: '#3b82f6' }}>
                                                    Week {nextWeekInfo.week} Chart Missing
                                                </div>
                                                <div className={styles.alertText}>
                                                    {nextWeekInfo.types.length === 1 ? (
                                                        <>Your <strong>{nextWeekInfo.types[0] === 'workout' ? 'Workout' : 'Diet'}</strong> chart is missing. <a href="/contact">Contact admin</a>.</>
                                                    ) : (
                                                        <>Your <strong>Workout and Diet</strong> charts are missing. <a href="/contact">Contact admin</a>.</>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}

                                {weeklyCharts.length === 0 ? (
                                    <div className={styles.emptyState}>
                                        <p>No weekly charts available yet.</p>
                                        <p className={styles.emptySubtext}>Charts will be uploaded by admin or your trainer.</p>
                                    </div>
                                ) : (
                                    <div className={styles.chartsList}>
                                        {weeklyCharts.slice(0, 10).map((chart) => {
                                            const chartMembership = allMemberships.find(m => m.id === chart.membership_id);
                                            return (
                                                <div key={chart.id} className={styles.chartCard}>
                                                    <div className={styles.chartHeader}>
                                                        <span className={styles.chartWeek}>Week {chart.week_number}</span>
                                                        <span className={styles.chartType}>
                                                            {chart.chart_type === 'workout' ? 'Workout' : 'Diet'}
                                                        </span>
                                                        {chartMembership && (
                                                            <span className={styles.planBadge}>
                                                                {chartMembership.plan_name.charAt(0).toUpperCase() + chartMembership.plan_name.slice(1)}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {chart.title && (
                                                        <p className={styles.chartTitle}>{chart.title}</p>
                                                    )}
                                                    <div className={styles.chartMeta}>
                                                        <span><Calendar size={12} /> {formatDate(chart.created_at)}</span>
                                                        <span>By: {chart.created_by && chart.trainers ? (Array.isArray(chart.trainers) ? chart.trainers[0]?.name : chart.trainers.name) : 'Admin'}</span>
                                                    </div>
                                                    {chart.file_url && (
                                                        <a
                                                            href={chart.file_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className={styles.downloadBtn}
                                                        >
                                                            <Download size={14} />
                                                            Download
                                                        </a>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
