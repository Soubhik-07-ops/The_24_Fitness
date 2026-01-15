import { NextRequest, NextResponse } from 'next/server';
import { validateAdminSession } from '@/lib/adminAuth';
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

export async function GET(request: NextRequest) {
    try {
        // Authenticate admin
        const token = request.cookies.get('admin_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });
        }

        // Fetch all memberships with payment info
        const { data: memberships, error: membershipsError } = await supabaseAdmin
            .from('memberships')
            .select('*')
            .neq('status', 'awaiting_payment')
            .order('created_at', { ascending: false });

        if (membershipsError) {
            console.error('Error fetching memberships:', membershipsError);
            throw membershipsError;
        }

        // Get unique user IDs
        const userIds = [...new Set(memberships?.map(m => m.user_id) || [])];

        // Get auth users data
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers();
        if (authError) throw authError;
        const authUsers = authData?.users || [];

        // Get profiles data
        const { data: profilesData, error: profilesError } = await supabaseAdmin
            .from('profiles')
            .select('id, full_name')
            .in('id', userIds);

        if (profilesError) throw profilesError;
        const profiles = profilesData || [];

        // Get payment data
        const membershipIds = memberships?.map(m => m.id) || [];
        let payments: any[] = [];
        if (membershipIds.length > 0) {
            const { data: paymentsData, error: paymentsError } = await supabaseAdmin
                .from('membership_payments')
                .select('*')
                .in('membership_id', membershipIds)
                .order('created_at', { ascending: false });

            if (!paymentsError && paymentsData) {
                payments = paymentsData;
            }
        }

        // Get addons data
        let addons: any[] = [];
        if (membershipIds.length > 0) {
            const { data: addonsData, error: addonsError } = await supabaseAdmin
                .from('membership_addons')
                .select('*, trainers(id, name)')
                .in('membership_id', membershipIds);

            if (!addonsError && addonsData) {
                addons = addonsData;
            }
        }

        // Get trainers data
        const trainerIds = [...new Set(memberships?.map(m => m.trainer_id).filter(Boolean) || [])];
        const trainersMap = new Map<string, string>();
        if (trainerIds.length > 0) {
            const { data: trainersData, error: trainersError } = await supabaseAdmin
                .from('trainers')
                .select('id, name')
                .in('id', trainerIds);

            if (!trainersError && trainersData) {
                trainersData.forEach(trainer => {
                    trainersMap.set(trainer.id, trainer.name);
                });
            }
        }

        // Helper functions
        const capitalizeEnum = (value: string | null | undefined): string => {
            if (!value) return '';
            return value
                .split('_')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
        };

        const formatPlanType = (planType: string | null | undefined): string => {
            if (!planType) return '';
            if (planType === 'in_gym') return 'In-Gym';
            return planType.charAt(0).toUpperCase() + planType.slice(1);
        };

        const formatPlanName = (planName: string | null | undefined): string => {
            if (!planName) return '';
            return planName
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
        };

        const getGenderFromFormData = (formData: any): string => {
            if (!formData) return '';
            const gender = formData.personalInformation?.gender || formData.gender || '';
            if (!gender) return '';
            return gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase();
        };

        const getAddonsString = (membershipAddons: any[]): string => {
            if (!membershipAddons || membershipAddons.length === 0) return 'None';
            const activeAddons = membershipAddons.filter(a => a.status === 'active');
            if (activeAddons.length === 0) return 'None';
            
            const addonTypes = activeAddons.map(addon => {
                if (addon.addon_type === 'personal_trainer') return 'Trainer';
                if (addon.addon_type === 'in_gym') return 'In-Gym';
                return capitalizeEnum(addon.addon_type);
            });
            return addonTypes.join(', ');
        };

        const getTrainerStatus = (membership: any): string => {
            if (!membership.trainer_assigned || !membership.trainer_id) return 'Not Assigned';
            if (!membership.trainer_period_end) return 'Active (No End Date)';
            
            const periodEnd = new Date(membership.trainer_period_end);
            const now = new Date();
            
            if (periodEnd > now) {
                return 'Active';
            } else if (membership.trainer_grace_period_end) {
                const graceEnd = new Date(membership.trainer_grace_period_end);
                if (now <= graceEnd) {
                    return 'Grace Period';
                }
            }
            return 'Expired';
        };

        // Create workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Memberships Report');

        // Brand colors
        const brandOrange = { argb: 'FFFF6B35' }; // Brand orange
        const headerText = { argb: 'FFFFFFFF' }; // White
        const rowStripLight = { argb: 'FFF9FAFB' }; // Very light gray
        const borderColor = { argb: 'FFE5E7EB' }; // Light gray

        let currentRow = 1;

        // Header Section - Branded
        const companyName = 'THE 24 FITNESS GYM';
        const reportTitle = 'Memberships Report';
        const exportDate = new Date().toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });

        // Company name
        worksheet.mergeCells(currentRow, 1, currentRow, 17);
        worksheet.getCell(currentRow, 1).value = companyName;
        worksheet.getCell(currentRow, 1).font = { bold: true, size: 18, color: brandOrange };
        worksheet.getCell(currentRow, 1).alignment = { horizontal: 'left', vertical: 'middle' };
        currentRow++;

        // Report title
        worksheet.mergeCells(currentRow, 1, currentRow, 17);
        worksheet.getCell(currentRow, 1).value = reportTitle;
        worksheet.getCell(currentRow, 1).font = { bold: true, size: 14 };
        worksheet.getCell(currentRow, 1).alignment = { horizontal: 'left', vertical: 'middle' };
        currentRow++;

        // Export date
        worksheet.mergeCells(currentRow, 1, currentRow, 17);
        worksheet.getCell(currentRow, 1).value = `Exported on: ${exportDate}`;
        worksheet.getCell(currentRow, 1).font = { size: 11, italic: true };
        worksheet.getCell(currentRow, 1).alignment = { horizontal: 'left', vertical: 'middle' };
        currentRow += 2; // Empty row for spacing

        // Column headers
        const headers = [
            'Membership ID',
            'User Name',
            'Email',
            'Plan Name',
            'Plan Type',
            'Gender',
            'Duration (Months)',
            'Base Price',
            'Addons',
            'Trainer Name',
            'Membership Status',
            'Trainer Status',
            'Start Date',
            'End Date',
            'Total Paid',
            'Pending Amount',
            'Created At'
        ];

        const headerRow = worksheet.getRow(currentRow);
        headerRow.height = 25;
        headers.forEach((header, index) => {
            const cell = worksheet.getCell(currentRow, index + 1);
            cell.value = header;
            cell.font = { bold: true, size: 11, color: headerText };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: brandOrange
            };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = {
                top: { style: 'thin', color: borderColor },
                bottom: { style: 'thin', color: borderColor },
                left: { style: 'thin', color: borderColor },
                right: { style: 'thin', color: borderColor }
            };
        });
        currentRow++;

        // Prepare and add data rows
        (memberships || []).forEach((membership) => {
            const profile = profiles.find(p => p.id === membership.user_id);
            const authUser = authUsers.find(u => u.id === membership.user_id);
            const membershipAddons = addons.filter(a => a.membership_id === membership.id);
            const allPayments = payments.filter(p => p.membership_id === membership.id);
            const trainerName = membership.trainer_id ? trainersMap.get(membership.trainer_id) || null : null;

            const totalPaid = allPayments
                .filter((p: any) => p.status === 'verified')
                .reduce((sum: number, p: any) => sum + (parseFloat(p.amount) || 0), 0);

            const pendingAmount = allPayments
                .filter((p: any) => p.status === 'pending')
                .reduce((sum: number, p: any) => sum + (parseFloat(p.amount) || 0), 0);

            const row = worksheet.getRow(currentRow);
            row.height = 20;
            const isEvenRow = (currentRow - (headerRow.number + 1)) % 2 === 0;
            
            const rowFill: ExcelJS.Fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: isEvenRow ? rowStripLight : { argb: 'FFFFFFFF' }
            } as ExcelJS.FillPattern;

            // Membership ID (numeric)
            worksheet.getCell(currentRow, 1).value = membership.id;
            worksheet.getCell(currentRow, 1).numFmt = '0';
            worksheet.getCell(currentRow, 1).alignment = { horizontal: 'right', vertical: 'middle' };
            
            // User Name
            worksheet.getCell(currentRow, 2).value = profile?.full_name || 'Unknown User';
            
            // Email
            worksheet.getCell(currentRow, 3).value = authUser?.email || '';
            
            // Plan Name
            worksheet.getCell(currentRow, 4).value = formatPlanName(membership.plan_name);
            
            // Plan Type
            worksheet.getCell(currentRow, 5).value = formatPlanType(membership.plan_type);
            
            // Gender
            worksheet.getCell(currentRow, 6).value = getGenderFromFormData(membership.form_data);
            
            // Duration (numeric)
            worksheet.getCell(currentRow, 7).value = membership.duration_months || 0;
            worksheet.getCell(currentRow, 7).numFmt = '0';
            worksheet.getCell(currentRow, 7).alignment = { horizontal: 'right', vertical: 'middle' };
            
            // Base Price (numeric)
            worksheet.getCell(currentRow, 8).value = membership.price || 0;
            worksheet.getCell(currentRow, 8).numFmt = '#,##0';
            worksheet.getCell(currentRow, 8).alignment = { horizontal: 'right', vertical: 'middle' };
            
            // Addons
            worksheet.getCell(currentRow, 9).value = getAddonsString(membershipAddons);
            
            // Trainer Name
            worksheet.getCell(currentRow, 10).value = trainerName || '';
            
            // Membership Status
            worksheet.getCell(currentRow, 11).value = capitalizeEnum(membership.status);
            
            // Trainer Status
            worksheet.getCell(currentRow, 12).value = getTrainerStatus(membership);
            
            // Start Date
            const startDate = membership.membership_start_date || membership.start_date;
            if (startDate) {
                const dateValue = new Date(startDate);
                if (!isNaN(dateValue.getTime())) {
                    worksheet.getCell(currentRow, 13).value = dateValue;
                    worksheet.getCell(currentRow, 13).numFmt = 'dd-mmm-yyyy';
                }
            }
            
            // End Date
            const endDate = membership.membership_end_date || membership.end_date;
            if (endDate) {
                const dateValue = new Date(endDate);
                if (!isNaN(dateValue.getTime())) {
                    worksheet.getCell(currentRow, 14).value = dateValue;
                    worksheet.getCell(currentRow, 14).numFmt = 'dd-mmm-yyyy';
                }
            }
            
            // Total Paid (numeric)
            worksheet.getCell(currentRow, 15).value = totalPaid;
            worksheet.getCell(currentRow, 15).numFmt = '#,##0';
            worksheet.getCell(currentRow, 15).alignment = { horizontal: 'right', vertical: 'middle' };
            
            // Pending Amount (numeric)
            worksheet.getCell(currentRow, 16).value = pendingAmount;
            worksheet.getCell(currentRow, 16).numFmt = '#,##0';
            worksheet.getCell(currentRow, 16).alignment = { horizontal: 'right', vertical: 'middle' };
            
            // Created At
            if (membership.created_at) {
                const dateValue = new Date(membership.created_at);
                if (!isNaN(dateValue.getTime())) {
                    worksheet.getCell(currentRow, 17).value = dateValue;
                    worksheet.getCell(currentRow, 17).numFmt = 'dd-mmm-yyyy';
                }
            }

            // Apply common styling to all cells in the row
            for (let col = 1; col <= 17; col++) {
                const cell = worksheet.getCell(currentRow, col);
                cell.fill = rowFill;
                cell.border = {
                    top: { style: 'thin', color: borderColor },
                    bottom: { style: 'thin', color: borderColor },
                    left: { style: 'thin', color: borderColor },
                    right: { style: 'thin', color: borderColor }
                };
                cell.alignment = { ...cell.alignment, vertical: 'middle', wrapText: true };
            }

            currentRow++;
        });

        // Set column widths
        worksheet.getColumn(1).width = 12;  // Membership ID
        worksheet.getColumn(2).width = 20;  // User Name
        worksheet.getColumn(3).width = 25;  // Email
        worksheet.getColumn(4).width = 18;  // Plan Name
        worksheet.getColumn(5).width = 12;  // Plan Type
        worksheet.getColumn(6).width = 10;  // Gender
        worksheet.getColumn(7).width = 15;  // Duration
        worksheet.getColumn(8).width = 12;  // Base Price
        worksheet.getColumn(9).width = 18;  // Addons
        worksheet.getColumn(10).width = 20; // Trainer Name
        worksheet.getColumn(11).width = 18; // Membership Status
        worksheet.getColumn(12).width = 16; // Trainer Status
        worksheet.getColumn(13).width = 12; // Start Date
        worksheet.getColumn(14).width = 12; // End Date
        worksheet.getColumn(15).width = 12; // Total Paid
        worksheet.getColumn(16).width = 14; // Pending Amount
        worksheet.getColumn(17).width = 12; // Created At

        // Freeze header row
        worksheet.views = [
            {
                state: 'frozen',
                ySplit: headerRow.number
            }
        ];

        // Generate Excel file buffer
        const buffer = await workbook.xlsx.writeBuffer();

        // Return Excel file as response
        return new NextResponse(buffer, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="24Fitness_Memberships_${new Date().toISOString().split('T')[0]}.xlsx"`
            }
        });
    } catch (error: any) {
        console.error('Error generating Excel export:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to generate Excel export' },
            { status: 500 }
        );
    }
}
