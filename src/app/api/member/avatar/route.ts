import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
    try {
        let userId = '';
        let mimeType = 'image/jpeg';
        let rawFileName = '';
        let buffer: Buffer | null = null;

        const contentType = request.headers.get('content-type') || '';

        if (contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            userId = (formData.get('userId') as string) || '';
            const file = formData.get('file') as File | null;
            if (file) {
                mimeType = file.type || 'image/jpeg';
                rawFileName = file.name || '';
                const arrayBuffer = await file.arrayBuffer();
                buffer = Buffer.from(arrayBuffer);
            }
        } else {
            const body = await request.json().catch(() => ({}));
            userId = body.userId;
            mimeType = body.mimeType || 'image/jpeg';
            rawFileName = body.fileName;
            const imageBase64 = body.imageBase64;

            if (imageBase64) {
                const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
                buffer = Buffer.from(cleanBase64, 'base64');
            }
        }

        if (!userId) {
            return NextResponse.json(
                { success: false, error: 'User ID is required.' },
                { status: 400, headers: corsHeaders }
            );
        }

        if (!buffer || buffer.length === 0) {
            return NextResponse.json(
                { success: false, error: 'Image data is required.' },
                { status: 400, headers: corsHeaders }
            );
        }

        // Enforce 5MB limit
        if (buffer.length > 5 * 1024 * 1024) {
            return NextResponse.json(
                { success: false, error: 'File size too large. Please select an image under 5MB.' },
                { status: 400, headers: corsHeaders }
            );
        }

        // 1. Delete existing avatar if one exists
        try {
            const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('avatar_url')
                .eq('id', userId)
                .maybeSingle();

            if (profile?.avatar_url) {
                const cleanUrl = profile.avatar_url.split('?')[0];
                const urlParts = cleanUrl.split('/');
                const oldFileName = urlParts[urlParts.length - 1];
                if (oldFileName) {
                    await supabaseAdmin.storage.from('avatars').remove([`${userId}/${oldFileName}`]);
                }
            }
        } catch (cleanupErr) {
            console.warn('[Avatar API] Failed to purge old avatar:', cleanupErr);
        }

        // 2. Upload new avatar using service role
        const ext = rawFileName ? rawFileName.split('.').pop() || 'jpg' : 'jpg';
        const newFileName = `${userId}/${Date.now()}.${ext}`;

        const { error: uploadError } = await supabaseAdmin.storage
            .from('avatars')
            .upload(newFileName, buffer, {
                contentType: mimeType,
                cacheControl: '3600',
                upsert: true,
            });

        if (uploadError) {
            return NextResponse.json(
                { success: false, error: `Failed to upload photo: ${uploadError.message}` },
                { status: 500, headers: corsHeaders }
            );
        }

        // 3. Obtain public URL and append cache-busting timestamp
        const { data: { publicUrl } } = supabaseAdmin.storage
            .from('avatars')
            .getPublicUrl(newFileName);

        const cacheBustedUrl = `${publicUrl}?t=${Date.now()}`;

        // 4. Update profile in database
        const { error: updateError } = await supabaseAdmin
            .from('profiles')
            .update({
                avatar_url: cacheBustedUrl,
                updated_at: new Date().toISOString(),
            })
            .eq('id', userId);

        // Also update trainers table if this user is a trainer
        try {
            await supabaseAdmin
                .from('trainers')
                .update({ photo_url: cacheBustedUrl })
                .or(`id.eq.${userId},user_id.eq.${userId}`);
        } catch (trainerErr: any) {
            console.warn('[Avatar API] Non-fatal trainer photo update warning:', trainerErr?.message);
        }

        // Also update admins table if this user is an admin
        try {
            await supabaseAdmin
                .from('admins')
                .update({ photo_url: cacheBustedUrl })
                .eq('id', userId);
        } catch (adminErr: any) {
            console.warn('[Avatar API] Non-fatal admin photo update warning:', adminErr?.message);
        }

        if (updateError) {
            const { data: trainerCheck } = await supabaseAdmin
                .from('trainers')
                .select('id')
                .or(`id.eq.${userId},user_id.eq.${userId}`)
                .maybeSingle();

            const { data: adminCheck } = await supabaseAdmin
                .from('admins')
                .select('id')
                .eq('id', userId)
                .maybeSingle();

            if (!trainerCheck && !adminCheck) {
                return NextResponse.json(
                    { success: false, error: `Failed to save photo URL: ${updateError.message}` },
                    { status: 500, headers: corsHeaders }
                );
            }
        }

        return NextResponse.json(
            { success: true, avatarUrl: cacheBustedUrl },
            { headers: corsHeaders }
        );
    } catch (err: any) {
        console.error('[Avatar API] POST Exception:', err);
        return NextResponse.json(
            { success: false, error: err.message || 'Internal server error processing avatar upload.' },
            { status: 500, headers: corsHeaders }
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));
        const url = new URL(request.url);
        const userId = body.userId || url.searchParams.get('userId');

        if (!userId) {
            return NextResponse.json(
                { success: false, error: 'User ID is required.' },
                { status: 400, headers: corsHeaders }
            );
        }

        // 1. Purge file from storage
        try {
            const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('avatar_url')
                .eq('id', userId)
                .maybeSingle();

            if (profile?.avatar_url) {
                const cleanUrl = profile.avatar_url.split('?')[0];
                const urlParts = cleanUrl.split('/');
                const fileName = urlParts[urlParts.length - 1];
                if (fileName) {
                    await supabaseAdmin.storage.from('avatars').remove([`${userId}/${fileName}`]);
                }
            }
        } catch (cleanupErr) {
            console.warn('[Avatar API] Failed to purge storage file:', cleanupErr);
        }

        // 2. Set profile avatar_url to null
        await supabaseAdmin
            .from('profiles')
            .update({
                avatar_url: null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', userId);

        // 3. Clear in trainers table
        try {
            await supabaseAdmin
                .from('trainers')
                .update({ photo_url: null })
                .or(`id.eq.${userId},user_id.eq.${userId}`);
        } catch (trainerErr: any) {
            console.warn('[Avatar API] Non-fatal trainer photo clear warning:', trainerErr?.message);
        }

        // 4. Clear in admins table
        try {
            await supabaseAdmin
                .from('admins')
                .update({ photo_url: null })
                .eq('id', userId);
        } catch (adminErr: any) {
            console.warn('[Avatar API] Non-fatal admin photo clear warning:', adminErr?.message);
        }

        return NextResponse.json(
            { success: true },
            { headers: corsHeaders }
        );
    } catch (err: any) {
        console.error('[Avatar API] DELETE Exception:', err);
        return NextResponse.json(
            { success: false, error: err.message || 'Internal server error removing avatar.' },
            { status: 500, headers: corsHeaders }
        );
    }
}
