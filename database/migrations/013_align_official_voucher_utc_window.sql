-- Migration 013: chuẩn hóa thời hạn Voucher chính thức theo UTC.
-- Migration 011 dùng CURRENT_TIMESTAMP nhưng API so sánh DATETIME với UTC_TIMESTAMP.
-- Chỉ cập nhật ba Voucher chính thức còn ở tương lai do lệch múi giờ; không đổi lượt dùng.
-- Chạy qua migration runner sau khi có backup/restore attestation hợp lệ.

UPDATE vouchers
SET starts_at = UTC_TIMESTAMP(),
    ends_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 YEAR)
WHERE is_active = 1
  AND quantity_limit = 100
  AND used_count = 0
  AND per_customer_limit IS NULL
  AND ends_at = DATE_ADD(starts_at, INTERVAL 1 YEAR)
  AND starts_at > UTC_TIMESTAMP()
  AND (
    (code = 'ANHNGUYET10' AND campaign_name = 'ANHNGUYET10'
      AND discount_type = 'percentage' AND discount_value = 10.00
      AND minimum_subtotal = 100000.00 AND maximum_discount = 50000.00)
    OR
    (code = 'ANHNGUYET20' AND campaign_name = 'ANHNGUYET20'
      AND discount_type = 'fixed' AND discount_value = 20000.00
      AND minimum_subtotal = 150000.00 AND maximum_discount IS NULL)
    OR
    (code = 'CHAOMUNG30' AND campaign_name = 'CHAOMUNG30'
      AND discount_type = 'fixed' AND discount_value = 30000.00
      AND minimum_subtotal = 200000.00 AND maximum_discount IS NULL)
  );
