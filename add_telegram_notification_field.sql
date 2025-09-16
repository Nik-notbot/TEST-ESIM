-- Добавляем поле для отслеживания отправки Telegram уведомлений
-- Это поможет избежать дублирования сообщений

ALTER TABLE orders 
ADD COLUMN telegram_notification_sent_at TIMESTAMP WITH TIME ZONE;

-- Добавляем комментарий к полю
COMMENT ON COLUMN orders.telegram_notification_sent_at IS 'Время отправки последнего Telegram уведомления о продаже';

-- Создаем индекс для оптимизации запросов
CREATE INDEX idx_orders_telegram_notification ON orders(telegram_notification_sent_at);