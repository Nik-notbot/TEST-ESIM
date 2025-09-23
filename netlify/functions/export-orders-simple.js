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
        console.log('Export orders simple function called');
        
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

        // Simple query first - just get orders without joins
        console.log('Fetching orders...');
        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10); // Limit to 10 for testing

        console.log('Orders query result:', { 
            ordersCount: orders?.length, 
            error: ordersError?.message,
            hasData: !!orders 
        });

        if (ordersError) {
            console.error('Orders query error:', ordersError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    error: 'Failed to fetch orders',
                    details: ordersError.message,
                    code: ordersError.code
                })
            };
        }

        // Simple response without complex joins
        const exportData = {
            export_date: new Date().toISOString(),
            total_orders: orders?.length || 0,
            orders: orders?.map(order => ({
                id: order.id,
                email: order.email,
                phone: order.phone,
                plan_id: order.plan_id,
                status: order.status,
                created_at: order.created_at,
                updated_at: order.updated_at,
                qr_code_id: order.qr_code_id
            })) || []
        };

        console.log('Export data prepared:', { 
            totalOrders: exportData.total_orders,
            sampleOrder: exportData.orders[0] 
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
        console.error('Export orders simple error:', error);
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