import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables')
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
})

// Public API to get website stats (no authentication required)
export async function GET(request: NextRequest) {
    try {
        // Fetch active memberships count
        const { count: activeMembers, error: membersError } = await supabaseAdmin
            .from('memberships')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'active')

        // Fetch total trainers count
        const { count: totalTrainers, error: trainersError } = await supabaseAdmin
            .from('trainers')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true)

        // Fetch reviews for rating calculation
        const { data: reviewsData, error: reviewsError } = await supabaseAdmin
            .from('reviews')
            .select('rating')
            .eq('is_approved', true)

        // Calculate average rating
        const averageRating = reviewsData && reviewsData.length > 0
            ? reviewsData.reduce((sum, review) => sum + (review.rating || 0), 0) / reviewsData.length
            : 0

        // Calculate satisfaction rate (percentage of 4+ star reviews)
        const satisfactionRate = reviewsData && reviewsData.length > 0
            ? (reviewsData.filter(r => (r.rating || 0) >= 4).length / reviewsData.length) * 100
            : 100

        return NextResponse.json({
            success: true,
            stats: {
                activeMembers: activeMembers || 0,
                totalTrainers: totalTrainers || 0,
                averageRating: averageRating.toFixed(1),
                satisfactionRate: satisfactionRate.toFixed(0)
            }
        })

    } catch (error: any) {
        console.error('Error fetching stats:', error)
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to fetch stats',
                stats: {
                    activeMembers: 0,
                    totalTrainers: 0,
                    averageRating: '0.0',
                    satisfactionRate: '100'
                }
            },
            { status: 500 }
        )
    }
}

