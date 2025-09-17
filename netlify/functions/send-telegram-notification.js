// Функция для отправки уведомлений в Telegram
// Используется для уведомлений о продажах

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
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
        const { orderData, notificationType = 'sale' } = JSON.parse(event.body);

        // Получаем настройки Telegram из переменных окружения
        const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
        const telegramChatIds = process.env.TELEGRAM_CHAT_IDS || process.env.TELEGRAM_CHAT_ID;

        if (!telegramBotToken || !telegramChatIds) {
            console.log('Telegram not configured, skipping notification');
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ 
                    success: true, 
                    message: 'Telegram not configured, notification skipped' 
                })
            };
        }

        // Поддерживаем как один Chat ID, так и несколько (через запятую)
        const chatIds = telegramChatIds.split(',').map(id => id.trim()).filter(id => id);
        
        if (chatIds.length === 0) {
            console.log('No valid chat IDs found');
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ 
                    success: true, 
                    message: 'No valid chat IDs found, notification skipped' 
                })
            };
        }

        // Формируем сообщение в зависимости от типа уведомления
        let message = '';
        
        if (notificationType === 'sale') {
            message = formatSaleNotification(orderData);
        } else if (notificationType === 'error') {
            message = formatErrorNotification(orderData);
        } else {
            message = formatGenericNotification(orderData);
        }

        // Отправляем сообщение всем указанным пользователям
        const results = [];
        const errors = [];

        for (const chatId of chatIds) {
            try {
                console.log(`Sending notification to chat ID: ${chatId}`);
                
                const telegramResponse = await fetch(
                    `https://api.telegram.org/bot${telegramBotToken}/sendMessage`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            chat_id: chatId,
                            text: message,
                            parse_mode: 'HTML',
                            disable_web_page_preview: true
                        })
                    }
                );

                if (!telegramResponse.ok) {
                    const errorText = await telegramResponse.text();
                    console.error(`Telegram API error for chat ${chatId}:`, errorText);
                    errors.push({ chatId, error: errorText });
                } else {
                    const telegramResult = await telegramResponse.json();
                    console.log(`Telegram notification sent to ${chatId}:`, telegramResult.message_id);
                    results.push({ 
                        chatId, 
                        messageId: telegramResult.message_id,
                        success: true 
                    });
                }
            } catch (error) {
                console.error(`Error sending to chat ${chatId}:`, error);
                errors.push({ chatId, error: error.message });
            }
        }

        // Возвращаем результат
        const successCount = results.length;
        const errorCount = errors.length;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                success: successCount > 0,
                message: `Notifications sent: ${successCount} success, ${errorCount} errors`,
                results: results,
                errors: errors,
                total_recipients: chatIds.length
            })
        };

    } catch (error) {
        console.error('Error sending notification:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Failed to send notification',
                message: error.message 
            })
        };
    }
};

// Форматирование уведомления о продаже
function formatSaleNotification(orderData) {
    const {
        id: orderId,
        customer_email,
        customer_phone,
        amount,
        currency = 'RUB',
        esim_plans,
        created_at
    } = orderData;

    const orderTime = new Date(created_at).toLocaleString('ru-RU', {
        timeZone: 'Europe/Moscow',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });

    return `🛒 <b>НОВАЯ ПРОДАЖА eSIM!</b>

📋 <b>Заказ:</b> #${orderId.substring(0, 8)}
💰 <b>Сумма:</b> ${amount} ${currency}
📧 <b>Email:</b> ${customer_email || 'Не указан'}
📞 <b>Телефон:</b> ${customer_phone || 'Не указан'}
🎯 <b>Тариф:</b> ${esim_plans?.name || 'Неизвестно'} (${esim_plans?.data_gb || '?'} ГБ)
⏰ <b>Время:</b> ${orderTime}

💡 <i>Проверьте админ панель для деталей</i>`;
}

// Форматирование уведомления об ошибке
function formatErrorNotification(errorData) {
    return `⚠️ <b>ОШИБКА В СИСТЕМЕ</b>

🔍 <b>Тип:</b> ${errorData.type || 'Неизвестная ошибка'}
📝 <b>Описание:</b> ${errorData.message || 'Нет описания'}
⏰ <b>Время:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}

🚨 <i>Требуется проверка системы</i>`;
}

// Форматирование общего уведомления
function formatGenericNotification(data) {
    return `📢 <b>УВЕДОМЛЕНИЕ СИСТЕМЫ</b>

📝 <b>Сообщение:</b> ${data.message || 'Нет сообщения'}
⏰ <b>Время:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`;
}