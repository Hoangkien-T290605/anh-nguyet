-- Migration 010: lưu thông tin chi tiết sản phẩm theo cấu trúc mở rộng.
-- Chỉ bổ sung một cột nullable; không sửa hoặc tự điền nội dung sản phẩm hiện có.
-- Thực thi qua production runner sau khi backup/schema preflight được xác minh.

ALTER TABLE products
  ADD COLUMN product_details JSON DEFAULT NULL;
