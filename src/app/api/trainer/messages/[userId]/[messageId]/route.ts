import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTrainerFromRequest } from '@/lib/trainerAuth';
import { logger } from '@/lib/logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Delete a message
export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ userId: string; messageId: string }> }
) {
    try {
        const trainer = await getTrainerFromRequest(request);
        if (!trainer) {
            return NextResponse.json({ error: 'Not authenticated or invalid session' }, { status: 401 });
        }

        const { userId, messageId } = await context.params;

        // Verify the message belongs to this trainer and user
        const { data: message, error: fetchError } = await supabaseAdmin
            .from('trainer_messages')
            .select('id, trainer_id, user_id')
            .eq('id', messageId)
            .eq('trainer_id', trainer.id)
            .eq('user_id', userId)
            .single();

        if (fetchError || !message) {
            return NextResponse.json({ error: 'Message not found or unauthorized' }, { status: 404 });
        }

        // Delete the message
        const { error: deleteError } = await supabaseAdmin
            .from('trainer_messages')
            .delete()
            .eq('id', messageId);

        if (deleteError) {
            logger.error('Delete trainer message error:', deleteError);
            return NextResponse.json({ error: 'Failed to delete message' }, { status: 500 });
        }

        // Send broadcast to refresh messages in both trainer and user chat
        try {
            const payload = { messageId };
            const ch1 = supabaseAdmin.channel(`trainer_messages_${trainer.id}_${userId}`);
            await ch1.subscribe();
            await new Promise(resolve => setTimeout(resolve, 50));
            await ch1.send({ type: 'broadcast', event: 'message_deleted', payload });
            await ch1.unsubscribe();

            const ch2 = supabaseAdmin.channel(`trainer_messages_user_${trainer.id}_${userId}`);
            await ch2.subscribe();
            await new Promise(resolve => setTimeout(resolve, 50));
            await ch2.send({ type: 'broadcast', event: 'message_deleted', payload });
            await ch2.unsubscribe();
        } catch (err) {
            logger.error('Error sending message_deleted broadcast:', err);
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        logger.error('Delete trainer message exception:', err);
        return NextResponse.json(
            { error: 'Failed to delete message' },
            { status: 500 }
        );
    }
}

