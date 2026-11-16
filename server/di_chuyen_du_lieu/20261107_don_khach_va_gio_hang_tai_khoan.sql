-- Bổ sung đơn khách, giỏ hàng theo tài khoản và phân quyền quản trị.
-- Chỉ chạy qua trình migration đã kiểm tra schema và database đích.

-- Cho phép khách vãng lai tạo đơn nhưng giữ nguyên thông tin người nhận.
ALTER TABLE orders
  MODIFY COLUMN customer_id INT NULL;

-- Bổ sung khóa chống tạo đơn trùng và dấu vân tay nội dung yêu cầu.
ALTER TABLE orders
  ADD COLUMN idempotency_key CHAR(36) NULL;

ALTER TABLE orders
  ADD COLUMN request_fingerprint CHAR(64) NULL;

ALTER TABLE orders
  ADD UNIQUE KEY uq_orders_idempotency_key (idempotency_key);

-- Tài khoản mới mặc định là khách; migration không cấp quyền Admin.
ALTER TABLE users
  ADD COLUMN role ENUM('customer', 'admin') NOT NULL DEFAULT 'customer';

-- Lưu giỏ hàng đồng bộ theo tài khoản và liên kết với sản phẩm hiện có.
CREATE TABLE IF NOT EXISTS user_cart_items (
  user_id INT NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, product_id),
  KEY idx_user_cart_product (product_id),
  CONSTRAINT fk_user_cart_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_user_cart_product
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT chk_user_cart_quantity CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Tài khoản hiện có mặc định là khách hàng. Không tự động cấp quyền quản trị.
