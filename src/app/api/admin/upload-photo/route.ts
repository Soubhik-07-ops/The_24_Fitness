import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession, getAdminTokenFromRequest } from '@/lib/adminAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-token',
};

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
    try {
        // Authenticate admin session from Bearer header, x-admin-token, or cookie
        const token = getAdminTokenFromRequest(request) || getAdminTokenFromRequest(request);
        if (!token) {
            return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401, headers: corsHeaders });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ success: false, error: 'Invalid or expired admin session' }, { status: 401, headers: corsHeaders });
        }

        // Get form data with file
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const oldImageUrl = formData.get('oldImageUrl') as string | null;
        const type = (formData.get('type') as string) || 'admin'; // 'trainer', 'admin', or 'class'

        if (!file) {
            return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400, headers: corsHeaders });
        }

        if (!['trainer', 'admin', 'class', 'payment-qr'].includes(type)) {
            return NextResponse.json({ success: false, error: 'Invalid type. Must be trainer, admin, class, or payment-qr' }, { status: 400, headers: corsHeaders });
        }

        // Validate file type
        if (!file.type.startsWith('image/')) {
            return NextResponse.json({ success: false, error: 'File must be an image' }, { status: 400, headers: corsHeaders });
        }

        // Validate file size (5MB)
        if (file.size > 5 * 1024 * 1024) {
            return NextResponse.json({ success: false, error: 'File size must be less than 5MB' }, { status: 400, headers: corsHeaders });
        }

        // Determine bucket and folder based on type
        const bucketName = 'class-images';
        let folderPath = '';

        if (type === 'trainer') {
            folderPath = 'trainers/';
        } else if (type === 'admin') {
            folderPath = 'admin/';
        } else if (type === 'payment-qr') {
            folderPath = 'payment-qr/';
        } else {
            folderPath = 'classes/';
        }

        // Delete old image if provided
        if (oldImageUrl) {
            try {
                const urlParts = oldImageUrl.split('/');
                const pathIndex = urlParts.findIndex(part => part === 'class-images');
                if (pathIndex !== -1 && pathIndex < urlParts.length - 1) {
                    const oldPath = urlParts.slice(pathIndex + 1).join('/');
                    await supabaseAdmin.storage.from(bucketName).remove([oldPath]);
                }
            } catch (err) {
                // Continue even if deletion fails
            }
        }

        // Generate unique filename
        const fileExt = file.name.split('.').pop() || 'jpg';
        const fileName = `${folderPath}${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        // Convert File to ArrayBuffer for upload
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Upload using service role (bypasses RLS)
        const { error: uploadError } = await supabaseAdmin.storage
            .from(bucketName)
            .upload(fileName, buffer, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.type
            });

        if (uploadError) {
            return NextResponse.json({ success: false, error: uploadError.message || 'Failed to upload image' }, { status: 500, headers: corsHeaders });
        }

        // Get public URL
        const { data: { publicUrl } } = supabaseAdmin.storage
            .from(bucketName)
            .getPublicUrl(fileName);

        const cacheBustedUrl = `${publicUrl}?t=${Date.now()}`;

        // If uploading an admin photo, also update admins table
        if (type === 'admin' && admin.id) {
            try {
                await supabaseAdmin
                    .from('admins')
                    .update({ photo_url: cacheBustedUrl })
                    .eq('id', admin.id);
            } catch (adminErr) {
                console.warn('[Admin Upload Photo] Non-fatal admin table update warning:', adminErr);
            }
        }

        return NextResponse.json({ success: true, imageUrl: cacheBustedUrl, avatarUrl: cacheBustedUrl }, { status: 200, headers: corsHeaders });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500, headers: corsHeaders });
    }
}
