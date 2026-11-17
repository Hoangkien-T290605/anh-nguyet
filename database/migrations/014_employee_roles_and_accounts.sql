-- Migration 014: hỗ trợ vai trò Employee và vòng đời tài khoản.
-- Không đổi role của các tài khoản hiện có; customer/admin vẫn giữ nguyên.
-- Chạy bằng runner đã được phê duyệt sau backup và xác minh môi trường.

ALTER TABLE users
  MODIFY COLUMN role ENUM('customer', 'employee', 'admin') NOT NULL DEFAULT 'customer';

SET @has_is_active := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_active'
);
SET @sql_is_active := IF(@has_is_active = 0,
  'ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER role',
  'SELECT 1');
PREPARE stmt_is_active FROM @sql_is_active;
EXECUTE stmt_is_active;
DEALLOCATE PREPARE stmt_is_active;

SET @has_must_change_password := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'must_change_password'
);
SET @sql_must_change_password := IF(@has_must_change_password = 0,
  'ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active',
  'SELECT 1');
PREPARE stmt_must_change_password FROM @sql_must_change_password;
EXECUTE stmt_must_change_password;
DEALLOCATE PREPARE stmt_must_change_password;

CREATE TABLE employee_invitations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(150) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  invited_by_admin_id INT NOT NULL,
  accepted_user_id INT NULL,
  revoked_by_admin_id INT NULL,
  status ENUM('pending', 'accepted', 'expired', 'revoked') NOT NULL DEFAULT 'pending',
  email_delivery_status ENUM('pending', 'sending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
  last_email_error_code VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME NULL,
  expires_at DATETIME NOT NULL,
  accepted_at DATETIME NULL,
  revoked_at DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  pending_email VARCHAR(150) GENERATED ALWAYS AS (
    CASE WHEN status = 'pending' THEN email ELSE NULL END
  ) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_invitations_token_hash (token_hash),
  UNIQUE KEY uq_employee_invitations_pending_email (pending_email),
  KEY idx_employee_invitations_status_expiry (status, expires_at),
  KEY idx_employee_invitations_inviter (invited_by_admin_id, created_at),
  CONSTRAINT fk_employee_invitations_inviter FOREIGN KEY (invited_by_admin_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_employee_invitations_accepted_user FOREIGN KEY (accepted_user_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_employee_invitations_revoker FOREIGN KEY (revoked_by_admin_id)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE employee_role_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_user_id INT NOT NULL,
  admin_user_id INT NULL,
  invitation_id BIGINT UNSIGNED NULL,
  action ENUM('granted', 'revoked', 'activated', 'deactivated', 'invitation_accepted') NOT NULL,
  role_before ENUM('customer', 'employee', 'admin') NULL,
  role_after ENUM('customer', 'employee', 'admin') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_employee_role_history_user_created (employee_user_id, created_at, id),
  KEY idx_employee_role_history_admin_created (admin_user_id, created_at),
  CONSTRAINT fk_employee_role_history_employee FOREIGN KEY (employee_user_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_employee_role_history_admin FOREIGN KEY (admin_user_id)
    REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_employee_role_history_invitation FOREIGN KEY (invitation_id)
    REFERENCES employee_invitations (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
