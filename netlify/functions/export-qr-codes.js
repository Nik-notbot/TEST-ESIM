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
        // Check environment variables
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            console.error('Missing Supabase environment variables');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    error: 'Server configuration error',
                    details: 'Missing Supabase credentials'
                })
            };
        }

        // Initialize Supabase client with service role key
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        // Get all QR codes with related data
        console.log('Fetching QR codes from database...');
        const { data: qrCodes, error: qrError } = await supabase
            .from('qr_codes')
            .select(`
                *,
                esim_plans (
                    id,
                    name,
                    price,
                    data_limit,
                    validity_days,
                    country_name
                )
            `)
            .order('created_at', { ascending: false });
            
        console.log('QR codes query result:', { qrCodesCount: qrCodes?.length, error: qrError });

        if (qrError) {
            console.error('Error fetching QR codes:', qrError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    error: 'Failed to fetch QR codes',
                    details: qrError.message 
                })
            };
        }

        // Get orders that use these QR codes
        const qrCodeIds = qrCodes.map(qr => qr.id);
        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select('id, email, phone, status, created_at, qr_code_id')
            .in('qr_code_id', qrCodeIds);

        if (ordersError) {
            console.error('Error fetching orders:', ordersError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    error: 'Failed to fetch orders',
                    details: ordersError.message 
                })
            };
        }

        // Combine QR codes with order data
        const qrCodesWithOrders = qrCodes.map(qr => {
            const relatedOrder = orders.find(order => order.qr_code_id === qr.id);
            return {
                ...qr,
                order: relatedOrder || null
            };
        });

        // Format data for export
        const exportData = {
            export_date: new Date().toISOString(),
            total_qr_codes: qrCodesWithOrders.length,
            available_qr_codes: qrCodesWithOrders.filter(qr => !qr.is_used).length,
            used_qr_codes: qrCodesWithOrders.filter(qr => qr.is_used).length,
            qr_codes: qrCodesWithOrders.map(qr => ({
                id: qr.id,
                plan_name: qr.esim_plans?.name || 'Unknown',
                plan_price: qr.esim_plans?.price || 0,
                plan_data_limit: qr.esim_plans?.data_limit || 'Unknown',
                plan_validity: qr.esim_plans?.validity_days || 0,
                plan_country: qr.esim_plans?.country_name || 'Unknown',
                country_name: qr.country_name,
                country_code: qr.country_code,
                esim_number: qr.esim_number,
                pin_code: qr.pin_code,
                puk_code: qr.puk_code,
                qr_url: qr.qr_url,
                is_used: qr.is_used,
                created_at: qr.created_at,
                updated_at: qr.updated_at,
                hidden_notes: qr.hidden_notes,
                order_info: qr.order ? {
                    order_id: qr.order.id,
                    customer_email: qr.order.email,
                    customer_phone: qr.order.phone,
                    order_status: qr.order.status,
                    order_created_at: qr.order.created_at
                } : null
            }))
        };

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="qr_codes_export_${new Date().toISOString().split('T')[0]}.json"`
            },
            body: JSON.stringify(exportData, null, 2)
        };

    } catch (error) {
        console.error('Export QR codes error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Internal server error',
                details: error.message 
            })
        };
    }
};