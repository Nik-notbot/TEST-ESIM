const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        console.log('Export QR codes simple function called');
        
        // Check environment variables
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            console.error('Missing environment variables');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    error: 'Missing Supabase credentials',
                    details: {
                        hasUrl: !!process.env.SUPABASE_URL,
                        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
                    }
                })
            };
        }

        // Initialize Supabase client
        console.log('Initializing Supabase client...');
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        // Simple query first - just get QR codes without joins
        console.log('Fetching QR codes...');
        const { data: qrCodes, error: qrError } = await supabase
            .from('qr_codes')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10); // Limit to 10 for testing

        console.log('QR codes query result:', { 
            qrCodesCount: qrCodes?.length, 
            error: qrError?.message,
            hasData: !!qrCodes 
        });

        if (qrError) {
            console.error('QR codes query error:', qrError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    error: 'Failed to fetch QR codes',
                    details: qrError.message,
                    code: qrError.code
                })
            };
        }

        // Calculate statistics
        const totalQRCodes = qrCodes?.length || 0;
        const availableQRCodes = qrCodes?.filter(qr => !qr.is_used).length || 0;
        const usedQRCodes = qrCodes?.filter(qr => qr.is_used).length || 0;

        // Simple response without complex joins
        const exportData = {
            export_date: new Date().toISOString(),
            total_qr_codes: totalQRCodes,
            available_qr_codes: availableQRCodes,
            used_qr_codes: usedQRCodes,
            qr_codes: qrCodes?.map(qr => ({
                id: qr.id,
                plan_id: qr.plan_id,
                country_name: qr.country_name,
                country_code: qr.country_code,
                esim_number: qr.esim_number,
                pin_code: qr.pin_code,
                puk_code: qr.puk_code,
                qr_url: qr.qr_url,
                is_used: qr.is_used,
                created_at: qr.created_at,
                updated_at: qr.updated_at,
                hidden_notes: qr.hidden_notes
            })) || []
        };

        console.log('Export data prepared:', { 
            totalQRCodes: exportData.total_qr_codes,
            availableQRCodes: exportData.available_qr_codes,
            usedQRCodes: exportData.used_qr_codes,
            sampleQR: exportData.qr_codes[0] 
        });

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(exportData, null, 2)
        };

    } catch (error) {
        console.error('Export QR codes simple error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Internal server error',
                details: error.message,
                stack: error.stack
            })
        };
    }
};