USE anh_nguyet;

START TRANSACTION;

DELETE FROM products;

INSERT INTO products
(name, description, price, category, image, stock, featured, active)
VALUES

-- ==========================================
-- 1. BÁNH (24 SẢN PHẨM)
-- ==========================================
('Bánh tráng trắng', NULL, 15000, 'Bánh', 'banh_trang_trang.png', 50, 0, 1),
('Bánh tráng mè', NULL, 20000, 'Bánh', 'banh_trang_me.png', 45, 0, 1),
('Bánh tráng dừa', NULL, 25000, 'Bánh', 'banh_trang_dua.png', 40, 0, 1),
('Bánh tráng sữa', NULL, 25000, 'Bánh', 'banh_trang_sua.png', 40, 0, 1),
('Bánh tráng phơi sương', NULL, 30000, 'Bánh', 'banh_trang_phoi_suong.png', 35, 0, 1),
('Bánh tráng sa tế', NULL, 20000, 'Bánh', 'banh_trang_sa_te.png', 45, 0, 1),
('Bánh tráng muối nhuyễn', NULL, 20000, 'Bánh', 'banh_trang_muoi_nhuyen.png', 45, 0, 1),
('Bánh tráng gạo lứt', NULL, 30000, 'Bánh', 'banh_trang_gao_lut.png', 35, 0, 1),
('Bánh gạo lứt', NULL, 35000, 'Bánh', 'banh_gao_lut.png', 40, 0, 1),
('Bánh gạo rong biển', NULL, 40000, 'Bánh', 'banh_gao_rong_bien.png', 40, 0, 1),
('Bánh gạo phô mai', NULL, 40000, 'Bánh', 'banh_gao_pho_mai.png', 35, 0, 1),
('Bánh gạo vị cay', NULL, 35000, 'Bánh', 'banh_gao_vi_cay.png', 35, 0, 1),
('Bánh gạo vị mật ong', NULL, 40000, 'Bánh', 'banh_gao_vi_mat_ong.png', 35, 0, 1),
('Cơm cháy truyền thống', NULL, 35000, 'Bánh', 'com_chay_truyen_thong.png', 40, 0, 1),
('Cơm cháy chà bông', NULL, 45000, 'Bánh', 'com_chay_cha_bong.png', 40, 0, 1),
('Cơm cháy khô gà', NULL, 45000, 'Bánh', 'com_chay_kho_ga.png', 35, 0, 1),
('Cơm cháy mắm hành', NULL, 40000, 'Bánh', 'com_chay_mam_hanh.png', 40, 0, 1),
('Cơm cháy nước mắm', NULL, 35000, 'Bánh', 'com_chay_nuoc_mam.png', 40, 0, 1),
('Cơm cháy rong biển', NULL, 40000, 'Bánh', 'com_chay_rong_bien.png', 35, 0, 1),
('Cơm cháy gạo lứt', NULL, 45000, 'Bánh', 'com_chay_gao_lut.png', 30, 0, 1),
('Cốm nếp than', NULL, 40000, 'Bánh', 'com_nep_than.png', 30, 0, 1),
('Cốm nếp cẩm', NULL, 40000, 'Bánh', 'com_nep_cam.png', 30, 0, 1),
('Cốm gạo lứt', NULL, 35000, 'Bánh', 'com_gao_lut.png', 35, 0, 1),
('Cốm xanh', NULL, 40000, 'Bánh', 'com_xanh.png', 30, 0, 1),

-- ==========================================
-- 2. GẠO, BỘT (10 SẢN PHẨM)
-- ==========================================
('Gạo nếp than', NULL, 45000, 'Gạo, bột', 'gao_nep_than.png', 40, 0, 1),
('Gạo lứt tím than', NULL, 40000, 'Gạo, bột', 'gao_lut_tim_than.png', 40, 0, 1),
('Gạo lứt đỏ', NULL, 35000, 'Gạo, bột', 'gao_lut_do.png', 40, 0, 1),
('Gạo ST25', NULL, 45000, 'Gạo, bột', 'gao_st25.png', 50, 0, 1),
('Gạo thơm', NULL, 30000, 'Gạo, bột', 'gao_thom.png', 50, 0, 1),
('Bột gạo tẻ', NULL, 25000, 'Gạo, bột', 'bot_gao_te.png', 40, 0, 1),
('Bột gạo nếp', NULL, 30000, 'Gạo, bột', 'bot_gao_nep.png', 40, 0, 1),
('Bột gạo lứt', NULL, 35000, 'Gạo, bột', 'bot_gao_lut.png', 35, 0, 1),
('Bột sữa gạo', NULL, 45000, 'Gạo, bột', 'bot_sua_gao.png', 30, 0, 1),
('Bột gạo hòa tan', NULL, 40000, 'Gạo, bột', 'bot_gao_hoa_tan.png', 35, 0, 1),

