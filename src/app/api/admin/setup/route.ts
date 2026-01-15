// ============================================
// FILE: src/app/api/admin/setup/route.ts
// One-time setup to create/update admin password
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { hashPassword } from '@/lib/adminAuth';

export async function POST(request: NextRequest) {
    try {
        const { email, password, fullName, setupKey } = await request.json();

        // IMPORTANT: Use a secure setup key (store in .env.local)
        // This prevents unauthorized admin creation
        const ADMIN_SETUP_KEY = process.env.ADMIN_SETUP_KEY;
        
        if (!ADMIN_SETUP_KEY) {
            console.error('ADMIN_SETUP_KEY environment variable is not set');
            return NextResponse.json(
                { error: 'Server configuration error. ADMIN_SETUP_KEY is required.' },
                { status: 500 }
            );
        }

        if (setupKey !== ADMIN_SETUP_KEY) {
            return NextResponse.json(
                { error: 'Invalid setup key' },
                { status: 403 }
            );
        }

        // Hash the password
        const passwordHash = await hashPassword(password);

        // Check if admin exists
        const { data: existingAdmin } = await supabase
            .from('admins')
            .select('id')
            .eq('email', email)
            .single();

        if (existingAdmin) {
            // Update existing admin
            const { error } = await supabase
                .from('admins')
                .update({
                    password_hash: passwordHash,
                    full_name: fullName
                })
                .eq('email', email);

            if (error) throw error;

            return NextResponse.json({
                success: true,
                message: 'Admin password updated'
            });
        } else {
            // Create new admin
            const { error } = await supabase
                .from('admins')
                .insert({
                    email,
                    password_hash: passwordHash,
                    full_name: fullName,
                    role: 'admin'
                });

            if (error) throw error;

            return NextResponse.json({
                success: true,
                message: 'Admin created successfully'
            });
        }
    } catch (error) {
        console.error('Admin setup error:', error);
        return NextResponse.json(
            { error: 'Failed to setup admin' },
            { status: 500 }
        );
    }
}