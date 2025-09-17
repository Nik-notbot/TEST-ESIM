const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        console.log('Simple admin auth function called');
        const { password } = JSON.parse(event.body);

        if (!password) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Password обязателен' 
                })
            };
        }

        // Получаем пароль из переменных окружения (более безопасно)
        const adminPassword = process.env.ADMIN_PASSWORD || 'JlHhWO2hoU2';
        
        // Проверяем пароль напрямую (без обращения к БД)
        if (password !== adminPassword) {
            console.log('Invalid password attempt');
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({
                    success: false,
                    message: 'Неверный пароль'
                })
            };
        }

        // Пароль верный - создаем сессию
        console.log('Successful admin login');
        
        const sessionToken = Buffer.from(`admin:${Date.now()}`).toString('base64');
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Успешная авторизация',
                sessionToken: sessionToken
            })
        };

    } catch (error) {
        console.error('Auth error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                message: 'Internal server error: ' + error.message 
            })
        };
    }
};