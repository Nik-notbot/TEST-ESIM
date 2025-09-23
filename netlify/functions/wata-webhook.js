// Netlify Function для обработки вебхуков от Wata
// Эта функция будет вызываться когда пользователь завершит оплату

// Конфигурация - проект esim-store
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wiwkergsvbgnrdslqkzg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indpd2tlcmdzdmJnbnJkc2xxa3pnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Njk5MDkyMCwiZXhwIjoyMDcyNTY2OTIwfQ.RJPwoAVUNzIbG7yGTm-hS2wNrBelhaQ5k57cpQLXZj8'; // service_role key для вебхуков

// Секретный ключ для проверки подписи Wata
const WATA_WEBHOOK_SECRET = process.env.WATA_WEBHOOK_SECRET || 'your-webhook-secret-here';

// Получаем fetch для Node.js
const fetch = globalThis.fetch || require('node-fetch');

// Функция для проверки подписи Wata
function verifyWataSignature(payload, signature, secret) {
    if (!signature || !secret) {
        console.log('No signature or secret provided, skipping verification');
        return true; // Пропускаем проверку если нет подписи
    }
    
    try {
        const crypto = require('crypto');
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(payload, 'utf8')
            .digest('hex');
        
        return crypto.timingSafeEqual(
            Buffer.from(signature, 'hex'),
            Buffer.from(expectedSignature, 'hex')
        );
    } catch (error) {
        console.error('Signature verification error:', error);
        return false;
    }
}

