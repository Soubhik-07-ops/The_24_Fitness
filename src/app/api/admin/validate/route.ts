// ============================================
// FILE: src/app/api/admin/validate/route.ts
// Validate admin session endpoint
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { validateAdminSession } from '@/lib/adminAuth';

export async function GET(request: NextRequest) {
    try {
        const token = request.cookies.get('admin_token')?.value;

        if (!token) {
            return NextResponse.json(
                { error: 'No session found' },
                { status: 401 }
            );
        }

        // Validate session (RPC or fallback inside validateAdminSession)
        const admin = await validateAdminSession(token);

        if (!admin) {
            const response = NextResponse.json(
                { error: 'Invalid or expired session' },
                { status: 401 }
            );
            // Clear invalid session cookie
            response.cookies.delete('admin_token');
            return response;
        }

        return NextResponse.json({ admin });
    } catch (error) {
        return NextResponse.json(
            { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}