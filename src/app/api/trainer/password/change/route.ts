import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateTrainerSession, verifyPassword, hashPassword } from '@/lib/trainerAuth';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Change trainer password
export async function POST(request: NextRequest) {
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

        const body = await request.json();
        const { currentPassword, newPassword } = body;

        if (!currentPassword || !newPassword) {
            return NextResponse.json({ error: 'Current password and new password are required' }, { status: 400 });
        }

        if (newPassword.length < 8) {
            return NextResponse.json({ error: 'New password must be at least 8 characters long' }, { status: 400 });
        }

        // Get current password hash
        const { data: trainerData, error: fetchError } = await supabaseAdmin
            .from('trainers')
            .select('password_hash')
            .eq('id', trainer.id)
            .single();

        if (fetchError || !trainerData) {
            logger.error('Error fetching trainer data:', fetchError);
            return NextResponse.json({ error: 'Failed to fetch trainer data' }, { status: 500 });
        }

        if (!trainerData.password_hash) {
            return NextResponse.json({ error: 'No password set. Please contact admin.' }, { status: 400 });
        }

        // Verify current password
        const isCurrentPasswordValid = await verifyPassword(currentPassword, trainerData.password_hash);
        if (!isCurrentPasswordValid) {
            return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
        }

        // Hash new password
        const newPasswordHash = await hashPassword(newPassword);

        // Update password
        const { error: updateError } = await supabaseAdmin
            .from('trainers')
            .update({ password_hash: newPasswordHash })
            .eq('id', trainer.id);

        if (updateError) {
            logger.error('Error updating password:', updateError);
            return NextResponse.json({ error: 'Failed to update password' }, { status: 500 });
        }

        logger.info(`Trainer ${trainer.name} changed their password`);

        return NextResponse.json({ success: true, message: 'Password changed successfully' });
    } catch (err: any) {
        logger.error('Change password exception:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to change password' },
            { status: 500 }
        );
    }
}

