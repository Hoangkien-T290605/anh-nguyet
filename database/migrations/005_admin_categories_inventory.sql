-- Migration 005: danh mục có thể quản trị độc lập và lịch sử biến động tồn kho.
-- Chỉ tạo cấu trúc/bổ sung danh mục đang tồn tại; không xóa hoặc sửa sản phẩm.
-- Chưa tự động áp dụng. Chạy qua migration runner sau khi backup và phê duyệt.

CREATE TABLE IF NOT EXISTS categories (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO categories (name)
SELECT DISTINCT TRIM(category)
FROM products
WHERE category IS NOT NULL AND TRIM(category) <> '';

CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id INT UNSIGNED NOT NULL,
  admin_user_id INT DEFAULT NULL,
  movement_type ENUM('inbound', 'outbound', 'sale') NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  stock_before INT UNSIGNED NOT NULL,
  stock_after INT UNSIGNED NOT NULL,
  note VARCHAR(500) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_inventory_movements_product_created (product_id, created_at, id),
  KEY idx_inventory_movements_admin_created (admin_user_id, created_at),
  CONSTRAINT fk_inventory_movements_product FOREIGN KEY (product_id)
    REFERENCES products (id) ON DELETE RESTRICT,
  CONSTRAINT fk_inventory_movements_admin FOREIGN KEY (admin_user_id)
    REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_inventory_movements_quantity CHECK (quantity > 0),
  CONSTRAINT chk_inventory_movements_stock CHECK (
    (movement_type = 'inbound' AND stock_after = stock_before + quantity) OR
    (movement_type = 'outbound' AND stock_before = stock_after + quantity) OR
    (movement_type = 'sale' AND stock_before = stock_after + quantity)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Lưu ảnh chụp tồn kho ban đầu từ số lượng đang có, chỉ tạo một lần cho mỗi sản phẩm.
INSERT INTO inventory_movements
  (product_id, admin_user_id, movement_type, quantity, stock_before, stock_after, note)
SELECT p.id, NULL, 'inbound', p.stock, 0, p.stock, 'Ảnh chụp tồn đầu kỳ khi triển khai quản lý kho'
FROM products p
WHERE p.stock > 0
  AND NOT EXISTS (
    SELECT 1 FROM inventory_movements m
    WHERE m.product_id = p.id AND m.note = 'Ảnh chụp tồn đầu kỳ khi triển khai quản lý kho'
  );
