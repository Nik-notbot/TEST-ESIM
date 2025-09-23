-- Таблица тарифов eSIM
CREATE TABLE esim_plans (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    data_gb INTEGER NOT NULL,
    price_rub DECIMAL(10,2) NOT NULL,
    description TEXT,
    is_popular BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Таблица с QR-кодами (предзагруженные ссылки на QR-коды)
CREATE TABLE qr_codes (
    id SERIAL PRIMARY KEY,
    plan_id INTEGER REFERENCES esim_plans(id),
    qr_url VARCHAR(255) NOT NULL UNIQUE,
    country_name VARCHAR(100),
    country_code VARCHAR(10),
    esim_number VARCHAR(50),
    pin_code VARCHAR(20),
    puk_code VARCHAR(20),
    is_used BOOLEAN DEFAULT FALSE,
    order_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMP WITH TIME ZONE
);

-- Таблица заказов
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id INTEGER REFERENCES esim_plans(id),
    qr_code_id INTEGER REFERENCES qr_codes(id),
    customer_email VARCHAR(255),
    customer_phone VARCHAR(20),
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'RUB',
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, processing, paid, failed, cancelled
    payment_id VARCHAR(255), -- ID платежа от Wata
    payment_url TEXT, -- URL для оплаты от Wata
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Таблица истории платежей (для логирования всех событий от платежной системы)
CREATE TABLE payment_history (
    id SERIAL PRIMARY KEY,
    order_id UUID REFERENCES orders(id),
    event_type VARCHAR(50) NOT NULL, -- created, processing, success, failed
    payment_data JSONB, -- Полные данные от платежной системы
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для оптимизации
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_payment_id ON orders(payment_id);
CREATE INDEX idx_qr_codes_is_used ON qr_codes(is_used);
CREATE INDEX idx_qr_codes_plan_id ON qr_codes(plan_id);

-- Вставка начальных данных о тарифах
INSERT INTO esim_plans (name, data_gb, price_rub, description, is_popular) VALUES
('Стандарт', 8, 2400.00, 'Высокоскоростной интернет на месяц', false),
('Премиум', 50, 3000.00, 'Высокоскоростной интернет на месяц', true);

-- Примеры QR-кодов (замените на реальные)
-- INSERT INTO qr_codes (plan_id, qr_url) VALUES
-- (1, 'https://ibb.co/TxNLKx3x'),
-- (1, 'https://ibb.co/another-qr-1'),
-- (2, 'https://ibb.co/another-qr-2'),
-- (2, 'https://ibb.co/another-qr-3');