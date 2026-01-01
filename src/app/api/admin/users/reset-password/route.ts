import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase URL or Service Role Key is missing');
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Generate random password (10 characters with mix of uppercase, lowercase, numbers, special chars)
function generateRandomPassword(): string {
    const length = 10; // Fixed length: 10 characters
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%&*';
    const allChars = uppercase + lowercase + numbers + special;
    
    let password = '';
    
    // Ensure at least one of each type
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];
    
    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
}

export async function POST(request: NextRequest) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });
        }

        const { userId } = await request.json();

        if (!userId || typeof userId !== 'string') {
            return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
        }

        // Generate random temporary password
        const temporaryPassword = generateRandomPassword();

        // Update user password using Supabase Admin API
        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
            userId,
            { password: temporaryPassword }
        );

        if (error) {
            console.error('Error resetting password:', error);
            return NextResponse.json(
                { error: error.message || 'Failed to reset password' },
                { status: 500 }
            );
        }

        if (!data.user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Create notification for user about password reset
        try {
            await supabaseAdmin
                .from('notifications')
                .insert({
                    user_id: userId,
                    title: 'Password Reset by Admin',
                    message: 'Your password has been reset by admin. Please login with the temporary password provided and change it immediately from Profile → Change Password.',
                    type: 'info',
                    read: false
                });
        } catch (notifError) {
            // Don't fail if notification creation fails
            console.error('Failed to create notification:', notifError);
        }

        return NextResponse.json({
            success: true,
            temporaryPassword: temporaryPassword,
            message: 'Password reset successfully. Share the temporary password with the user.'
        });

    } catch (err: any) {
        console.error('Password reset error:', err);
        return NextResponse.json(
            { error: err.message || 'Internal server error' },
            { status: 500 }
        );
    }
}

