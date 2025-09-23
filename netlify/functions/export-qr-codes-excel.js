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
        console.log('Export QR codes Excel function called');
        
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

        // Get all QR codes
        const { data: qrCodes, error: qrError } = await supabase
            .from('qr_codes')
            .select('*')
            .order('created_at', { ascending: false });

        if (qrError) {
            console.error('QR codes query error:', qrError);
            return {
                statusCode: 500,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    error: 'Failed to fetch QR codes',
                    details: qrError.message
                })
            };
        }

        // Create Excel content
        const excelHeaders = [
            'ID QR-кода',
            'ID тарифа',
            'Страна',
            'Код страны',
            'Номер eSIM',
            'PIN код',
            'PUK код',
            'URL QR-кода',
            'Статус использования',
            'Дата создания',
            'Дата обновления',
            'Скрытые заметки'
        ];

        const excelRows = qrCodes.map(qr => [
            qr.id,
            qr.plan_id || '',
            qr.country_name || '',
            qr.country_code || '',
            qr.esim_number || '',
            qr.pin_code || '',
            qr.puk_code || '',
            qr.qr_url || '',
            qr.is_used ? 'Использован' : 'Доступен',
            qr.created_at || '',
            qr.updated_at || '',
            qr.hidden_notes || ''
        ]);

        // Create HTML table that Excel can open
        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Экспорт QR-кодов</title>
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

        const filename = `qr_codes_export_${new Date().toISOString().split('T')[0]}.xls`;

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
        console.error('Export QR codes Excel error:', error);
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