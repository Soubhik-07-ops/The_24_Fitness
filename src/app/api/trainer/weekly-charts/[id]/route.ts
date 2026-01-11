// src/app/api/trainer/weekly-charts/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateTrainerSession } from '@/lib/trainerAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// PUT: Update a weekly chart
export async function PUT(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const token = request.cookies.get('trainer_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const trainer = await validateTrainerSession(token);
        if (!trainer) {
            return NextResponse.json({ error: 'Invalid or expired trainer session' }, { status: 401 });
        }

        const { id } = await context.params;
        const chartId = parseInt(id);
        if (isNaN(chartId)) {
            return NextResponse.json({ error: 'Invalid chart ID' }, { status: 400 });
        }

        // Verify that this chart belongs to a membership assigned to this trainer
        // AND trainer period is active (allows updating admin-uploaded charts after renewal)
        const { data: chart, error: chartError } = await supabaseAdmin
            .from('weekly_charts')
            .select(`
                *,
                memberships!inner(
                    id,
                    status,
                    trainer_id,
                    trainer_assigned,
                    trainer_period_end
                )
            `)
            .eq('id', chartId)
            .single();

        if (chartError || !chart || !chart.memberships) {
            return NextResponse.json(
                { error: 'Chart not found' },
                { status: 404 }
            );
        }

        const membership = Array.isArray(chart.memberships) ? chart.memberships[0] : chart.memberships;
        
        // Verify trainer is assigned to this membership
        if (membership.trainer_id !== trainer.id || !membership.trainer_assigned) {
            return NextResponse.json(
                { error: 'You are not assigned as trainer for this membership' },
                { status: 403 }
            );
        }

        // Verify trainer period is active (allows managing charts after renewal)
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

        const body = await request.json();
        const { title, content, file_url } = body;

        // Update the chart
        const { data: updatedChart, error: updateError } = await supabaseAdmin
            .from('weekly_charts')
            .update({
                title: title !== undefined ? title : chart.title,
                content: content !== undefined ? content : chart.content,
                file_url: file_url !== undefined ? file_url : chart.file_url,
                updated_at: new Date().toISOString()
            })
            .eq('id', chartId)
            .select()
            .single();

        if (updateError) {
            throw updateError;
        }

        return NextResponse.json({
            success: true,
            chart: updatedChart
        });
    } catch (err: any) {
        return NextResponse.json(
            { error: err.message || 'Failed to update weekly chart' },
            { status: 500 }
        );
    }
}

// DELETE: Delete a weekly chart
export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const token = request.cookies.get('trainer_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const trainer = await validateTrainerSession(token);
        if (!trainer) {
            return NextResponse.json({ error: 'Invalid or expired trainer session' }, { status: 401 });
        }

        const { id } = await context.params;
        const chartId = parseInt(id);
        if (isNaN(chartId)) {
            return NextResponse.json({ error: 'Invalid chart ID' }, { status: 400 });
        }

        // Verify that this chart belongs to a membership assigned to this trainer
        // AND trainer period is active (allows deleting admin-uploaded charts after renewal)
        const { data: chart, error: chartError } = await supabaseAdmin
            .from('weekly_charts')
            .select(`
                id,
                memberships!inner(
                    id,
                    trainer_id,
                    trainer_assigned,
                    trainer_period_end
                )
            `)
            .eq('id', chartId)
            .single();

        if (chartError || !chart || !chart.memberships) {
            return NextResponse.json(
                { error: 'Chart not found' },
                { status: 404 }
            );
        }

        const membership = Array.isArray(chart.memberships) ? chart.memberships[0] : chart.memberships;
        
        // Verify trainer is assigned to this membership
        if (membership.trainer_id !== trainer.id || !membership.trainer_assigned) {
            return NextResponse.json(
                { error: 'You are not assigned as trainer for this membership' },
                { status: 403 }
            );
        }

        // Verify trainer period is active (allows managing charts after renewal)
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

        // Delete the chart
        const { error: deleteError } = await supabaseAdmin
            .from('weekly_charts')
            .delete()
            .eq('id', chartId);

        if (deleteError) {
            throw deleteError;
        }

        return NextResponse.json({
            success: true,
            message: 'Chart deleted successfully'
        });
    } catch (err: any) {
        return NextResponse.json(
            { error: err.message || 'Failed to delete weekly chart' },
            { status: 500 }
        );
    }
}

