-- Migration 003: yêu thích theo tài khoản và đánh giá gắn với khách đã mua.
-- Từng thay đổi được kiểm tra trong information_schema để có thể tiếp tục an toàn.

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

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_reviews'
     AND COLUMN_NAME = 'customer_id') = 0,
  'ALTER TABLE product_reviews ADD COLUMN customer_id INT NULL AFTER customer_name',
  'SELECT 1'
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_reviews'
     AND COLUMN_NAME = 'is_visible') = 0,
  'ALTER TABLE product_reviews ADD COLUMN is_visible TINYINT(1) NOT NULL DEFAULT 1 AFTER media',
  'SELECT 1'
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_reviews'
     AND INDEX_NAME = 'uq_product_reviews_customer_product') = 0,
  'ALTER TABLE product_reviews ADD UNIQUE KEY uq_product_reviews_customer_product (customer_id, product_id)',
  'SELECT 1'
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_reviews'
     AND INDEX_NAME = 'idx_product_reviews_visible_created') = 0,
  'ALTER TABLE product_reviews ADD KEY idx_product_reviews_visible_created (is_visible, created_at)',
  'SELECT 1'
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_product_reviews_customer') = 0,
  'ALTER TABLE product_reviews ADD CONSTRAINT fk_product_reviews_customer FOREIGN KEY (customer_id) REFERENCES users (id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;
