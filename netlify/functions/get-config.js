exports.handler = async (event, context) => {
    // Настройка CORS
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        // Проверяем наличие переменных окружения
        let supabaseUrl = process.env.SUPABASE_URL;
        let supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

        // Временный fallback для тестирования (удалить после настройки переменных окружения)
        if (!supabaseUrl || !supabaseAnonKey) {
            console.warn('Environment variables not set, using fallback values for testing');
            supabaseUrl = 'https://wiwkergsvbgnrdslqkzg.supabase.co';
            supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indpd2tlcmdzdmJnbnJkc2xxa3pnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5OTA5MjAsImV4cCI6MjA3MjU2NjkyMH0.PmWeSrWMRzlHlFJpwRjlSla3Ra6hWAoCNErMEdEWtEk';
            
            console.log('Using fallback configuration - PLEASE SET ENVIRONMENT VARIABLES IN NETLIFY!');
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                supabaseUrl,
                supabaseAnonKey,
                message: 'Configuration loaded successfully'
            })
        };
    } catch (error) {
        console.error('Error in get-config:', error);
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