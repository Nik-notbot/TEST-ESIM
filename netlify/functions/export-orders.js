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

        // Get all orders with related data
        console.log('Fetching orders from database...');
        const { data: orders, error: ordersError } = await supabase
            .from('orders')
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
            
        console.log('Orders query result:', { ordersCount: orders?.length, error: ordersError });

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

        // Get payment history for orders
        const orderIds = orders.map(order => order.id);
        const { data: payments, error: paymentsError } = await supabase
            .from('payment_history')
            .select('*')
            .in('order_id', orderIds);

        if (paymentsError) {
            console.error('Error fetching payments:', paymentsError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    error: 'Failed to fetch payment history',
                    details: paymentsError.message 
                })
            };
        }

        // Combine orders with payment data
        const ordersWithPayments = orders.map(order => {
            const orderPayments = payments.filter(payment => payment.order_id === order.id);
            return {
                ...order,
                payments: orderPayments
            };
        });

        // Format data for export
        const exportData = {
            export_date: new Date().toISOString(),
            total_orders: ordersWithPayments.length,
            orders: ordersWithPayments.map(order => ({
                id: order.id,
                email: order.email,
                phone: order.phone,
                plan_name: order.esim_plans?.name || 'Unknown',
                plan_price: order.esim_plans?.price || 0,
                plan_data_limit: order.esim_plans?.data_limit || 'Unknown',
                plan_validity: order.esim_plans?.validity_days || 0,
                plan_country: order.esim_plans?.country_name || 'Unknown',
                status: order.status,
                created_at: order.created_at,
                updated_at: order.updated_at,
                qr_code_assigned: order.qr_code_id ? 'Yes' : 'No',
                qr_code_id: order.qr_code_id,
                payments: order.payments.map(payment => ({
                    payment_id: payment.id,
                    amount: payment.amount,
                    currency: payment.currency,
                    status: payment.status,
                    payment_method: payment.payment_method,
                    transaction_id: payment.transaction_id,
                    created_at: payment.created_at
                }))
            }))
        };

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="orders_export_${new Date().toISOString().split('T')[0]}.json"`
            },
            body: JSON.stringify(exportData, null, 2)
        };

    } catch (error) {
        console.error('Export orders error:', error);
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