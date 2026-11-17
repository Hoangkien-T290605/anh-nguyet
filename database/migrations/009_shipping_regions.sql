-- Migration 009: tạo ba khu vực với các mức phí vận chuyển đã được xác nhận.
-- Admin có thể cập nhật hoặc tạm tắt khu vực bằng giao diện quản trị.
-- Áp dụng riêng qua production migration runner sau backup/preflight đạt yêu cầu.

CREATE TABLE IF NOT EXISTS shipping_regions (
  id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  region_code VARCHAR(32) NOT NULL,
  region_name VARCHAR(100) NOT NULL,
  fee DECIMAL(12,2) DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_shipping_regions_code (region_code),
  KEY idx_shipping_regions_active_code (is_active, region_code),
  CONSTRAINT chk_shipping_regions_fee CHECK (fee IS NULL OR fee >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'shipping_region_code') = 0,
  'ALTER TABLE orders ADD COLUMN shipping_region_code VARCHAR(32) DEFAULT NULL',
  'SELECT 1'
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'shipping_region_name') = 0,
  'ALTER TABLE orders ADD COLUMN shipping_region_name VARCHAR(100) DEFAULT NULL',
  'SELECT 1'
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

INSERT INTO shipping_regions (region_code, region_name, fee, is_active)
SELECT seed.region_code, seed.region_name, seed.fee, TRUE
FROM (
  SELECT 'NOI_THANH' AS region_code, 'Nội thành' AS region_name, 20000.00 AS fee
  UNION ALL SELECT 'NGOAI_THANH', 'Ngoại thành', 30000.00
  UNION ALL SELECT 'TINH_THANH_KHAC', 'Tỉnh/thành khác', 35000.00
) AS seed
WHERE NOT EXISTS (
  SELECT 1 FROM shipping_regions current_region WHERE current_region.region_code = seed.region_code
);
