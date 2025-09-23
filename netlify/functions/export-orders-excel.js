const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
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
        console.log('Export orders Excel function called');
        
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

        // Create Excel content using simple HTML table format
        // This will be opened as Excel by most spreadsheet applications
        const excelHeaders = [
            'ID заказа',
            'Email клиента', 
            'Телефон клиента',
            'ID тарифа',
            'Статус',
            'Дата создания',
            'Дата обновления',
            'ID QR-кода'
        ];

        const excelRows = orders.map(order => [
            order.id,
            order.email || '',
            order.phone || '',
            order.plan_id || '',
            order.status || '',
            order.created_at || '',
            order.updated_at || '',
            order.qr_code_id || ''
        ]);

        // Create HTML table that Excel can open
        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Экспорт заказов</title>
</head>
<body>
    <table border="1">
        <thead>
            <tr>
                ${excelHeaders.map(header => `<th>${header}</th>`).join('')}
            </tr>
        </thead>
        <tbody>
            ${excelRows.map(row => 
                `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`
            ).join('')}
        </tbody>
    </table>
</body>
</html>`;

        const filename = `orders_export_${new Date().toISOString().split('T')[0]}.xls`;

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Type': 'application/vnd.ms-excel'
            },
            body: htmlContent
        };

    } catch (error) {
        console.error('Export orders Excel error:', error);
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