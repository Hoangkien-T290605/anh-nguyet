CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id INT NOT NULL,
  user_address_id INT DEFAULT NULL,
  recipient_name VARCHAR(100) NOT NULL,
  recipient_phone VARCHAR(20) NOT NULL,
  shipping_address TEXT NOT NULL,
  subtotal DECIMAL(14,2) NOT NULL,
  shipping_fee DECIMAL(14,2) DEFAULT NULL,
  total_amount DECIMAL(14,2) NOT NULL,
  status ENUM(
    'pending_confirmation',
    'confirmed',
    'preparing',
    'shipping',
    'completed',
    'cancelled'
  ) NOT NULL DEFAULT 'pending_confirmation',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_orders_customer_created (customer_id, created_at),
  KEY idx_orders_status_created (status, created_at),
  CONSTRAINT fk_orders_customer
    FOREIGN KEY (customer_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_orders_user_address
    FOREIGN KEY (user_address_id) REFERENCES user_addresses (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  product_id INT UNSIGNED DEFAULT NULL,
  product_name VARCHAR(255) NOT NULL,
  product_category VARCHAR(100) NOT NULL,
  product_image VARCHAR(2048) DEFAULT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  line_total DECIMAL(14,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_order_items_order (order_id),
  KEY idx_order_items_product (product_id),
  CONSTRAINT fk_order_items_order
    FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_product
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
