// Серверная функция для получения списка QR-кодов
// Использует service_role для обхода RLS

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        // Проверяем авторизацию
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Требуется авторизация' 
                })
            };
        }

        // Инициализация Supabase с service_role
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        // Получаем QR-коды
        const { data, error } = await supabase
            .from('qr_codes')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            console.error('Database error:', error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Ошибка базы данных: ' + error.message 
                })
            };
        }

        // Получаем статистику
        const { data: statsData, error: statsError } = await supabase
            .from('qr_codes')
            .select('plan_id, is_used');

        let stats = {
            '1': { total: 0, available: 0 },
            '2': { total: 0, available: 0 }
        };

        if (!statsError && statsData) {
            statsData.forEach(qr => {
                stats[qr.plan_id].total++;
                if (!qr.is_used) {
                    stats[qr.plan_id].available++;
                }
            });
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                data: data,
                stats: stats
            })
        };

    } catch (error) {
        console.error('Error getting QR codes:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                message: 'Внутренняя ошибка сервера: ' + error.message 
            })
        };
    }
};