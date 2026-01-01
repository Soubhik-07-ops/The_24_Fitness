import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

export async function GET(request: NextRequest) {
    try {
        const { data: trainers, error } = await supabase
            .from('trainers')
            .select('id, name, phone, email, photo_url, specialization, bio, online_training, in_gym_training, price')
            .eq('is_active', true)
            .order('name', { ascending: true });

        if (error) {
            console.error('Error fetching trainers:', error);
            throw error;
        }

        return NextResponse.json({ trainers: trainers || [] });
    } catch (err: any) {
        console.error('Trainers API error:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to fetch trainers' },
            { status: 500 }
        );
    }
}

