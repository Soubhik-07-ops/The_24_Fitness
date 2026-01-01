// src/app/api/trainer/weekly-charts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateTrainerSession } from '@/lib/trainerAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// GET: Fetch weekly charts for trainer's clients
export async function GET(request: NextRequest) {
    try {
        const token = request.cookies.get('trainer_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const trainer = await validateTrainerSession(token);
        if (!trainer) {
            return NextResponse.json({ error: 'Invalid or expired trainer session' }, { status: 401 });
        }

        // Get all memberships where this trainer is assigned (from memberships table)
        const { data: memberships, error: membershipsError } = await supabaseAdmin
            .from('memberships')
            .select('id, user_id, plan_name, status, trainer_assigned, trainer_id, trainer_period_end, membership_start_date, membership_end_date')
            .eq('trainer_id', trainer.id)
            .eq('trainer_assigned', true)
            .eq('status', 'active')
            .gt('trainer_period_end', new Date().toISOString()); // Only active trainer periods

        if (membershipsError) {
            throw membershipsError;
        }

        if (!memberships || memberships.length === 0) {
            return NextResponse.json({ clients: [], charts: [] });
        }

        // Get membership IDs and user IDs
        const membershipIds = memberships.map(m => m.id);
        const userIds = [...new Set(memberships.map(m => m.user_id))];

        // Fetch profiles separately
        const { data: profiles, error: profilesError } = await supabaseAdmin
            .from('profiles')
            .select('id, full_name, email')
            .in('id', userIds);

        if (profilesError) {
            console.error('Error fetching profiles:', profilesError);
        }

        // Get all weekly charts for these memberships
        const { data: charts, error: chartsError } = await supabaseAdmin
            .from('weekly_charts')
            .select('*')
            .in('membership_id', membershipIds)
            .order('week_number', { ascending: false })
            .order('created_at', { ascending: false });

        if (chartsError) {
            throw chartsError;
        }

        // Format response with client info
        const clientsWithCharts = memberships.map((membership: any) => {
            const profile = (profiles || []).find((p: any) => p.id === membership.user_id);
            const clientCharts = (charts || []).filter((c: any) => c.membership_id === membership.id);

            // Calculate days until trainer period expires
            const now = new Date();
            const periodEnd = new Date(membership.trainer_period_end);
            const diffTime = periodEnd.getTime() - now.getTime();
            const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            const isExpiringSoon = daysRemaining <= 4 && daysRemaining > 0;

            return {
                membership_id: membership.id,
                user_id: membership.user_id,
                user_name: profile?.full_name || 'Unknown',
                user_email: profile?.email || '',
                plan_name: membership.plan_name,
                status: membership.status,
                start_date: membership.membership_start_date || membership.start_date || null,
                trainer_period_end: membership.trainer_period_end,
                days_remaining: daysRemaining,
                is_expiring_soon: isExpiringSoon,
                charts: clientCharts
            };
        });

        return NextResponse.json({
            clients: clientsWithCharts,
            charts: charts || []
        });
    } catch (err: any) {
        return NextResponse.json(
            { error: err.message || 'Failed to fetch weekly charts' },
            { status: 500 }
        );
    }
}

// POST: Create a new weekly chart
export async function POST(request: NextRequest) {
    try {
        const token = request.cookies.get('trainer_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const trainer = await validateTrainerSession(token);
        if (!trainer) {
            return NextResponse.json({ error: 'Invalid or expired trainer session' }, { status: 401 });
        }

        const body = await request.json();
        const { membership_id, week_number, chart_type, title, content, file_url } = body;

        if (!membership_id || !week_number || !chart_type) {
            return NextResponse.json(
                { error: 'membership_id, week_number, and chart_type are required' },
                { status: 400 }
            );
        }

        // Verify that this trainer is assigned to this membership (check memberships table)
        const { data: membership, error: membershipError } = await supabaseAdmin
            .from('memberships')
            .select('id, status, trainer_assigned, trainer_id, trainer_period_end')
            .eq('id', membership_id)
            .eq('trainer_id', trainer.id)
            .eq('trainer_assigned', true)
            .eq('status', 'active')
            .single();

        if (membershipError || !membership) {
            return NextResponse.json(
                { error: 'You are not assigned as trainer for this membership' },
                { status: 403 }
            );
        }

        // Check if trainer period is still active
        if (membership.trainer_period_end) {
            const periodEnd = new Date(membership.trainer_period_end);
            const now = new Date();
            if (periodEnd < now) {
            return NextResponse.json(
                    { error: 'Your trainer access period for this membership has expired' },
                    { status: 403 }
            );
            }
        }

        // Check if chart already exists for this week and type
        const { data: existingChart } = await supabaseAdmin
            .from('weekly_charts')
            .select('id')
            .eq('membership_id', membership_id)
            .eq('week_number', week_number)
            .eq('chart_type', chart_type)
            .single();

        if (existingChart) {
            return NextResponse.json(
                { error: 'Chart already exists for this week and type. Use PUT to update.' },
                { status: 400 }
            );
        }

        // Create the chart
        const { data: chart, error: chartError } = await supabaseAdmin
            .from('weekly_charts')
            .insert({
                membership_id,
                week_number,
                chart_type,
                title: title || null,
                content: content || null,
                file_url: file_url || null,
                created_by: trainer.id
            })
            .select()
            .single();

        if (chartError) {
            throw chartError;
        }

        // Note: Notification removed - trainer panel no longer uses notifications

        return NextResponse.json({
            success: true,
            chart
        });
    } catch (err: any) {
        return NextResponse.json(
            { error: err.message || 'Failed to create weekly chart' },
            { status: 500 }
        );
    }
}

