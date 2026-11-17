-- Migration 011: khởi tạo ba Voucher đã được chủ dự án xác nhận.
-- Thời hạn bắt đầu tại thời điểm áp dụng thực tế và kéo dài đúng một năm.
-- Chạy sau 004, 006, 007 qua production runner có backup và xác minh schema.

INSERT INTO vouchers
  (code, campaign_name, discount_type, discount_value, minimum_subtotal,
   maximum_discount, quantity_limit, used_count, starts_at, ends_at, is_active)
VALUES
  ('ANHNGUYET10', 'ANHNGUYET10', 'percentage', 10.00, 100000.00, 50000.00, 100, 0, CURRENT_TIMESTAMP, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 YEAR), TRUE),
  ('ANHNGUYET20', 'ANHNGUYET20', 'fixed', 20000.00, 150000.00, NULL, 100, 0, CURRENT_TIMESTAMP, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 YEAR), TRUE),
  ('CHAOMUNG30', 'CHAOMUNG30', 'fixed', 30000.00, 200000.00, NULL, 100, 0, CURRENT_TIMESTAMP, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 YEAR), TRUE);
