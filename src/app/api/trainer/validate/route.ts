import { NextRequest, NextResponse } from 'next/server';
import { getTrainerFromRequest } from '@/lib/trainerAuth';

export async function GET(request: NextRequest) {
    try {
        const trainer = await getTrainerFromRequest(request);

        if (!trainer) {
            return NextResponse.json({ error: 'Not authenticated or invalid session' }, { status: 401 });
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