-- ==========================================
-- 3. ĐỒ UỐNG (13 SẢN PHẨM)
-- ==========================================
('Sữa gạo', NULL, 25000, 'Đồ uống', 'sua_gao.png', 40, 0, 1),
('Sữa gạo lứt', NULL, 30000, 'Đồ uống', 'sua_gao_lut.png', 40, 0, 1),
('Sữa gạo rang', NULL, 30000, 'Đồ uống', 'sua_gao_rang.png', 40, 0, 1),
('Sữa gạo đậu đen', NULL, 35000, 'Đồ uống', 'sua_gao_dau_den.png', 35, 0, 1),
('Sữa gạo mè đen', NULL, 35000, 'Đồ uống', 'sua_gao_me_den.png', 35, 0, 1),
('Sữa gạo hạnh nhân', NULL, 40000, 'Đồ uống', 'sua_gao_hanh_nhan.png', 30, 0, 1),
('Sữa gạo óc chó', NULL, 40000, 'Đồ uống', 'sua_gao_oc_cho.png', 30, 0, 1),
('Trà gạo lứt', NULL, 35000, 'Đồ uống', 'tra_gao_lut.png', 35, 0, 1),
('Trà gạo lứt đậu đen', NULL, 40000, 'Đồ uống', 'tra_gao_lut_dau_den.png', 35, 0, 1),
('Trà gạo lứt túi lọc', NULL, 45000, 'Đồ uống', 'tra_gao_lut_tui_loc.png', 40, 0, 1),
('Rượu gạo', NULL, 65000, 'Đồ uống', 'ruou_gao.png', 25, 0, 1),
('Rượu nếp', NULL, 75000, 'Đồ uống', 'ruou_nep.png', 25, 0, 1),
('Rượu nếp than', NULL, 85000, 'Đồ uống', 'ruou_nep_than.png', 20, 0, 1),

-- ==========================================
-- 4. MỸ PHẨM (18 SẢN PHẨM)
-- ==========================================
('Sữa rửa mặt gạo', NULL, 89000, 'Mỹ phẩm', 'sua_rua_mat_gao.png', 30, 0, 1),
('Nước tẩy trang chiết xuất gạo', NULL, 109000, 'Mỹ phẩm', 'nuoc_tay_trang_chiet_xuat_gao.png', 30, 0, 1),
('Toner nước gạo', NULL, 99000, 'Mỹ phẩm', 'toner_nuoc_gao.png', 30, 0, 1),
('Serum tinh chất gạo', NULL, 159000, 'Mỹ phẩm', 'serum_tinh_chat_gao.png', 25, 0, 1),
('Serum cám gạo', NULL, 149000, 'Mỹ phẩm', 'serum_cam_gao.png', 25, 0, 1),
('Kem dưỡng da gạo', NULL, 129000, 'Mỹ phẩm', 'kem_duong_da_gao.png', 25, 0, 1),
('Kem dưỡng trắng chiết xuất gạo', NULL, 159000, 'Mỹ phẩm', 'kem_duong_trang_chiet_xuat_gao.png', 25, 0, 1),
('Mặt nạ bột cám gạo', NULL, 79000, 'Mỹ phẩm', 'mat_na_bot_cam_gao.png', 35, 0, 1),
('Mặt nạ ngủ gạo', NULL, 119000, 'Mỹ phẩm', 'mat_na_ngu_gao.png', 25, 0, 1),
('Tẩy tế bào chết cám gạo', NULL, 99000, 'Mỹ phẩm', 'tay_te_bao_chet_cam_gao.png', 30, 0, 1),
('Sữa tắm cám gạo', NULL, 99000, 'Mỹ phẩm', 'sua_tam_cam_gao.png', 30, 0, 1),
('Xà phòng cám gạo', NULL, 45000, 'Mỹ phẩm', 'xa_phong_cam_gao.png', 40, 0, 1),
('Xà phòng dầu gạo', NULL, 55000, 'Mỹ phẩm', 'xa_phong_dau_gao.png', 35, 0, 1),
('Sữa dưỡng thể cám gạo', NULL, 119000, 'Mỹ phẩm', 'sua_duong_the_cam_gao.png', 25, 0, 1),
('Kem dưỡng da tay từ gạo', NULL, 69000, 'Mỹ phẩm', 'kem_duong_da_tay_tu_gao.png', 30, 0, 1),
('Tẩy tế bào chết toàn thân cám gạo', NULL, 129000, 'Mỹ phẩm', 'tay_te_bao_chet_toan_than_cam_gao.png', 25, 0, 1),
('Tinh chất dưỡng da đầu từ gạo', NULL, 149000, 'Mỹ phẩm', 'tinh_chat_duong_da_dau_tu_gao.png', 20, 0, 1),
('Dầu xả chiết xuất gạo', NULL, 99000, 'Mỹ phẩm', 'dau_xa_chiet_xuat_gao.png', 30, 0, 1),

-- ==========================================
-- 5. SẢN PHẨM KHÁC (5 SẢN PHẨM)
-- ==========================================
('Dầu cám gạo', NULL, 120000, 'Sản phẩm khác', 'dau_cam_gao.png', 25, 0, 1),
('Sáp cám gạo', NULL, 85000, 'Sản phẩm khác', 'sap_cam_gao.png', 25, 0, 1),
('Bao bì sinh học từ tinh bột gạo', NULL, 50000, 'Sản phẩm khác', 'bao_bi_sinh_hoc_tu_tinh_bot_gao.png', 40, 0, 1),
('Ống hút sinh học từ tinh bột gạo', NULL, 30000, 'Sản phẩm khác', 'ong_hut_sinh_hoc_tu_tinh_bot_gao.png', 50, 0, 1),
('Hộp đựng thực phẩm từ tinh bột gạo', NULL, 65000, 'Sản phẩm khác', 'hop_dung_thuc_pham_tu_tinh_bot_gao.png', 35, 0, 1);

COMMIT;
