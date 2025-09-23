// Утилита для работы с Supabase с защитой от превышения лимитов
// Используется в других Netlify Functions

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wiwkergsvbgnrdslqkzg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Функция для выполнения запроса с повторными попытками и защитой от лимитов
async function makeSupabaseRequest(url, options = {}, maxRetries = 3) {
    const defaultOptions = {
        headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json'
        }
    };
    
    const finalOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers
        }
    };
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Supabase request attempt ${attempt}/${maxRetries} to ${url}`);
            
            const response = await fetch(url, finalOptions);
            
            // Если получили 429 (Too Many Requests), ждем и повторяем
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After') || Math.pow(2, attempt);
                const waitTime = parseInt(retryAfter) * 1000;
                
                console.log(`Rate limited (429), waiting ${waitTime}ms before retry ${attempt + 1}`);
                
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    continue;
                } else {
                    throw new Error(`Rate limited after ${maxRetries} attempts`);
                }
            }
            
            return response;
        } catch (error) {
            console.error(`Attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                throw error;
            }
            
            // Экспоненциальная задержка между попытками
            const waitTime = Math.pow(2, attempt) * 1000;
            console.log(`Waiting ${waitTime}ms before retry ${attempt + 1}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
}

// Функция для обновления заказа
async function updateOrder(orderId, updateData) {
    const url = `${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`;
    const options = {
        method: 'PATCH',
        headers: {
            'Prefer': 'return=representation'
        },
        body: JSON.stringify(updateData)
    };
    
    const response = await makeSupabaseRequest(url, options);
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to update order: ${response.status} - ${error}`);
    }
    
    return await response.json();
}

// Функция для получения заказа
async function getOrder(orderId, select = '*') {
    const url = `${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}&select=${select}`;
    const options = {
        method: 'GET'
    };
    
    const response = await makeSupabaseRequest(url, options);
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to get order: ${response.status} - ${error}`);
    }
    
    return await response.json();
}

// Функция для вызова RPC функции
async function callRPC(functionName, params = {}) {
    const url = `${SUPABASE_URL}/rest/v1/rpc/${functionName}`;
    const options = {
        method: 'POST',
        body: JSON.stringify(params)
    };
    
    const response = await makeSupabaseRequest(url, options);
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to call RPC ${functionName}: ${response.status} - ${error}`);
    }
    
    return await response.json();
}

module.exports = {
    makeSupabaseRequest,
    updateOrder,
    getOrder,
    callRPC,
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY
};