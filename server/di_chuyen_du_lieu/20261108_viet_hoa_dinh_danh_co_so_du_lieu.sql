-- Đổi tên vật lý các bảng, cột và index sang tiếng Việt không dấu.
-- Chạy bằng script migration thử nghiệm đã kiểm tra từng đối tượng.

RENAME TABLE
  users TO nguoi_dung,
  products TO san_pham,
  user_addresses TO dia_chi_nguoi_dung,
  product_reviews TO danh_gia_san_pham,
  orders TO don_hang,
  order_items TO chi_tiet_don_hang,
  user_cart_items TO chi_tiet_gio_hang;

ALTER TABLE nguoi_dung
  RENAME COLUMN id TO ma_nguoi_dung,
  RENAME COLUMN full_name TO ho_ten,
  RENAME COLUMN password TO mat_khau_ma_hoa,
  RENAME COLUMN phone TO so_dien_thoai,
  RENAME COLUMN address TO dia_chi_mac_dinh,
  RENAME COLUMN avatar_url TO duong_dan_anh_dai_dien,
  RENAME COLUMN role TO vai_tro,
  RENAME COLUMN created_at TO ngay_tao,
  RENAME COLUMN updated_at TO ngay_cap_nhat;

ALTER TABLE danh_gia_san_pham DROP CHECK chk_review_rating;

ALTER TABLE san_pham
  RENAME COLUMN id TO ma_san_pham,
  RENAME COLUMN name TO ten_san_pham,
  RENAME COLUMN description TO mo_ta,
  RENAME COLUMN price TO gia_ban,
  RENAME COLUMN category TO danh_muc,
  RENAME COLUMN image TO duong_dan_anh,
  RENAME COLUMN stock TO so_luong_ton,
  RENAME COLUMN featured TO noi_bat,
  RENAME COLUMN active TO dang_kinh_doanh,
  RENAME COLUMN created_at TO ngay_tao,
  RENAME COLUMN updated_at TO ngay_cap_nhat;

ALTER TABLE dia_chi_nguoi_dung
  RENAME COLUMN id TO ma_dia_chi,
  RENAME COLUMN user_id TO ma_nguoi_dung,
  RENAME COLUMN recipient_name TO ten_nguoi_nhan,
  RENAME COLUMN phone TO so_dien_thoai,
  RENAME COLUMN address TO dia_chi_day_du,
  RENAME COLUMN is_default TO mac_dinh,
  RENAME COLUMN created_at TO ngay_tao,
  RENAME COLUMN updated_at TO ngay_cap_nhat,
  RENAME COLUMN latitude TO vi_do,
  RENAME COLUMN longitude TO kinh_do;

ALTER TABLE danh_gia_san_pham
  RENAME COLUMN id TO ma_danh_gia,
  RENAME COLUMN product_id TO ma_san_pham,
  RENAME COLUMN customer_name TO ten_khach_hang,
  RENAME COLUMN rating TO so_sao,
  RENAME COLUMN comment TO noi_dung,
  RENAME COLUMN media TO tep_dinh_kem,
  RENAME COLUMN created_at TO ngay_tao;

ALTER TABLE don_hang
  RENAME COLUMN id TO ma_don_hang,
  RENAME COLUMN customer_id TO ma_nguoi_dat,
  RENAME COLUMN user_address_id TO ma_dia_chi,
  RENAME COLUMN recipient_name TO ten_nguoi_nhan,
  RENAME COLUMN recipient_phone TO so_dien_thoai_nhan,
  RENAME COLUMN shipping_address TO dia_chi_giao_hang,
  RENAME COLUMN subtotal TO tam_tinh,
  RENAME COLUMN shipping_fee TO phi_van_chuyen,
  RENAME COLUMN total_amount TO tong_tien,
  RENAME COLUMN status TO trang_thai,
  RENAME COLUMN created_at TO ngay_tao,
  RENAME COLUMN updated_at TO ngay_cap_nhat,
  RENAME COLUMN idempotency_key TO ma_yeu_cau,
  RENAME COLUMN request_fingerprint TO dau_van_tay_yeu_cau;

ALTER TABLE chi_tiet_don_hang
  RENAME COLUMN id TO ma_chi_tiet,
  RENAME COLUMN order_id TO ma_don_hang,
  RENAME COLUMN product_id TO ma_san_pham,
  RENAME COLUMN product_name TO ten_san_pham_luc_dat,
  RENAME COLUMN product_category TO danh_muc_luc_dat,
  RENAME COLUMN product_image TO anh_san_pham_luc_dat,
  RENAME COLUMN unit_price TO don_gia,
  RENAME COLUMN quantity TO so_luong,
  RENAME COLUMN line_total TO thanh_tien,
  RENAME COLUMN created_at TO ngay_tao;

ALTER TABLE chi_tiet_gio_hang
  DROP CHECK chk_user_cart_quantity;

ALTER TABLE chi_tiet_gio_hang
  RENAME COLUMN user_id TO ma_nguoi_dung,
  RENAME COLUMN product_id TO ma_san_pham,
  RENAME COLUMN quantity TO so_luong,
  RENAME COLUMN created_at TO ngay_tao,
  RENAME COLUMN updated_at TO ngay_cap_nhat;

ALTER TABLE danh_gia_san_pham
  ADD CONSTRAINT ck_danh_gia_san_pham_so_sao CHECK (so_sao BETWEEN 1 AND 5);

ALTER TABLE chi_tiet_gio_hang
  ADD CONSTRAINT ck_chi_tiet_gio_hang_so_luong CHECK (so_luong > 0);

ALTER TABLE nguoi_dung RENAME INDEX email TO uq_nguoi_dung_email;
ALTER TABLE dia_chi_nguoi_dung RENAME INDEX fk_user_addresses_user TO ix_dia_chi_nguoi_dung_ma_nguoi_dung;
ALTER TABLE danh_gia_san_pham RENAME INDEX idx_review_product TO ix_danh_gia_san_pham_ma_san_pham;
ALTER TABLE danh_gia_san_pham RENAME INDEX idx_review_rating TO ix_danh_gia_san_pham_ma_san_pham_so_sao;
ALTER TABLE don_hang RENAME INDEX idx_orders_customer_created TO ix_don_hang_nguoi_dat_ngay_tao;
ALTER TABLE don_hang RENAME INDEX idx_orders_status_created TO ix_don_hang_trang_thai_ngay_tao;
ALTER TABLE don_hang RENAME INDEX fk_orders_user_address TO ix_don_hang_ma_dia_chi;
ALTER TABLE don_hang RENAME INDEX uq_orders_idempotency_key TO uq_don_hang_ma_yeu_cau;
ALTER TABLE chi_tiet_don_hang RENAME INDEX idx_order_items_order TO ix_chi_tiet_don_hang_ma_don_hang;
ALTER TABLE chi_tiet_don_hang RENAME INDEX idx_order_items_product TO ix_chi_tiet_don_hang_ma_san_pham;
ALTER TABLE chi_tiet_gio_hang RENAME INDEX idx_user_cart_product TO ix_chi_tiet_gio_hang_ma_san_pham;
