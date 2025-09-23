const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    // Настройка CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        // Инициализация Supabase
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        const { httpMethod, path } = event;
        const pathParts = path.split('/').filter(p => p);
        const action = pathParts[pathParts.length - 1];

        if (httpMethod === 'GET' && action === 'get-order') {
            // Получение информации о заказе
            const orderId = event.queryStringParameters?.orderId;
            
            if (!orderId) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Order ID is required' })
                };
            }

            const { data: order, error } = await supabase
                .from('orders')
                .select('*, esim_plans(name, data_gb)')
                .eq('id', orderId)
                .single();

            if (error) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: 'Order not found' })
                };
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ order })
            };
        }

        if (httpMethod === 'GET' && action === 'get-qr-code') {
            // Получение QR-кода для заказа
            const orderId = event.queryStringParameters?.orderId;
            
            if (!orderId) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Order ID is required' })
                };
            }

            // Получаем заказ
            const { data: order, error: orderError } = await supabase
                .from('orders')
                .select('plan_id, status, qr_code_id')
                .eq('id', orderId)
                .single();

            if (orderError) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: 'Order not found' })
                };
            }

            // БЕЗОПАСНОСТЬ: Проверяем статус оплаты
            if (order.status !== 'paid' && order.status !== 'completed') {
                return {
                    statusCode: 403,
                    headers,
                    body: JSON.stringify({ 
                        error: 'Payment not confirmed',
                        message: 'QR code can only be issued for paid orders',
                        orderStatus: order.status
                    })
                };
            }

            // Если QR-код уже назначен
            if (order.qr_code_id) {
                const { data: qrCode, error: qrError } = await supabase
                    .from('qr_codes')
                    .select('qr_url, country_name, country_code, esim_number, pin_code, puk_code')
                    .eq('id', order.qr_code_id)
                    .single();

                if (!qrError && qrCode) {
                    return {
                        statusCode: 200,
                        headers,
                        body: JSON.stringify({ qrCode, order })
                    };
                }
            }

            // Получаем доступный QR-код
            const { data: availableQRCodes, error: qrError } = await supabase
                .from('qr_codes')
                .select('id, qr_url, country_name, country_code, esim_number, pin_code, puk_code')
                .eq('plan_id', order.plan_id)
                .eq('is_used', false)
                .order('created_at')
                .limit(1);

            if (qrError) {
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ error: 'Failed to find QR codes' })
                };
            }

            if (!availableQRCodes || availableQRCodes.length === 0) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: 'No available QR codes' })
                };
            }

            const qrCode = availableQRCodes[0];

            // Помечаем QR-код как использованный
            const { error: updateQRError } = await supabase
                .from('qr_codes')
                .update({
                    is_used: true,
                    used_at: new Date().toISOString(),
                    order_id: orderId
                })
                .eq('id', qrCode.id)
                .eq('is_used', false);

            if (updateQRError) {
                console.error('Error updating QR code:', updateQRError);
                // Продолжаем выполнение, даже если не удалось обновить статус
            }

            // Обновляем заказ
            const { error: updateOrderError } = await supabase
                .from('orders')
                .update({
                    qr_code_id: qrCode.id,
                    status: 'completed',
                    updated_at: new Date().toISOString()
                })
                .eq('id', orderId);

            if (updateOrderError) {
                console.error('Error updating order:', updateOrderError);
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ qrCode, order: { ...order, status: 'completed' } })
            };
        }

        if (httpMethod === 'POST' && action === 'update-order-status') {
            // Обновление статуса заказа
            const { orderId, status } = JSON.parse(event.body);
            
            if (!orderId || !status) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Order ID and status are required' })
                };
            }

            // БЕЗОПАСНОСТЬ: Логируем принудительное обновление статуса
            console.warn(`SECURITY: Forced status update for order ${orderId} to ${status}`);
            
            const { data, error } = await supabase
                .from('orders')
                .update({ status })
                .eq('id', orderId)
                .select()
                .single();

            if (error) {
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ error: 'Failed to update order' })
                };
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ order: data })
            };
        }

        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ error: 'Endpoint not found' })
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};