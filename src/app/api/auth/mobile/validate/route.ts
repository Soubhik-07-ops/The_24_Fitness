import { NextRequest, NextResponse } from 'next/server';
import { validateAdminSession } from '@/lib/adminAuth';
import { validateTrainerSession } from '@/lib/trainerAuth';

export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        const token = authHeader?.replace('Bearer ', '').trim();

        if (!token) {
            return NextResponse.json(
                { valid: false, error: 'No authorization token provided' },
                { status: 401 }
            );
        }

        // 1. Try validating as admin
        try {
            const admin = await validateAdminSession(token);
            if (admin && admin.is_active) {
                return NextResponse.json({
                    valid: true,
                    role: 'ADMIN',
                    user: {
                        id: admin.id,
                        role: 'ADMIN',
                        fullName: admin.full_name || 'System Admin',
                        email: admin.email || '',
                        gender: 'MALE',
                        joinedDate: new Date().toISOString()
                    }
                });
            }
        } catch (err) {
            // Fall through to trainer validation
        }

        // 2. Try validating as trainer
        try {
            const trainer = await validateTrainerSession(token);
            if (trainer && trainer.is_active) {
                return NextResponse.json({
                    valid: true,
                    role: 'TRAINER',
                    user: {
                        id: trainer.id,
                        role: 'TRAINER',
                        fullName: trainer.name || 'Trainer',
                        email: trainer.email || '',
                        phone: trainer.phone || '',
                        gender: 'MALE',
                        avatarUrl: trainer.photo_url || undefined,
                        joinedDate: new Date().toISOString()
                    }
                });
            }
        } catch (err) {
            // Fall through to invalid
        }

        return NextResponse.json(
            { valid: false, error: 'Session expired or invalid' },
            { status: 401 }
        );
    } catch (error: any) {
        console.error('Mobile token validation error:', error);
        return NextResponse.json(
            { valid: false, error: 'Internal validation error' },
            { status: 500 }
        );
    }
}
