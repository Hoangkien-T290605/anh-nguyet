-- Gallery nhiều ảnh cho sản phẩm. Giữ products.image làm ảnh chính tương thích.
-- Migration idempotent về dữ liệu: chỉ đưa ảnh hiện có vào gallery khi chưa có ảnh cho sản phẩm.
-- Kiểm tra backup/schema và thực thi bằng quy trình migration được phê duyệt; không tự chạy.

CREATE TABLE IF NOT EXISTS product_images (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id INT UNSIGNED NOT NULL,
  image_url VARCHAR(2048) NOT NULL,
  file_name VARCHAR(255) DEFAULT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_images_file_name (file_name),
  KEY idx_product_images_product_order (product_id, sort_order, id),
  CONSTRAINT fk_product_images_product
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO product_images (product_id, image_url, sort_order, is_primary)
SELECT p.id, p.image, 0, 1
FROM products p
WHERE p.image IS NOT NULL AND TRIM(p.image) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM product_images existing WHERE existing.product_id = p.id
  );
