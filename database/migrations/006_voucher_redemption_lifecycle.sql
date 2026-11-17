-- Migration 006: tách lượt voucher đang giữ cho đơn chờ xử lý khỏi lượt đã hoàn tất.
-- Các lượt có trước migration được giữ là redeemed để không tự ý thay đổi used_count.
-- Chỉ bổ sung cấu trúc; chưa tự động áp dụng lên bất kỳ database nào.

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'voucher_redemptions'
     AND COLUMN_NAME = 'usage_status') = 0,
  'ALTER TABLE voucher_redemptions ADD COLUMN usage_status ENUM(''reserved'',''redeemed'',''released'') NOT NULL DEFAULT ''redeemed'' AFTER discount_amount',
  'SELECT 1'
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'voucher_redemptions'
     AND INDEX_NAME = 'idx_voucher_redemptions_status') = 0,
  'ALTER TABLE voucher_redemptions ADD KEY idx_voucher_redemptions_status (usage_status, voucher_id)',
  'SELECT 1'
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;
