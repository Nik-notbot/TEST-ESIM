// Функция для получения статистики продаж
// Используется для уведомлений и отчетов

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
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

        // Получаем параметры из запроса
        const { period = 'today' } = event.queryStringParameters || {};

        let startDate, endDate;
        const now = new Date();

        // Определяем период
        switch (period) {
            case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
                break;
            case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                endDate = now;
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = now;
                break;
            default:
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
        }

        // Получаем статистику продаж
        const { data: orders, error } = await supabase
            .from('orders')
            .select(`
                id,
                amount,
                currency,
                status,
                created_at,
                esim_plans(name, data_gb)
            `)
            .eq('status', 'paid')
            .gte('created_at', startDate.toISOString())
            .lt('created_at', endDate.toISOString())
            .order('created_at', { ascending: false });

        if (error) {
            throw error;
        }

        // Вычисляем статистику
        const stats = {
            period: period,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            totalSales: orders.length,
            totalRevenue: orders.reduce((sum, order) => sum + parseFloat(order.amount), 0),
            currency: orders.length > 0 ? orders[0].currency : 'RUB',
            plans: {},
            recentOrders: orders.slice(0, 5) // Последние 5 заказов
        };

        // Группируем по тарифам
        orders.forEach(order => {
            const planName = order.esim_plans?.name || 'Неизвестно';
            if (!stats.plans[planName]) {
                stats.plans[planName] = {
                    count: 0,
                    revenue: 0
                };
            }
            stats.plans[planName].count++;
            stats.plans[planName].revenue += parseFloat(order.amount);
        });

        // Форматируем статистику для Telegram
        const formatStatsForTelegram = (stats) => {
            const periodNames = {
                'today': 'сегодня',
                'week': 'за неделю',
                'month': 'за месяц'
            };

            let message = `📊 <b>СТАТИСТИКА ПРОДАЖ ${periodNames[stats.period].toUpperCase()}</b>\n\n`;
            
            message += `💰 <b>Общая выручка:</b> ${stats.totalRevenue.toLocaleString('ru-RU')} ${stats.currency}\n`;
            message += `🛒 <b>Количество продаж:</b> ${stats.totalSales}\n`;
            message += `📈 <b>Средний чек:</b> ${stats.totalSales > 0 ? (stats.totalRevenue / stats.totalSales).toFixed(0) : 0} ${stats.currency}\n\n`;

            if (Object.keys(stats.plans).length > 0) {
                message += `<b>📋 По тарифам:</b>\n`;
                Object.entries(stats.plans).forEach(([planName, planStats]) => {
                    message += `• ${planName}: ${planStats.count} шт. (${planStats.revenue.toLocaleString('ru-RU')} ${stats.currency})\n`;
                });
                message += '\n';
            }

            if (stats.recentOrders.length > 0) {
                message += `<b>🕐 Последние заказы:</b>\n`;
                stats.recentOrders.forEach(order => {
                    const time = new Date(order.created_at).toLocaleString('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    message += `• ${time} - ${order.amount} ${order.currency}\n`;
                });
            }

            return message;
        };

        // Если запрос с параметром telegram=true, форматируем для Telegram
        if (event.queryStringParameters?.telegram === 'true') {
            const telegramMessage = formatStatsForTelegram(stats);
            
            // Отправляем в Telegram
            const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
            const telegramChatId = process.env.TELEGRAM_CHAT_ID;

            if (telegramBotToken && telegramChatId) {
                try {
                    const telegramResponse = await fetch(
                        `https://api.telegram.org/bot${telegramBotToken}/sendMessage`,
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                chat_id: telegramChatId,
                                text: telegramMessage,
                                parse_mode: 'HTML'
                            })
                        }
                    );

                    if (telegramResponse.ok) {
                        console.log('Статистика отправлена в Telegram');
                    }
                } catch (telegramError) {
                    console.error('Ошибка отправки статистики в Telegram:', telegramError);
                }
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                stats: stats,
                telegramMessage: event.queryStringParameters?.telegram === 'true' ? formatStatsForTelegram(stats) : null
            })
        };

    } catch (error) {
        console.error('Error getting sales stats:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Failed to get sales statistics',
                message: error.message
            })
        };
    }
};