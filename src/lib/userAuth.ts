// Helper function to validate user authentication and verify user still exists
// This ensures deleted users cannot access the system even if they have a valid token

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

/**
 * Validate user token and verify user still exists in auth.users
 * Returns the user if valid and exists, null otherwise
 */
export async function validateUserAuth(token: string): Promise<{ id: string; email?: string } | null> {
    try {
        // First, verify the token is valid
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        
        if (authError || !user) {
            return null;
        }

        // Double-check: Verify the user still exists in auth.users
        // This is critical - even if getUser succeeds, the user might have been deleted
        // between the token validation and this check
        const { data: { user: verifiedUser }, error: verifyError } = await supabaseAdmin.auth.admin.getUserById(user.id);
        
        if (verifyError || !verifiedUser) {
            // User was deleted - token is no longer valid
            return null;
        }

        return {
            id: verifiedUser.id,
            email: verifiedUser.email
        };
    } catch (error) {
        console.error('Error validating user auth:', error);
        return null;
    }
}

/**
 * Get user from request (checks both Authorization header and cookies)
 * Returns the user if valid and exists, null otherwise
 */
export async function getUserFromRequest(request: Request): Promise<{ id: string; email?: string } | null> {
    try {
        // Get token from Authorization header
        const authHeader = request.headers.get('authorization');
        let token = authHeader?.replace('Bearer ', '');
        
        // If no token in header, try to get from cookies
        if (!token) {
            const { cookies } = await import('next/headers');
            const cookieStore = await cookies();
            token = cookieStore.get('sb-access-token')?.value;
        }
        
        if (!token) {
            return null;
        }

        return await validateUserAuth(token);
    } catch (error) {
        console.error('Error getting user from request:', error);
        return null;
    }
}

