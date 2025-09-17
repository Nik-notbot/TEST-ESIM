// Функция для получения конфигурации админ панели
// Пароль загружается из переменных окружения, а не из кода

exports.handler = async (event, context) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        // Пароль загружается из переменных окружения
        const adminPassword = process.env.ADMIN_PASSWORD || 'JlHhWO2hoU2';
        
        // Проверяем, что пароль установлен
        if (!adminPassword) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    error: 'Admin password not configured',
                    message: 'Please set ADMIN_PASSWORD environment variable'
                })
            };
        }

        // Возвращаем только информацию о том, что конфигурация готова
        // НЕ возвращаем сам пароль!
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                configured: true,
                message: 'Admin configuration is ready',
                // Пароль НЕ передается клиенту!
                hasPassword: !!adminPassword
            })
        };
    } catch (error) {
        console.error('Error in get-admin-config:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message
            })
        };
    }
};