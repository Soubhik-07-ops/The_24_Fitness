/**
 * Invoice Service
 * Helper functions for invoice generation
 */

/**
 * Generate invoice asynchronously
 * Note: This function now waits for completion to ensure invoice is generated
 */
export async function generateInvoiceAsync(
    paymentId: number,
    membershipId: number,
    invoiceType: 'initial' | 'renewal' | 'trainer_renewal',
    adminEmail: string,
    baseUrl: string
): Promise<void> {
    try {
        console.log('[INVOICE SERVICE] Starting generation', {
            paymentId,
            membershipId,
            invoiceType,
            adminEmail,
            baseUrl,
            timestamp: new Date().toISOString()
        });

        const response = await fetch(`${baseUrl}/api/admin/invoices/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                paymentId,
                membershipId,
                invoiceType,
                adminEmail
            })
        });

        const responseText = await response.text();
        let responseData: any;
        try {
            responseData = JSON.parse(responseText);
        } catch (e) {
            responseData = { raw: responseText };
        }

        if (response.ok) {
            console.log('[INVOICE SERVICE] Generated successfully:', {
                invoiceNumber: responseData.invoice?.invoiceNumber,
                invoiceId: responseData.invoice?.id,
                fileUrl: responseData.invoice?.fileUrl,
                message: responseData.message
            });
        } else {
            console.error('[INVOICE SERVICE] Generation failed:', {
                status: response.status,
                statusText: response.statusText,
                error: responseData,
                paymentId,
                membershipId,
                invoiceType
            });
            // Throw error so caller knows it failed
            throw new Error(`Invoice generation failed: ${responseData.error || response.statusText}`);
        }
    } catch (error: any) {
        console.error('[INVOICE SERVICE] Generation error:', {
            message: error?.message,
            stack: error?.stack,
            paymentId,
            membershipId,
            invoiceType,
            timestamp: new Date().toISOString()
        });
        // Re-throw so caller can handle it
        throw error;
    }
}

