import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTrainerFromRequest } from '@/lib/trainerAuth';
import { logger } from '@/lib/logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-trainer-token',
};

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
}

// Get trainer profile
export async function GET(request: NextRequest) {
    try {
        const trainer = await getTrainerFromRequest(request);
        if (!trainer) {
            return NextResponse.json({ error: 'Not authenticated or session expired' }, { status: 401, headers: corsHeaders });
        }

        return NextResponse.json({
            success: true,
            trainer
        }, { headers: corsHeaders });
    } catch (err: any) {
        logger.error('Get trainer profile error:', err);
        return NextResponse.json(
            { error: 'Failed to fetch profile' },
            { status: 500, headers: corsHeaders }
        );
    }
}

// Update trainer profile
export async function PUT(request: NextRequest) {
    try {
        const trainer = await getTrainerFromRequest(request);
        if (!trainer) {
            return NextResponse.json({ error: 'Not authenticated or session expired' }, { status: 401, headers: corsHeaders });
        }

        const body = await request.json().catch(() => ({}));
        const { name, phone, email, photo_url } = body;

        const resolvedName = (name || trainer.name || '').trim();
        const resolvedPhone = (phone || trainer.phone || '').trim();

        if (!resolvedName || !resolvedPhone) {
            return NextResponse.json({ error: 'Name and phone are required' }, { status: 400, headers: corsHeaders });
        }

        // Check if phone number is already taken by another trainer only if changed
        if (resolvedPhone !== trainer.phone) {
            const { data: existingTrainer } = await supabaseAdmin
                .from('trainers')
                .select('id, phone')
                .eq('phone', resolvedPhone)
                .neq('id', trainer.id)
                .single();

            if (existingTrainer) {
                return NextResponse.json({ error: 'Phone number already in use by another trainer' }, { status: 400, headers: corsHeaders });
            }
        }

        const updateData: any = {
            name: resolvedName,
            phone: resolvedPhone,
            email: email !== undefined ? (email || null) : trainer.email,
            photo_url: photo_url !== undefined ? (photo_url || null) : trainer.photo_url,
            updated_at: new Date().toISOString()
        };

        const { data: updatedTrainer, error: updateError } = await supabaseAdmin
            .from('trainers')
            .update(updateData)
            .eq('id', trainer.id)
            .select('id, name, phone, email, photo_url')
            .single();

        if (updateError) {
            if (updateError.code === '23505') {
                return NextResponse.json({ error: 'Phone number already in use' }, { status: 400, headers: corsHeaders });
            }
            logger.error('Error updating trainer profile:', updateError);
            throw updateError;
        }

        logger.info(`Trainer ${trainer.id} updated their profile`);

        return NextResponse.json({
            success: true,
            trainer: updatedTrainer
        }, { headers: corsHeaders });
    } catch (err: any) {
        logger.error('Update trainer profile error:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to update profile' },
            { status: 500, headers: corsHeaders }
        );
    }
}
