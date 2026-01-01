// ============================================
// FILE: src/lib/trainerAuth.ts
// Trainer authentication utilities
// ============================================

import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    if (process.env.NODE_ENV === 'production') {
        console.error('TrainerAuth: SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL missing. Trainer session functions will fail without server envs.');
    }
}

const serverSupabase = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

const SALT_ROUNDS = 10;
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export interface Trainer {
    id: string;
    name: string;
    phone: string;
    email: string;
    user_id: string | null;
    is_active: boolean;
    photo_url?: string | null;
}

export interface TrainerSession {
    token: string;
    trainer: Trainer;
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
 * Create trainer session
 */
export async function createTrainerSession(trainerId: string): Promise<string> {
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_DURATION);

    const { error } = await serverSupabase
        .from('trainer_sessions')
        .insert({ trainer_id: trainerId, token, expires_at: expiresAt.toISOString() });

    if (error) {
        throw new Error('Failed to create session');
    }

    return token;
}

/**
 * Validate trainer session
 */
export async function validateTrainerSession(token: string): Promise<Trainer | null> {
    try {
        // Try RPC first
        try {
            const { data, error } = await serverSupabase
                .rpc('validate_trainer_session', { session_token: token });

            if (!error && data && Array.isArray(data) && data.length > 0) {
                const trainerData = data[0];
                return {
                    id: trainerData.trainer_id,
                    name: trainerData.name,
                    phone: trainerData.phone,
                    email: trainerData.email,
                    user_id: trainerData.user_id,
                    is_active: true,
                    photo_url: trainerData.photo_url || null
                };
            }
        } catch (rpcErr) {
            if (process.env.NODE_ENV === 'production') {
                console.error('RPC validate_trainer_session threw an error');
            }
        }

        // Fallback: direct table lookups
        const { data: sessionData, error: sessionError } = await serverSupabase
            .from('trainer_sessions')
            .select('trainer_id, expires_at')
            .eq('token', token)
            .single();

        if (sessionError || !sessionData) {
            if (sessionError) console.error('Session lookup error');
            return null;
        }

        if (new Date(sessionData.expires_at) < new Date()) {
            return null;
        }

        const { data: trainerData, error: trainerError } = await serverSupabase
            .from('trainers')
            .select('id, name, phone, email, user_id, is_active, photo_url')
            .eq('id', sessionData.trainer_id)
            .single();

        if (trainerError || !trainerData) {
            if (trainerError) console.error('Trainer lookup error');
            return null;
        }

        if (!trainerData.is_active) {
            return null;
        }

        return {
            id: trainerData.id,
            name: trainerData.name,
            phone: trainerData.phone,
            email: trainerData.email,
            user_id: trainerData.user_id,
            is_active: true,
            photo_url: trainerData.photo_url || null
        };
    } catch (error) {
        console.error('Session validation error:', error);
        return null;
    }
}

/**
 * Delete trainer session (logout)
 */
export async function deleteTrainerSession(token: string): Promise<void> {
    await serverSupabase.from('trainer_sessions').delete().eq('token', token);
}

/**
 * Clean expired sessions
 */
export async function cleanExpiredTrainerSessions(): Promise<void> {
    try {
        await serverSupabase.rpc('clean_expired_trainer_sessions');
    } catch {
        // Fallback: manual cleanup
        const now = new Date().toISOString();
        await serverSupabase.from('trainer_sessions').delete().lt('expires_at', now);
    }
}

