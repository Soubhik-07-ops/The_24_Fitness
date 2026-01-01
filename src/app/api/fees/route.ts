// Public API route to fetch in-gym fees (no authentication required)
import { NextResponse } from 'next/server'
import { getInGymAdmissionFee, getInGymMonthlyFee } from '@/lib/adminSettings'

export async function GET() {
    try {
        const admissionFee = await getInGymAdmissionFee()
        const monthlyFee = await getInGymMonthlyFee()

        return NextResponse.json({
            success: true,
            fees: {
                admissionFee,
                monthlyFee
            }
        })
    } catch (error: any) {
        console.error('Error fetching fees:', error)
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to fetch fees',
                fees: {
                    admissionFee: 1200, // Fallback
                    monthlyFee: 650 // Fallback
                }
            },
            { status: 500 }
        )
    }
}

