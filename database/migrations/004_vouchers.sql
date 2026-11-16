-- Migration 004: voucher và ảnh chụp giảm giá bất biến trên đơn hàng.
-- Chỉ áp dụng qua migration runner sau khi sao lưu/kiểm tra schema; không tự chạy.

CREATE TABLE IF NOT EXISTS vouchers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL,
  campaign_name VARCHAR(150) NOT NULL,
  discount_type ENUM('percentage', 'fixed') NOT NULL,
  discount_value DECIMAL(12,2) NOT NULL,
  minimum_subtotal DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  maximum_discount DECIMAL(14,2) DEFAULT NULL,
  quantity_limit INT UNSIGNED NOT NULL,
  used_count INT UNSIGNED NOT NULL DEFAULT 0,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vouchers_code (code),
  KEY idx_vouchers_active_dates (is_active, starts_at, ends_at),
  CONSTRAINT chk_vouchers_discount_value CHECK (discount_value > 0),
  CONSTRAINT chk_vouchers_percentage CHECK (discount_type <> 'percentage' OR discount_value <= 100),
  CONSTRAINT chk_vouchers_minimum CHECK (minimum_subtotal >= 0),
  CONSTRAINT chk_vouchers_max_discount CHECK (maximum_discount IS NULL OR maximum_discount > 0),
  CONSTRAINT chk_vouchers_quantity CHECK (quantity_limit > 0 AND used_count <= quantity_limit),
  CONSTRAINT chk_vouchers_dates CHECK (ends_at > starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET @voucher_order_columns = NULL;
SELECT GROUP_CONCAT(column_clause ORDER BY column_order SEPARATOR ', ')
  INTO @voucher_order_columns
FROM (
  SELECT 1 AS column_order, 'ADD COLUMN voucher_id BIGINT UNSIGNED DEFAULT NULL' AS column_clause
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'voucher_id')
  UNION ALL
  SELECT 2, 'ADD COLUMN voucher_code VARCHAR(40) DEFAULT NULL'
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'voucher_code')
  UNION ALL
  SELECT 3, 'ADD COLUMN voucher_campaign_name VARCHAR(150) DEFAULT NULL'
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'voucher_campaign_name')
  UNION ALL
  SELECT 4, 'ADD COLUMN voucher_discount_type VARCHAR(20) DEFAULT NULL'
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'voucher_discount_type')
  UNION ALL
  SELECT 5, 'ADD COLUMN voucher_discount_value DECIMAL(12,2) DEFAULT NULL'
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'voucher_discount_value')
  UNION ALL
  SELECT 6, 'ADD COLUMN discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00'
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'discount_amount')
) AS missing_order_columns;
SET @ddl = IF(@voucher_order_columns IS NULL, 'SELECT 1', CONCAT('ALTER TABLE orders ', @voucher_order_columns));
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_voucher_id') = 0,
  'ALTER TABLE orders ADD KEY idx_orders_voucher_id (voucher_id)', 'SELECT 1'
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_orders_voucher') = 0,
  'ALTER TABLE orders ADD CONSTRAINT fk_orders_voucher FOREIGN KEY (voucher_id) REFERENCES vouchers (id) ON DELETE SET NULL', 'SELECT 1'
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND CONSTRAINT_NAME = 'chk_orders_discount_amount') = 0,
  'ALTER TABLE orders ADD CONSTRAINT chk_orders_discount_amount CHECK (discount_amount >= 0)', 'SELECT 1'
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

CREATE TABLE IF NOT EXISTS voucher_redemptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  voucher_id BIGINT UNSIGNED NOT NULL,
  order_id BIGINT UNSIGNED NOT NULL,
  customer_id INT DEFAULT NULL,
  voucher_code_snapshot VARCHAR(40) NOT NULL,
  discount_amount DECIMAL(14,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_voucher_redemptions_order (order_id),
  KEY idx_voucher_redemptions_voucher (voucher_id, created_at),
  KEY idx_voucher_redemptions_customer (customer_id, created_at),
  CONSTRAINT fk_voucher_redemptions_voucher
    FOREIGN KEY (voucher_id) REFERENCES vouchers (id) ON DELETE RESTRICT,
  CONSTRAINT fk_voucher_redemptions_order
    FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_voucher_redemptions_customer
    FOREIGN KEY (customer_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_voucher_redemptions_discount CHECK (discount_amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
