import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateTrainerSession } from '@/lib/trainerAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

export async function POST(request: NextRequest) {
    try {
        // Authenticate trainer session from cookie
        const token = request.cookies.get('trainer_token')?.value;
        if (!token) {
            return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
        }

        const trainer = await validateTrainerSession(token);
        if (!trainer) {
            return NextResponse.json({ success: false, error: 'Invalid or expired trainer session' }, { status: 401 });
        }

        // Get form data with file
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const oldImageUrl = formData.get('oldImageUrl') as string | null;

        if (!file) {
            return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
        }

        // Validate file type (images and PDFs)
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json({ success: false, error: 'File must be an image (JPEG, PNG, WebP, GIF) or PDF' }, { status: 400 });
        }

        // Validate file size (10MB)
        if (file.size > 10 * 1024 * 1024) {
            return NextResponse.json({ success: false, error: 'File size must be less than 10MB' }, { status: 400 });
        }

        // Delete old image if provided
        if (oldImageUrl) {
            try {
                // Extract path from URL
                const urlParts = oldImageUrl.split('/');
                const pathIndex = urlParts.findIndex((part: string) => part === 'weekly-charts');
                if (pathIndex !== -1 && pathIndex < urlParts.length - 1) {
                    const oldPath = urlParts.slice(pathIndex + 1).join('/');
                    await supabaseAdmin.storage.from('weekly-charts').remove([oldPath]);
                }
            } catch (err) {
                // Continue even if deletion fails
            }
        }

        // Generate unique filename
        const fileExt = file.name.split('.').pop();
        const fileName = `weekly-charts/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        // Convert File to ArrayBuffer for upload
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Upload using service role (bypasses RLS)
        const { error: uploadError } = await supabaseAdmin.storage
            .from('weekly-charts')
            .upload(fileName, buffer, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.type
            });

        if (uploadError) {
            return NextResponse.json({ success: false, error: uploadError.message || 'Failed to upload file' }, { status: 500 });
        }

        // Get public URL
        const { data: { publicUrl } } = supabaseAdmin.storage
            .from('weekly-charts')
            .getPublicUrl(fileName);

        return NextResponse.json({ success: true, fileUrl: publicUrl }, { status: 200 });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
    }
}

