import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Use service role to bypass RLS for public display data
const supabase = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Get gym owner information (public endpoint - gets the first active admin)
export async function GET(request: NextRequest) {
    try {
        const { data: owner, error } = await supabase
            .from('admins')
            .select('id, email, full_name, photo_url, phone, bio, specialization, experience')
            .eq('is_active', true)
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
            console.error('Error fetching gym owner:', error);
            throw error;
        }

        // If no owner exists, return default structure
        if (!owner) {
            return NextResponse.json({
                owner: {
                    id: null,
                    full_name: '',
                    photo_url: null,
                    phone: '',
                    email: '',
                    bio: '',
                    specialization: '',
                    experience: ''
                }
            });
        }

        return NextResponse.json({
            owner: {
                id: owner.id,
                full_name: owner.full_name || '',
                photo_url: owner.photo_url || null,
                phone: owner.phone || '',
                email: owner.email || '',
                bio: owner.bio || '',
                specialization: owner.specialization || '',
                experience: owner.experience || ''
            }
        });
    } catch (err: any) {
        console.error('Get gym owner exception:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to fetch gym owner' },
            { status: 500 }
        );
    }
}

