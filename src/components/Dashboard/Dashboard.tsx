// src/components/Dashboard/Dashboard.tsx
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { type User as SupabaseUser } from '@supabase/supabase-js';
import styles from './Dashboard.module.css';
import { Edit3, User, Wifi, WifiOff, Calendar, FileText, CheckCircle, Clock, XCircle, MessageSquare, Download, ArrowRight, TrendingUp, CreditCard, Award, Activity, Bell, Target, Eye, X, ChevronRight, Receipt } from 'lucide-react';
import { getMembershipExpirationStatus as getMembershipExpirationStatusUtil, getTrainerPeriodExpirationStatus as getTrainerPeriodExpirationStatusUtil } from '@/lib/membershipUtils';
import { isInGracePeriod, getGracePeriodDaysRemaining } from '@/lib/gracePeriod';
import { isTrainerInGracePeriod, getTrainerGracePeriodDaysRemaining } from '@/lib/trainerGracePeriod';
import { checkTrainerMessagingAccess } from '@/lib/trainerMessagingAccess';

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
    grace_period_end?: string | null;
    trainer_grace_period_end?: string | null;
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
    const [invoices, setInvoices] = useState<any[]>([]);
    const [loadingInvoices, setLoadingInvoices] = useState(false);
    const [addonsExpanded, setAddonsExpanded] = useState(true); // Collapsible state for addons
    const [selectedChart, setSelectedChart] = useState<WeeklyChart | null>(null);
    const [showChartModal, setShowChartModal] = useState(false);
    const [showAllChartsModal, setShowAllChartsModal] = useState(false);
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

    const fetchInvoices = useCallback(async (membershipId: number) => {
        setLoadingInvoices(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                setLoadingInvoices(false);
                return;
            }

            const response = await fetch(`/api/memberships/${membershipId}/invoices`, {
                credentials: 'include',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setInvoices(data.invoices || []);
            } else {
                console.error('Error fetching invoices:', await response.json());
            }
        } catch (error) {
            console.error('Error fetching invoices:', error);
        } finally {
            setLoadingInvoices(false);
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
            // Get ALL active memberships (not just one) - include grace_period for renewals
            const { data: memberships, error } = await supabase
                .from('memberships')
                .select('*')
                .eq('user_id', userId)
                .in('status', ['pending', 'active', 'grace_period'])
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
                            const withTrainer = { ...m, trainer_name: trainer?.name || null };

                            // UI-repair for old Regular Plan trainer periods:
                            // Previously, "Regular Monthly" wasn't handled in `calculateTrainerPeriod`,
                            // which could set `trainer_period_end` ~= start date (0 days).
                            // For Regular plans, trainer addon validity should match membership validity (duration_months).
                            try {
                                const planLower = String(withTrainer.plan_name || '').toLowerCase();
                                const isRegularLike = planLower.includes('regular');
                                const hasAddon = Boolean(withTrainer.trainer_addon);
                                const start = withTrainer.membership_start_date || withTrainer.start_date;
                                if (isRegularLike && hasAddon && start && withTrainer.trainer_period_end) {
                                    const startDate = new Date(start);
                                    const endDate = new Date(withTrainer.trainer_period_end);
                                    const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
                                    if (diffDays <= 1) {
                                        const membershipEnd = withTrainer.membership_end_date || withTrainer.end_date;
                                        if (membershipEnd) {
                                            withTrainer.trainer_period_end = new Date(membershipEnd).toISOString();
                                        } else if (typeof withTrainer.duration_months === 'number' && withTrainer.duration_months > 0) {
                                            const fixedEnd = new Date(startDate);
                                            fixedEnd.setMonth(fixedEnd.getMonth() + withTrainer.duration_months);
                                            withTrainer.trainer_period_end = fixedEnd.toISOString();
                                        }
                                    }
                                }
                            } catch {
                                // ignore repair errors; keep original values
                            }

                            return withTrainer;
                        }
                        // Also repair memberships without trainer_name fetch (same issue)
                        try {
                            const planLower = String(m.plan_name || '').toLowerCase();
                            const isRegularLike = planLower.includes('regular');
                            const hasAddon = Boolean(m.trainer_addon);
                            const start = m.membership_start_date || m.start_date;
                            if (isRegularLike && hasAddon && start && m.trainer_period_end) {
                                const startDate = new Date(start);
                                const endDate = new Date(m.trainer_period_end);
                                const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
                                if (diffDays <= 1) {
                                    const membershipEnd = m.membership_end_date || m.end_date;
                                    if (membershipEnd) {
                                        return { ...m, trainer_period_end: new Date(membershipEnd).toISOString() };
                                    }
                                    if (typeof m.duration_months === 'number' && m.duration_months > 0) {
                                        const fixedEnd = new Date(startDate);
                                        fixedEnd.setMonth(fixedEnd.getMonth() + m.duration_months);
                                        return { ...m, trainer_period_end: fixedEnd.toISOString() };
                                    }
                                }
                            }
                        } catch {
                            // ignore
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
                    fetchInvoices(primaryMembership.id);
                } else {
                    // Fallback: fetch addons directly if no membership ID
                    fetchMembershipAddons(primaryMembership.id);
                }

                // Fetch charts for ALL active memberships
                const activeMemberships = membershipsWithTrainers.filter(m => m.status === 'active');
                // Charts eligibility:
                // - Regular plans: ONLY if they have trainer addon
                // - Other plans: Always eligible
                // IMPORTANT: Online plans can still have in-gym addon (plan_type/plan_mode may become in_gym),
                // but they still need workout charts. So eligibility is plan-name based.
                const chartEligibleMemberships = activeMemberships.filter((m: any) => {
                    const planLower = String(m.plan_name || '').toLowerCase();
                    const isRegularPlan = planLower.includes('regular');

                    // Regular plans: only eligible if they have trainer addon
                    if (isRegularPlan) {
                        const hasTrainerAddon = Boolean(m.trainer_addon || m.trainer_id || m.trainer_assigned);
                        return hasTrainerAddon;
                    }

                    // Other plans: always eligible
                    return true;
                });

                if (chartEligibleMemberships.length > 0) {
                    console.log('[DASHBOARD] Found', chartEligibleMemberships.length, 'chart-eligible active memberships, fetching charts...');
                    fetchAllWeeklyCharts(chartEligibleMemberships.map(m => m.id));
                } else {
                    console.log('[DASHBOARD] No chart-eligible memberships found (Regular plans need trainer addon for charts)');
                    setWeeklyCharts([]);
                    setChartsLoading(false);
                }
            } else {
                setMembership(null);
                setAllMemberships([]);
                setWeeklyCharts([]);
                setChartsLoading(false);
            }
        } catch (error) {
            console.error('Error fetching user membership:', error);
        } finally {
            setMembershipLoading(false);
        }
    }, [fetchMembershipHistory, fetchMembershipAddons, fetchAllWeeklyCharts, fetchInvoices]);

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
        // Only subscribe for chart-eligible memberships (Regular plans need trainer addon for charts)
        const chartEligibleMemberships = activeMemberships.filter((m: any) => {
            const planLower = String(m.plan_name || '').toLowerCase();
            const isRegularPlan = planLower.includes('regular');

            // Regular plans: only eligible if they have trainer addon
            if (isRegularPlan) {
                const hasTrainerAddon = Boolean(m.trainer_addon || m.trainer_id || m.trainer_assigned);
                return hasTrainerAddon;
            }

            // Other plans: always eligible
            return true;
        });
        if (chartEligibleMemberships.length === 0) return;

        const membershipIds = chartEligibleMemberships.map(m => m.id);
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

    // Calculate grace period data for membership
    const membershipGracePeriodData = useMemo(() => {
        if (!membership) return { isInGracePeriod: false, daysRemaining: null };

        const gracePeriodEnd = membership.grace_period_end ?? null;
        const endDate = membership.end_date || membership.membership_end_date || null;
        const now = new Date();

        // Grace period should only show if:
        // 1. Status is 'grace_period'
        // 2. grace_period_end exists and is in the future
        // 3. Membership end_date has actually passed (expired)
        const hasExpired = endDate ? new Date(endDate) <= now : false;
        const isInMembershipGracePeriod = membership.status === 'grace_period' &&
            gracePeriodEnd &&
            new Date(gracePeriodEnd) >= now &&
            hasExpired;

        // Calculate grace period days remaining - same logic as renew page
        const gracePeriodDaysRemaining = isInMembershipGracePeriod && gracePeriodEnd
            ? getGracePeriodDaysRemaining(gracePeriodEnd, now)
            : null;

        return {
            isInGracePeriod: isInMembershipGracePeriod,
            daysRemaining: gracePeriodDaysRemaining
        };
    }, [membership]);

    // Check if membership is expiring soon or expired
    const getMembershipExpirationStatus = (membership: Membership) => {
        const endDateStr = membership.membership_end_date || membership.end_date;
        const now = new Date();
        return getMembershipExpirationStatusUtil(endDateStr, now);
    };

    // Check if trainer period is expiring soon or expired
    const getTrainerPeriodExpirationStatus = (membership: Membership) => {
        if (!membership.trainer_assigned) {
            return { isExpiringSoon: false, isExpired: false, daysRemaining: null };
        }
        const now = new Date();
        return getTrainerPeriodExpirationStatusUtil(membership.trainer_period_end, now);
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

    // Group charts by membership and organize by current/previous plans
    const organizedCharts = useMemo(() => {
        const activeMemberships = allMemberships.filter(m => m.status === 'active');
        const previousMemberships = allMemberships.filter(m => m.status !== 'active');

        // Group charts by membership_id
        const chartsByMembership = new Map<number, WeeklyChart[]>();
        weeklyCharts.forEach(chart => {
            const membershipId = Number(chart.membership_id);
            if (!chartsByMembership.has(membershipId)) {
                chartsByMembership.set(membershipId, []);
            }
            chartsByMembership.get(membershipId)!.push(chart);
        });

        // Current plan charts (only current week for active memberships)
        const currentPlanCharts: { membership: Membership; currentWeekCharts: WeeklyChart[]; allCharts: WeeklyChart[] }[] = [];

        activeMemberships.forEach(membership => {
            const membershipId = Number(membership.id);
            const membershipCharts = chartsByMembership.get(membershipId) || [];

            if (membershipCharts.length > 0) {
                const startDate = membership.membership_start_date || membership.start_date;
                const currentWeek = calculateCurrentWeek(startDate);

                // Get current week charts
                const currentWeekCharts = currentWeek
                    ? membershipCharts.filter(chart => chart.week_number === currentWeek)
                    : [];

                // Sort all charts by week (descending - newest first)
                const sortedCharts = [...membershipCharts].sort((a, b) => b.week_number - a.week_number);

                currentPlanCharts.push({
                    membership,
                    currentWeekCharts,
                    allCharts: sortedCharts
                });
            }
        });

        // Previous plan charts (all charts from inactive memberships)
        const previousPlanCharts: { membership: Membership; charts: WeeklyChart[] }[] = [];

        previousMemberships.forEach(membership => {
            const membershipId = Number(membership.id);
            const membershipCharts = chartsByMembership.get(membershipId) || [];

            if (membershipCharts.length > 0) {
                // Sort charts by week (descending - newest first)
                const sortedCharts = [...membershipCharts].sort((a, b) => b.week_number - a.week_number);
                previousPlanCharts.push({
                    membership,
                    charts: sortedCharts
                });
            }
        });

        return {
            currentPlanCharts,
            previousPlanCharts
        };
    }, [allMemberships, weeklyCharts]);

    if (loading) {
        return (
            <div className={styles.dashboardContainer}>
                <h1 className={styles.loading}>Loading...</h1>
            </div>
        );
    }

    const statusBadge = membership ? getStatusBadge(membership.status) : null;
    const StatusIcon = statusBadge?.icon || Clock;

    // Charts eligibility: Regular plans need trainer addon, other plans always eligible
    const hasActiveMembership = allMemberships.some(m => m.status === 'active');
    const hasChartEligibleActiveMembership = allMemberships
        .filter(m => m.status === 'active')
        .some((m: any) => {
            const planLower = String(m.plan_name || '').toLowerCase();
            const isRegularPlan = planLower.includes('regular');

            // Regular plans: only eligible if they have trainer addon
            if (isRegularPlan) {
                const hasTrainerAddon = Boolean(m.trainer_addon || m.trainer_id || m.trainer_assigned);
                return hasTrainerAddon;
            }

            // Other plans: always eligible
            return true;
        });

    return (
        <>
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
                            <div className={styles.statValue}>
                                {hasChartEligibleActiveMembership ? dashboardStats.totalCharts : 'N/A'}
                            </div>
                            <div className={styles.statLabel}>
                                {hasChartEligibleActiveMembership ? 'Total Charts' : 'Charts'}
                            </div>
                        </div>
                    </div>

                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                            <Target size={24} />
                        </div>
                        <div className={styles.statContent}>
                            <div className={styles.statValue}>
                                {hasChartEligibleActiveMembership ? dashboardStats.workoutCharts : 'N/A'}
                            </div>
                            <div className={styles.statLabel}>
                                {hasChartEligibleActiveMembership ? 'Workout Plans' : 'Workout Plans (Not for Regular)'}
                            </div>
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
                                    // Use pre-calculated grace period data (calculated at component level with useMemo)
                                    const { isInGracePeriod: isInMembershipGracePeriod, daysRemaining: gracePeriodDaysRemaining } = membershipGracePeriodData;

                                    if (isInMembershipGracePeriod && gracePeriodDaysRemaining !== null && gracePeriodDaysRemaining > 0) {
                                        return (
                                            <div className={styles.alertCard} style={{ background: '#fef3c7', borderColor: '#f59e0b' }}>
                                                <Clock size={20} style={{ color: '#f59e0b' }} />
                                                <div>
                                                    <div className={styles.alertTitle} style={{ color: '#f59e0b' }}>Membership Grace Period</div>
                                                    <div className={styles.alertText}>
                                                        Your membership is in grace period ({gracePeriodDaysRemaining} day{gracePeriodDaysRemaining !== 1 ? 's' : ''} remaining).
                                                        <a href={`/membership/renew?membershipId=${membership.id}`} style={{ marginLeft: '0.5rem', fontWeight: 600, textDecoration: 'underline' }}>Renew now</a> to reactivate your membership.
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }

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

                                    // Check if in grace period
                                    const trainerGracePeriodEnd = (membership as any).trainer_grace_period_end;
                                    const now: Date = new Date();
                                    const isInTrainerGracePeriod = isTrainerInGracePeriod(
                                        membership.trainer_period_end ?? null,
                                        trainerGracePeriodEnd ?? null,
                                        now
                                    );
                                    const gracePeriodDaysRemaining = isInTrainerGracePeriod && trainerGracePeriodEnd
                                        ? getTrainerGracePeriodDaysRemaining(trainerGracePeriodEnd, now)
                                        : null;

                                    if (isInTrainerGracePeriod && gracePeriodDaysRemaining !== null) {
                                        return (
                                            <div className={styles.alertCard} style={{ background: '#fef3c7', borderColor: '#f59e0b' }}>
                                                <Clock size={20} style={{ color: '#f59e0b' }} />
                                                <div>
                                                    <div className={styles.alertTitle} style={{ color: '#f59e0b' }}>Trainer Access Grace Period</div>
                                                    <div className={styles.alertText}>
                                                        Your trainer access is in grace period ({gracePeriodDaysRemaining} day{gracePeriodDaysRemaining !== 1 ? 's' : ''} remaining). <a href={`/membership/renew-trainer?membershipId=${membership.id}`}>Renew now</a> to continue trainer access.
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    } else if (trainerExpiration.isExpired) {
                                        return (
                                            <div className={styles.alertCard} style={{ background: '#fee2e2', borderColor: '#dc2626' }}>
                                                <XCircle size={20} style={{ color: '#dc2626' }} />
                                                <div>
                                                    <div className={styles.alertTitle} style={{ color: '#dc2626' }}>Trainer Access Expired</div>
                                                    <div className={styles.alertText}>
                                                        Your trainer access has expired. <a href={`/membership/renew-trainer?membershipId=${membership.id}`}>Renew trainer access</a> to continue.
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
                                                        Trainer access expires in {trainerExpiration.daysRemaining} day{trainerExpiration.daysRemaining !== 1 ? 's' : ''}. <a href={`/membership/renew-trainer?membershipId=${membership.id}`}>Renew now</a>.
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
                                    {membership.trainer_assigned && membership.trainer_id && (() => {
                                        // CRITICAL: For Regular Monthly plans, hide trainer info if membership has expired
                                        // Trainer access is tightly bound to membership lifecycle - no carryover to grace period
                                        const planName = (membership.plan_name || '').toLowerCase();
                                        const isRegularMonthly = planName.includes('regular') && (planName.includes('monthly') || planName.includes('boys') || planName.includes('girls'));

                                        if (isRegularMonthly) {
                                            const endDate = membership.membership_end_date || membership.end_date;
                                            const now = new Date();

                                            // If membership has expired (even if in grace period), hide trainer completely
                                            if (endDate && new Date(endDate) <= now) {
                                                // Membership expired - trainer access should be hidden
                                                return null;
                                            }
                                        }

                                        // For non-Regular plans or Regular plans that haven't expired, show trainer info
                                        return (
                                            <>
                                                <div className={styles.infoItem}>
                                                    <span className={styles.infoLabel}>Trainer</span>
                                                    <span className={styles.infoValue}>
                                                        {membership.trainer_name || 'N/A'}
                                                        {(() => {
                                                            // Use centralized messaging access control utility
                                                            // Only show message button when trainer access is actively valid
                                                            const now = new Date();
                                                            const messagingAccess = checkTrainerMessagingAccess(
                                                                membership.trainer_period_end ?? null,
                                                                membership.trainer_grace_period_end ?? null,
                                                                now, // Pass demo mode date for accurate access checking
                                                                membership.membership_end_date || membership.end_date || null, // Pass membership end date for Regular Monthly check
                                                                membership.plan_name // Pass plan name for Regular Monthly check
                                                            );

                                                            if (messagingAccess.canMessage) {
                                                                return (
                                                                    <a href={`/messages/trainer/${membership.trainer_id}`} className={styles.messageLink}>
                                                                        <MessageSquare size={14} />
                                                                        Message
                                                                    </a>
                                                                );
                                                            }
                                                            // Don't show anything when access is expired or in grace period
                                                            return null;
                                                        })()}
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
                                        );
                                    })()}
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

                                {/* Invoices Section */}
                                <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Receipt size={18} style={{ color: '#f97316' }} />
                                            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'white', margin: 0 }}>Invoices</h3>
                                        </div>
                                        {invoices.length > 0 && (
                                            <span className={styles.badge}>{invoices.length} Available</span>
                                        )}
                                    </div>
                                    {loadingInvoices ? (
                                        <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Loading invoices...</p>
                                    ) : invoices.length === 0 ? (
                                        <div className={styles.emptyState}>
                                            <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
                                                No invoices available yet. Invoices are generated automatically after payment approval.
                                            </p>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                            {invoices.map((invoice: any) => {
                                                const invoiceTypeLabel = invoice.invoice_type === 'initial'
                                                    ? 'Initial Purchase'
                                                    : invoice.invoice_type === 'renewal'
                                                        ? 'Membership Plan Renewal'
                                                        : invoice.invoice_type === 'trainer_renewal'
                                                            ? 'Trainer Access Renewal'
                                                            : 'Payment';
                                                const invoiceTypeColor = invoice.invoice_type === 'initial'
                                                    ? '#3b82f6'
                                                    : invoice.invoice_type === 'renewal'
                                                        ? '#f59e0b'
                                                        : invoice.invoice_type === 'trainer_renewal'
                                                            ? '#10b981'
                                                            : '#6b7280';
                                                return (
                                                    <div
                                                        key={invoice.id}
                                                        style={{
                                                            padding: '0.875rem',
                                                            background: 'rgba(255, 255, 255, 0.05)',
                                                            border: '1px solid rgba(255, 255, 255, 0.1)',
                                                            borderRadius: '0.5rem',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            gap: '1rem',
                                                            transition: 'all 0.2s ease'
                                                        }}
                                                    >
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                                                                <span style={{
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: 600,
                                                                    padding: '0.25rem 0.5rem',
                                                                    borderRadius: '9999px',
                                                                    background: `${invoiceTypeColor}15`,
                                                                    color: invoiceTypeColor,
                                                                    border: `1px solid ${invoiceTypeColor}30`
                                                                }}>
                                                                    {invoiceTypeLabel}
                                                                </span>
                                                                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                                                                    {invoice.invoice_number}
                                                                </span>
                                                            </div>
                                                            <div style={{ fontSize: '0.8125rem', color: '#d1d5db', marginBottom: '0.25rem' }}>
                                                                ₹{parseFloat(invoice.amount).toLocaleString()} • {formatDate(invoice.created_at)}
                                                            </div>
                                                        </div>
                                                        <a
                                                            href={invoice.file_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className={styles.downloadBtn}
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '0.375rem',
                                                                padding: '0.5rem 0.875rem',
                                                                background: 'rgba(249, 115, 22, 0.1)',
                                                                color: '#f97316',
                                                                border: '1px solid rgba(249, 115, 22, 0.3)',
                                                                borderRadius: '0.5rem',
                                                                fontSize: '0.8125rem',
                                                                fontWeight: 600,
                                                                textDecoration: 'none',
                                                                transition: 'all 0.2s ease'
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                e.currentTarget.style.background = 'rgba(249, 115, 22, 0.2)';
                                                                e.currentTarget.style.borderColor = 'rgba(249, 115, 22, 0.5)';
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                e.currentTarget.style.background = 'rgba(249, 115, 22, 0.1)';
                                                                e.currentTarget.style.borderColor = 'rgba(249, 115, 22, 0.3)';
                                                            }}
                                                        >
                                                            <Download size={14} />
                                                            Download
                                                        </a>
                                                    </div>
                                                );
                                            })}
                                            <div style={{
                                                marginTop: '0.5rem',
                                                padding: '0.75rem',
                                                background: 'rgba(251, 191, 36, 0.1)',
                                                border: '1px solid rgba(251, 191, 36, 0.2)',
                                                borderRadius: '0.5rem',
                                                fontSize: '0.75rem',
                                                color: '#fbbf24'
                                            }}>
                                                <Bell size={14} style={{ display: 'inline', marginRight: '0.5rem', verticalAlign: 'middle' }} />
                                                Please download invoices soon, they may be deleted later.
                                            </div>
                                        </div>
                                    )}
                                </div>
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
                            {!hasActiveMembership ? (
                                <div className={styles.emptyState}>
                                    <p>Weekly charts will appear here once your membership is activated.</p>
                                </div>
                            ) : !hasChartEligibleActiveMembership ? (
                                <div className={styles.emptyState}>
                                    <p><strong>Charts not available for your current plan.</strong></p>
                                    <p className={styles.emptySubtext}>
                                        {allMemberships.some((m: any) => {
                                            const planLower = String(m.plan_name || '').toLowerCase();
                                            return planLower.includes('regular') && m.status === 'active';
                                        }) ? (
                                            <>Regular plans require a trainer addon to receive workout and diet charts. Add a trainer to your membership to get weekly charts.</>
                                        ) : (
                                            <>Weekly charts will appear here once your membership is activated.</>
                                        )}
                                    </p>
                                </div>
                            ) : chartsLoading ? (
                                <p>Loading charts...</p>
                            ) : (
                                <>
                                    {/* Missing Chart Reminders */}
                                    {allMemberships
                                        .filter((m: any) => m.status === 'active' && !String(m.plan_name || '').toLowerCase().includes('regular'))
                                        .map((membership) => {
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

                                    {organizedCharts.currentPlanCharts.length === 0 && organizedCharts.previousPlanCharts.length === 0 ? (
                                        <div className={styles.emptyState}>
                                            <p>No weekly charts available yet.</p>
                                            <p className={styles.emptySubtext}>Charts will be uploaded by admin or your trainer.</p>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Current Plan - Current Week Charts */}
                                            {organizedCharts.currentPlanCharts.map(({ membership, currentWeekCharts, allCharts }) => {
                                                const startDate = membership.membership_start_date || membership.start_date;
                                                const currentWeek = calculateCurrentWeek(startDate);
                                                const hasMoreCharts = allCharts.length > currentWeekCharts.length;

                                                return (
                                                    <div key={membership.id} style={{ marginBottom: '2rem' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                                            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#f97316' }}>
                                                                Current Plan: {membership.plan_name.charAt(0).toUpperCase() + membership.plan_name.slice(1)}
                                                                {currentWeek && (
                                                                    <span style={{ fontSize: '0.875rem', fontWeight: 400, color: '#9ca3af', marginLeft: '0.5rem' }}>
                                                                        - Week {currentWeek}
                                                                    </span>
                                                                )}
                                                            </h3>
                                                            {hasMoreCharts && (
                                                                <button
                                                                    onClick={() => setShowAllChartsModal(true)}
                                                                    className={styles.viewAllChartsBtn}
                                                                >
                                                                    View All Charts
                                                                    <ChevronRight size={16} />
                                                                </button>
                                                            )}
                                                        </div>

                                                        {currentWeekCharts.length > 0 ? (
                                                            <div className={styles.chartsList}>
                                                                {currentWeekCharts.map((chart) => (
                                                                    <div key={chart.id} className={styles.chartCard}>
                                                                        <div className={styles.chartHeader}>
                                                                            <span className={styles.chartWeek}>Week {chart.week_number}</span>
                                                                            <span className={styles.chartType}>
                                                                                {chart.chart_type === 'workout' ? 'Workout' : 'Diet'}
                                                                            </span>
                                                                        </div>
                                                                        {chart.title && (
                                                                            <p className={styles.chartTitle}>{chart.title}</p>
                                                                        )}
                                                                        {chart.content && (
                                                                            <div className={styles.chartContent} style={{
                                                                                marginTop: '0.75rem',
                                                                                fontSize: '0.875rem',
                                                                                color: '#e5e7eb',
                                                                                lineHeight: '1.6',
                                                                                maxHeight: '150px',
                                                                                overflow: 'hidden',
                                                                                textOverflow: 'ellipsis',
                                                                                display: '-webkit-box',
                                                                                WebkitLineClamp: 4,
                                                                                WebkitBoxOrient: 'vertical'
                                                                            }}>
                                                                                {chart.content}
                                                                            </div>
                                                                        )}
                                                                        <div className={styles.chartMeta}>
                                                                            <span><Calendar size={12} /> {formatDate(chart.created_at)}</span>
                                                                            <span>By: {chart.created_by && chart.trainers ? (Array.isArray(chart.trainers) ? chart.trainers[0]?.name : chart.trainers.name) : 'Admin'}</span>
                                                                        </div>
                                                                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                                                                            <button
                                                                                onClick={() => {
                                                                                    setSelectedChart(chart);
                                                                                    setShowChartModal(true);
                                                                                }}
                                                                                className={styles.viewChartBtn}
                                                                            >
                                                                                <Eye size={14} />
                                                                                View Chart
                                                                            </button>
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
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : currentWeek ? (
                                                            <div className={styles.emptyState}>
                                                                <p>No charts available for Week {currentWeek} yet.</p>
                                                                {hasMoreCharts && (
                                                                    <button
                                                                        onClick={() => setShowAllChartsModal(true)}
                                                                        className={styles.viewAllChartsBtn}
                                                                        style={{ marginTop: '1rem' }}
                                                                    >
                                                                        View Previous Weeks
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className={styles.emptyState}>
                                                                <p>Charts will appear here once your membership starts.</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}

                                            {/* Previous Plans Charts */}
                                            {organizedCharts.previousPlanCharts.length > 0 && (
                                                <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                                    <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#9ca3af', marginBottom: '1rem' }}>
                                                        Previous Plans
                                                    </h3>
                                                    {organizedCharts.previousPlanCharts.map(({ membership, charts }) => (
                                                        <div key={membership.id} style={{ marginBottom: '2rem' }}>
                                                            <h4 style={{ fontSize: '1rem', fontWeight: 600, color: '#d1d5db', marginBottom: '0.75rem' }}>
                                                                {membership.plan_name.charAt(0).toUpperCase() + membership.plan_name.slice(1)} Plan
                                                            </h4>
                                                            <div className={styles.chartsList}>
                                                                {charts.map((chart) => (
                                                                    <div key={chart.id} className={styles.chartCard}>
                                                                        <div className={styles.chartHeader}>
                                                                            <span className={styles.chartWeek}>Week {chart.week_number}</span>
                                                                            <span className={styles.chartType}>
                                                                                {chart.chart_type === 'workout' ? 'Workout' : 'Diet'}
                                                                            </span>
                                                                            <span className={styles.previousPlanBadge}>
                                                                                {membership.plan_name.charAt(0).toUpperCase() + membership.plan_name.slice(1)}
                                                                            </span>
                                                                        </div>
                                                                        {chart.title && (
                                                                            <p className={styles.chartTitle}>{chart.title}</p>
                                                                        )}
                                                                        {chart.content && (
                                                                            <div className={styles.chartContent} style={{
                                                                                marginTop: '0.75rem',
                                                                                fontSize: '0.875rem',
                                                                                color: '#e5e7eb',
                                                                                lineHeight: '1.6',
                                                                                maxHeight: '150px',
                                                                                overflow: 'hidden',
                                                                                textOverflow: 'ellipsis',
                                                                                display: '-webkit-box',
                                                                                WebkitLineClamp: 4,
                                                                                WebkitBoxOrient: 'vertical'
                                                                            }}>
                                                                                {chart.content}
                                                                            </div>
                                                                        )}
                                                                        <div className={styles.chartMeta}>
                                                                            <span><Calendar size={12} /> {formatDate(chart.created_at)}</span>
                                                                            <span>By: {chart.created_by && chart.trainers ? (Array.isArray(chart.trainers) ? chart.trainers[0]?.name : chart.trainers.name) : 'Admin'}</span>
                                                                        </div>
                                                                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                                                                            <button
                                                                                onClick={() => {
                                                                                    setSelectedChart(chart);
                                                                                    setShowChartModal(true);
                                                                                }}
                                                                                className={styles.viewChartBtn}
                                                                            >
                                                                                <Eye size={14} />
                                                                                View Chart
                                                                            </button>
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
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                </div>
            </div>

            {/* View All Charts Modal */}
            {showAllChartsModal && (
                <div
                    className={styles.chartModalOverlay}
                    onClick={() => setShowAllChartsModal(false)}
                >
                    <div
                        className={styles.allChartsModal}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={styles.chartModalHeader}>
                            <div>
                                <h2 className={styles.chartModalTitle}>All Weekly Charts</h2>
                                <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                                    View all charts from your current plan
                                </p>
                            </div>
                            <button
                                className={styles.chartModalClose}
                                onClick={() => setShowAllChartsModal(false)}
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className={styles.allChartsModalBody}>
                            {organizedCharts.currentPlanCharts.map(({ membership, allCharts }) => {
                                const startDate = membership.membership_start_date || membership.start_date;
                                const currentWeek = calculateCurrentWeek(startDate);

                                // Group charts by week
                                const chartsByWeek = new Map<number, WeeklyChart[]>();
                                allCharts.forEach(chart => {
                                    if (!chartsByWeek.has(chart.week_number)) {
                                        chartsByWeek.set(chart.week_number, []);
                                    }
                                    chartsByWeek.get(chart.week_number)!.push(chart);
                                });

                                const weeks = Array.from(chartsByWeek.keys()).sort((a, b) => b - a);

                                return (
                                    <div key={membership.id} style={{ marginBottom: '2rem' }}>
                                        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#f97316', marginBottom: '1rem' }}>
                                            {membership.plan_name.charAt(0).toUpperCase() + membership.plan_name.slice(1)} Plan
                                        </h3>
                                        {weeks.map(weekNumber => {
                                            const weekCharts = chartsByWeek.get(weekNumber) || [];
                                            const isCurrentWeek = weekNumber === currentWeek;

                                            return (
                                                <div key={weekNumber} style={{ marginBottom: '1.5rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                                        <h4 style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#d1d5db' }}>
                                                            Week {weekNumber}
                                                        </h4>
                                                        {isCurrentWeek && (
                                                            <span style={{
                                                                background: 'rgba(249, 115, 22, 0.2)',
                                                                color: '#f97316',
                                                                padding: '0.125rem 0.5rem',
                                                                borderRadius: '9999px',
                                                                fontSize: '0.75rem',
                                                                fontWeight: 600
                                                            }}>
                                                                Current
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                        {weekCharts.map((chart) => (
                                                            <div key={chart.id} className={styles.chartCard} style={{ margin: 0 }}>
                                                                <div className={styles.chartHeader}>
                                                                    <span className={styles.chartType}>
                                                                        {chart.chart_type === 'workout' ? 'Workout' : 'Diet'}
                                                                    </span>
                                                                </div>
                                                                {chart.title && (
                                                                    <p className={styles.chartTitle}>{chart.title}</p>
                                                                )}
                                                                <div className={styles.chartMeta}>
                                                                    <span><Calendar size={12} /> {formatDate(chart.created_at)}</span>
                                                                    <span>By: {chart.created_by && chart.trainers ? (Array.isArray(chart.trainers) ? chart.trainers[0]?.name : chart.trainers.name) : 'Admin'}</span>
                                                                </div>
                                                                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                                                                    <button
                                                                        onClick={() => {
                                                                            setSelectedChart(chart);
                                                                            setShowChartModal(true);
                                                                            setShowAllChartsModal(false);
                                                                        }}
                                                                        className={styles.viewChartBtn}
                                                                    >
                                                                        <Eye size={14} />
                                                                        View Chart
                                                                    </button>
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
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                        <div className={styles.chartModalFooter}>
                            <button
                                className={styles.chartModalCloseBtn}
                                onClick={() => setShowAllChartsModal(false)}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Chart Detail Modal */}
            {showChartModal && selectedChart && (
                <div
                    className={styles.chartModalOverlay}
                    onClick={() => {
                        setShowChartModal(false);
                        setSelectedChart(null);
                    }}
                >
                    <div
                        className={styles.chartModal}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={styles.chartModalHeader}>
                            <div>
                                <h2 className={styles.chartModalTitle}>
                                    Week {selectedChart.week_number} - {selectedChart.chart_type === 'workout' ? 'Workout Plan' : 'Diet Plan'}
                                </h2>
                                <div className={styles.chartModalMeta}>
                                    <span><Calendar size={14} /> {formatDate(selectedChart.created_at)}</span>
                                    <span>•</span>
                                    <span>By: {selectedChart.created_by && selectedChart.trainers ? (Array.isArray(selectedChart.trainers) ? selectedChart.trainers[0]?.name : selectedChart.trainers.name) : 'Admin'}</span>
                                </div>
                            </div>
                            <button
                                className={styles.chartModalClose}
                                onClick={() => {
                                    setShowChartModal(false);
                                    setSelectedChart(null);
                                }}
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className={styles.chartModalBody}>
                            {selectedChart.title && (
                                <h3 className={styles.chartModalContentTitle}>{selectedChart.title}</h3>
                            )}
                            {selectedChart.content && (
                                <div className={styles.chartModalContent}>
                                    {selectedChart.content.split('\n').map((line, index) => (
                                        <p key={index} style={{ marginBottom: line.trim() ? '0.75rem' : '0.5rem', whiteSpace: 'pre-wrap' }}>
                                            {line || '\u00A0'}
                                        </p>
                                    ))}
                                </div>
                            )}
                            {!selectedChart.content && (
                                <div className={styles.chartModalEmpty}>
                                    <FileText size={48} />
                                    <p>No content available for this chart.</p>
                                </div>
                            )}
                        </div>
                        <div className={styles.chartModalFooter}>
                            {selectedChart.file_url && (
                                <a
                                    href={selectedChart.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.downloadBtn}
                                >
                                    <Download size={16} />
                                    Download File
                                </a>
                            )}
                            <button
                                className={styles.chartModalCloseBtn}
                                onClick={() => {
                                    setShowChartModal(false);
                                    setSelectedChart(null);
                                }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
