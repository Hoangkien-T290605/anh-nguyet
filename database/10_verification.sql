USE `anh_nguyet`;

-- Danh sách bảng.
SHOW FULL TABLES WHERE Table_type = 'BASE TABLE';

-- Số lượng dữ liệu tổng quát, không trả thông tin cá nhân.
SELECT
  (SELECT COUNT(*) FROM products) AS product_count,
  (SELECT COUNT(*) FROM users) AS user_count,
  (SELECT COUNT(*) FROM orders) AS order_count,
  (SELECT COUNT(*) FROM order_items) AS order_item_count,
  (SELECT COUNT(*) FROM user_cart_items) AS cart_item_count;

-- Cột phục vụ giỏ hàng, idempotency, thanh toán và vận chuyển.
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND ((TABLE_NAME = 'user_cart_items')
    OR (TABLE_NAME = 'orders' AND COLUMN_NAME IN (
      'customer_id', 'idempotency_key', 'request_fingerprint',
      'payment_method', 'payment_status', 'shipping_fee', 'total_amount'
    ))
    OR (TABLE_NAME = 'shipping_configuration'))
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- Quan hệ khóa ngoại và chỉ mục.
SELECT TABLE_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
ORDER BY TABLE_NAME, CONSTRAINT_NAME;

SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, COLUMN_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('users', 'products', 'user_cart_items', 'orders', 'order_items')
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

-- Phí NULL có nghĩa chính sách vận chuyển chưa được cấu hình.
SELECT id, flat_fee, updated_at FROM shipping_configuration;
