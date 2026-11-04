// ============================================
// FILE: src/app/api/admin/logout/route.ts
// Admin logout endpoint
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { deleteAdminSession, getAdminTokenFromRequest } from '@/lib/adminAuth';

export async function POST(request: NextRequest) {
    try {
        const token = getAdminTokenFromRequest(request);

        if (!token) {
            return NextResponse.json(
                { error: 'No session found' },
                { status: 401 }
            );
        }

        await deleteAdminSession(token);

        const response = NextResponse.json({ success: true });
        response.cookies.delete('admin_token');

        return response;
    } catch (error) {
        console.error('Admin logout error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}