// src/app/api/admin/dashboard/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';

export async function GET(request: NextRequest) {
    try {
        // Authenticate admin
        const token = request.cookies.get('admin_token')?.value;
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

        // Fetch all stats (removed bookings)
        const [
            { count: totalUsers, error: usersError },
            { count: totalClasses, error: classesError },
            { data: reviewsData, error: reviewsError }
        ] = await Promise.all([
            supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
            supabaseAdmin.from('classes').select('*', { count: 'exact', head: true }),
            supabaseAdmin.from('reviews').select('*')
        ]);

        // Handle errors silently
        if (usersError || classesError || reviewsError) {
            // Continue with available data
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