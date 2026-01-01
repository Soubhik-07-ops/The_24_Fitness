import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateTrainerSession } from '@/lib/trainerAuth';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Remove a client (delete all bookings and send notification)
export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ userId: string }> }
) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('trainer_token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const trainer = await validateTrainerSession(token);
        if (!trainer) {
            return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
        }

        const { userId } = await context.params;

        // Get memberships for this user where this trainer is assigned
        // This matches how clients are determined in weekly-charts API
        const { data: userMemberships } = await supabaseAdmin
            .from('memberships')
            .select('id, plan_name, trainer_id, trainer_assigned')
            .eq('user_id', userId)
            .eq('trainer_id', trainer.id)
            .eq('trainer_assigned', true);

        if (!userMemberships || userMemberships.length === 0) {
            return NextResponse.json({ error: 'User is not assigned to this trainer' }, { status: 404 });
        }

        const membershipIds = userMemberships.map(m => m.id);

        // Update memberships table to remove trainer assignment (primary source of truth)
        const { error: updateMembershipError } = await supabaseAdmin
            .from('memberships')
            .update({
                trainer_id: null,
                trainer_assigned: false,
                trainer_period_end: null
            })
            .in('id', membershipIds);

        if (updateMembershipError) {
            logger.error('Update membership error:', updateMembershipError);
            return NextResponse.json({ error: 'Failed to remove trainer assignment' }, { status: 500 });
        }

        // Also delete trainer assignments (for Elite/Premium plans)
        const { data: trainerAssignments } = await supabaseAdmin
            .from('trainer_assignments')
            .select('id')
            .eq('trainer_id', trainer.id)
            .in('membership_id', membershipIds);

        if (trainerAssignments && trainerAssignments.length > 0) {
            const assignmentIds = trainerAssignments.map(a => a.id);
            const { error: deleteAssignmentError } = await supabaseAdmin
                .from('trainer_assignments')
                .delete()
                .in('id', assignmentIds);

            if (deleteAssignmentError) {
                logger.error('Delete trainer assignment error:', deleteAssignmentError);
                // Don't fail - membership update is more important
            }
        }

        // Also delete membership addons (for Basic plan with trainer addon)
        const { data: addons } = await supabaseAdmin
            .from('membership_addons')
            .select('id')
            .eq('trainer_id', trainer.id)
            .eq('addon_type', 'personal_trainer')
            .in('membership_id', membershipIds);

        if (addons && addons.length > 0) {
            const addonIds = addons.map(a => a.id);
            const { error: deleteError } = await supabaseAdmin
                .from('membership_addons')
                .delete()
                .in('id', addonIds);

            if (deleteError) {
                logger.error('Delete client addon error:', deleteError);
                // Don't fail - membership update is more important
            }
            }

            // Send broadcast to message channel if user is in chat window
            try {
                const messageChannel = supabaseAdmin.channel(`trainer_messages_user_${trainer.id}_${userId}`);
                await messageChannel.subscribe();
                await new Promise(resolve => setTimeout(resolve, 100));
                await messageChannel.send({
                    type: 'broadcast',
                    event: 'trainer_removed',
                    payload: {
                        notificationType: 'client_removed'
                    }
                });
                await messageChannel.unsubscribe();
            } catch (msgBroadcastErr) {
                logger.error('Error sending message channel broadcast:', msgBroadcastErr);
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        logger.error('Remove client exception:', err);
        return NextResponse.json(
            { error: 'Failed to remove client' },
            { status: 500 }
        );
    }
}

