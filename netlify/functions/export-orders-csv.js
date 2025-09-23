const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'text/csv; charset=utf-8'
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: 'Method not allowed'
        };
    }

    try {
        console.log('Export orders CSV function called');
        
        // Check environment variables
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            console.error('Missing environment variables');
            return {
                statusCode: 500,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    error: 'Missing Supabase credentials'
                })
            };
        }

        // Initialize Supabase client
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        // Get all orders
        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });

        if (ordersError) {
            console.error('Orders query error:', ordersError);
            return {
                statusCode: 500,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    error: 'Failed to fetch orders',
                    details: ordersError.message
                })
            };
        }

        // Create CSV content
        const csvHeaders = [
            'ID заказа',
            'Email клиента',
            'Телефон клиента',
            'ID тарифа',
            'Статус',
            'Дата создания',
            'Дата обновления',
            'ID QR-кода'
        ];

        const csvRows = orders.map(order => [
            order.id,
            order.email || '',
            order.phone || '',
            order.plan_id || '',
            order.status || '',
            order.created_at || '',
            order.updated_at || '',
            order.qr_code_id || ''
        ]);

        // Escape CSV values
        const escapeCsvValue = (value) => {
            if (value === null || value === undefined) return '';
            const stringValue = String(value);
            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
        };

        // Build CSV content
        const csvContent = [
            csvHeaders.map(escapeCsvValue).join(','),
            ...csvRows.map(row => row.map(escapeCsvValue).join(','))
        ].join('\n');

        // Add BOM for proper UTF-8 encoding in Excel
        const csvWithBom = '\uFEFF' + csvContent;

        const filename = `orders_export_${new Date().toISOString().split('T')[0]}.csv`;

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Type': 'text/csv; charset=utf-8'
            },
            body: csvWithBom
        };

    } catch (error) {
        console.error('Export orders CSV error:', error);
        return {
            statusCode: 500,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                error: 'Internal server error',
                details: error.message
            })
        };
    }
};