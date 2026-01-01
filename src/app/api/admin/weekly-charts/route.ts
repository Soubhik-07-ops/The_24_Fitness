// src/app/api/admin/weekly-charts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// GET: Fetch weekly charts for memberships without trainers
export async function GET(request: NextRequest) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });
        }

        // Get all active memberships
        const { data: memberships, error: membershipsError } = await supabaseAdmin
            .from('memberships')
            .select(`
                id,
                user_id,
                plan_name,
                status,
                membership_addons!left (
                    id,
                    addon_type
                )
            `)
            .eq('status', 'active');

        if (membershipsError) {
            throw membershipsError;
        }

        // Filter memberships without personal trainer addon
        const membershipsWithoutTrainer = (memberships || []).filter((m: any) => {
            const hasPersonalTrainer = (m.membership_addons || []).some(
                (a: any) => a.addon_type === 'personal_trainer'
            );
            return !hasPersonalTrainer;
        });

        const membershipIds = membershipsWithoutTrainer.map((m: any) => m.id);

        if (membershipIds.length === 0) {
            return NextResponse.json({ memberships: [], charts: [] });
        }

        // Get user IDs
        const userIds = [...new Set(membershipsWithoutTrainer.map((m: any) => m.user_id))];

        // Fetch profiles separately
        const { data: profiles, error: profilesError } = await supabaseAdmin
            .from('profiles')
            .select('id, full_name, email')
            .in('id', userIds);

        if (profilesError) {
            console.error('Error fetching profiles:', profilesError);
        }

        // Get all weekly charts for these memberships (only those created by admin, i.e., created_by IS NULL)
        const { data: charts, error: chartsError } = await supabaseAdmin
            .from('weekly_charts')
            .select('*')
            .in('membership_id', membershipIds)
            .is('created_by', null)
            .order('week_number', { ascending: false })
            .order('created_at', { ascending: false });

        if (chartsError) {
            throw chartsError;
        }

        // Format response with membership info
        const membershipsWithCharts = membershipsWithoutTrainer.map((membership: any) => {
            const profile = (profiles || []).find((p: any) => p.id === membership.user_id);
            const membershipCharts = (charts || []).filter((c: any) => c.membership_id === membership.id);
            return {
                membership_id: membership.id,
                user_id: membership.user_id,
                user_name: profile?.full_name || 'Unknown',
                user_email: profile?.email || '',
                plan_name: membership.plan_name,
                status: membership.status,
                start_date: membership.start_date || null,
                charts: membershipCharts
            };
        });

        return NextResponse.json({
            memberships: membershipsWithCharts,
            charts: charts || []
        });
    } catch (err: any) {
        return NextResponse.json(
            { error: err.message || 'Failed to fetch weekly charts' },
            { status: 500 }
        );
    }
}

// POST: Create a new weekly chart (admin)
export async function POST(request: NextRequest) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });
        }

        const body = await request.json();
        const { membership_id, week_number, chart_type, title, content, file_url } = body;

        if (!membership_id || !week_number || !chart_type) {
            return NextResponse.json(
                { error: 'membership_id, week_number, and chart_type are required' },
                { status: 400 }
            );
        }

        // Verify that this membership doesn't have a personal trainer addon
        const { data: membership, error: membershipError } = await supabaseAdmin
            .from('memberships')
            .select(`
                id,
                status,
                user_id,
                membership_addons!left (
                    addon_type
                )
            `)
            .eq('id', membership_id)
            .single();

        if (membershipError || !membership) {
            return NextResponse.json(
                { error: 'Membership not found' },
                { status: 404 }
            );
        }

        // Check if membership has personal trainer
        const hasPersonalTrainer = (membership.membership_addons || []).some(
            (a: any) => a.addon_type === 'personal_trainer'
        );

        if (hasPersonalTrainer) {
            return NextResponse.json(
                { error: 'This membership has a personal trainer. Charts should be created by the trainer.' },
                { status: 400 }
            );
        }

        // Check if membership is active
        if (membership.status !== 'active') {
            return NextResponse.json(
                { error: 'Membership is not active' },
                { status: 400 }
            );
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

        // Create the chart (created_by is NULL for admin-created charts)
        const { data: chart, error: chartError } = await supabaseAdmin
            .from('weekly_charts')
            .insert({
                membership_id,
                week_number,
                chart_type,
                title: title || null,
                content: content || null,
                file_url: file_url || null,
                created_by: null // NULL means created by admin
            })
            .select()
            .single();

        if (chartError) {
            throw chartError;
        }

        // Send notification to user
        if (membership.user_id) {
            await supabaseAdmin
                .from('notifications')
                .insert({
                    recipient_id: membership.user_id,
                    actor_role: 'admin',
                    type: 'weekly_chart_added',
                    content: `A new ${chart_type} chart for Week ${week_number} has been added to your membership.`,
                    is_read: false
                });
        }

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

