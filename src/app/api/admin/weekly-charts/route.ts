// src/app/api/admin/weekly-charts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';
import { getChartResponsibility, needsWorkoutCharts, needsDietCharts } from '@/lib/chartResponsibility';

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

        // Get all active memberships with trainer period info
        const { data: memberships, error: membershipsError } = await supabaseAdmin
            .from('memberships')
            .select(`
                id,
                user_id,
                plan_name,
                plan_type,
                plan_mode,
                status,
                trainer_period_end,
                trainer_id,
                trainer_assigned,
                membership_start_date,
                membership_end_date,
                end_date,
                membership_addons!left (
                    id,
                    addon_type,
                    status
                )
            `)
            .eq('status', 'active');

        if (membershipsError) {
            throw membershipsError;
        }

        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);

        // Filter ALL chart-eligible memberships (not just admin-uploadable)
        // - Regular plans: ONLY if they have trainer addon
        // - Other plans: Always eligible
        const allChartEligibleMemberships = (memberships || []).filter((m: any) => {
            const planName = String(m.plan_name || '').toLowerCase();
            const isRegularPlan = planName.includes('regular');
            
            const hasPersonalTrainer = (m.membership_addons || []).some(
                (a: any) => a.addon_type === 'personal_trainer' && (a.status === 'active' || a.status === 'pending')
            );
            
            // Regular plans: ONLY allow if they have trainer addon
            if (isRegularPlan) {
                return hasPersonalTrainer; // Regular without trainer = no charts
            }
            
            // Other plans: always eligible
            return true;
        });

        const membershipIds = allChartEligibleMemberships.map((m: any) => m.id);

        if (membershipIds.length === 0) {
            return NextResponse.json({ 
                directAdminMemberships: [],
                trainerAssignedMemberships: [],
                charts: []
            });
        }

        // Get user IDs
        const userIds = [...new Set(allChartEligibleMemberships.map((m: any) => m.user_id))];

        // Fetch profiles separately
        const { data: profiles, error: profilesError } = await supabaseAdmin
            .from('profiles')
            .select('id, full_name, email')
            .in('id', userIds);

        if (profilesError) {
            console.error('Error fetching profiles:', profilesError);
        }

        // Get ALL weekly charts for these memberships (admin + trainer created)
        const { data: allCharts, error: chartsError } = await supabaseAdmin
            .from('weekly_charts')
            .select('*')
            .in('membership_id', membershipIds)
            .order('week_number', { ascending: false })
            .order('created_at', { ascending: false });

        if (chartsError) {
            throw chartsError;
        }

        // Separate into two groups:
        // 1. Direct Admin: No trainer OR trainer period expired (admin can upload)
        // 2. Trainer-Assigned: Has active trainer period (trainer uploads, admin can view)
        const directAdminMemberships: any[] = [];
        const trainerAssignedMemberships: any[] = [];

        allChartEligibleMemberships.forEach((membership: any) => {
            const profile = (profiles || []).find((p: any) => p.id === membership.user_id);
            const membershipCharts = (allCharts || []).filter((c: any) => c.membership_id === membership.id);
            const hasTrainerAddon = (membership.membership_addons || []).some(
                (a: any) => a.addon_type === 'personal_trainer' && (a.status === 'active' || a.status === 'pending')
            );
            const hasInGymAddon = (membership.membership_addons || []).some(
                (a: any) => a.addon_type === 'in_gym' && (a.status === 'active' || a.status === 'pending')
            );
            
            const membershipStartDate = membership.membership_start_date || membership.start_date;
            const membershipEndDate = membership.membership_end_date || membership.end_date;
            const trainerPeriodEnd = membership.trainer_period_end ? new Date(membership.trainer_period_end) : null;

            // Use chart responsibility logic
            const chartResp = getChartResponsibility({
                planName: membership.plan_name,
                hasTrainerAddon,
                hasInGymAddon,
                trainerPeriodEnd,
                membershipStartDate: membershipStartDate ? new Date(membershipStartDate) : new Date(),
                membershipEndDate: membershipEndDate ? new Date(membershipEndDate) : new Date(),
                currentDate
            });

            const membershipData = {
                membership_id: membership.id,
                user_id: membership.user_id,
                user_name: profile?.full_name || 'Unknown',
                user_email: profile?.email || '',
                plan_name: membership.plan_name,
                status: membership.status,
                start_date: membershipStartDate || null,
                trainer_period_end: membership.trainer_period_end || null,
                trainer_id: membership.trainer_id || null,
                trainer_assigned: membership.trainer_assigned || false,
                has_trainer_addon: hasTrainerAddon,
                charts: membershipCharts,
                chart_responsibility: chartResp.shouldUpload,
                chart_reason: chartResp.reason
            };

            const membershipDataWithFlags = {
                ...membershipData,
                trainer_period_expired: trainerPeriodEnd ? trainerPeriodEnd < currentDate : false,
                admin_can_upload: chartResp.canAdminUpload,
                trainer_can_upload: chartResp.canTrainerUpload
            };

            // Separate into sections based on responsibility
            if (chartResp.shouldUpload === 'admin') {
                directAdminMemberships.push(membershipDataWithFlags);
            } else if (chartResp.shouldUpload === 'trainer') {
                trainerAssignedMemberships.push(membershipDataWithFlags);
            } else if (chartResp.shouldUpload === 'none') {
                // Regular plans without trainer addon - no charts needed
                // Skip adding to either section
            }
        });

        return NextResponse.json({
            directAdminMemberships,
            trainerAssignedMemberships,
            charts: allCharts || []
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

        // Verify membership and check trainer period status
        const { data: membership, error: membershipError } = await supabaseAdmin
            .from('memberships')
            .select(`
                id,
                status,
                user_id,
                plan_name,
                plan_type,
                plan_mode,
                trainer_period_end,
                membership_start_date,
                start_date,
                membership_end_date,
                end_date,
                membership_addons!left (
                    addon_type,
                    status
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

        // Get addons
        const hasTrainerAddon = (membership.membership_addons || []).some(
            (a: any) => a.addon_type === 'personal_trainer' && (a.status === 'active' || a.status === 'pending')
        );
        const hasInGymAddon = (membership.membership_addons || []).some(
            (a: any) => a.addon_type === 'in_gym' && (a.status === 'active' || a.status === 'pending')
        );

        // Use chart responsibility logic
        const membershipStartDate = membership.membership_start_date || membership.start_date;
        const membershipEndDate = membership.membership_end_date || membership.end_date;
        const trainerPeriodEnd = membership.trainer_period_end ? new Date(membership.trainer_period_end) : null;
        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);

        const chartResp = getChartResponsibility({
            planName: membership.plan_name,
            hasTrainerAddon,
            hasInGymAddon,
            trainerPeriodEnd,
            membershipStartDate: membershipStartDate ? new Date(membershipStartDate) : new Date(),
            membershipEndDate: membershipEndDate ? new Date(membershipEndDate) : new Date(),
            currentDate
        });

        // Admin can ALWAYS upload charts as backup (even if trainer is assigned)
        // Only block if charts are not needed at all (Regular without trainer)
        if (chartResp.shouldUpload === 'none') {
            return NextResponse.json(
                { error: 'Weekly charts are not available for this membership type.' },
                { status: 400 }
            );
        }

        // Check if chart type is allowed
        const planNameLower = String(membership.plan_name || '').toLowerCase();
        const isBasicPlan = planNameLower === 'basic';
        
        if (chart_type === 'diet' && isBasicPlan) {
            return NextResponse.json(
                { error: 'Basic plans only include workout charts, not diet charts.' },
                { status: 400 }
            );
        }

        // Also check using helper functions
        if (chart_type === 'diet' && !needsDietCharts(membership.plan_name, hasTrainerAddon)) {
            return NextResponse.json(
                { error: 'This plan type does not include diet charts.' },
                { status: 400 }
            );
        }

        if (chart_type === 'workout' && !needsWorkoutCharts(membership.plan_name, hasTrainerAddon)) {
            return NextResponse.json(
                { error: 'This plan type does not include workout charts.' },
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

