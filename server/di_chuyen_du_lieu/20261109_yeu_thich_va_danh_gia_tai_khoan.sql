-- Bổ sung danh sách yêu thích và liên kết đánh giá với tài khoản mua hàng.
-- Chỉ chạy qua migration runner trên bản sao thử nghiệm trước.
CREATE TABLE IF NOT EXISTS user_favorites (
  user_id INT NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, product_id),
  KEY idx_user_favorites_product (product_id),
  CONSTRAINT fk_user_favorites_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_user_favorites_product
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE product_reviews
  ADD COLUMN customer_id INT NULL,
  ADD COLUMN is_visible TINYINT(1) NOT NULL DEFAULT 1,
  ADD UNIQUE KEY uq_product_reviews_customer_product (customer_id, product_id),
  ADD KEY idx_product_reviews_visible_created (is_visible, created_at),
  ADD CONSTRAINT fk_product_reviews_customer
    FOREIGN KEY (customer_id) REFERENCES users (id) ON DELETE SET NULL;
