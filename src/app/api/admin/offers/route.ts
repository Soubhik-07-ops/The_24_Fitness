import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

// GET - Fetch all offers
export async function GET(request: NextRequest) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) {
            return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ success: false, error: 'Invalid or expired admin session' }, { status: 401 });
        }

        const { data: offers, error } = await supabaseAdmin
            .from('offers')
            .select('*')
            .order('priority', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, offers: offers || [] }, { status: 200 });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
    }
}

// POST - Create new offer
export async function POST(request: NextRequest) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) {
            return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ success: false, error: 'Invalid or expired admin session' }, { status: 401 });
        }

        const body = await request.json();
        const {
            title,
            description,
            discount_percentage,
            discount_amount,
            offer_type,
            image_url,
            start_date,
            end_date,
            is_active,
            priority,
            applicable_to,
            plan_name
        } = body;

        if (!title || !offer_type) {
            return NextResponse.json({ success: false, error: 'Title and offer type are required' }, { status: 400 });
        }

        const { data: offer, error } = await supabaseAdmin
            .from('offers')
            .insert({
                title,
                description: description || null,
                discount_percentage: discount_percentage || null,
                discount_amount: discount_amount || null,
                offer_type,
                image_url: image_url || null,
                start_date: start_date || null,
                end_date: end_date || null,
                is_active: is_active !== undefined ? is_active : true,
                priority: priority || 0,
                applicable_to: applicable_to || 'all',
                plan_name: plan_name || null,
                created_by: admin.id || null
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        // Audit log
        try {
            await supabaseAdmin.from('admin_audit').insert([{
                admin_id: admin.id,
                action: 'create',
                table_name: 'offers',
                record_id: offer.id,
                payload: JSON.stringify({ title, offer_type }),
                created_at: new Date().toISOString()
            }]);
        } catch (auditErr) {
            // Audit log failure is non-critical
        }

        return NextResponse.json({ success: true, offer }, { status: 201 });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
    }
}

// PUT - Update offer
export async function PUT(request: NextRequest) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) {
            return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ success: false, error: 'Invalid or expired admin session' }, { status: 401 });
        }

        const body = await request.json();
        const { id, ...updateData } = body;

        if (!id) {
            return NextResponse.json({ success: false, error: 'Offer ID is required' }, { status: 400 });
        }

        // Fetch current offer to check if image is being changed
        const { data: currentOffer, error: fetchError } = await supabaseAdmin
            .from('offers')
            .select('image_url')
            .eq('id', id)
            .single();

        if (fetchError) {
            return NextResponse.json({ success: false, error: 'Offer not found' }, { status: 404 });
        }

        // Delete old image from storage if image_url is being removed or changed
        if (currentOffer?.image_url) {
            const newImageUrl = updateData.image_url;
            // If image_url is null/empty or different from current, delete old image
            if (!newImageUrl || newImageUrl !== currentOffer.image_url) {
                try {
                    const urlParts = currentOffer.image_url.split('/');
                    const pathIndex = urlParts.findIndex((part: string) => part === 'class-images');
                    if (pathIndex !== -1 && pathIndex < urlParts.length - 1) {
                        const imagePath = urlParts.slice(pathIndex + 1).join('/');
                        const { error: deleteImageError } = await supabaseAdmin.storage
                            .from('class-images')
                            .remove([imagePath]);

                        if (deleteImageError) {
                            console.warn('Error deleting old offer image during update:', deleteImageError);
                            // Continue with update even if image deletion fails
                        }
                    }
                } catch (imgErr) {
                    console.warn('Error processing image deletion during update:', imgErr);
                    // Continue with update even if image deletion fails
                }
            }
        }

        const { data: offer, error } = await supabaseAdmin
            .from('offers')
            .update({
                ...updateData,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        // Audit log
        try {
            await supabaseAdmin.from('admin_audit').insert([{
                admin_id: admin.id,
                action: 'update',
                table_name: 'offers',
                record_id: id,
                payload: JSON.stringify(updateData),
                created_at: new Date().toISOString()
            }]);
        } catch (auditErr) {
            // Audit log failure is non-critical
        }

        return NextResponse.json({ success: true, offer }, { status: 200 });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
    }
}

// DELETE - Delete offer
export async function DELETE(request: NextRequest) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) {
            return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ success: false, error: 'Invalid or expired admin session' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ success: false, error: 'Offer ID is required' }, { status: 400 });
        }

        // Fetch offer to get image URL before deletion
        const { data: offer, error: fetchError } = await supabaseAdmin
            .from('offers')
            .select('image_url')
            .eq('id', id)
            .single();

        if (fetchError) {
            return NextResponse.json({ success: false, error: 'Offer not found' }, { status: 404 });
        }

        // Delete image from storage if it exists
        if (offer?.image_url) {
            try {
                const urlParts = offer.image_url.split('/');
                const pathIndex = urlParts.findIndex((part: string) => part === 'class-images');
                if (pathIndex !== -1 && pathIndex < urlParts.length - 1) {
                    const imagePath = urlParts.slice(pathIndex + 1).join('/');
                    const { error: deleteImageError } = await supabaseAdmin.storage
                        .from('class-images')
                        .remove([imagePath]);

                    if (deleteImageError) {
                        console.warn('Error deleting offer image from storage:', deleteImageError);
                        // Continue with offer deletion even if image deletion fails
                    }
                }
            } catch (imgErr) {
                console.warn('Error processing image deletion:', imgErr);
                // Continue with offer deletion even if image deletion fails
            }
        }

        // Delete the offer
        const { error } = await supabaseAdmin
            .from('offers')
            .delete()
            .eq('id', id);

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        // Audit log
        try {
            await supabaseAdmin.from('admin_audit').insert([{
                admin_id: admin.id,
                action: 'delete',
                table_name: 'offers',
                record_id: parseInt(id),
                payload: null,
                created_at: new Date().toISOString()
            }]);
        } catch (auditErr) {
            // Audit log failure is non-critical
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
    }
}

