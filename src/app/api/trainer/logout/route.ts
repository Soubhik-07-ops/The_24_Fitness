import { NextRequest, NextResponse } from 'next/server';
import { deleteTrainerSession } from '@/lib/trainerAuth';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('trainer_token')?.value;

        if (token) {
            await deleteTrainerSession(token);
        }

        cookieStore.delete('trainer_token');

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error('Trainer logout error:', err);
        return NextResponse.json({ error: err.message || 'Logout failed' }, { status: 500 });
    }
}

