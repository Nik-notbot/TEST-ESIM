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
        console.log('Export QR codes CSV function called');
        
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

        // Create CSV content
        const csvHeaders = [
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

        const csvRows = qrCodes.map(qr => [
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

        const filename = `qr_codes_export_${new Date().toISOString().split('T')[0]}.csv`;

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
        console.error('Export QR codes CSV error:', error);
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