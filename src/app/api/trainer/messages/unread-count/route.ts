import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateTrainerSession } from '@/lib/trainerAuth';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

export async function GET(request: NextRequest) {
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

        // Get unread messages count (messages from users to trainer that haven't been read)
        const { count: unreadMessages, error: unreadError } = await supabaseAdmin
            .from('trainer_messages')
            .select('*', { count: 'exact', head: true })
            .eq('trainer_id', trainer.id)
            .eq('is_trainer', false)
            .is('read_at', null);

        if (unreadError) {
            console.error('Error counting unread messages:', unreadError);
            return NextResponse.json({ count: 0 }, { status: 200 });
        }

        return NextResponse.json({ count: unreadMessages || 0 });
    } catch (error: any) {
        console.error('Error fetching unread count:', error);
        return NextResponse.json({ count: 0 }, { status: 200 });
    }
}

