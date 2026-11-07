-- Migration 002: chỉ bật COD và tạo nơi cấu hình phí vận chuyển tập trung.
-- Không tự gán mức phí; NULL nghĩa là chưa có chính sách chính thức.

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'payment_method') = 0,
  'ALTER TABLE orders ADD COLUMN payment_method VARCHAR(20) NULL AFTER shipping_fee',
  'SELECT 1'
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'payment_status') = 0,
  'ALTER TABLE orders ADD COLUMN payment_status ENUM(''pending'',''unpaid'',''paid'') NOT NULL DEFAULT ''pending'' AFTER payment_method',
  'SELECT 1'
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

CREATE TABLE IF NOT EXISTS shipping_configuration (
  id TINYINT UNSIGNED NOT NULL,
  flat_fee DECIMAL(12,2) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_shipping_configuration_singleton CHECK (id = 1),
  CONSTRAINT chk_shipping_configuration_fee CHECK (flat_fee IS NULL OR flat_fee >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO shipping_configuration (id, flat_fee) VALUES (1, NULL);
