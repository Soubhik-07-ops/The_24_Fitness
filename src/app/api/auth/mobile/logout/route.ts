import { NextRequest, NextResponse } from 'next/server';
import { deleteAdminSession } from '@/lib/adminAuth';
import { deleteTrainerSession } from '@/lib/trainerAuth';

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        const token = authHeader?.replace('Bearer ', '').trim();

        if (token) {
            await Promise.allSettled([
                deleteAdminSession(token),
                deleteTrainerSession(token)
            ]);
        }

        return NextResponse.json({
            success: true,
            message: 'Session revoked successfully'
        });
    } catch (error: any) {
        console.error('Mobile logout error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to revoke session' },
            { status: 500 }
        );
    }
}
