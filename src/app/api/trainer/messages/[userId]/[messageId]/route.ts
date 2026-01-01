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

// Delete a message
export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ userId: string; messageId: string }> }
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
            const channel = supabaseAdmin.channel(`trainer_messages_${trainer.id}_${userId}`);
            await channel.subscribe();
            await new Promise(resolve => setTimeout(resolve, 100));
            await channel.send({
                type: 'broadcast',
                event: 'message_deleted',
                payload: { messageId }
            });
            await channel.unsubscribe();
        } catch (err) {
            logger.error('Error sending broadcast:', err);
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

