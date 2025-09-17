// Серверная функция для добавления QR-кодов через админ панель
// Использует service_role для обхода RLS

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
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

        // Парсим данные
        const { 
            plan_id, 
            qr_url, 
            country_name, 
            country_code, 
            esim_number, 
            pin_code, 
            puk_code, 
            hidden_notes 
        } = JSON.parse(event.body);

        // Валидация
        if (!plan_id || !qr_url) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'plan_id и qr_url обязательны' 
                })
            };
        }

        // Инициализация Supabase с service_role
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        // Добавляем QR-код
        const { data, error } = await supabase
            .from('qr_codes')
            .insert({
                plan_id: parseInt(plan_id),
                qr_url: qr_url.trim(),
                country_name: country_name?.trim() || null,
                country_code: country_code?.trim() || null,
                esim_number: esim_number?.trim() || null,
                pin_code: pin_code?.trim() || null,
                puk_code: puk_code?.trim() || null,
                hidden_notes: hidden_notes?.trim() || null
            })
            .select()
            .single();

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

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'QR-код успешно добавлен',
                data: data
            })
        };

    } catch (error) {
        console.error('Error adding QR code:', error);
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
