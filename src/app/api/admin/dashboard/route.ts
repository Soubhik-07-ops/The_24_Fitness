// src/app/api/admin/dashboard/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession, getAdminTokenFromRequest } from '@/lib/adminAuth';

export async function GET(request: NextRequest) {
    try {
        // Authenticate admin via cookie, Authorization Bearer, or x-admin-token
        const token = getAdminTokenFromRequest(request);
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            return NextResponse.json(
                {
                    error: 'Server configuration error',
                    details: 'Missing Supabase environment variables. Check your .env.local file.'
                },
                { status: 500 }
            );
        }

        // Create Supabase admin client with service role key
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });

        const now = new Date();
        const nowMs = now.getTime();
        const sevenDaysFromNowMs = nowMs + 7 * 24 * 60 * 60 * 1000;
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // Fetch all stats authoritative data
        const [
            { count: totalUsers, error: usersError },
            { count: totalClasses, error: classesError },
            { data: reviewsData, error: reviewsError },
            { data: membershipsData, error: membershipsError },
            { data: paymentsData, error: paymentsError }
        ] = await Promise.all([
            supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
            supabaseAdmin.from('classes').select('*', { count: 'exact', head: true }),
            supabaseAdmin.from('reviews').select('*'),
            supabaseAdmin.from('memberships').select('id, user_id, status, membership_end_date, end_date, price, created_at'),
            supabaseAdmin.from('membership_payments').select('id, membership_id, amount, status, payment_date, created_at')
        ]);

        if (usersError) console.error('Error fetching totalUsers:', usersError);
        if (membershipsError) console.error('Error fetching memberships:', membershipsError);
        if (paymentsError) console.error('Error fetching payments:', paymentsError);

        const memberships = membershipsData || [];
        const payments = paymentsData || [];

        const isMembershipExpired = (m: any) => {
            const end = m.membership_end_date || m.end_date;
            if (!end) return false;
            const endMs = new Date(end).getTime();
            return !isNaN(endMs) && endMs < nowMs;
        };

        const activeList = memberships.filter((m: any) => {
            const raw = (m.status || '').toLowerCase();
            return (raw === 'active' || raw === 'approved') && !isMembershipExpired(m);
        });

        const expiredList = memberships.filter((m: any) => {
            const raw = (m.status || '').toLowerCase();
            if (raw === 'grace_period') return false;
            return raw === 'expired' || ((raw === 'active' || raw === 'approved') && isMembershipExpired(m));
        });

        const graceList = memberships.filter(
            (m: any) => (m.status || '').toLowerCase() === 'grace_period'
        );

        const expiringList = activeList.filter((m: any) => {
            const endDate = m.membership_end_date || m.end_date;
            if (!endDate) return false;
            const endMs = new Date(endDate).getTime();
            return !isNaN(endMs) && endMs >= nowMs && endMs <= sevenDaysFromNowMs;
        });

        // Pending payments: payments with status 'pending'
        const pendingPaymentRows = payments.filter(
            (p: any) => (p.status || '').toLowerCase() === 'pending'
        );
        const pendingMemberships = memberships.filter(
            (m: any) => (m.status || '').toLowerCase() === 'pending'
        );
        const pendingCount = Math.max(pendingPaymentRows.length, pendingMemberships.length);

        // Revenue calculations
        let monthlyRevenue = 0;
        let totalLifetimeRevenue = 0;

        for (const p of payments) {
            if ((p.status || '').toLowerCase() === 'verified') {
                const amt = Number(p.amount || 0);
                totalLifetimeRevenue += amt;
                const pDateStr = p.payment_date || p.created_at;
                if (pDateStr) {
                    const pDate = new Date(pDateStr);
                    if (pDate.getMonth() === currentMonth && pDate.getFullYear() === currentYear) {
                        monthlyRevenue += amt;
                    }
                }
            }
        }

        // Calculate average rating
        const averageRating = reviewsData && reviewsData.length > 0
            ? reviewsData.reduce((sum, review) => sum + (review.rating || 0), 0) / reviewsData.length
            : 0;

        // Calculate engagement rate based on reviews (users who have reviewed)
        const uniqueUsersWithReviews = new Set(reviewsData?.map(review => review.user_id) || []);
        const engagementRate = (totalUsers || 0) > 0
            ? (uniqueUsersWithReviews.size / (totalUsers || 1)) * 100
            : 0;

        const stats = {
            totalUsers: totalUsers || 0,
            activeMembers: activeList.length,
            expiredMembers: expiredList.length,
            gracePeriodCount: graceList.length,
            pendingPayments: pendingCount,
            expiringMembers: expiringList.length,
            monthlyRevenue,
            totalLifetimeRevenue,
            totalClasses: totalClasses || 0,
            totalReviews: reviewsData?.length || 0,
            averageRating,
            engagementRate
        };

        return NextResponse.json({
            success: true,
            stats
        });

    } catch (error: any) {
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to fetch dashboard data',
                details: error.message
            },
            { status: 500 }
        );
    }
}