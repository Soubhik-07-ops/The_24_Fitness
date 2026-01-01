import { NextRequest, NextResponse } from 'next/server';
import { validateTrainerSession } from '@/lib/trainerAuth';
import { cookies } from 'next/headers';

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

        return NextResponse.json({
            success: true,
            trainer: {
                id: trainer.id,
                name: trainer.name,
                phone: trainer.phone,
                email: trainer.email,
                user_id: trainer.user_id,
                photo_url: trainer.photo_url || null
            }
        });
    } catch (err: any) {
        console.error('Trainer validation error:', err);
        return NextResponse.json({ error: err.message || 'Validation failed' }, { status: 500 });
    }
}

