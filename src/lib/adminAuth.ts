// ============================================
// FILE: src/lib/adminAuth.ts
// Admin authentication utilities
// ============================================

import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

// Create a server-side supabase client using the service role key for admin session ops.
// This file is intended to be used from server-only routes (login/validate/logout).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    // In production we should surface a clear error if envs are missing.
    if (process.env.NODE_ENV === 'production') {
        console.error('AdminAuth: SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL missing. Admin session functions will fail without server envs.');
    }
    // In non-production (dev/test) keep silent to avoid noisy logs; missing envs should be fixed by deploy configs.
}

const serverSupabase = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

const SALT_ROUNDS = 10;
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export interface Admin {
    id: string;
    email: string;
    full_name: string | null;
    role: 'admin' | 'super_admin';
    is_active: boolean;
}

export interface AdminSession {
    token: string;
    admin: Admin;
    expires_at: string;
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

/**
 * Generate a secure session token
 */
function generateSessionToken(): string {
    return crypto.randomUUID();
}

/**
 * Create admin session
 */
export async function createAdminSession(adminId: string): Promise<string> {
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_DURATION);

    const { error } = await serverSupabase
        .from('admin_sessions')
        .insert({ admin_id: adminId, token, expires_at: expiresAt.toISOString() });

    if (error) {
        throw new Error('Failed to create session');
    }

    return token;
}

/**
 * Extracts admin token from request:
 * 1. Authorization: Bearer <token>
 * 2. x-admin-token: <token>
 * 3. Cookie: admin_token=<token>
 * 4. URL query: ?admin_token=<token>
 */
export function getAdminTokenFromRequest(request: any): string | null {
    if (!request) return null;

    // 1. Authorization header: Bearer <token>
    try {
        const authHeader = request.headers?.get
            ? (request.headers.get('authorization') || request.headers.get('Authorization'))
            : null;
        if (authHeader) {
            const parts = authHeader.split(' ');
            if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
                const t = parts[1].trim();
                if (t) return t;
            }
            if (parts.length === 1 && parts[0].trim()) {
                return parts[0].trim();
            }
        }
    } catch {}

    // 2. Custom header: x-admin-token
    try {
        const customHeader = request.headers?.get ? request.headers.get('x-admin-token') : null;
        if (customHeader && customHeader.trim()) {
            return customHeader.trim();
        }
    } catch {}

    // 3. Cookie from NextRequest: request.cookies.get('admin_token')
    try {
        if (request.cookies?.get) {
            const cookieVal = request.cookies.get('admin_token')?.value;
            if (cookieVal && cookieVal.trim()) {
                return cookieVal.trim();
            }
        }
    } catch {}

    // 4. Raw cookie header fallback
    try {
        const rawCookies = request.headers?.get ? request.headers.get('cookie') : null;
        if (rawCookies) {
            const match = rawCookies.match(/(?:^|;\s*)admin_token=([^;]+)/);
            if (match && match[1]) {
                return decodeURIComponent(match[1].trim());
            }
        }
    } catch {}

    // 5. URL query parameter fallback
    try {
        if (request.url) {
            const url = new URL(request.url);
            const queryToken = url.searchParams.get('admin_token');
            if (queryToken && queryToken.trim()) {
                return queryToken.trim();
            }
        }
    } catch {}

    return null;
}

/**
 * Validate admin session
 */
export async function validateAdminSession(token: string): Promise<Admin | null> {
    try {
        // Preferred path: call DB RPC if it exists
        try {
            const { data, error } = await serverSupabase
                .rpc('validate_admin_session', { session_token: token });

            if (!error && data && Array.isArray(data) && data.length > 0) {
                const adminData = data[0];
                return {
                    id: adminData.admin_id,
                    email: adminData.email,
                    role: adminData.role,
                    full_name: adminData.full_name,
                    is_active: true
                };
            }

            // If RPC returned no data, fall through to fallback lookup
            // If the RPC returned no data or produced an error, fall through to fallback lookup.
        } catch (rpcErr) {
            // Ignore RPC errors here and run the fallback lookup. Avoid verbose logging in production.
            if (process.env.NODE_ENV === 'production') {
                console.error('RPC validate_admin_session threw an error');
            }
        }

        // Fallback: direct table lookups (works when RPC is not present)
        const { data: sessionData, error: sessionError } = await serverSupabase
            .from('admin_sessions')
            .select('admin_id, expires_at')
            .eq('token', token)
            .single();

        if (sessionError || !sessionData) {
            // Session not found or DB error -- treat as unauthenticated.
            if (sessionError) console.error('Session lookup error');
            return null;
        }

        if (new Date(sessionData.expires_at) < new Date()) {
            // Expired session: normal flow, no error log to avoid noise.
            return null;
        }

        const { data: adminData, error: adminError } = await serverSupabase
            .from('admins')
            .select('id, email, full_name, role, is_active')
            .eq('id', sessionData.admin_id)
            .single();

        if (adminError || !adminData) {
            if (adminError) console.error('Admin lookup error');
            return null;
        }

        if (!adminData.is_active) {
            // Inactive account: do not log as an error to avoid leaking account state; treat as unauthenticated.
            return null;
        }

        return {
            id: adminData.id,
            email: adminData.email,
            role: adminData.role as 'admin' | 'super_admin',
            full_name: adminData.full_name,
            is_active: true
        };
    } catch (error) {
        console.error('Session validation error:', error);
        return null;
    }
}

/**
 * Delete admin session (logout)
 */
export async function deleteAdminSession(token: string): Promise<void> {
    await serverSupabase.from('admin_sessions').delete().eq('token', token);
}

/**
 * Clean expired sessions
 */
export async function cleanExpiredSessions(): Promise<void> {
    await serverSupabase.rpc('clean_expired_admin_sessions');
}