/**
 * Invoice Generation API
 * Generates invoice PDF after payment approval
 * Called internally by approval flows (not directly by clients)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';
import { generateInvoicePDF, generateInvoiceNumber, type InvoiceData } from '@/lib/invoiceGenerator';
import { getAdminSetting } from '@/lib/adminSettings';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

interface GenerateInvoiceRequest {
    paymentId: number;
    membershipId: number;
    invoiceType?: 'initial' | 'renewal' | 'trainer_renewal'; // Optional - will use payment_purpose if not provided
    adminEmail: string;
}

/**
 * Generate invoice PDF and store in database
 */
export async function POST(request: NextRequest) {
    try {
        const body: GenerateInvoiceRequest = await request.json();
        const { paymentId, membershipId, invoiceType, adminEmail } = body;

        // Validate required fields (invoiceType is optional - will use payment_purpose if not provided)
        if (!paymentId || !membershipId || !adminEmail) {
            return NextResponse.json(
                { error: 'Missing required fields: paymentId, membershipId, adminEmail' },
                { status: 400 }
            );
        }

        // Get payment details
        const { data: payment, error: paymentError } = await supabaseAdmin
            .from('membership_payments')
            .select('*')
            .eq('id', paymentId)
            .single();

        if (paymentError || !payment) {
            console.error('[INVOICE] Payment not found:', { paymentId, error: paymentError });
            return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
        }

        // Verify payment is verified (required for invoice generation)
        if (payment.status !== 'verified') {
            console.error('[INVOICE] Payment not verified:', { paymentId, status: payment.status });
            return NextResponse.json(
                { error: `Payment is not verified. Current status: ${payment.status}. Invoice can only be generated for verified payments.` },
                { status: 400 }
            );
        }

        // Determine invoice type from payment_purpose (explicit intent) or fallback to provided invoiceType
        // payment_purpose is the source of truth set at payment creation time
        let finalInvoiceType: 'initial' | 'renewal' | 'trainer_renewal';
        
        if (payment.payment_purpose) {
            // Use explicit payment_purpose from payment record (primary source of truth)
            if (payment.payment_purpose === 'initial_purchase') {
                finalInvoiceType = 'initial';
            } else if (payment.payment_purpose === 'membership_renewal') {
                finalInvoiceType = 'renewal';
            } else if (payment.payment_purpose === 'trainer_renewal') {
                finalInvoiceType = 'trainer_renewal';
            } else {
                // Invalid payment_purpose - fallback to provided invoiceType or default
                console.warn(`[INVOICE] Invalid payment_purpose '${payment.payment_purpose}' for payment ${paymentId}. Using fallback invoiceType.`);
                finalInvoiceType = invoiceType || 'initial';
            }
        } else {
            // payment_purpose not set - use provided invoiceType or default
            // This handles legacy payments created before payment_purpose was introduced
            if (invoiceType) {
                finalInvoiceType = invoiceType;
            } else {
                console.warn(`[INVOICE] No payment_purpose and no invoiceType provided for payment ${paymentId}. Defaulting to 'initial'.`);
                finalInvoiceType = 'initial';
            }
        }

        // Check if invoice already exists (idempotency)
        const { data: existingInvoice } = await supabaseAdmin
            .from('invoices')
            .select('id, invoice_number, file_url')
            .eq('payment_id', paymentId)
            .single();

        if (existingInvoice) {
            return NextResponse.json({
                success: true,
                invoice: {
                    id: existingInvoice.id,
                    invoiceNumber: existingInvoice.invoice_number,
                    fileUrl: existingInvoice.file_url
                },
                message: 'Invoice already exists'
            });
        }

        // Get membership details
        const { data: membership, error: membershipError } = await supabaseAdmin
            .from('memberships')
            .select('*')
            .eq('id', membershipId)
            .single();

        if (membershipError || !membership) {
            return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
        }

        // Get user profile
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('full_name, email, phone')
            .eq('id', membership.user_id)
            .single();

        if (profileError || !profile) {
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }

        // Get gym settings
        const gymName = await getAdminSetting('gym_name', 'THE 24 FITNESS GYM');
        const gymAddress = await getAdminSetting('gym_address', 'Digwadih No. 10, near Gobinda sweets, Old SBI Building');
        const contactEmail = await getAdminSetting('contact_email', 'The24fitness8055@gmail.com');
        const contactPhone = await getAdminSetting('contact_phone', '8084548055');

        // Get addons for this payment
        // PRODUCTION-READY: Use explicit references stored in trainer assignment metadata
        // This eliminates timing-based matching and ensures reliable addon lookup
        const paymentDate = new Date(payment.created_at);
        const paymentAmount = parseFloat(payment.amount) || 0;
        let addons: any[] | null = null;

        // For trainer renewals, use explicit reference from trainer assignment metadata
        if (finalInvoiceType === 'trainer_renewal') {
            console.log('[INVOICE] Trainer renewal detected - using explicit reference lookup...', {
                paymentId,
                membershipId
            });

            // Step 1: Find trainer assignment that references this payment_id in metadata
            const { data: trainerAssignments } = await supabaseAdmin
                .from('trainer_assignments')
                .select('id, metadata, trainer_id')
                .eq('membership_id', membershipId)
                .eq('assignment_type', 'addon')
                .in('status', ['assigned', 'pending']);

            // Find assignment with this payment_id in metadata
            const matchingAssignment = trainerAssignments?.find((assignment: any) => {
                const metadata = assignment.metadata;
                if (metadata && typeof metadata === 'object') {
                    return metadata.payment_id === paymentId;
                }
                return false;
            });

            if (matchingAssignment && matchingAssignment.metadata) {
                const metadata = matchingAssignment.metadata;
                const addonId = metadata.addon_id;

                if (addonId) {
                    console.log('[INVOICE] Found explicit addon reference in assignment metadata:', {
                        assignmentId: matchingAssignment.id,
                        addonId
                    });

                    // Step 2: Fetch addon directly using explicit addon_id
                    const { data: explicitAddon, error: addonError } = await supabaseAdmin
                        .from('membership_addons')
                        .select('*, trainers(name)')
                        .eq('id', addonId)
                        .eq('membership_id', membershipId)
                        .single();

                    if (!addonError && explicitAddon) {
                        console.log('[INVOICE] Successfully fetched addon using explicit reference:', {
                            addonId: explicitAddon.id,
                            addonType: explicitAddon.addon_type,
                            price: explicitAddon.price
                        });
                        addons = [explicitAddon];
                    } else {
                        console.warn('[INVOICE] Addon not found using explicit reference, falling back to time-window matching:', {
                            addonId,
                            error: addonError?.message
                        });
                    }
                }
            }

            // Fallback: If explicit reference not found, use time-window matching (backward compatibility)
            if (!addons || addons.length === 0) {
                console.log('[INVOICE] Explicit reference not found, using time-window matching fallback...');
                const windowStart = new Date(paymentDate.getTime() - 5 * 60 * 1000);
                const windowEnd = new Date(paymentDate.getTime() + 5 * 60 * 1000);

                const { data: timeWindowAddons } = await supabaseAdmin
                    .from('membership_addons')
                    .select('*, trainers(name)')
                    .eq('membership_id', membershipId)
                    .eq('addon_type', 'personal_trainer')
                    .in('status', ['active', 'pending'])
                    .gte('created_at', windowStart.toISOString())
                    .lte('created_at', windowEnd.toISOString())
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (timeWindowAddons && timeWindowAddons.length > 0) {
                    console.log('[INVOICE] Found addon using time-window matching:', timeWindowAddons[0].id);
                    addons = timeWindowAddons;
                } else {
                    // Last resort: Find by payment amount match
                    const { data: allTrainerAddons } = await supabaseAdmin
                        .from('membership_addons')
                        .select('*, trainers(name)')
                        .eq('membership_id', membershipId)
                        .eq('addon_type', 'personal_trainer')
                        .in('status', ['active', 'pending'])
                        .order('created_at', { ascending: false })
                        .limit(10);

                    if (allTrainerAddons && allTrainerAddons.length > 0) {
                        const matchingAddon = allTrainerAddons.find((addon: any) => {
                            const addonPrice = parseFloat(addon.price?.toString() || '0');
                            return Math.abs(addonPrice - paymentAmount) <= 10;
                        });

                        if (matchingAddon) {
                            console.log('[INVOICE] Found addon using amount matching:', matchingAddon.id);
                            addons = [matchingAddon];
                        } else {
                            console.log('[INVOICE] Using most recent trainer addon as last resort:', allTrainerAddons[0].id);
                            addons = [allTrainerAddons[0]];
                        }
                    }
                }
            }
        } else {
            // For other invoice types (initial purchase, membership renewal), use time-window matching
            const windowStart = new Date(paymentDate.getTime() - 5 * 60 * 1000);
            const windowEnd = new Date(paymentDate.getTime() + 5 * 60 * 1000);

            const { data: timeWindowAddons } = await supabaseAdmin
                .from('membership_addons')
                .select('*, trainers(name)')
                .eq('membership_id', membershipId)
                .gte('created_at', windowStart.toISOString())
                .lte('created_at', windowEnd.toISOString());

            if (timeWindowAddons && timeWindowAddons.length > 0) {
                addons = timeWindowAddons;
            } else {
                // Fallback: Get most recent addons
                const { data: recentAddons } = await supabaseAdmin
                    .from('membership_addons')
                    .select('*, trainers(name)')
                    .eq('membership_id', membershipId)
                    .in('status', ['active', 'pending'])
                    .order('created_at', { ascending: false })
                    .limit(5);

                if (recentAddons && recentAddons.length > 0) {
                    addons = recentAddons;
                }
            }
        }
        
        console.log('[INVOICE] Final addons selected:', {
            count: addons?.length || 0,
            addons: addons?.map((a: any) => ({
                id: a.id,
                type: a.addon_type,
                price: a.price,
                trainerName: a.trainers?.name
            }))
        });

        // Calculate amounts
        const basePlanAmount = parseFloat(payment.amount) || 0;
        let addonAmount = 0;
        const addonsBreakdown: Array<{ type: string; name: string; price: number }> = [];

        if (addons && addons.length > 0) {
            addons.forEach((addon: any) => {
                const addonPrice = parseFloat(addon.price?.toString() || '0');
                addonAmount += addonPrice;

                let addonName = '';
                if (addon.addon_type === 'personal_trainer') {
                    addonName = addon.trainers?.name 
                        ? `Personal Trainer - ${addon.trainers.name}`
                        : 'Personal Trainer';
                } else if (addon.addon_type === 'in_gym') {
                    addonName = 'In-Gym Access';
                } else {
                    addonName = addon.addon_type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
                }

                addonsBreakdown.push({
                    type: addon.addon_type,
                    name: addonName,
                    price: addonPrice
                });
            });
        }

        // For membership renewals/initial, base plan amount should be membership price
        // For trainer renewals, base plan amount is 0 (all amount is addon)
        let actualBaseAmount = basePlanAmount;
        if (finalInvoiceType === 'trainer_renewal') {
            actualBaseAmount = 0;
            // All amount is addon (trainer)
        } else {
            // Membership payment: base = total - addons
            actualBaseAmount = basePlanAmount - addonAmount;
            if (actualBaseAmount < 0) actualBaseAmount = 0;
        }

        // Get trainer details if applicable
        // For trainer renewals, prioritize trainer from addon; otherwise use membership trainer_id
        let trainerName: string | undefined;
        let trainerPeriodEnd: string | undefined;

        if (finalInvoiceType === 'trainer_renewal') {
            // For trainer renewals, get trainer from the addon
            const trainerAddon = addons?.find((a: any) => a.addon_type === 'personal_trainer');
            if (trainerAddon) {
                trainerName = trainerAddon.trainers?.name;
                
                // Get trainer period end from trainer assignment
                // PRODUCTION-READY: Use explicit reference from assignment metadata for reliable lookup
                if (trainerAddon.trainer_id) {
                    // First, try to find assignment using explicit payment_id reference in metadata
                    const { data: explicitAssignments } = await supabaseAdmin
                        .from('trainer_assignments')
                        .select('period_end, created_at, metadata')
                        .eq('membership_id', membershipId)
                        .eq('trainer_id', trainerAddon.trainer_id)
                        .eq('assignment_type', 'addon')
                        .in('status', ['assigned', 'pending']);

                    // Find assignment with this payment_id in metadata
                    let trainerAssignment = explicitAssignments?.find((assignment: any) => {
                        const metadata = assignment.metadata;
                        if (metadata && typeof metadata === 'object') {
                            return metadata.payment_id === paymentId;
                        }
                        return false;
                    });

                    // Fallback: If explicit reference not found, use time-window matching
                    if (!trainerAssignment) {
                        const windowStart = new Date(paymentDate.getTime() - 5 * 60 * 1000);
                        const windowEnd = new Date(paymentDate.getTime() + 5 * 60 * 1000);
                        
                        const { data: timeWindowAssignment } = await supabaseAdmin
                            .from('trainer_assignments')
                            .select('period_end, created_at, metadata')
                            .eq('membership_id', membershipId)
                            .eq('trainer_id', trainerAddon.trainer_id)
                            .eq('assignment_type', 'addon')
                            .in('status', ['assigned', 'pending'])
                            .gte('created_at', windowStart.toISOString())
                            .lte('created_at', windowEnd.toISOString())
                            .order('created_at', { ascending: false })
                            .limit(1)
                            .maybeSingle();

                        if (timeWindowAssignment) {
                            trainerAssignment = timeWindowAssignment;
                        } else {
                            // Last resort: Get most recent assignment
                            const { data: recentAssignments } = await supabaseAdmin
                                .from('trainer_assignments')
                                .select('period_end, created_at, metadata')
                                .eq('membership_id', membershipId)
                                .eq('trainer_id', trainerAddon.trainer_id)
                                .eq('assignment_type', 'addon')
                                .in('status', ['assigned', 'pending'])
                                .order('created_at', { ascending: false })
                                .limit(1)
                                .maybeSingle();

                            if (recentAssignments) {
                                trainerAssignment = recentAssignments;
                            }
                        }
                    }
                    
                    if (trainerAssignment?.period_end) {
                        trainerPeriodEnd = trainerAssignment.period_end;
                    } else {
                        // Fallback to membership trainer_period_end (should be updated by approval)
                        trainerPeriodEnd = membership.trainer_period_end || undefined;
                    }
                }
            }
        } else {
            // For other invoice types, use membership trainer_id
            if (membership.trainer_id) {
                const { data: trainer } = await supabaseAdmin
                    .from('trainers')
                    .select('name')
                    .eq('id', membership.trainer_id)
                    .single();
                trainerName = trainer?.name;
                trainerPeriodEnd = membership.trainer_period_end || undefined;
            }
        }

        // Log invoice generation details for debugging
        console.log('[INVOICE GENERATION]', {
            paymentId,
            membershipId,
            finalInvoiceType,
            payment_purpose: payment.payment_purpose,
            paymentAmount: payment.amount,
            paymentStatus: payment.status,
            hasAddons: addons && addons.length > 0,
            addonCount: addons?.length || 0
        });

        // Generate invoice number
        const invoiceNumber = generateInvoiceNumber();

        // Prepare invoice data
        const invoiceData: InvoiceData = {
            gymName,
            gymAddress,
            contactEmail,
            contactPhone,
            userName: profile.full_name || 'User',
            userEmail: profile.email || '',
            userPhone: profile.phone || undefined,
            planName: membership.plan_name,
            planType: membership.plan_mode === 'InGym' ? 'In-Gym' : 'Online',
            durationMonths: membership.duration_months,
            startDate: membership.membership_start_date || membership.start_date || new Date().toISOString(),
            endDate: membership.membership_end_date || membership.end_date || new Date().toISOString(),
            trainerName,
            trainerPeriodEnd,
            invoiceNumber,
            paymentDate: payment.payment_date || payment.created_at,
            transactionId: payment.transaction_id || 'N/A',
            approvedAt: payment.verified_at || payment.created_at,
            approvedBy: adminEmail,
            invoiceType: finalInvoiceType, // Use determined invoice type
            basePlanAmount: actualBaseAmount,
            addonAmount,
            totalAmount: basePlanAmount,
            addons: addonsBreakdown.length > 0 ? addonsBreakdown : undefined
        };

        // Generate PDF using jsPDF
        // Note: jsPDF works in Node.js when using output('arraybuffer')
        const pdfDoc = generateInvoicePDF(invoiceData);
        const pdfArrayBuffer = pdfDoc.output('arraybuffer');
        const pdfBuffer = Buffer.from(pdfArrayBuffer);

        // Upload to Supabase Storage
        const fileName = `invoices/${invoiceNumber}.pdf`;
        const { error: uploadError } = await supabaseAdmin.storage
            .from('invoices')
            .upload(fileName, pdfBuffer, {
                contentType: 'application/pdf',
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) {
            console.error('[INVOICE] Upload error:', uploadError);
            return NextResponse.json(
                { error: 'Failed to upload invoice PDF', details: uploadError.message },
                { status: 500 }
            );
        }

        // Get public URL
        const { data: { publicUrl } } = supabaseAdmin.storage
            .from('invoices')
            .getPublicUrl(fileName);

        // Determine invoice amount based on invoice type
        // For trainer renewals, use addonAmount (full payment amount)
        // For other types, use totalAmount (basePlanAmount + addonAmount)
        const invoiceAmount = finalInvoiceType === 'trainer_renewal' 
            ? addonAmount 
            : invoiceData.totalAmount;

        // Save invoice record to database
        const { data: invoice, error: invoiceError } = await supabaseAdmin
            .from('invoices')
            .insert({
                invoice_number: invoiceNumber,
                payment_id: paymentId,
                membership_id: membershipId,
                invoice_type: finalInvoiceType, // Use determined invoice type
                file_path: fileName,
                file_url: publicUrl,
                amount: invoiceAmount, // Use correct amount based on invoice type
                created_by: adminEmail
            })
            .select()
            .single();

        if (invoiceError || !invoice) {
            console.error('[INVOICE] Database insert error:', invoiceError);
            // Try to clean up uploaded file
            await supabaseAdmin.storage.from('invoices').remove([fileName]);
            return NextResponse.json(
                { error: 'Failed to save invoice record', details: invoiceError?.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            invoice: {
                id: invoice.id,
                invoiceNumber: invoice.invoice_number,
                fileUrl: invoice.file_url
            }
        });

    } catch (error: any) {
        console.error('[INVOICE] Generation error:', error);
        return NextResponse.json(
            { error: 'Failed to generate invoice', details: error.message },
            { status: 500 }
        );
    }
}