exports.handler = async (event, context) => {
    // CORS заголовки
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Обработка preflight запросов
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    // Только POST запросы
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }
    
    try {
        // Логируем входящий запрос
        console.log('Webhook received:', {
            method: event.httpMethod,
            headers: event.headers,
            body: event.body
        });

        // Проверяем наличие тела запроса
        if (!event.body) {
            console.error('Empty request body');
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Empty request body' })
            };
        }

        // Wata не использует подпись webhook, пропускаем проверку
        console.log('Skipping signature verification (not used by Wata)');

        // Парсим данные вебхука
        let webhookData;
        try {
            webhookData = JSON.parse(event.body);
        } catch (parseError) {
            console.error('JSON parse error:', parseError);
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid JSON format' })
            };
        }
        
        console.log('Parsed webhook data:', webhookData);
        
        // Извлекаем данные платежа согласно реальному формату Wata API
        // Реальный формат Wata: { transactionType, transactionId, transactionStatus, amount, currency, orderId, orderDescription, paymentTime, commission, email }
        const orderId = webhookData.orderId || webhookData.order_uuid || webhookData.order_id || webhookData.id;
        const paymentId = webhookData.transactionId || webhookData.payment_id || webhookData.paymentId || webhookData.transaction_id;
        const status = webhookData.transactionStatus || webhookData.status || webhookData.state || webhookData.payment_status;
        const amount = webhookData.amount || webhookData.total || webhookData.sum;
        const currency = webhookData.currency || webhookData.currency_code || 'RUB';
        const paidDate = webhookData.paymentTime || webhookData.paid_date_msk || webhookData.paid_date || webhookData.created_at;
        const hash = webhookData.hash;
        const transactionType = webhookData.transactionType;
        const orderDescription = webhookData.orderDescription;
        const commission = webhookData.commission;
        
        console.log('Extracted data:', { orderId, paymentId, status, amount, currency, paidDate, hash, transactionType, orderDescription, commission });
        
        if (!orderId || !status) {
            console.error('Missing required fields:', { orderId, status });
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    error: 'Missing required fields',
                    received: { orderId, status },
                    fullData: webhookData
                })
            };
        }
        
        // Определяем статус для нашей БД согласно реальному формату Wata API
        let orderStatus = 'pending';
        if (status === 'Paid' || status === 'Success' || status === 'Succeeded') {
            orderStatus = 'paid';
        } else if (status === 'Failed' || status === 'Declined' || status === 'Cancelled' || status === 'Error') {
            orderStatus = 'failed';
        }
        
        console.log(`Обновляем заказ ${orderId} - статус: ${orderStatus}`);
        console.log('Supabase URL:', SUPABASE_URL);
        console.log('Service Key configured:', !!SUPABASE_SERVICE_KEY);
        
        // Обновляем статус заказа в Supabase с защитой от превышения лимитов
        const updateUrl = `${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`;
        const updateBody = {
            status: orderStatus,
            payment_id: paymentId,
            updated_at: new Date().toISOString()
        };
        
        console.log('Update URL:', updateUrl);
        console.log('Update body:', updateBody);
        
        // Функция для выполнения запроса с повторными попытками
        async function makeSupabaseRequest(url, options, maxRetries = 3) {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`Supabase request attempt ${attempt}/${maxRetries}`);
                    
                    const response = await fetch(url, options);
                    
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
        
        const updateResponse = await makeSupabaseRequest(updateUrl, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(updateBody)
        });
        
        console.log('Update response status:', updateResponse.status);
        console.log('Update response headers:', Object.fromEntries(updateResponse.headers.entries()));
        
        if (!updateResponse.ok) {
            const error = await updateResponse.text();
            console.error('Ошибка обновления заказа:', error);
            console.error('Response status:', updateResponse.status);
            console.error('Response headers:', Object.fromEntries(updateResponse.headers.entries()));
            throw new Error(`Failed to update order: ${updateResponse.status} - ${error}`);
        }
        
        const updatedOrder = await updateResponse.json();
        console.log('Заказ обновлен:', updatedOrder);
        
        // Если оплата успешна и нет QR-кода, пытаемся назначить
        if (orderStatus === 'paid' && updatedOrder.length > 0 && !updatedOrder[0].qr_code_id) {
            console.log('Назначаем QR-код для заказа...');
            
            // Вызываем функцию назначения QR-кода с защитой от лимитов
            const qrResponse = await makeSupabaseRequest(
                `${SUPABASE_URL}/rest/v1/rpc/get_available_qr_code`,
                {
                    method: 'POST',
                    headers: {
                        'apikey': SUPABASE_SERVICE_KEY,
                        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        p_plan_id: updatedOrder[0].plan_id,
                        p_order_id: orderId
                    })
                }
            );
            
            if (qrResponse.ok) {
                console.log('QR-код успешно назначен');
            } else {
                console.log('Не удалось назначить QR-код:', await qrResponse.text());
            }
        }

        // Отправляем уведомление о продаже (только при успешной оплате и если еще не отправляли)
        if (orderStatus === 'paid' && updatedOrder.length > 0) {
            console.log('Проверяем, нужно ли отправлять уведомление о продаже...');
            
            // Проверяем, не отправляли ли уже уведомление для этого заказа
            const order = updatedOrder[0];
            const lastNotificationTime = order.telegram_notification_sent_at;
            const now = new Date();
            
            // Если уведомление уже отправляли в последние 24 часа, пропускаем
            if (lastNotificationTime) {
                const notificationDate = new Date(lastNotificationTime);
                const hoursSinceNotification = (now - notificationDate) / (1000 * 60 * 60);
                
                if (hoursSinceNotification < 24) {
                    console.log(`Уведомление для заказа ${orderId} уже отправлялось ${hoursSinceNotification.toFixed(1)} часов назад, пропускаем`);
                    return {
                        statusCode: 200,
                        headers,
                        body: JSON.stringify({ 
                            success: true,
                            message: 'Webhook processed successfully (notification already sent)',
                            orderId: orderId,
                            status: orderStatus,
                            notificationSkipped: true
                        })
                    };
                }
            }
            
            console.log('Отправляем уведомление о продаже...');
            
            try {
                // Получаем полную информацию о заказе с планом с защитой от лимитов
                const fullOrderResponse = await makeSupabaseRequest(
                    `${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}&select=*,esim_plans(*)`,
                    {
                        method: 'GET',
                        headers: {
                            'apikey': SUPABASE_SERVICE_KEY,
                            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                if (fullOrderResponse.ok) {
                    const fullOrderData = await fullOrderResponse.json();
                    if (fullOrderData.length > 0) {
                        // Отправляем уведомление в Telegram
                        const notificationResponse = await fetch(
                            `${process.env.URL || 'https://heyesim.me'}/.netlify/functions/send-telegram-notification`,
                            {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    orderData: fullOrderData[0],
                                    notificationType: 'sale'
                                })
                            }
                        );

                        if (notificationResponse.ok) {
                            console.log('Уведомление о продаже отправлено');
                            
                            // Обновляем время отправки уведомления в БД с защитой от лимитов
                            await makeSupabaseRequest(
                                `${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`,
                                {
                                    method: 'PATCH',
                                    headers: {
                                        'apikey': SUPABASE_SERVICE_KEY,
                                        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        telegram_notification_sent_at: now.toISOString()
                                    })
                                }
                            );
                            console.log('Время отправки уведомления сохранено в БД');
                        } else {
                            console.log('Не удалось отправить уведомление о продаже');
                        }
                    }
                }
            } catch (notificationError) {
                console.error('Ошибка отправки уведомления:', notificationError);
                // Не прерываем выполнение из-за ошибки уведомления
            }
        }
        
        // Возвращаем успешный ответ
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                success: true,
                message: 'Webhook processed successfully',
                orderId: orderId,
                status: orderStatus
            })
        };
        
    } catch (error) {
        console.error('Ошибка обработки вебхука:', error);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Internal server error',
                message: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            })
        };
    }
};