-- Migration 007: mô tả voucher và giới hạn dùng theo khách hàng.
-- Bổ sung lũy tiến, không thay đổi lịch sử lượt dùng hiện có.

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME = 'vouchers' AND COLUMN_NAME = 'description') = 0,
  'ALTER TABLE vouchers ADD COLUMN description VARCHAR(500) DEFAULT NULL AFTER campaign_name',
  'SELECT 1'
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME = 'vouchers' AND COLUMN_NAME = 'per_customer_limit') = 0,
  'ALTER TABLE vouchers ADD COLUMN per_customer_limit INT UNSIGNED DEFAULT NULL AFTER quantity_limit',
  'SELECT 1'
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
   AND TABLE_NAME = 'vouchers' AND CONSTRAINT_NAME = 'chk_vouchers_customer_limit') = 0,
  'ALTER TABLE vouchers ADD CONSTRAINT chk_vouchers_customer_limit CHECK (per_customer_limit IS NULL OR per_customer_limit > 0)',
  'SELECT 1'
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;
