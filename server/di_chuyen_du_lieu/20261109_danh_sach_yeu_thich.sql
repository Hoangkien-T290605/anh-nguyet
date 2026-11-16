-- Danh sách yêu thích theo tài khoản; chỉ thêm bảng, không sửa dữ liệu hiện có.
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
