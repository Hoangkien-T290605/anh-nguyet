// API Express của Ánh Nguyệt; giữ hợp đồng JSON trong khi ánh xạ tên DB tiếng Việt.
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const {
  luuAnhSanPhamCucBo,
  tenTepGalleryQuanTriDuoc,
} = require("./product-image-storage");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;
const DATABASE_NAME = process.env.DB_NAME || "anh_nguyet";

// =========================
// CẤU HÌNH UPLOAD ẢNH
// =========================

const avatarDirectory = path.join(__dirname, "uploads", "avatars");
const reviewImageDirectory = path.join(__dirname, "uploads", "reviews");
const productImageDirectory = path.join(__dirname, "uploads", "products");

fs.mkdirSync(avatarDirectory, { recursive: true });
fs.mkdirSync(reviewImageDirectory, { recursive: true });
fs.mkdirSync(productImageDirectory, { recursive: true });

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const allowedImageTypes = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const avatarStorage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, avatarDirectory);
  },

  filename: (req, file, callback) => {
    const extension = allowedImageTypes[file.mimetype];
    const filename = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`;

    callback(null, filename);
  },
});

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, callback) => {
    if (!Object.hasOwn(allowedImageTypes, file.mimetype)) {
      return callback(new Error("Chỉ chấp nhận ảnh JPG, PNG, WEBP hoặc GIF"));
    }

    callback(null, true);
  },
}).single("avatar");

const uploadProductImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!Object.hasOwn(allowedImageTypes, file.mimetype)) {
      return callback(new Error("Ảnh sản phẩm chỉ hỗ trợ JPG, PNG, WEBP hoặc GIF"));
    }
    callback(null, true);
  },
}).fields([{ name: "coverImage", maxCount: 1 }, { name: "imageFile", maxCount: 1 }]);

// Giữ ảnh gallery trong bộ nhớ tới khi xác minh chữ ký nội dung, rồi mới lưu cục bộ.
const uploadProductGallery = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, callback) => {
    if (!Object.hasOwn(allowedImageTypes, file.mimetype)) {
      return callback(new Error("Ảnh sản phẩm chỉ hỗ trợ JPG, PNG, WEBP hoặc GIF"));
    }
    callback(null, true);
  },
}).array("images", 10);

function kiemTraMaSanPhamGallery(req, res, next) {
  const productId = Number(req.params.id);
  if (!Number.isSafeInteger(productId) || productId < 1) {
    return res.status(400).json({ success: false, message: "Mã sản phẩm không hợp lệ" });
  }
  return next();
}

let coBangAnhSanPham = false;
let coCotMediaDanhGia = false;
let coCotChiTietSanPham = false;
let coRoleNhanVien = false;
let coCotTrangThaiNguoiDung = false;
let coCotDoiMatKhauLanDau = false;
let coBangLoiMoiNhanVien = false;
let coBangLichSuQuyenNhanVien = false;
let coSchemaQuanLyNhanVien = false;

function tenTepGalleryHopLe(fileName) {
  return tenTepGalleryQuanTriDuoc(fileName);
}

async function luuTepGalleryCucBo(file) {
  const saved = await luuAnhSanPhamCucBo({
    directory: productImageDirectory,
    file,
    allowedImageTypes,
    nhanDangDinhDangAnh,
  });
  return {
    image_url: `/uploads/products/${saved.fileName}`,
    file_name: saved.fileName,
  };
}

async function xoaTepGalleryCucBo(fileName) {
  if (!tenTepGalleryHopLe(fileName)) return;
  try {
    await fs.promises.unlink(path.join(productImageDirectory, fileName));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function xoaAnhGalleryNeuKhongDuocThamChieu(image) {
  if (!tenTepGalleryHopLe(image?.file_name) || typeof image?.image_url !== "string") return;
  const reviewReference = coBangDanhGia && coCotMediaDanhGia
    ? "UNION ALL SELECT 1 FROM product_reviews WHERE JSON_SEARCH(CASE WHEN JSON_VALID(media) THEN media ELSE JSON_ARRAY() END, 'one', ?) IS NOT NULL"
    : "";
  const parameters = [image.file_name, image.image_url, image.image_url, image.image_url];
  if (reviewReference) parameters.push(image.image_url);
  const [references] = await pool.execute(
    `SELECT 1 FROM product_images WHERE file_name = ?
     UNION ALL SELECT 1 FROM products WHERE image = ?
     UNION ALL SELECT 1 FROM order_items WHERE product_image = ?
     UNION ALL SELECT 1 FROM product_images WHERE image_url = ? ${reviewReference} LIMIT 1`,
    parameters,
  );
  if (!references.length) await xoaTepGalleryCucBo(image.file_name);
}

function xuLyUploadGallery(req, res, next) {
  if (!coBangAnhSanPham) return res.status(503).json({ success: false, message: "Thư viện ảnh sản phẩm chưa được kích hoạt trong cơ sở dữ liệu" });
  uploadProductGallery(req, res, (error) => {
    if (error) {
      const message = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
        ? "Mỗi ảnh không được vượt quá 5 MB"
        : error instanceof multer.MulterError && error.code === "LIMIT_FILE_COUNT"
          ? "Mỗi lần tải tối đa 10 ảnh"
          : error.message || "Không thể nhận ảnh tải lên";
      return res.status(400).json({ success: false, message });
    }
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ success: false, message: "Vui lòng chọn ít nhất một ảnh" });
    for (const file of files) {
      if (nhanDangDinhDangAnh(file.buffer) !== file.mimetype) {
        return res.status(400).json({ success: false, message: "Nội dung tệp không khớp định dạng ảnh được hỗ trợ" });
      }
    }
    next();
  });
}

function nhanDangDinhDangAnh(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))) return "image/gif";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return "";
}

async function xoaTepAnhSanPham(file) {
  if (!file?.path) return;
  try {
    await fs.promises.unlink(file.path);
  } catch (error) {
    if (error.code !== "ENOENT") console.error("Lỗi dọn ảnh sản phẩm chưa liên kết:", error.code || "UNKNOWN");
  }
}

async function xoaAnhSanPhamNeuKhongDuocThamChieu(imageUrl) {
  const prefix = "/uploads/products/";
  if (typeof imageUrl !== "string" || !imageUrl.startsWith(prefix)) return;
  const filename = path.basename(imageUrl);
  if (!filename || filename === "." || filename === "..") return;
  const galleryReference = coBangAnhSanPham
    ? "UNION ALL SELECT 1 FROM product_images WHERE image_url = ?"
    : "";
  const reviewReference = coBangDanhGia && coCotMediaDanhGia
    ? "UNION ALL SELECT 1 FROM product_reviews WHERE JSON_SEARCH(CASE WHEN JSON_VALID(media) THEN media ELSE JSON_ARRAY() END, 'one', ?) IS NOT NULL"
    : "";
  const parameters = [imageUrl, imageUrl];
  if (galleryReference) parameters.push(imageUrl);
  if (reviewReference) parameters.push(imageUrl);
  try {
    const [references] = await pool.execute(
      `SELECT 1 FROM products WHERE image = ?
       UNION ALL
       SELECT 1 FROM order_items WHERE product_image = ?
       ${galleryReference}
       ${reviewReference}
       LIMIT 1`,
      parameters,
    );
    if (references.length) return;
    await fs.promises.unlink(path.join(productImageDirectory, filename));
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Lỗi dọn ảnh sản phẩm không còn tham chiếu:", error.code || "UNKNOWN");
    }
  }
}

function xuLyUploadAnhSanPham(req, res, next) {
  uploadProductImage(req, res, async (error) => {
    const uploadedFiles = req.files || {};
    const coverFiles = [...(uploadedFiles.coverImage || []), ...(uploadedFiles.imageFile || [])];
    if (error) {
      await Promise.allSettled(coverFiles.map((file) => xoaTepAnhSanPham(file)));
      const message = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
        ? "Ảnh sản phẩm không được vượt quá 5 MB"
        : error.message || "Không thể tải ảnh sản phẩm lên";
      return res.status(400).json({ success: false, message });
    }
    if (coverFiles.length > 1) {
      await Promise.allSettled(coverFiles.map((file) => xoaTepAnhSanPham(file)));
      return res.status(400).json({ success: false, message: "Chỉ được chọn một ảnh bìa cho mỗi sản phẩm" });
    }
    req.file = coverFiles[0] || null;

    try {
      req.body ||= {};
      if (typeof req.body.product_details === "string") {
        try {
          req.body.product_details = JSON.parse(req.body.product_details);
        } catch {
          await xoaTepAnhSanPham(req.file);
          return res.status(400).json({ success: false, message: "Thông tin chi tiết sản phẩm không đúng định dạng" });
        }
      }
      if (req.file) {
        const saved = await luuAnhSanPhamCucBo({
          directory: productImageDirectory,
          file: req.file,
          allowedImageTypes,
          nhanDangDinhDangAnh,
        });
        req.file.filename = saved.fileName;
        req.file.path = saved.filePath;
        req.file.destination = productImageDirectory;
        req.file.buffer = undefined;
      }

      for (const field of ["active", "featured"]) {
        if (req.body[field] === "true") req.body[field] = true;
        if (req.body[field] === "false") req.body[field] = false;
      }
      next();
    } catch (validationError) {
      await xoaTepAnhSanPham(req.file);
      console.error("Lỗi kiểm tra ảnh sản phẩm:", validationError.code || "UNKNOWN");
      const isInvalidImage = validationError.message === "Nội dung tệp không khớp định dạng ảnh được hỗ trợ";
      return res.status(isInvalidImage ? 400 : 500).json({
        success: false,
        message: isInvalidImage ? validationError.message : "Không thể lưu ảnh sản phẩm vào kho cục bộ",
      });
    }
  });
}

// Giữ ảnh trong bộ nhớ đến khi đã xác minh điều kiện nghiệp vụ, sau đó lưu cục bộ.
const reviewUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, callback) => {
    if (!allowedImageTypes[file.mimetype]) {
      return callback(new Error("Ảnh đánh giá chỉ hỗ trợ JPG, PNG, WEBP hoặc GIF"));
    }
    callback(null, true);
  },
}).array("images", 5);

// Xóa ảnh đại diện cũ chỉ khi đường dẫn thuộc thư mục upload của ứng dụng.
async function xoaAnhDaiDienCu(avatarUrl) {
  if (
    typeof avatarUrl !== "string" ||
    !avatarUrl.startsWith("/uploads/avatars/")
  ) {
    return;
  }

  const filename = path.basename(avatarUrl);

  if (!filename || filename === "." || filename === "..") {
    return;
  }

  const filePath = path.join(avatarDirectory, filename);

  try {
    const [references] = await pool.execute(
      "SELECT 1 FROM users WHERE avatar_url = ? LIMIT 1",
      [avatarUrl],
    );
    if (references.length) return;
    await fs.promises.unlink(filePath);
    console.log("Đã xóa ảnh đại diện cũ:", filename);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Lỗi xóa ảnh đại diện cũ:", error.code || "UNKNOWN");
    }
  }
}

app.use(cors());
app.use(express.json());

const boKetNoiGoc = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD,
  database: DATABASE_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Ánh xạ tên bảng vật lý Việt hóa sang tên tương thích với truy vấn hiện có.
const tenBangViet = {
  users: "nguoi_dung",
  products: "san_pham",
  user_addresses: "dia_chi_nguoi_dung",
  product_reviews: "danh_gia_san_pham",
  orders: "don_hang",
  order_items: "chi_tiet_don_hang",
  user_cart_items: "chi_tiet_gio_hang",
  vouchers: "ma_giam_gia",
  voucher_redemptions: "luot_su_dung_ma_giam_gia",
  categories: "danh_muc_san_pham",
  inventory_movements: "lich_su_ton_kho",
  shipping_configuration: "cau_hinh_van_chuyen",
  shipping_regions: "khu_vuc_van_chuyen",
  product_images: "thu_vien_anh_san_pham",
};

// Ánh xạ cột theo từng bảng; phản hồi API vẫn dùng các khóa JSON cũ.
const tenCotViet = {
  users: {
    id: "ma_nguoi_dung",
    full_name: "ho_ten",
    email: "email",
    password: "mat_khau_ma_hoa",
    phone: "so_dien_thoai",
    address: "dia_chi_mac_dinh",
    avatar_url: "duong_dan_anh_dai_dien",
    role: "vai_tro",
    created_at: "ngay_tao",
    updated_at: "ngay_cap_nhat",
  },
  products: {
    id: "ma_san_pham",
    name: "ten_san_pham",
    description: "mo_ta",
    price: "gia_ban",
    category: "danh_muc",
    image: "duong_dan_anh",
    stock: "so_luong_ton",
    featured: "noi_bat",
    active: "dang_kinh_doanh",
    created_at: "ngay_tao",
    updated_at: "ngay_cap_nhat",
  },
  product_images: {
    id: "ma_anh",
    product_id: "ma_san_pham",
    image_url: "duong_dan_anh",
    file_name: "ten_tep",
    sort_order: "thu_tu",
    is_primary: "la_anh_chinh",
    created_at: "ngay_tao",
  },
  user_addresses: {
    id: "ma_dia_chi",
    user_id: "ma_nguoi_dung",
    recipient_name: "ten_nguoi_nhan",
    phone: "so_dien_thoai",
    address: "dia_chi_day_du",
    is_default: "mac_dinh",
    latitude: "vi_do",
    longitude: "kinh_do",
    created_at: "ngay_tao",
    updated_at: "ngay_cap_nhat",
  },
  product_reviews: {
    id: "ma_danh_gia",
    product_id: "ma_san_pham",
    customer_name: "ten_khach_hang",
    customer_id: "ma_nguoi_dung",
    rating: "so_sao",
    comment: "noi_dung",
    media: "tep_dinh_kem",
    is_visible: "dang_hien_thi",
    created_at: "ngay_tao",
  },
  orders: {
    id: "ma_don_hang",
    customer_id: "ma_nguoi_dat",
    user_address_id: "ma_dia_chi",
    recipient_name: "ten_nguoi_nhan",
    recipient_phone: "so_dien_thoai_nhan",
    shipping_address: "dia_chi_giao_hang",
    subtotal: "tam_tinh",
    shipping_fee: "phi_van_chuyen",
    payment_method: "phuong_thuc_thanh_toan",
    payment_status: "trang_thai_thanh_toan",
    total_amount: "tong_tien",
    status: "trang_thai",
    created_at: "ngay_tao",
    updated_at: "ngay_cap_nhat",
    idempotency_key: "ma_yeu_cau",
    request_fingerprint: "dau_van_tay_yeu_cau",
    voucher_id: "ma_chuong_trinh_giam_gia",
    voucher_code: "ma_voucher_luc_dat",
    voucher_campaign_name: "ten_chuong_trinh_luc_dat",
    voucher_discount_type: "loai_giam_luc_dat",
    voucher_discount_value: "gia_tri_giam_luc_dat",
    discount_amount: "so_tien_giam",
    shipping_region_code: "ma_khu_vuc_van_chuyen",
    shipping_region_name: "ten_khu_vuc_van_chuyen",
  },
  vouchers: {
    id: "ma_chuong_trinh",
    code: "ma_voucher",
    campaign_name: "ten_chuong_trinh",
    description: "mo_ta",
    discount_type: "loai_giam",
    discount_value: "gia_tri_giam",
    minimum_subtotal: "don_hang_toi_thieu",
    maximum_discount: "giam_toi_da",
    quantity_limit: "so_luong_phat_hanh",
    per_customer_limit: "gioi_han_moi_khach",
    used_count: "so_luot_su_dung",
    starts_at: "bat_dau_luc",
    ends_at: "ket_thuc_luc",
    is_active: "dang_kich_hoat",
    created_at: "ngay_tao",
    updated_at: "ngay_cap_nhat",
  },
  voucher_redemptions: {
    id: "ma_luot_su_dung",
    voucher_id: "ma_chuong_trinh_giam_gia",
    order_id: "ma_don_hang",
    customer_id: "ma_nguoi_dung",
    voucher_code_snapshot: "ma_voucher_luc_dat",
    discount_amount: "so_tien_giam",
    usage_status: "trang_thai_su_dung",
    created_at: "ngay_tao",
  },
  categories: {
    id: "ma_danh_muc",
    name: "ten_danh_muc",
    description: "mo_ta",
    created_at: "ngay_tao",
    updated_at: "ngay_cap_nhat",
  },
  inventory_movements: {
    id: "ma_bien_dong",
    product_id: "ma_san_pham",
    admin_user_id: "ma_admin",
    movement_type: "loai_bien_dong",
    quantity: "so_luong",
    stock_before: "ton_truoc",
    stock_after: "ton_sau",
    note: "ghi_chu",
    created_at: "ngay_tao",
  },
  shipping_configuration: {
    id: "ma_cau_hinh",
    flat_fee: "phi_co_dinh",
    updated_at: "ngay_cap_nhat",
  },
  shipping_regions: {
    id: "ma_khu_vuc",
    region_code: "ma_khu_vuc_van_chuyen",
    region_name: "ten_khu_vuc",
    fee: "phi_van_chuyen",
    is_active: "dang_hoat_dong",
    created_at: "ngay_tao",
    updated_at: "ngay_cap_nhat",
  },
  order_items: {
    id: "ma_chi_tiet",
    order_id: "ma_don_hang",
    product_id: "ma_san_pham",
    product_name: "ten_san_pham_luc_dat",
    product_category: "danh_muc_luc_dat",
    product_image: "anh_san_pham_luc_dat",
    unit_price: "don_gia",
    quantity: "so_luong",
    line_total: "thanh_tien",
    created_at: "ngay_tao",
  },
  user_cart_items: {
    user_id: "ma_nguoi_dung",
    product_id: "ma_san_pham",
    quantity: "so_luong",
    created_at: "ngay_tao",
    updated_at: "ngay_cap_nhat",
  },
};

const tokenSql =
  /\s+|'(?:\\.|''|[^'])*'|"(?:\\.|""|[^"])*"|`[^`]*`|[A-Za-z_][A-Za-z0-9_$]*|\d+(?:\.\d+)?|./gs;
const tuKhoaSql = new Set([
  "AS",
  "WHERE",
  "SET",
  "ON",
  "INNER",
  "LEFT",
  "RIGHT",
  "CROSS",
  "JOIN",
  "ORDER",
  "GROUP",
  "LIMIT",
  "OFFSET",
  "FOR",
  "VALUES",
  "VALUE",
  "RETURNING",
  "USE",
  "UNION",
  "WHEN",
  "THEN",
]);

// Chỉ dịch tên định danh khi database đang dùng schema vật lý tiếng Việt.
let coSoDuLieuDungTenViet = false;
let coCotDanhGiaTaiKhoan = false;
let coBangDanhGia = false;
let coBangVoucher = false;
let coCotVoucherDonHang = false;
let coBangDanhMuc = false;
let coBangLichSuTonKho = false;
let coBangCauHinhVanChuyen = false;
let coBangKhuVucVanChuyen = false;
let coCotSnapshotKhuVucVanChuyen = false;
let coCotTrangThaiLuotVoucher = false;
let coCotMetadataVoucher = false;

function cotVoucherDonHangSelect() {
  return coBangVoucher && coCotVoucherDonHang
    ? ", voucher_id, voucher_code, voucher_campaign_name, voucher_discount_type, voucher_discount_value, discount_amount"
    : ", NULL AS voucher_id, NULL AS voucher_code, NULL AS voucher_campaign_name, NULL AS voucher_discount_type, NULL AS voucher_discount_value, 0 AS discount_amount";
}

function cotKhuVucVanChuyenDonHangSelect() {
  return coCotSnapshotKhuVucVanChuyen
    ? ", shipping_region_code, shipping_region_name"
    : ", NULL AS shipping_region_code, NULL AS shipping_region_name";
}

// Dịch các định danh SQL trước khi gửi truy vấn đến MySQL.
function vietLaiCauSql(sql) {
  if (!coSoDuLieuDungTenViet) return sql;

  const tokens = sql.match(tokenSql) || [];
  const aliases = new Map();
  const tableIndexes = new Set();
  let primaryTable = null;
  // Bỏ qua khoảng trắng để tìm token SQL kế tiếp.
  const layChiSoTokenTiepTheo = (start) => {
    for (let index = start; index < tokens.length; index += 1) {
      if (!/^\s+$/.test(tokens[index])) return index;
    }
    return -1;
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const word = tokens[index].replace(/^`|`$/g, "").toUpperCase();
    if (!["FROM", "JOIN", "UPDATE", "INTO"].includes(word)) continue;
    const tableIndex = layChiSoTokenTiepTheo(index + 1);
    if (tableIndex < 0) continue;
    const sourceTable = tokens[tableIndex].replace(/^`|`$/g, "");
    if (!tenBangViet[sourceTable]) continue;

    const destinationTable = tenBangViet[sourceTable];
    tokens[tableIndex] = tokens[tableIndex].startsWith("`")
      ? `\`${destinationTable}\``
      : destinationTable;
    tableIndexes.add(tableIndex);
    const possibleAliasIndex = layChiSoTokenTiepTheo(tableIndex + 1);
    let alias = sourceTable;
    if (
      possibleAliasIndex >= 0 &&
      tokens[possibleAliasIndex].replace(/^`|`$/g, "").toUpperCase() === "AS"
    ) {
      const explicitAliasIndex = layChiSoTokenTiepTheo(possibleAliasIndex + 1);
      if (explicitAliasIndex >= 0)
        alias = tokens[explicitAliasIndex].replace(/^`|`$/g, "");
    } else if (possibleAliasIndex >= 0) {
      const possibleAlias = tokens[possibleAliasIndex].replace(/^`|`$/g, "");
      if (
        /^[A-Za-z_][A-Za-z0-9_$]*$/.test(possibleAlias) &&
        !tuKhoaSql.has(possibleAlias.toUpperCase())
      ) {
        alias = possibleAlias;
      }
    }
    aliases.set(alias, sourceTable);
    aliases.set(sourceTable, sourceTable);
    if (!primaryTable && ["FROM", "UPDATE", "INTO"].includes(word))
      primaryTable = sourceTable;
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const quotedIdentifier = token.startsWith("`") && token.endsWith("`");
    const identifier = quotedIdentifier ? token.slice(1, -1) : token;
    if (
      (!quotedIdentifier && !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(identifier)) ||
      tableIndexes.has(index)
    )
      continue;
    const previousIndex = layChiSoTokenTiepTheo(index - 1);
    const nextIndex = layChiSoTokenTiepTheo(index + 1);
    let table = primaryTable;
    if (previousIndex >= 0 && tokens[previousIndex] === ".") {
      const aliasIndex = layChiSoTokenTiepTheo(previousIndex - 1);
      const alias =
        aliasIndex >= 0 ? tokens[aliasIndex].replace(/^`|`$/g, "") : "";
      table = aliases.get(alias) || table;
    } else if (nextIndex >= 0 && tokens[nextIndex] === ".") {
      continue;
    }
    const translated = tenCotViet[table]?.[identifier];
    if (translated)
      tokens[index] = quotedIdentifier ? `\`${translated}\`` : translated;
  }

  return tokens.join("");
}

// Đổi tên cột kết quả về hợp đồng JSON công khai của Frontend.
function doiTenCotVeHopDongApi(rows, fields) {
  if (!Array.isArray(rows) || !Array.isArray(fields) || !fields.length)
    return rows;
  return rows.map((row) => {
    const result = {};
    for (const field of fields) {
      const outputName = field.name;
      let key = outputName;
      const physicalTable = Object.keys(tenBangViet).find(
        (name) => tenBangViet[name] === field.orgTable,
      );
      if (physicalTable && field.orgName && outputName === field.orgName) {
        const columns = tenCotViet[physicalTable];
        key =
          Object.keys(columns).find(
            (name) => columns[name] === field.orgName,
          ) || outputName;
      }
      result[key] = row[outputName];
    }
    return result;
  });
}

// Bọc pool/kết nối để mọi truy vấn dùng chung bộ chuyển đổi định danh.
function ganBoChuyenDoiCoSoDuLieu(executor) {
  for (const method of ["query", "execute"]) {
    const original = executor[method].bind(executor);
    executor[method] = (sql, ...args) => {
      const translatedSql = typeof sql === "string" ? vietLaiCauSql(sql) : sql;
      return original(translatedSql, ...args).then(([rows, fields]) => [
        doiTenCotVeHopDongApi(rows, fields),
        fields,
      ]);
    };
  }
  return executor;
}

const pool = new Proxy(boKetNoiGoc, {
  get(target, property) {
    if (property === "query" || property === "execute") {
      return (sql, ...args) => {
        const translatedSql =
          typeof sql === "string" ? vietLaiCauSql(sql) : sql;
        return target[property](translatedSql, ...args).then(
          ([rows, fields]) => [doiTenCotVeHopDongApi(rows, fields), fields],
        );
      };
    }
    if (property === "getConnection") {
      return async (...args) =>
        ganBoChuyenDoiCoSoDuLieu(await target.getConnection(...args));
    }
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  },
});

// =========================
// QUẢN LÝ MÃ OTP ĐỔI MẬT KHẨU
// =========================

const passwordOtpStore = new Map();

// Tạo cấu hình gửi thư nếu môi trường đã cung cấp thông tin SMTP.
function taoBoGoiThu() {
  const smtpHost = process.env.SMTP_HOST?.trim();
  if (smtpHost) {
    const port = Number(process.env.SMTP_PORT || 587);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("SMTP_PORT không hợp lệ");
    }
    const smtpUser = process.env.SMTP_USER?.trim();
    const smtpPassword = process.env.SMTP_PASSWORD;
    if (Boolean(smtpUser) !== Boolean(smtpPassword)) {
      throw new Error("SMTP_USER và SMTP_PASSWORD phải được cấu hình cùng nhau");
    }
    return nodemailer.createTransport({
      host: smtpHost,
      port,
      secure: process.env.SMTP_SECURE === "true",
      ...(smtpUser ? { auth: { user: smtpUser, pass: smtpPassword } } : {}),
    });
  }

  const email = process.env.GMAIL_USER;
  const appPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");

  if (!email || !appPassword) {
    throw new Error(
      "Chưa cấu hình GMAIL_USER và GMAIL_APP_PASSWORD trong file .env",
    );
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: email,
      pass: appPassword,
    },
  });
}

function diaChiGuiThu() {
  const email = process.env.SMTP_FROM?.trim() || process.env.GMAIL_USER?.trim() || process.env.SMTP_USER?.trim();
  if (!email) throw new Error("Thiếu địa chỉ gửi thư SMTP");
  return `"Ánh Nguyệt" <${email}>`;
}

function layDiaChiGiaoDien() {
  const configured = process.env.FRONTEND_BASE_URL?.trim();
  if (!configured) return null;
  try {
    const base = new URL(configured);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password ||
        base.pathname !== "/" || base.search || base.hash) return null;
    return base.origin;
  } catch {
    return null;
  }
}

function maLoiEmail(error) {
  return typeof error?.code === "string" && /^[A-Z0-9_]{1,64}$/i.test(error.code)
    ? error.code.toUpperCase()
    : "EMAIL_DELIVERY_FAILED";
}

async function guiLoiMoiNhanVien(email, token) {
  const baseUrl = layDiaChiGiaoDien();
  if (!baseUrl) throw new Error("FRONTEND_BASE_URL chưa được cấu hình hợp lệ");
  const invitationUrl = `${baseUrl}/employee-invite.html?token=${encodeURIComponent(token)}`;
  const transporter = taoBoGoiThu();
  await transporter.sendMail({
    from: diaChiGuiThu(),
    to: email,
    subject: "Lời mời tham gia đội ngũ Ánh Nguyệt",
    text: `Bạn được mời tham gia đội ngũ Ánh Nguyệt. Liên kết có hiệu lực trong 48 giờ: ${invitationUrl}\n\nNếu bạn không mong đợi thư này, vui lòng bỏ qua.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#342747"><h2 style="color:#8056a8">Ánh Nguyệt</h2><p>Bạn được mời tham gia đội ngũ Nhân viên.</p><p><a href="${invitationUrl}" style="display:inline-block;padding:12px 18px;background:#7041a6;color:#fff;text-decoration:none;border-radius:8px">Chấp nhận lời mời</a></p><p>Liên kết có hiệu lực trong 48 giờ. Nếu bạn không mong đợi thư này, vui lòng bỏ qua.</p></div>`,
  });
}

// =========================
// HÀM HỖ TRỢ
// =========================

// Chuyển một dòng sản phẩm MySQL thành cấu trúc JSON public.
function chuanHoaSanPham(row) {
  let productDetails = row.product_details;
  if (typeof productDetails === "string") {
    try { productDetails = JSON.parse(productDetails); } catch { productDetails = null; }
  }
  if (!productDetails || typeof productDetails !== "object" || Array.isArray(productDetails)) productDetails = null;
  return {
    ...row,
    product_details: productDetails,
    _id: String(row.id),
    price: Number(row.price),
    stock: Number(row.stock),
    average_rating: Number(row.average_rating || 0),
    review_count: Number(row.review_count || 0),
    featured: Boolean(row.featured),
    active: Boolean(row.active),
  };
}

const cacTruongChiTietSanPham = new Set([
  "short_description", "ingredients", "origin", "manufacturer", "brand", "additional_info",
  "weight", "volume", "expiry", "storage", "usage", "packaging",
]);

function kiemTraChiTietSanPham(value) {
  if (value === null) return { value: null, error: "" };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { value: null, error: "Thông tin chi tiết sản phẩm phải là một đối tượng dữ liệu hợp lệ" };
  }
  const allowed = new Set([...cacTruongChiTietSanPham, "specifications"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return { value: null, error: "Có trường thông tin chi tiết sản phẩm không được hỗ trợ" };
  }
  const normalized = {};
  for (const key of cacTruongChiTietSanPham) {
    if (value[key] === undefined || value[key] === "") continue;
    if (typeof value[key] !== "string" || value[key].length > 2000) {
      return { value: null, error: `Trường ${key} phải là văn bản không quá 2.000 ký tự` };
    }
    normalized[key] = value[key].trim();
  }
  if (value.specifications !== undefined && value.specifications !== null) {
    const entries = value.specifications;
    if (!entries || typeof entries !== "object" || Array.isArray(entries) || Object.keys(entries).length > 30) {
      return { value: null, error: "Thông số bổ sung phải là đối tượng tối đa 30 mục" };
    }
    const specifications = {};
    for (const [name, detail] of Object.entries(entries)) {
      if (!name.trim() || name.length > 80 || typeof detail !== "string" || detail.length > 500) {
        return { value: null, error: "Tên thông số tối đa 80 ký tự và giá trị phải là văn bản tối đa 500 ký tự" };
      }
      if (detail.trim()) specifications[name.trim()] = detail.trim();
    }
    if (Object.keys(specifications).length) normalized.specifications = specifications;
  }
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > 12000) {
    return { value: null, error: "Tổng thông tin chi tiết sản phẩm vượt quá giới hạn cho phép" };
  }
  return { value: normalized, error: "" };
}

// Chuẩn hóa dữ liệu đánh giá trước khi trả về API.
function chuanHoaDanhGia(row) {
  let media = row.media;

  if (typeof media === "string") {
    try {
      media = JSON.parse(media);
    } catch {
      media = [];
    }
  }

  if (!Array.isArray(media)) {
    media = [];
  }

  return {
    ...row,
    id: Number(row.id),
    product_id: Number(row.product_id),
    customer_id: row.customer_id == null ? null : Number(row.customer_id),
    rating: Number(row.rating),
    is_visible: row.is_visible === undefined ? true : Boolean(row.is_visible),
    media,
  };
}

// Serializer công khai chỉ phát các trường cần cho giao diện, không lộ mã tài khoản.
function chuanHoaDanhGiaCongKhai(row) {
  const review = chuanHoaDanhGia(row);
  return {
    id: review.id,
    product_id: review.product_id,
    customer_name: review.customer_name,
    rating: review.rating,
    comment: review.comment,
    media: review.media,
    created_at: review.created_at,
    ...(row.is_mine !== undefined ? { is_mine: Boolean(row.is_mine) } : {}),
  };
}

// Serializer riêng cho chủ đánh giá; trạng thái ẩn chỉ lộ cho chính chủ tài khoản.
function chuanHoaDanhGiaCuaToi(row) {
  const review = chuanHoaDanhGia(row);
  return {
    id: review.id,
    product_id: review.product_id,
    customer_name: review.customer_name,
    rating: review.rating,
    comment: review.comment,
    media: review.media,
    is_visible: review.is_visible,
    created_at: review.created_at,
  };
}

// Xác thực chữ ký nội dung ảnh trước khi tin MIME do trình duyệt gửi lên.
function xacDinhDinhDangAnh(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))) return "image/gif";
  return null;
}

async function luuAnhDanhGia(file) {
  const format = xacDinhDinhDangAnh(file.buffer);
  if (!format || format !== file.mimetype) throw new Error("Định dạng nội dung ảnh không khớp với loại tệp được khai báo");
  const filename = `${Date.now()}-${crypto.randomBytes(12).toString("hex")}${allowedImageTypes[format]}`;
  const filePath = path.join(reviewImageDirectory, filename);
  try {
    await fs.promises.writeFile(filePath, file.buffer, { flag: "wx" });
  } catch (error) {
    try { await fs.promises.unlink(filePath); } catch { /* Không có tệp hoàn chỉnh để dọn. */ }
    throw error;
  }
  return { type: "image", url: `/uploads/reviews/${filename}` };
}

// Chỉ dọn ảnh nội bộ không còn được tham chiếu; URL ảnh ngoài máy chủ được giữ nguyên.
async function xoaAnhDanhGiaChuaLienKet(media = []) {
  for (const item of media) {
    const url = typeof item === "string" ? item : item?.url;
    const prefix = "/uploads/reviews/";
    if (typeof url !== "string" || !url.startsWith(prefix)) continue;
    const filename = url.slice(prefix.length);
    if (!filename || filename !== path.basename(filename) || !/^[\w-]+\.(jpg|png|webp|gif)$/i.test(filename)) continue;
    try {
      const [[reference]] = await pool.execute(
        `SELECT EXISTS(
          SELECT 1 FROM product_reviews
          WHERE JSON_CONTAINS(media, JSON_OBJECT('url', ?), '$')
             OR JSON_CONTAINS(media, JSON_QUOTE(?), '$')
        ) AS is_used`,
        [url, url],
      );
      if (reference?.is_used) continue;
      await fs.promises.unlink(path.join(reviewImageDirectory, filename));
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.error("Không thể dọn ảnh đánh giá chưa liên kết:", error.code || "UNKNOWN");
      }
    }
  }
}

function nhanTepDanhGia(req, res, next) {
  reviewUpload(req, res, (error) => {
    if (!error) return next();
    const status = error.code === "LIMIT_FILE_SIZE" || error.code === "LIMIT_FILE_COUNT" ? 400 : 400;
    return res.status(status).json({ success: false, message: error.message || "Tệp ảnh đánh giá không hợp lệ" });
  });
}

// Bỏ thông tin xác thực và chuẩn hóa hồ sơ người dùng trả về.
function chuanHoaNguoiDung(row) {
  return {
    id: Number(row.id),
    full_name: row.full_name,
    email: row.email,
    role: row.role || "customer",
    is_active: row.is_active === undefined ? true : Boolean(row.is_active),
    must_change_password: Boolean(row.must_change_password),
    phone: row.phone,
    address: row.address,
    avatar_url: row.avatar_url || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Chuẩn hóa địa chỉ giao hàng theo cấu trúc API hiện tại.
function chuanHoaDiaChi(row) {
  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    recipient_name: row.recipient_name,
    phone: row.phone,
    address: row.address,
    is_default: Boolean(row.is_default),
    latitude:
      row.latitude === null || row.latitude === undefined
        ? null
        : Number(row.latitude),
    longitude:
      row.longitude === null || row.longitude === undefined
        ? null
        : Number(row.longitude),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Tạo JWT cho tài khoản đã được xác thực.
function taoToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );
}

// Xác minh JWT và đọc lại quyền/trạng thái từ MySQL để thu hồi phiên ngay khi khóa tài khoản.
async function xacThucToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Vui lòng đăng nhập để tiếp tục",
    });
  }

  let claims;
  try {
    claims = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ success: false, message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn" });
  }
  try {
    const fields = ["id", "email", "role"];
    if (coCotTrangThaiNguoiDung) fields.push("is_active");
    if (coCotDoiMatKhauLanDau) fields.push("must_change_password");
    const [rows] = await pool.execute(
      `SELECT ${fields.map((field) => `\`${field}\``).join(", ")} FROM users WHERE id = ? LIMIT 1`,
      [claims.id],
    );
    if (!rows.length || (rows[0].role === "employee" && coCotTrangThaiNguoiDung && !rows[0].is_active)) {
      return res.status(401).json({ success: false, message: "Tài khoản không hoạt động hoặc không còn tồn tại" });
    }
    req.user = {
      id: Number(rows[0].id),
      email: rows[0].email,
      role: rows[0].role,
      must_change_password: rows[0].role === "employee" && Boolean(rows[0].must_change_password),
    };
    const passwordChangeAllowed = req.path === "/api/auth/me" && req.method === "GET" ||
      req.path.startsWith("/api/auth/change-password/");
    if (req.user.must_change_password && !passwordChangeAllowed) {
      return res.status(403).json({ success: false, code: "PASSWORD_CHANGE_REQUIRED", message: "Vui lòng đổi mật khẩu tạm thời trước khi tiếp tục" });
    }
    return next();
  } catch (error) {
    console.error("Lỗi xác minh tài khoản phiên:", error.code || "UNKNOWN");
    return res.status(503).json({ success: false, message: "Hiện không thể xác minh trạng thái tài khoản" });
  }
}

// Cho phép khách chưa đăng nhập tiếp tục nhưng xác minh token nếu có gửi lên.
function xacThucTokenTuyChon(req, res, next) {
  if (!req.headers.authorization) {
    req.user = null;
    return next();
  }
  return xacThucToken(req, res, next);
}

// Chặn thao tác quản trị nếu phiên hiện tại không có quyền Admin.
async function yeuCauQuyenQuanTri(req, res, next) {
  try {
    if (req.user?.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "Bạn không có quyền quản trị" });
    }
    return next();
  } catch (error) {
    console.error("Lỗi kiểm tra quyền quản trị:", error.code || "UNKNOWN");
    return res
      .status(500)
      .json({ success: false, message: "Không thể xác minh quyền quản trị" });
  }
}

// Quyền tác nghiệp dành cho Employee và Admin; quyền Admin-only vẫn dùng middleware riêng.
function yeuCauQuyenNhanVien(req, res, next) {
  if (!req.user || !["employee", "admin"].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: "Bạn không có quyền thực hiện thao tác này" });
  }
  if (req.user.role === "employee" &&
      (!coRoleNhanVien || !coCotTrangThaiNguoiDung || !coCotDoiMatKhauLanDau)) {
    return res.status(503).json({ success: false, code: "EMPLOYEE_SCHEMA_REQUIRED", message: "Quản lý nhân viên chưa được kích hoạt trong cơ sở dữ liệu" });
  }
  return next();
}

function yeuCauSchemaNhanVien(res) {
  if (coSchemaQuanLyNhanVien) return false;
  res.status(503).json({ success: false, code: "EMPLOYEE_SCHEMA_REQUIRED", message: "Cần áp dụng migration tài khoản nhân viên trước khi sử dụng chức năng này" });
  return true;
}

// Kiểm tra dữ liệu sản phẩm
// Kiểm tra các trường sản phẩm trước khi tạo mới hoặc cập nhật.
function kiemTraDuLieuSanPham(body, partial = false) {
  const errors = [];

  if (!partial || body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      errors.push("Tên sản phẩm là bắt buộc");
    }
  }

  if (!partial || body.price !== undefined) {
    if (
      body.price === "" ||
      body.price === undefined ||
      !Number.isFinite(Number(body.price)) ||
      Number(body.price) < 0
    ) {
      errors.push("Giá sản phẩm phải là số không âm");
    }
  }

  if (!partial || body.category !== undefined) {
    if (typeof body.category !== "string" || !body.category.trim()) {
      errors.push("Danh mục là bắt buộc");
    }
  }

  if (body.description !== undefined && typeof body.description !== "string") {
    errors.push("Mô tả phải là chuỗi ký tự");
  }

  if (body.image !== undefined && typeof body.image !== "string") {
    errors.push("Đường dẫn ảnh phải là chuỗi ký tự");
  } else if (body.image !== undefined && !duongDanAnhSanPhamHopLe(body.image)) {
    errors.push("Đường dẫn ảnh phải là tên tệp, đường dẫn ảnh sản phẩm nội bộ hoặc URL HTTP(S) hợp lệ");
  }

  if (body.product_details !== undefined) {
    const detailResult = kiemTraChiTietSanPham(body.product_details);
    if (detailResult.error) errors.push(detailResult.error);
  }

  if (body.stock !== undefined) {
    if (
      body.stock === "" ||
      !Number.isInteger(Number(body.stock)) ||
      Number(body.stock) < 0
    ) {
      errors.push("Tồn kho phải là số nguyên không âm");
    }
  }

  for (const field of ["featured", "active"]) {
    if (
      body[field] !== undefined &&
      typeof body[field] !== "boolean" &&
      body[field] !== 0 &&
      body[field] !== 1
    ) {
      errors.push(`${field} phải là true hoặc false`);
    }
  }

  return errors;
}

function duongDanAnhSanPhamHopLe(value) {
  if (typeof value !== "string" || value.length > 2048 || /[\u0000-\u001f\u007f\\]/.test(value)) return false;
  const image = value.trim();
  if (!image) return true;
  if (/^https?:\/\//i.test(image)) {
    try {
      const url = new URL(image);
      return !url.username && !url.password;
    } catch {
      return false;
    }
  }
  if (image.split(/[/?#]/).includes("..")) return false;
  return /^[\p{L}\p{N}_ .()'-]+\.(?:jpe?g|png|webp|gif)$/iu.test(image) ||
    /^\/?(?:images|uploads)\/products\/[\p{L}\p{N}_ .()'-]+\.(?:jpe?g|png|webp|gif)$/iu.test(image);
}

// Lấy giá trị đã chuẩn hóa để ghi sản phẩm vào cơ sở dữ liệu.
function layGiaTriSanPham(body) {
  return {
    name: body.name.trim(),
    description: body.description ?? "",
    price: Number(body.price),
    category: body.category.trim(),
    image: body.image ?? "",
    stock: body.stock === undefined ? 0 : Number(body.stock),
    featured: body.featured === true || body.featured === 1,
    active:
      body.active === undefined
        ? true
        : body.active === true || body.active === 1,
  };
}

const allowedFields = [
  "name",
  "description",
  "price",
  "category",
  "image",
  "stock",
  "featured",
  "active",
];

// Kiểm tra tọa độ bản đồ
// Kiểm tra tọa độ địa chỉ nằm trong phạm vi hợp lệ.
function kiemTraToaDo(body) {
  const { latitude, longitude } = body;

  if ((latitude === null) !== (longitude === null)) {
    return "Vui lòng cung cấp đầy đủ kinh độ và vĩ độ";
  }

  if (latitude === undefined && longitude === undefined) {
    return null;
  }

  if (latitude === null && longitude === null) {
    return null;
  }

  if (
    latitude === undefined ||
    longitude === undefined ||
    latitude === "" ||
    longitude === "" ||
    !Number.isFinite(Number(latitude)) ||
    !Number.isFinite(Number(longitude))
  ) {
    return "Tọa độ bản đồ không hợp lệ";
  }

  if (Number(latitude) < -90 || Number(latitude) > 90) {
    return "Vĩ độ phải nằm trong khoảng -90 đến 90";
  }

  if (Number(longitude) < -180 || Number(longitude) > 180) {
    return "Kinh độ phải nằm trong khoảng -180 đến 180";
  }

  return null;
}

// Kiểm tra dữ liệu địa chỉ
// Kiểm tra và chuẩn hóa dữ liệu địa chỉ nhận hàng.
function kiemTraDuLieuDiaChi(body) {
  if (
    typeof body.recipient_name !== "string" ||
    !body.recipient_name.trim() ||
    body.recipient_name.trim().length > 100
  ) {
    return "Tên người nhận không hợp lệ";
  }

  if (
    typeof body.phone !== "string" ||
    !body.phone.trim() ||
    body.phone.trim().length > 20
  ) {
    return "Số điện thoại không hợp lệ";
  }

  if (typeof body.address !== "string" || !body.address.trim()) {
    return "Địa chỉ không được để trống";
  }

  if (
    body.is_default !== undefined &&
    typeof body.is_default !== "boolean" &&
    body.is_default !== 0 &&
    body.is_default !== 1
  ) {
    return "Trạng thái mặc định không hợp lệ";
  }

  return kiemTraToaDo(body);
}

const ORDER_STATUSES = new Set([
  "pending_confirmation",
  "confirmed",
  "preparing",
  "shipping",
  "completed",
  "cancelled",
]);

const guestOrderLookupAttempts = new Map();
const GUEST_LOOKUP_WINDOW_MS = 15 * 60 * 1000;
const GUEST_LOOKUP_MAX_ATTEMPTS = 5;

// Giới hạn tần suất tra cứu đơn công khai theo thông tin yêu cầu.
function gioiHanTraCuuDonKhach(req, res, next) {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  let attempt = guestOrderLookupAttempts.get(key);
  if (!attempt || now >= attempt.resetAt) {
    attempt = { count: 0, resetAt: now + GUEST_LOOKUP_WINDOW_MS };
  }
  if (attempt.count >= GUEST_LOOKUP_MAX_ATTEMPTS) {
    res.set("Retry-After", String(Math.ceil((attempt.resetAt - now) / 1000)));
    return res.status(429).json({
      success: false,
      message: "Bạn đã tra cứu quá nhiều lần. Vui lòng thử lại sau.",
    });
  }
  attempt.count++;
  guestOrderLookupAttempts.set(key, attempt);
  if (guestOrderLookupAttempts.size > 10000) {
    for (const [ip, value] of guestOrderLookupAttempts) {
      if (now >= value.resetAt) guestOrderLookupAttempts.delete(ip);
    }
  }
  return next();
}

class LoiApiDonHang extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Đọc số nguyên dương và báo lỗi theo tên trường hiển thị.
function docSoNguyenDuong(value, fieldName) {
  const normalized = typeof value === "string" ? value.trim() : value;
  if (
    (typeof normalized !== "number" && !/^\d+$/.test(String(normalized))) ||
    !Number.isSafeInteger(Number(normalized)) ||
    Number(normalized) < 1
  ) {
    throw new LoiApiDonHang(400, `${fieldName} không hợp lệ`);
  }
  return Number(normalized);
}

// Quy đổi tiền sang số nguyên xu để tránh sai số dấu phẩy động.
function doiSangSoTienXu(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) throw new Error("Giá sản phẩm trong database không hợp lệ");
  return BigInt(match[1]) * 100n + BigInt((match[2] || "").padEnd(2, "0"));
}

// Chuyển số xu nguyên về giá trị tiền dùng trong phản hồi.
function doiTuSoTienXu(cents) {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

function chuanHoaMaVoucher(value) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new LoiApiDonHang(400, "Mã giảm giá không hợp lệ");
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code)) {
    throw new LoiApiDonHang(400, "Mã giảm giá chỉ gồm chữ, số, gạch ngang hoặc gạch dưới (3–40 ký tự)");
  }
  return code;
}

function tinhSoTienGiam(voucher, subtotalCents) {
  if (subtotalCents < doiSangSoTienXu(voucher.minimum_subtotal)) {
    throw new LoiApiDonHang(409, `Đơn hàng tối thiểu ${Number(voucher.minimum_subtotal).toLocaleString("vi-VN")}đ để sử dụng mã này`);
  }
  let discountCents;
  if (voucher.discount_type === "percentage") {
    discountCents = (subtotalCents * doiSangSoTienXu(voucher.discount_value)) / 10000n;
    if (voucher.maximum_discount != null) {
      const cap = doiSangSoTienXu(voucher.maximum_discount);
      if (discountCents > cap) discountCents = cap;
    }
  } else {
    discountCents = doiSangSoTienXu(voucher.discount_value);
  }
  if (discountCents <= 0n) throw new LoiApiDonHang(409, "Giá trị đơn hàng chưa tạo được mức giảm tối thiểu");
  return discountCents > subtotalCents ? subtotalCents : discountCents;
}

async function kiemTraVoucher(connection, code, subtotalCents, lock = false, customerId = null) {
  if (!coBangVoucher || !coCotVoucherDonHang || !coCotTrangThaiLuotVoucher || !coCotMetadataVoucher) {
    throw new LoiApiDonHang(503, "Chức năng mã giảm giá chưa được kích hoạt trong cơ sở dữ liệu");
  }
  const [rows] = await connection.execute(
    `SELECT id, code, campaign_name, description, discount_type, discount_value,
            minimum_subtotal, maximum_discount, quantity_limit, used_count,
            per_customer_limit,
            starts_at, ends_at, is_active,
            starts_at <= UTC_TIMESTAMP() AS has_started,
            ends_at >= UTC_TIMESTAMP() AS has_not_ended
     FROM vouchers WHERE code = ? ${lock ? "FOR UPDATE" : ""}`,
    [code],
  );
  const voucher = rows[0];
  if (!voucher) throw new LoiApiDonHang(404, "Mã giảm giá không tồn tại");
  if (!voucher.is_active) throw new LoiApiDonHang(409, "Mã giảm giá đang tạm ngừng");
  if (!voucher.has_started) throw new LoiApiDonHang(409, "Mã giảm giá chưa đến thời gian sử dụng");
  if (!voucher.has_not_ended) throw new LoiApiDonHang(409, "Mã giảm giá đã hết hạn");
  if (Number(voucher.used_count) >= Number(voucher.quantity_limit)) {
    throw new LoiApiDonHang(409, "Mã giảm giá đã hết lượt sử dụng");
  }
  if (voucher.per_customer_limit != null && customerId == null) {
    throw new LoiApiDonHang(409, "Vui lòng đăng nhập để sử dụng mã có giới hạn lượt theo khách hàng");
  }
  if (customerId != null && voucher.per_customer_limit != null) {
    const [[usage]] = await connection.execute(
      `SELECT COUNT(*) AS total FROM voucher_redemptions
       WHERE voucher_id = ? AND customer_id = ? AND usage_status <> 'released'`,
      [voucher.id, customerId],
    );
    if (Number(usage.total) >= Number(voucher.per_customer_limit)) {
      throw new LoiApiDonHang(409, "Bạn đã sử dụng hết số lượt cho phép của mã giảm giá này");
    }
  }
  return { voucher, discountCents: tinhSoTienGiam(voucher, subtotalCents) };
}

// Chuẩn hóa một dòng hàng lưu tại thời điểm khách đặt đơn.
function chuanHoaChiTietDonHang(row) {
  return {
    id: String(row.id),
    product_id: row.product_id === null ? null : Number(row.product_id),
    product_name: row.product_name,
    product_category: row.product_category,
    product_image: row.product_image,
    unit_price: Number(row.unit_price),
    quantity: Number(row.quantity),
    line_total: Number(row.line_total),
  };
}

// Chuẩn hóa đơn và danh sách chi tiết theo hợp đồng API.
function chuanHoaDonHang(row, items = []) {
  return {
    id: String(row.id),
    user_address_id:
      row.user_address_id === null ? null : Number(row.user_address_id),
    recipient_name: row.recipient_name,
    recipient_phone: row.recipient_phone,
    shipping_address: row.shipping_address,
    subtotal: Number(row.subtotal),
    shipping_fee: row.shipping_fee === null ? null : Number(row.shipping_fee),
    shipping_region_code: row.shipping_region_code || null,
    shipping_region_name: row.shipping_region_name || null,
    total_amount: Number(row.total_amount),
    voucher_id: row.voucher_id == null ? null : Number(row.voucher_id),
    voucher_code: row.voucher_code || null,
    voucher_campaign_name: row.voucher_campaign_name || null,
    voucher_discount_type: row.voucher_discount_type || null,
    voucher_discount_value: row.voucher_discount_value == null ? null : Number(row.voucher_discount_value),
    discount_amount: Number(row.discount_amount || 0),
    status: row.status,
    payment_method: row.payment_method || null,
    payment_status: row.payment_status || "pending",
    created_at: row.created_at,
    updated_at: row.updated_at,
    items,
  };
}

// Lấy chi tiết cho một hoặc nhiều đơn bằng kết nối hiện tại.
async function layChiTietDonHang(connection, orderIds) {
  if (!orderIds.length) return new Map();
  const placeholders = orderIds.map(() => "?").join(",");
  const [rows] = await connection.execute(
    `SELECT id, order_id, product_id, product_name, product_category,
            product_image, unit_price, quantity, line_total
     FROM order_items
     WHERE order_id IN (${placeholders})
     ORDER BY id ASC`,
    orderIds,
  );
  const grouped = new Map();
  for (const row of rows) {
    const key = String(row.order_id);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(chuanHoaChiTietDonHang(row));
  }
  return grouped;
}

// Đồng bộ địa chỉ mặc định vào hồ sơ tài khoản
// Đồng bộ địa chỉ mặc định vào phần hồ sơ tương thích cũ.
async function dongBoDiaChiMacDinhVaoHoSo(connection, userId, address) {
  await connection.execute("UPDATE users SET address = ? WHERE id = ?", [
    address || null,
    userId,
  ]);
}

// =========================
// API KIỂM TRA BACKEND
// =========================

app.get("/api/hello", (req, res) => {
  res.json({
    success: true,
    message: "Backend Ánh Nguyệt đang hoạt động!",
  });
});

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      success: true,
      database: "connected",
      databaseName: DATABASE_NAME,
    });
  } catch (error) {
    console.error("Lỗi kiểm tra MySQL:", error.message);

    res.status(503).json({
      success: false,
      database: "disconnected",
    });
  }
});

// =========================
// API TÀI KHOẢN
// =========================

// Đăng ký
app.post("/api/auth/register", async (req, res) => {
  try {
    const { full_name, email, password, phone, address } = req.body;

    if (
      typeof full_name !== "string" ||
      !full_name.trim() ||
      full_name.trim().length > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Họ tên không hợp lệ hoặc vượt quá 100 ký tự",
      });
    }

    if (
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return res.status(400).json({
        success: false,
        message: "Địa chỉ email không hợp lệ",
      });
    }

    if (typeof password !== "string" || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu phải có ít nhất 6 ký tự",
      });
    }

    if (password.length > 72) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu không được vượt quá 72 ký tự",
      });
    }

    if (
      phone !== undefined &&
      phone !== null &&
      (typeof phone !== "string" || phone.length > 20)
    ) {
      return res.status(400).json({
        success: false,
        message: "Số điện thoại không hợp lệ",
      });
    }

    if (
      address !== undefined &&
      address !== null &&
      typeof address !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Địa chỉ không hợp lệ",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [existingUsers] = await pool.execute(
      "SELECT id FROM users WHERE email = ?",
      [normalizedEmail],
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email này đã được sử dụng",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const [result] = await pool.execute(
      `INSERT INTO users
        (full_name, email, password, phone, address)
       VALUES (?, ?, ?, ?, ?)`,
      [
        full_name.trim(),
        normalizedEmail,
        hashedPassword,
        phone?.trim() || null,
        address?.trim() || null,
      ],
    );

    const [rows] = await pool.execute("SELECT * FROM users WHERE id = ?", [
      result.insertId,
    ]);

    res.status(201).json({
      success: true,
      message: "Đăng ký tài khoản thành công",
      user: chuanHoaNguoiDung(rows[0]),
    });
  } catch (error) {
    console.error("Lỗi đăng ký:", error.message);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Email này đã được sử dụng",
      });
    }

    res.status(500).json({
      success: false,
      message: "Không thể đăng ký tài khoản",
    });
  }
});

// Đăng nhập
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập email và mật khẩu",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [rows] = await pool.execute("SELECT * FROM users WHERE email = ?", [
      normalizedEmail,
    ]);

    if (!rows.length) {
      return res.status(401).json({
        success: false,
        message: "Email hoặc mật khẩu không chính xác",
      });
    }

    const userRow = rows[0];

    if (userRow.role === "employee" && coCotTrangThaiNguoiDung && !userRow.is_active) {
      return res.status(403).json({ success: false, message: "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên." });
    }

    const passwordMatches = await bcrypt.compare(password, userRow.password);

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Email hoặc mật khẩu không chính xác",
      });
    }

    const user = chuanHoaNguoiDung(userRow);
    const token = taoToken(user);

    res.json({
      success: true,
      message: "Đăng nhập thành công",
      token,
      user,
    });
  } catch (error) {
    console.error("Lỗi đăng nhập:", error.message);

    res.status(500).json({
      success: false,
      message: "Không thể đăng nhập",
    });
  }
});

// Lấy thông tin tài khoản
app.get("/api/auth/me", xacThucToken, async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM users WHERE id = ?", [
      req.user.id,
    ]);

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài khoản",
      });
    }

    res.json({
      success: true,
      user: chuanHoaNguoiDung(rows[0]),
    });
  } catch (error) {
    console.error("Lỗi lấy thông tin tài khoản:", error.message);

    res.status(500).json({
      success: false,
      message: "Không thể lấy thông tin tài khoản",
    });
  }
});

// Cập nhật thông tin tài khoản và đồng bộ địa chỉ
app.put("/api/auth/me", xacThucToken, async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { full_name, phone, address } = req.body;

    if (
      full_name !== undefined &&
      (typeof full_name !== "string" ||
        !full_name.trim() ||
        full_name.trim().length > 100)
    ) {
      return res.status(400).json({
        success: false,
        message: "Họ tên không hợp lệ",
      });
    }

    if (
      phone !== undefined &&
      phone !== null &&
      (typeof phone !== "string" || phone.length > 20)
    ) {
      return res.status(400).json({
        success: false,
        message: "Số điện thoại không hợp lệ",
      });
    }

    if (
      address !== undefined &&
      address !== null &&
      typeof address !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Địa chỉ không hợp lệ",
      });
    }

    const updates = [];
    const values = [];

    if (full_name !== undefined) {
      updates.push("full_name = ?");
      values.push(full_name.trim());
    }

    if (phone !== undefined) {
      updates.push("phone = ?");
      values.push(phone?.trim() || null);
    }

    if (address !== undefined) {
      updates.push("address = ?");
      values.push(address?.trim() || null);
    }

    if (!updates.length) {
      return res.status(400).json({
        success: false,
        message: "Không có thông tin cần cập nhật",
      });
    }

    await connection.beginTransaction();

    const [userRows] = await connection.execute(
      `SELECT id, full_name, phone, address
       FROM users WHERE id = ? FOR UPDATE`,
      [req.user.id],
    );

    if (!userRows.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài khoản",
      });
    }

    const currentUser = userRows[0];

    values.push(req.user.id);

    await connection.execute(
      `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
      values,
    );

    if (address !== undefined && address?.trim()) {
      const [defaultRows] = await connection.execute(
        `SELECT id
         FROM user_addresses
         WHERE user_id = ? AND is_default = TRUE
         LIMIT 1`,
        [req.user.id],
      );

      if (defaultRows.length) {
        await connection.execute(
          `UPDATE user_addresses
           SET address = ?, latitude = NULL, longitude = NULL
           WHERE id = ? AND user_id = ?`,
          [address.trim(), defaultRows[0].id, req.user.id],
        );
      } else if (phone?.trim() || currentUser.phone) {
        const recipientPhone = phone?.trim() || currentUser.phone;

        await connection.execute(
          `UPDATE user_addresses
           SET is_default = FALSE
           WHERE user_id = ?`,
          [req.user.id],
        );

        await connection.execute(
          `INSERT INTO user_addresses
            (user_id, recipient_name, phone, address, is_default)
           VALUES (?, ?, ?, ?, TRUE)`,
          [
            req.user.id,
            full_name?.trim() || currentUser.full_name,
            recipientPhone,
            address.trim(),
          ],
        );
      }
    }

    const [rows] = await connection.execute(
      "SELECT * FROM users WHERE id = ?",
      [req.user.id],
    );

    await connection.commit();

    res.json({
      success: true,
      message: "Cập nhật thông tin thành công",
      user: chuanHoaNguoiDung(rows[0]),
    });
  } catch (error) {
    await connection.rollback();

    console.error("Lỗi cập nhật tài khoản:", error.message);

    res.status(500).json({
      success: false,
      message: "Không thể cập nhật thông tin tài khoản",
    });
  } finally {
    connection.release();
  }
});

// =========================
// API ĐỔI MẬT KHẨU BẰNG OTP
// =========================

// Bước 1: Kiểm tra mật khẩu hiện tại và gửi OTP
app.post(
  "/api/auth/change-password/request-otp",
  xacThucToken,
  async (req, res) => {
    try {
      const { current_password, new_password, confirm_password } = req.body;

      if (
        typeof current_password !== "string" ||
        !current_password ||
        typeof new_password !== "string" ||
        typeof confirm_password !== "string"
      ) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng nhập đầy đủ thông tin mật khẩu",
        });
      }

      if (new_password.length < 8) {
        return res.status(400).json({
          success: false,
          message: "Mật khẩu mới phải có ít nhất 8 ký tự",
        });
      }

      if (new_password.length > 72) {
        return res.status(400).json({
          success: false,
          message: "Mật khẩu mới không được vượt quá 72 ký tự",
        });
      }

      if (new_password !== confirm_password) {
        return res.status(400).json({
          success: false,
          message: "Mật khẩu xác nhận không khớp",
        });
      }

      const [users] = await pool.execute(
        "SELECT id, email, password FROM users WHERE id = ?",
        [req.user.id],
      );

      if (!users.length) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy tài khoản",
        });
      }

      const user = users[0];

      const passwordMatches = await bcrypt.compare(
        current_password,
        user.password,
      );

      if (!passwordMatches) {
        return res.status(400).json({
          success: false,
          message: "Mật khẩu hiện tại không chính xác",
        });
      }

      const isSamePassword = await bcrypt.compare(new_password, user.password);

      if (isSamePassword) {
        return res.status(400).json({
          success: false,
          message: "Mật khẩu mới phải khác mật khẩu hiện tại",
        });
      }

      if (!user.email) {
        return res.status(400).json({
          success: false,
          message: "Tài khoản chưa có địa chỉ email",
        });
      }

      const otp = crypto.randomInt(100000, 1000000).toString();

      const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

      const newPasswordHash = await bcrypt.hash(new_password, 12);

      passwordOtpStore.set(String(req.user.id), {
        otpHash,
        newPasswordHash,
        expiresAt: Date.now() + 5 * 60 * 1000,
        attempts: 0,
      });

      try {
        const transporter = taoBoGoiThu();

        await transporter.sendMail({
          from: `"Ánh Nguyệt" <${process.env.GMAIL_USER}>`,
          to: user.email,
          subject: "Mã xác nhận đổi mật khẩu - Ánh Nguyệt",
          text:
            `Xin chào,\n\n` +
            `Mã OTP để xác nhận đổi mật khẩu của bạn là: ${otp}\n\n` +
            `Mã có hiệu lực trong 5 phút.\n` +
            `Vui lòng không chia sẻ mã này với bất kỳ ai.\n\n` +
            `Trân trọng,\nÁnh Nguyệt`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#342747">
              <h2 style="color:#8056a8">Ánh Nguyệt</h2>
              <h3>Xác nhận đổi mật khẩu</h3>
              <p>Xin chào,</p>
              <p>Mã OTP xác nhận đổi mật khẩu của bạn là:</p>
              <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#8056a8;padding:18px 0">
                ${otp}
              </div>
              <p>Mã có hiệu lực trong <strong>5 phút</strong>.</p>
              <p>Vui lòng không chia sẻ mã này với bất kỳ ai.</p>
              <hr style="border:none;border-top:1px solid #eee">
              <p style="color:#888;font-size:12px">
                Email tự động từ hệ thống Ánh Nguyệt. Vui lòng không trả lời email này.
              </p>
            </div>
          `,
        });
      } catch (mailError) {
        passwordOtpStore.delete(String(req.user.id));

        console.error("Lỗi gửi email OTP:", mailError.message);

        return res.status(500).json({
          success: false,
          message:
            "Không thể gửi mã OTP. Vui lòng kiểm tra cấu hình email trong server/.env",
        });
      }

      res.json({
        success: true,
        message: "Mã OTP đã được gửi đến email đăng ký của bạn",
      });
    } catch (error) {
      console.error("Lỗi yêu cầu OTP đổi mật khẩu:", error.message);

      res.status(500).json({
        success: false,
        message: "Không thể gửi mã OTP",
      });
    }
  },
);

// Bước 2: Xác nhận OTP và cập nhật mật khẩu
app.post(
  "/api/auth/change-password/verify-otp",
  xacThucToken,
  async (req, res) => {
    try {
      const { otp } = req.body;

      if (typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng nhập mã OTP gồm 6 chữ số",
        });
      }

      const userId = String(req.user.id);
      const otpData = passwordOtpStore.get(userId);

      if (!otpData) {
        return res.status(400).json({
          success: false,
          message: "Không tìm thấy mã OTP. Vui lòng yêu cầu gửi mã mới",
        });
      }

      if (Date.now() > otpData.expiresAt) {
        passwordOtpStore.delete(userId);

        return res.status(400).json({
          success: false,
          message: "Mã OTP đã hết hạn. Vui lòng yêu cầu gửi mã mới",
        });
      }

      if (otpData.attempts >= 5) {
        passwordOtpStore.delete(userId);

        return res.status(400).json({
          success: false,
          message:
            "Bạn đã nhập sai OTP quá số lần cho phép. Vui lòng gửi mã mới",
        });
      }

      const submittedOtpHash = crypto
        .createHash("sha256")
        .update(otp)
        .digest("hex");

      if (submittedOtpHash !== otpData.otpHash) {
        otpData.attempts += 1;

        if (otpData.attempts >= 5) {
          passwordOtpStore.delete(userId);
        }

        return res.status(400).json({
          success: false,
          message: "Mã OTP không chính xác",
        });
      }

      const passwordUpdate = coCotDoiMatKhauLanDau
        ? "UPDATE users SET password = ?, must_change_password = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        : "UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?";
      const [result] = await pool.execute(passwordUpdate, [otpData.newPasswordHash, req.user.id]);

      if (result.affectedRows === 0) {
        passwordOtpStore.delete(userId);

        return res.status(404).json({
          success: false,
          message: "Không tìm thấy tài khoản để cập nhật mật khẩu",
        });
      }

      passwordOtpStore.delete(userId);

      res.json({
        success: true,
        message: "Đổi mật khẩu thành công",
      });
    } catch (error) {
      console.error("Lỗi xác nhận OTP:", error.message);

      res.status(500).json({
        success: false,
        message: "Không thể xác nhận OTP và đổi mật khẩu",
      });
    }
  },
);

// =========================
// API ẢNH ĐẠI DIỆN
// =========================

app.post(
  "/api/auth/avatar",
  xacThucToken,
  (req, res, next) => {
    uploadAvatar(req, res, (error) => {
      if (error) {
        let message = error.message;

        if (error instanceof multer.MulterError) {
          if (error.code === "LIMIT_FILE_SIZE") {
            message = "Ảnh đại diện không được vượt quá 5MB";
          } else {
            message = "Không thể tải ảnh lên";
          }
        }

        return res.status(400).json({
          success: false,
          message,
        });
      }

      next();
    });
  },
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng chọn ảnh đại diện",
      });
    }

    const newAvatarUrl = `/uploads/avatars/${req.file.filename}`;

    try {
      const imageContent = await fs.promises.readFile(req.file.path);
      if (nhanDangDinhDangAnh(imageContent) !== req.file.mimetype) {
        await xoaAnhDaiDienCu(newAvatarUrl);
        return res.status(400).json({
          success: false,
          message: "Nội dung tệp không khớp định dạng ảnh được hỗ trợ",
        });
      }

      const [existingRows] = await pool.execute(
        "SELECT avatar_url FROM users WHERE id = ?",
        [req.user.id],
      );

      if (!existingRows.length) {
        await xoaAnhDaiDienCu(newAvatarUrl);

        return res.status(404).json({
          success: false,
          message: "Không tìm thấy tài khoản",
        });
      }

      const oldAvatarUrl = existingRows[0].avatar_url;

      await pool.execute("UPDATE users SET avatar_url = ? WHERE id = ?", [
        newAvatarUrl,
        req.user.id,
      ]);

      const [rows] = await pool.execute("SELECT * FROM users WHERE id = ?", [
        req.user.id,
      ]);

      if (oldAvatarUrl && oldAvatarUrl !== newAvatarUrl) {
        await xoaAnhDaiDienCu(oldAvatarUrl);
      }

      res.json({
        success: true,
        message: "Cập nhật ảnh đại diện thành công",
        avatar_url: newAvatarUrl,
        user: chuanHoaNguoiDung(rows[0]),
      });
    } catch (error) {
      // Chỉ xóa nếu lần ghi tài khoản chưa liên kết ảnh mới.
      await xoaAnhDaiDienCu(newAvatarUrl);

      console.error("Lỗi upload ảnh đại diện:", error.message);

      res.status(500).json({
        success: false,
        message: "Không thể cập nhật ảnh đại diện",
      });
    }
  },
);

// =========================
// API QUẢN LÝ ĐỊA CHỈ
// =========================

// Lấy danh sách địa chỉ
app.get("/api/auth/addresses", xacThucToken, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT *
       FROM user_addresses
       WHERE user_id = ?
       ORDER BY is_default DESC, created_at DESC`,
      [req.user.id],
    );

    res.json({
      success: true,
      count: rows.length,
      data: rows.map(chuanHoaDiaChi),
    });
  } catch (error) {
    console.error("Lỗi lấy danh sách địa chỉ:", error.message);

    res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách địa chỉ",
    });
  }
});

// Thêm địa chỉ
app.post("/api/auth/addresses", xacThucToken, async (req, res) => {
  const validationError = kiemTraDuLieuDiaChi(req.body);

  if (validationError) {
    return res.status(400).json({
      success: false,
      message: validationError,
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [existingRows] = await connection.execute(
      "SELECT id FROM user_addresses WHERE user_id = ?",
      [req.user.id],
    );

    const shouldBeDefault =
      req.body.is_default === true ||
      req.body.is_default === 1 ||
      existingRows.length === 0;

    if (shouldBeDefault) {
      await connection.execute(
        "UPDATE user_addresses SET is_default = FALSE WHERE user_id = ?",
        [req.user.id],
      );
    }

    const [result] = await connection.execute(
      `INSERT INTO user_addresses
        (user_id, recipient_name, phone, address,
         is_default, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        req.body.recipient_name.trim(),
        req.body.phone.trim(),
        req.body.address.trim(),
        shouldBeDefault,
        req.body.latitude ?? null,
        req.body.longitude ?? null,
      ],
    );

    if (shouldBeDefault) {
      await dongBoDiaChiMacDinhVaoHoSo(
        connection,
        req.user.id,
        req.body.address.trim(),
      );
    }

    const [rows] = await connection.execute(
      "SELECT * FROM user_addresses WHERE id = ? AND user_id = ?",
      [result.insertId, req.user.id],
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      message: "Thêm địa chỉ thành công",
      data: chuanHoaDiaChi(rows[0]),
    });
  } catch (error) {
    await connection.rollback();

    console.error("Lỗi thêm địa chỉ:", error.message);

    res.status(500).json({
      success: false,
      message: "Không thể thêm địa chỉ",
    });
  } finally {
    connection.release();
  }
});

// Cập nhật địa chỉ
app.put("/api/auth/addresses/:id", xacThucToken, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      success: false,
      message: "ID địa chỉ không hợp lệ",
    });
  }

  const validationError = kiemTraDuLieuDiaChi(req.body);

  if (validationError) {
    return res.status(400).json({
      success: false,
      message: validationError,
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [existingRows] = await connection.execute(
      "SELECT * FROM user_addresses WHERE id = ? AND user_id = ?",
      [id, req.user.id],
    );

    if (!existingRows.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy địa chỉ",
      });
    }

    const oldAddress = existingRows[0];

    const shouldBeDefault =
      req.body.is_default === undefined
        ? Boolean(oldAddress.is_default)
        : req.body.is_default === true || req.body.is_default === 1;

    const latitude =
      req.body.latitude === undefined ? oldAddress.latitude : req.body.latitude;

    const longitude =
      req.body.longitude === undefined
        ? oldAddress.longitude
        : req.body.longitude;

    if (shouldBeDefault) {
      await connection.execute(
        "UPDATE user_addresses SET is_default = FALSE WHERE user_id = ?",
        [req.user.id],
      );
    }

    await connection.execute(
      `UPDATE user_addresses
       SET recipient_name = ?,
           phone = ?,
           address = ?,
           is_default = ?,
           latitude = ?,
           longitude = ?
       WHERE id = ? AND user_id = ?`,
      [
        req.body.recipient_name.trim(),
        req.body.phone.trim(),
        req.body.address.trim(),
        shouldBeDefault,
        latitude,
        longitude,
        id,
        req.user.id,
      ],
    );

    if (shouldBeDefault) {
      await dongBoDiaChiMacDinhVaoHoSo(
        connection,
        req.user.id,
        req.body.address.trim(),
      );
    }

    const [rows] = await connection.execute(
      "SELECT * FROM user_addresses WHERE id = ? AND user_id = ?",
      [id, req.user.id],
    );

    await connection.commit();

    res.json({
      success: true,
      message: "Cập nhật địa chỉ thành công",
      data: chuanHoaDiaChi(rows[0]),
    });
  } catch (error) {
    await connection.rollback();

    console.error("Lỗi cập nhật địa chỉ:", error.message);

    res.status(500).json({
      success: false,
      message: "Không thể cập nhật địa chỉ",
    });
  } finally {
    connection.release();
  }
});

// Đặt địa chỉ mặc định
app.patch("/api/auth/addresses/:id/default", xacThucToken, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      success: false,
      message: "ID địa chỉ không hợp lệ",
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [existingRows] = await connection.execute(
      "SELECT * FROM user_addresses WHERE id = ? AND user_id = ?",
      [id, req.user.id],
    );

    if (!existingRows.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy địa chỉ",
      });
    }

    await connection.execute(
      "UPDATE user_addresses SET is_default = FALSE WHERE user_id = ?",
      [req.user.id],
    );

    await connection.execute(
      `UPDATE user_addresses
         SET is_default = TRUE
         WHERE id = ? AND user_id = ?`,
      [id, req.user.id],
    );

    await dongBoDiaChiMacDinhVaoHoSo(
      connection,
      req.user.id,
      existingRows[0].address,
    );

    const [rows] = await connection.execute(
      "SELECT * FROM user_addresses WHERE id = ? AND user_id = ?",
      [id, req.user.id],
    );

    await connection.commit();

    res.json({
      success: true,
      message: "Đã đặt địa chỉ mặc định",
      data: chuanHoaDiaChi(rows[0]),
    });
  } catch (error) {
    await connection.rollback();

    console.error("Lỗi đặt địa chỉ mặc định:", error.message);

    res.status(500).json({
      success: false,
      message: "Không thể đặt địa chỉ mặc định",
    });
  } finally {
    connection.release();
  }
});

// Xóa địa chỉ
app.delete("/api/auth/addresses/:id", xacThucToken, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      success: false,
      message: "ID địa chỉ không hợp lệ",
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [existingRows] = await connection.execute(
      "SELECT * FROM user_addresses WHERE id = ? AND user_id = ?",
      [id, req.user.id],
    );

    if (!existingRows.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy địa chỉ",
      });
    }

    const wasDefault = Boolean(existingRows[0].is_default);

    await connection.execute(
      "DELETE FROM user_addresses WHERE id = ? AND user_id = ?",
      [id, req.user.id],
    );

    if (wasDefault) {
      const [remainingRows] = await connection.execute(
        `SELECT *
           FROM user_addresses
           WHERE user_id = ?
           ORDER BY created_at ASC, id ASC
           LIMIT 1`,
        [req.user.id],
      );

      if (remainingRows.length) {
        await connection.execute(
          `UPDATE user_addresses
             SET is_default = TRUE
             WHERE id = ? AND user_id = ?`,
          [remainingRows[0].id, req.user.id],
        );

        await dongBoDiaChiMacDinhVaoHoSo(
          connection,
          req.user.id,
          remainingRows[0].address,
        );
      } else {
        await dongBoDiaChiMacDinhVaoHoSo(connection, req.user.id, null);
      }
    }

    await connection.commit();

    res.json({
      success: true,
      message: "Xóa địa chỉ thành công",
    });
  } catch (error) {
    await connection.rollback();

    console.error("Lỗi xóa địa chỉ:", error.message);

    res.status(500).json({
      success: false,
      message: "Không thể xóa địa chỉ",
    });
  } finally {
    connection.release();
  }
});

// =========================
// API SẢN PHẨM
// =========================

// =========================
// API ĐƠN HÀNG
// =========================

// Cart state is private to the authenticated account; prices always come from products.
app.get("/api/cart", xacThucToken, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT p.*, ci.quantity AS cart_quantity
       FROM user_cart_items ci
       INNER JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = ?
       ORDER BY ci.created_at ASC, ci.product_id ASC`,
      [req.user.id],
    );
    res.json({
      success: true,
      count: rows.length,
      data: rows.map((row) => ({
        ...chuanHoaSanPham(row),
        quantity: Number(row.cart_quantity),
      })),
    });
  } catch (error) {
    console.error("Lỗi lấy giỏ hàng tài khoản:", error.code || "UNKNOWN");
    res.status(500).json({ success: false, message: "Không thể tải giỏ hàng" });
  }
});

app.put("/api/cart", xacThucToken, async (req, res) => {
  let connection;
  try {
    if (!Array.isArray(req.body?.items) || req.body.items.length > 100) {
      throw new LoiApiDonHang(
        400,
        "Giỏ hàng phải là danh sách tối đa 100 sản phẩm",
      );
    }
    const items = req.body.items.map((item, index) => ({
      productId: docSoNguyenDuong(
        item?.product_id,
        `Mã sản phẩm thứ ${index + 1}`,
      ),
      quantity: docSoNguyenDuong(
        item?.quantity,
        `Số lượng sản phẩm thứ ${index + 1}`,
      ),
    }));
    if (items.some((item) => item.quantity > 1000000)) {
      throw new LoiApiDonHang(400, "Số lượng sản phẩm vượt giới hạn cho phép");
    }
    if (new Set(items.map((item) => item.productId)).size !== items.length) {
      throw new LoiApiDonHang(
        400,
        "Mỗi sản phẩm chỉ được xuất hiện một lần trong giỏ hàng",
      );
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();
    const productsById = new Map();
    for (const productId of items
      .map((item) => item.productId)
      .sort((a, b) => a - b)) {
      const [rows] = await connection.execute(
        "SELECT * FROM products WHERE id = ? FOR UPDATE",
        [productId],
      );
      if (!rows.length)
        throw new LoiApiDonHang(404, `Không tìm thấy sản phẩm mã ${productId}`);
      if (!rows[0].active) {
        throw new LoiApiDonHang(
          409,
          `Sản phẩm “${rows[0].name}” hiện không kinh doanh`,
        );
      }
      const requested = items.find((item) => item.productId === productId);
      if (Number(rows[0].stock) < requested.quantity) {
        throw new LoiApiDonHang(
          409,
          `Sản phẩm “${rows[0].name}” không đủ tồn kho`,
        );
      }
      productsById.set(productId, rows[0]);
    }

    await connection.execute("DELETE FROM user_cart_items WHERE user_id = ?", [
      req.user.id,
    ]);
    for (const item of items) {
      await connection.execute(
        `INSERT INTO user_cart_items (user_id, product_id, quantity)
         VALUES (?, ?, ?)`,
        [req.user.id, item.productId, item.quantity],
      );
    }
    await connection.commit();

    res.json({
      success: true,
      count: items.length,
      data: items.map((item) => ({
        ...chuanHoaSanPham(productsById.get(item.productId)),
        quantity: item.quantity,
      })),
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {
        /* transaction may already be complete */
      }
    }
    if (error instanceof LoiApiDonHang) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    console.error("Lỗi lưu giỏ hàng tài khoản:", error.code || "UNKNOWN");
    return res
      .status(500)
      .json({ success: false, message: "Không thể lưu giỏ hàng" });
  } finally {
    connection?.release();
  }
});

// Danh mục là bảng tra cứu bổ sung; sản phẩm vẫn lưu tên danh mục hiện có.
function danhMucTableUnavailable(res) {
  if (coBangDanhMuc) return false;
  res.status(503).json({ success: false, message: "Quản lý danh mục cần áp dụng migration quản trị danh mục trước" });
  return true;
}

app.get("/api/admin/categories", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  try {
    const page = req.query.page === undefined ? 1 : docSoNguyenDuong(req.query.page, "Số trang");
    const limit = req.query.limit === undefined ? 50 : docSoNguyenDuong(req.query.limit, "Số lượng mỗi trang");
    if (limit > 100) throw new LoiApiDonHang(400, "Tối đa 100 danh mục mỗi trang");
    const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    const filter = query ? "WHERE c.name LIKE ?" : "";
    const params = query ? [`%${query}%`] : [];
    if (!coBangDanhMuc) {
      const productFilter = query ? "WHERE category LIKE ?" : "";
      const productParams = query ? params : [];
      const [[count]] = await pool.execute(`SELECT COUNT(DISTINCT category) AS total FROM products ${productFilter}`, productParams);
      const [rows] = await pool.execute(
        `SELECT NULL AS id, category AS name, NULL AS description, COUNT(*) AS product_count,
          COALESCE(SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END), 0) AS active_product_count
         FROM products ${productFilter} GROUP BY category ORDER BY category ASC LIMIT ? OFFSET ?`,
        [...productParams, limit, (page - 1) * limit],
      );
      return res.json({ success: true, management_enabled: false, data: rows, pagination: { page, limit, total: Number(count.total), total_pages: Math.max(1, Math.ceil(Number(count.total) / limit)) } });
    }
    const [[count]] = await pool.execute(`SELECT COUNT(*) AS total FROM categories c ${filter}`, params);
    const [rows] = await pool.execute(
      `SELECT c.id, c.name, c.description, c.created_at, c.updated_at,
        COUNT(p.id) AS product_count,
        COALESCE(SUM(CASE WHEN p.active = 1 THEN 1 ELSE 0 END), 0) AS active_product_count
       FROM categories c LEFT JOIN products p ON p.category = c.name
       ${filter} GROUP BY c.id, c.name, c.description, c.created_at, c.updated_at
       ORDER BY c.name ASC LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit],
    );
    res.json({ success: true, management_enabled: true, data: rows, pagination: { page, limit, total: Number(count.total), total_pages: Math.max(1, Math.ceil(Number(count.total) / limit)) } });
  } catch (error) {
    if (error instanceof LoiApiDonHang) return res.status(error.status).json({ success: false, message: error.message });
    console.error("Lỗi tải danh mục Admin:", error.code || "UNKNOWN");
    res.status(500).json({ success: false, message: "Không thể tải danh mục" });
  }
});

app.post("/api/admin/categories", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (danhMucTableUnavailable(res)) return;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  if (!name || name.length > 100 || description.length > 500) return res.status(400).json({ success: false, message: "Tên danh mục hoặc mô tả không hợp lệ" });
  try {
    const [result] = await pool.execute("INSERT INTO categories (name, description) VALUES (?, ?)", [name, description || null]);
    res.status(201).json({ success: true, message: "Đã tạo danh mục", data: { id: Number(result.insertId), name, description: description || null, product_count: 0, active_product_count: 0 } });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, message: "Tên danh mục đã tồn tại" });
    console.error("Lỗi tạo danh mục Admin:", error.code || "UNKNOWN");
    res.status(500).json({ success: false, message: "Không thể tạo danh mục" });
  }
});

app.put("/api/admin/categories/:id", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (danhMucTableUnavailable(res)) return;
  const id = Number(req.params.id);
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  if (!Number.isSafeInteger(id) || id < 1 || !name || name.length > 100 || description.length > 500) return res.status(400).json({ success: false, message: "Thông tin danh mục không hợp lệ" });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [[category]] = await connection.execute("SELECT id, name FROM categories WHERE id = ? FOR UPDATE", [id]);
    if (!category) { await connection.rollback(); return res.status(404).json({ success: false, message: "Không tìm thấy danh mục" }); }
    await connection.execute("UPDATE products SET category = ? WHERE category = ?", [name, category.name]);
    await connection.execute("UPDATE categories SET name = ?, description = ? WHERE id = ?", [name, description || null, id]);
    await connection.commit();
    res.json({ success: true, message: "Đã cập nhật danh mục và đồng bộ sản phẩm" });
  } catch (error) {
    await connection?.rollback().catch(() => {});
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, message: "Tên danh mục đã tồn tại" });
    console.error("Lỗi cập nhật danh mục Admin:", error.code || "UNKNOWN");
    res.status(500).json({ success: false, message: "Không thể cập nhật danh mục" });
  } finally { connection?.release(); }
});

app.delete("/api/admin/categories/:id", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (danhMucTableUnavailable(res)) return;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ success: false, message: "Mã danh mục không hợp lệ" });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [[category]] = await connection.execute("SELECT id, name FROM categories WHERE id = ? FOR UPDATE", [id]);
    if (!category) { await connection.rollback(); return res.status(404).json({ success: false, message: "Không tìm thấy danh mục" }); }
    const [[usage]] = await connection.execute("SELECT COUNT(*) AS total FROM products WHERE category = ?", [category.name]);
    if (Number(usage.total) > 0) { await connection.rollback(); return res.status(409).json({ success: false, message: "Danh mục đang được sản phẩm sử dụng; hãy chuyển sản phẩm sang danh mục khác trước" }); }
    await connection.execute("DELETE FROM categories WHERE id = ?", [id]);
    await connection.commit();
    res.json({ success: true, message: "Đã xóa danh mục trống" });
  } catch (error) {
    await connection?.rollback().catch(() => {});
    console.error("Lỗi xóa danh mục Admin:", error.code || "UNKNOWN");
    res.status(500).json({ success: false, message: "Không thể xóa danh mục" });
  } finally { connection?.release(); }
});

app.get("/api/admin/shipping", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (!coBangCauHinhVanChuyen) return res.status(503).json({ success: false, message: "Cấu hình vận chuyển chưa được khởi tạo trong database" });
  try {
    const [rows] = await pool.execute("SELECT id, flat_fee, updated_at FROM shipping_configuration WHERE id = 1 LIMIT 1");
    return res.json({ success: true, data: rows[0] ? { ...rows[0], flat_fee: rows[0].flat_fee == null ? null : Number(rows[0].flat_fee) } : null, supported: { flat_fee: true, regions: false, methods: ["cod"] } });
  } catch (error) {
    console.error("Lỗi tải cấu hình vận chuyển Admin:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể tải cấu hình vận chuyển" });
  }
});

app.put("/api/admin/shipping", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (!coBangCauHinhVanChuyen) return res.status(503).json({ success: false, message: "Cấu hình vận chuyển chưa được khởi tạo trong database" });
  const value = req.body?.flat_fee;
  if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 9999999999.99 || Math.round(value * 100) !== value * 100)) return res.status(400).json({ success: false, message: "Phí vận chuyển phải là số tiền không âm, tối đa hai chữ số thập phân hoặc để trống" });
  try {
    const [[existing]] = await pool.execute("SELECT id FROM shipping_configuration WHERE id = 1 LIMIT 1");
    if (!existing) return res.status(409).json({ success: false, message: "Chưa có dòng cấu hình vận chuyển; cần kiểm tra migration trước khi cập nhật" });
    await pool.execute("UPDATE shipping_configuration SET flat_fee = ? WHERE id = 1", [value]);
    const [[row]] = await pool.execute("SELECT id, flat_fee, updated_at FROM shipping_configuration WHERE id = 1");
    return res.json({ success: true, message: "Đã lưu cấu hình phí vận chuyển", data: { ...row, flat_fee: row.flat_fee == null ? null : Number(row.flat_fee) } });
  } catch (error) {
    console.error("Lỗi cập nhật cấu hình vận chuyển Admin:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể cập nhật cấu hình vận chuyển" });
  }
});

// Quản lý các mức phí theo khu vực. Phí chưa được cấu hình luôn giữ NULL và không hoạt động.
app.get("/api/admin/shipping/regions", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (!coBangKhuVucVanChuyen || !coCotSnapshotKhuVucVanChuyen) return res.status(503).json({ success: false, message: "Cấu trúc khu vực vận chuyển chưa hoàn chỉnh" });
  try {
    const [rows] = await pool.execute("SELECT id, region_code, region_name, fee, is_active, created_at, updated_at FROM shipping_regions ORDER BY id ASC");
    return res.json({ success: true, data: rows.map((row) => ({ ...row, id: Number(row.id), fee: row.fee == null ? null : Number(row.fee), is_active: Boolean(row.is_active) })) });
  } catch (error) {
    console.error("Lỗi tải khu vực vận chuyển Admin:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể tải khu vực vận chuyển" });
  }
});

app.post("/api/admin/shipping/regions", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (!coBangKhuVucVanChuyen || !coCotSnapshotKhuVucVanChuyen) return res.status(503).json({ success: false, message: "Cấu trúc khu vực vận chuyển chưa hoàn chỉnh" });
  const { region_code: regionCode, region_name: regionName, fee, is_active: isActive = false } = req.body || {};
  if (typeof regionCode !== "string" || !/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(regionCode) || typeof regionName !== "string" || !regionName.trim() || regionName.trim().length > 100 || (fee !== null && fee !== undefined && (typeof fee !== "number" || !Number.isFinite(fee) || fee < 0 || fee > 9999999999.99 || Math.round(fee * 100) !== fee * 100)) || typeof isActive !== "boolean" || (isActive && (fee === null || fee === undefined))) {
    return res.status(400).json({ success: false, message: "Thông tin khu vực và phí vận chuyển không hợp lệ; khu vực hoạt động phải có mức phí" });
  }
  try {
    const [result] = await pool.execute("INSERT INTO shipping_regions (region_code, region_name, fee, is_active) VALUES (?, ?, ?, ?)", [regionCode, regionName.trim(), fee ?? null, isActive]);
    const [[row]] = await pool.execute("SELECT id, region_code, region_name, fee, is_active, created_at, updated_at FROM shipping_regions WHERE id = ?", [result.insertId]);
    return res.status(201).json({ success: true, message: "Đã tạo khu vực vận chuyển", data: { ...row, id: Number(row.id), fee: row.fee == null ? null : Number(row.fee), is_active: Boolean(row.is_active) } });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, message: "Mã khu vực đã tồn tại" });
    console.error("Lỗi tạo khu vực vận chuyển Admin:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể tạo khu vực vận chuyển" });
  }
});

app.put("/api/admin/shipping/regions/:id", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (!coBangKhuVucVanChuyen || !coCotSnapshotKhuVucVanChuyen) return res.status(503).json({ success: false, message: "Cấu trúc khu vực vận chuyển chưa hoàn chỉnh" });
  const id = Number(req.params.id);
  const { region_code: regionCode, region_name: regionName, fee, is_active: isActive } = req.body || {};
  if (!Number.isSafeInteger(id) || id < 1 || typeof regionCode !== "string" || !/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(regionCode) || typeof regionName !== "string" || !regionName.trim() || regionName.trim().length > 100 || (fee !== null && (typeof fee !== "number" || !Number.isFinite(fee) || fee < 0 || fee > 9999999999.99 || Math.round(fee * 100) !== fee * 100)) || typeof isActive !== "boolean" || (isActive && fee === null)) {
    return res.status(400).json({ success: false, message: "Thông tin khu vực và phí vận chuyển không hợp lệ; khu vực hoạt động phải có mức phí" });
  }
  try {
    const [result] = await pool.execute("UPDATE shipping_regions SET region_code = ?, region_name = ?, fee = ?, is_active = ? WHERE id = ?", [regionCode, regionName.trim(), fee, isActive, id]);
    if (!result.affectedRows) {
      const [[exists]] = await pool.execute("SELECT id FROM shipping_regions WHERE id = ?", [id]);
      if (!exists) return res.status(404).json({ success: false, message: "Không tìm thấy khu vực vận chuyển" });
    }
    const [[row]] = await pool.execute("SELECT id, region_code, region_name, fee, is_active, created_at, updated_at FROM shipping_regions WHERE id = ?", [id]);
    return res.json({ success: true, message: "Đã cập nhật khu vực vận chuyển", data: { ...row, id: Number(row.id), fee: row.fee == null ? null : Number(row.fee), is_active: Boolean(row.is_active) } });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, message: "Mã khu vực đã được sử dụng" });
    console.error("Lỗi cập nhật khu vực vận chuyển Admin:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể cập nhật khu vực vận chuyển" });
  }
});

app.get("/api/admin/inventory", xacThucToken, yeuCauQuyenNhanVien, async (req, res) => {
  try {
    const page = req.query.page === undefined ? 1 : docSoNguyenDuong(req.query.page, "Số trang");
    const limit = req.query.limit === undefined ? 20 : docSoNguyenDuong(req.query.limit, "Số lượng mỗi trang");
    if (limit > 100) throw new LoiApiDonHang(400, "Tối đa 100 sản phẩm mỗi trang");
    const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    const category = typeof req.query.category === "string" ? req.query.category.trim().slice(0, 100) : "";
    const status = ["all", "available", "low", "out"].includes(req.query.status) ? req.query.status : "all";
    const conditions = [], params = [];
    if (query) { conditions.push("(name LIKE ? OR CAST(id AS CHAR) = ?)"); params.push(`%${query}%`, query); }
    if (category) { conditions.push("category = ?"); params.push(category); }
    if (status === "available") conditions.push("stock > 5");
    if (status === "low") conditions.push("stock BETWEEN 1 AND 5");
    if (status === "out") conditions.push("stock = 0");
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const [[count]] = await pool.execute(`SELECT COUNT(*) AS total FROM products ${where}`, params);
    const [rows] = await pool.execute(`SELECT id, name, category, image, stock, active FROM products ${where} ORDER BY stock ASC, name ASC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
    const [categories] = await pool.execute("SELECT DISTINCT category AS name FROM products WHERE category <> '' ORDER BY category ASC");
    return res.json({ success: true, history_available: coBangLichSuTonKho, can_adjust: coBangLichSuTonKho, data: rows.map((row) => ({ ...row, id: Number(row.id), stock: Number(row.stock), active: Boolean(row.active) })), categories: categories.map((row) => row.name), pagination: { page, limit, total: Number(count.total), total_pages: Math.max(1, Math.ceil(Number(count.total) / limit)) } });
  } catch (error) {
    if (error instanceof LoiApiDonHang) return res.status(error.status).json({ success: false, message: error.message });
    console.error("Lỗi tải tồn kho Admin:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể tải tồn kho" });
  }
});

app.get("/api/admin/inventory/:productId/movements", xacThucToken, yeuCauQuyenNhanVien, async (req, res) => {
  if (!coBangLichSuTonKho) return res.status(503).json({ success: false, message: "Lịch sử tồn kho chưa được kích hoạt" });
  const productId = Number(req.params.productId);
  if (!Number.isSafeInteger(productId) || productId < 1) return res.status(400).json({ success: false, message: "Mã sản phẩm không hợp lệ" });
  try {
    const [rows] = await pool.execute(`SELECT m.id, m.movement_type, m.quantity, m.stock_before, m.stock_after, m.note, m.created_at, u.full_name AS admin_name FROM inventory_movements m LEFT JOIN users u ON u.id = m.admin_user_id WHERE m.product_id = ? ORDER BY m.id DESC LIMIT 100`, [productId]);
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Lỗi tải lịch sử tồn kho:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể tải lịch sử tồn kho" });
  }
});

app.post("/api/admin/inventory/:productId/movements", xacThucToken, yeuCauQuyenNhanVien, async (req, res) => {
  if (!coBangLichSuTonKho) return res.status(503).json({ success: false, message: "Lịch sử tồn kho chưa được kích hoạt" });
  const productId = Number(req.params.productId);
  const { movement_type: movementType, quantity, note } = req.body || {};
  if (!Number.isSafeInteger(productId) || productId < 1 || !["inbound", "outbound"].includes(movementType) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000 || typeof note !== "string" || !note.trim() || note.trim().length > 500) return res.status(400).json({ success: false, message: "Thông tin điều chỉnh tồn kho không hợp lệ" });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [[product]] = await connection.execute("SELECT id, stock FROM products WHERE id = ? FOR UPDATE", [productId]);
    if (!product) { await connection.rollback(); return res.status(404).json({ success: false, message: "Không tìm thấy sản phẩm" }); }
    const before = Number(product.stock);
    const after = movementType === "inbound" ? before + quantity : before - quantity;
    if (!Number.isSafeInteger(after) || after < 0 || after > 4294967295) { await connection.rollback(); return res.status(409).json({ success: false, message: after < 0 ? "Số lượng xuất vượt tồn kho hiện tại" : "Tồn kho vượt giới hạn dữ liệu" }); }
    await connection.execute("UPDATE products SET stock = ? WHERE id = ?", [after, productId]);
    await connection.execute("INSERT INTO inventory_movements (product_id, admin_user_id, movement_type, quantity, stock_before, stock_after, note) VALUES (?, ?, ?, ?, ?, ?, ?)", [productId, req.user.id, movementType, quantity, before, after, note.trim()]);
    await connection.commit();
    return res.status(201).json({ success: true, message: "Đã ghi nhận biến động tồn kho", data: { product_id: productId, movement_type: movementType, quantity, stock_before: before, stock_after: after } });
  } catch (error) {
    await connection?.rollback().catch(() => {});
    console.error("Lỗi điều chỉnh tồn kho Admin:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể điều chỉnh tồn kho" });
  } finally { connection?.release(); }
});

app.get("/api/admin/admin-users", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  try {
    const page = req.query.page === undefined ? 1 : docSoNguyenDuong(req.query.page, "Số trang");
    const limit = req.query.limit === undefined ? 20 : docSoNguyenDuong(req.query.limit, "Số lượng mỗi trang");
    if (limit > 50) throw new LoiApiDonHang(400, "Tối đa 50 tài khoản Admin mỗi trang");
    const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    const filter = query ? "AND (full_name LIKE ? OR email LIKE ? OR phone LIKE ?)" : "";
    const params = query ? [`%${query}%`, `%${query}%`, `%${query}%`] : [];
    const [[count]] = await pool.execute(`SELECT COUNT(*) AS total FROM users WHERE role = 'admin' ${filter}`, params);
    const [rows] = await pool.execute(`SELECT id, full_name, email, phone, avatar_url, role, created_at FROM users WHERE role = 'admin' ${filter} ORDER BY created_at ASC, id ASC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
    return res.json({ success: true, data: rows.map(chuanHoaNguoiDung), pagination: { page, limit, total: Number(count.total), total_pages: Math.max(1, Math.ceil(Number(count.total) / limit)) } });
  } catch (error) {
    if (error instanceof LoiApiDonHang) return res.status(error.status).json({ success: false, message: error.message });
    console.error("Lỗi tải tài khoản Admin:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể tải danh sách tài khoản Admin" });
  }
});

// Tài khoản nhân viên và lời mời: mọi thao tác quản trị đều Admin-only.
app.get("/api/admin/employees", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (yeuCauSchemaNhanVien(res)) return;
  try {
    const page = req.query.page === undefined ? 1 : docSoNguyenDuong(req.query.page, "Số trang");
    const limit = req.query.limit === undefined ? 20 : docSoNguyenDuong(req.query.limit, "Số lượng mỗi trang");
    if (limit > 50) throw new LoiApiDonHang(400, "Tối đa 50 tài khoản mỗi trang");
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    const filter = q ? " AND (u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)" : "";
    const values = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];
    const [[count]] = await pool.execute(`SELECT COUNT(*) AS total FROM users u WHERE u.role = 'employee'${filter}`, values);
    const [rows] = await pool.execute(
      `SELECT u.id, u.full_name, u.email, u.phone, u.avatar_url, u.role, u.is_active,
              u.must_change_password, u.created_at,
              (SELECT MIN(h.created_at) FROM employee_role_history h
               WHERE h.employee_user_id = u.id AND h.action IN ('granted','invitation_accepted')) AS granted_at
       FROM users u WHERE u.role = 'employee'${filter}
       ORDER BY u.created_at DESC, u.id DESC LIMIT ? OFFSET ?`,
      [...values, limit, (page - 1) * limit],
    );
    return res.json({
      success: true,
      data: rows.map((row) => ({ ...chuanHoaNguoiDung(row), granted_at: row.granted_at })),
      pagination: { page, limit, total: Number(count.total), total_pages: Math.max(1, Math.ceil(Number(count.total) / limit)) },
    });
  } catch (error) {
    if (error instanceof LoiApiDonHang) return res.status(error.status).json({ success: false, message: error.message });
    console.error("Lỗi tải nhân viên:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể tải danh sách nhân viên" });
  }
});

app.get("/api/admin/employees/lookup", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (yeuCauSchemaNhanVien(res)) return;
  const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
  if (email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: "Địa chỉ email không hợp lệ" });
  }
  try {
    const [[user]] = await pool.execute(
      "SELECT id, full_name, email, phone, role, is_active FROM users WHERE email = ? LIMIT 1",
      [email],
    );
    return res.json({ success: true, data: user ? { ...user, id: Number(user.id), is_active: Boolean(user.is_active) } : null });
  } catch (error) {
    console.error("Lỗi tra cứu tài khoản nhân viên:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể tra cứu email" });
  }
});

function cauHinhGuiThuNhanVienHopLe() {
  const host = process.env.SMTP_HOST?.trim();
  if (host) {
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER?.trim();
    const password = process.env.SMTP_PASSWORD;
    return Number.isInteger(port) && port > 0 && port <= 65535 &&
      [undefined, "true", "false"].includes(process.env.SMTP_SECURE) &&
      Boolean(user) === Boolean(password) &&
      Boolean(process.env.SMTP_FROM?.trim() || user || process.env.GMAIL_USER?.trim());
  }
  return Boolean(process.env.GMAIL_USER?.trim() && process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, ""));
}

function emailNhanVienHopLe(email) {
  return typeof email === "string" && email.length <= 150 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function thongTinGiaoThuThatBai(error) {
  const message = error?.message || "";
  if (/FRONTEND_BASE_URL|Chưa cấu hình GMAIL_USER|Thiếu địa chỉ gửi thư|SMTP_USER và SMTP_PASSWORD|SMTP_PORT/i.test(message)) {
    return { status: 503, message: "Thiếu hoặc sai cấu hình URL giao diện/SMTP; chưa gửi được thư mời" };
  }
  return { status: 502, message: "Thư mời đã được lưu nhưng email chưa gửi được; có thể thử gửi lại" };
}

async function capNhatTrangThaiGiaoLoiMoi(invitationId, tokenHash, deliveryStatus, errorCode = null) {
  const [result] = await pool.execute(
    `UPDATE employee_invitations
     SET email_delivery_status = ?, last_email_error_code = ?,
         sent_at = CASE WHEN ? = 'sent' THEN UTC_TIMESTAMP() ELSE NULL END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND token_hash = ? AND status = 'pending' AND email_delivery_status = 'sending'`,
    [deliveryStatus, errorCode, deliveryStatus, invitationId, tokenHash],
  );
  if (result.affectedRows !== 1) throw new Error("EMPLOYEE_INVITATION_DELIVERY_STATE_CONFLICT");
}

async function guiVaCapNhatLoiMoi({ invitationId, email, token, tokenHash }) {
  try {
    await guiLoiMoiNhanVien(email, token);
    await capNhatTrangThaiGiaoLoiMoi(invitationId, tokenHash, "sent");
    return { success: true };
  } catch (error) {
    const code = maLoiEmail(error);
    console.error("Lỗi gửi lời mời Nhân viên:", code);
    try {
      await capNhatTrangThaiGiaoLoiMoi(invitationId, tokenHash, "failed", code);
    } catch (stateError) {
      console.error("Không xác minh được trạng thái email lời mời:", stateError.code || stateError.message);
      return { success: false, status: 500, message: "Chưa xác minh được trạng thái gửi thư; hãy tải lại danh sách trước khi thử lại" };
    }
    return { success: false, ...thongTinGiaoThuThatBai(error), error_code: code };
  }
}

app.get("/api/admin/employees/invitations", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (yeuCauSchemaNhanVien(res)) return;
  try {
    const page = req.query.page === undefined ? 1 : docSoNguyenDuong(req.query.page, "Số trang");
    const limit = req.query.limit === undefined ? 20 : docSoNguyenDuong(req.query.limit, "Số lượng mỗi trang");
    if (limit > 50) throw new LoiApiDonHang(400, "Tối đa 50 lời mời mỗi trang");
    await pool.execute(
      "UPDATE employee_invitations SET status = 'expired' WHERE status = 'pending' AND expires_at <= UTC_TIMESTAMP()",
    );
    const [[count]] = await pool.execute("SELECT COUNT(*) AS total FROM employee_invitations");
    const [rows] = await pool.execute(
      `SELECT id, email, invited_by_admin_id, status, email_delivery_status, last_email_error_code,
              created_at, sent_at, expires_at, accepted_at, revoked_at
       FROM employee_invitations ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [limit, (page - 1) * limit],
    );
    return res.json({
      success: true,
      data: rows.map((row) => ({ ...row, id: Number(row.id), invited_by_admin_id: Number(row.invited_by_admin_id) })),
      pagination: { page, limit, total: Number(count.total), total_pages: Math.max(1, Math.ceil(Number(count.total) / limit)) },
    });
  } catch (error) {
    if (error instanceof LoiApiDonHang) return res.status(error.status).json({ success: false, message: error.message });
    console.error("Lỗi tải lời mời Nhân viên:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể tải lời mời Nhân viên" });
  }
});

app.post("/api/admin/employees", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (yeuCauSchemaNhanVien(res)) return;
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!emailNhanVienHopLe(email)) return res.status(400).json({ success: false, message: "Địa chỉ Gmail không hợp lệ" });
  if (!layDiaChiGiaoDien()) return res.status(503).json({ success: false, code: "FRONTEND_BASE_URL_REQUIRED", message: "Cần cấu hình FRONTEND_BASE_URL hợp lệ trước khi gửi lời mời" });
  if (!cauHinhGuiThuNhanVienHopLe()) return res.status(503).json({ success: false, code: "EMAIL_CONFIGURATION_REQUIRED", message: "Chưa cấu hình SMTP/Gmail; chưa tạo lời mời hoặc gửi email" });

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  let connection;
  let invitationId;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [[existingUser]] = await connection.execute("SELECT id, role FROM users WHERE email = ? LIMIT 1 FOR UPDATE", [email]);
    if (existingUser) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        code: "EMPLOYEE_EMAIL_ALREADY_REGISTERED",
        message: existingUser.role === "customer"
          ? "Email đã đăng ký; hãy cấp quyền Nhân viên cho tài khoản hiện có"
          : "Email đã thuộc một tài khoản quản trị hoặc Nhân viên",
      });
    }
    const [[pendingInvitation]] = await connection.execute(
      "SELECT id, expires_at FROM employee_invitations WHERE email = ? AND status = 'pending' FOR UPDATE",
      [email],
    );
    if (pendingInvitation) {
      const [[expired]] = await connection.execute(
        "SELECT expires_at <= UTC_TIMESTAMP() AS value FROM employee_invitations WHERE id = ?",
        [pendingInvitation.id],
      );
      if (Number(expired.value)) {
        await connection.execute("UPDATE employee_invitations SET status = 'expired' WHERE id = ?", [pendingInvitation.id]);
      } else {
        await connection.rollback();
        return res.status(409).json({ success: false, message: "Email đã có lời mời đang chờ; hãy dùng chức năng gửi lại lời mời" });
      }
    }
    const [result] = await connection.execute(
      `INSERT INTO employee_invitations
        (email, token_hash, invited_by_admin_id, status, email_delivery_status, expires_at)
       VALUES (?, ?, ?, 'pending', 'sending', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 48 HOUR))`,
      [email, tokenHash, req.user.id],
    );
    invitationId = Number(result.insertId);
    await connection.commit();
  } catch (error) {
    await connection?.rollback().catch(() => {});
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, message: "Email đã có lời mời đang chờ" });
    console.error("Lỗi tạo lời mời Nhân viên:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể tạo lời mời Nhân viên" });
  } finally {
    connection?.release();
  }
  const delivery = await guiVaCapNhatLoiMoi({ invitationId, email, token, tokenHash });
  if (!delivery.success) {
    return res.status(delivery.status).json({
      success: false,
      code: delivery.error_code || "EMPLOYEE_INVITATION_EMAIL_FAILED",
      message: delivery.message,
      data: { id: invitationId, status: "pending", email_delivery_status: delivery.error_code ? "failed" : "sending" },
    });
  }
  return res.status(201).json({
    success: true,
    message: "Đã gửi lời mời. Liên kết có hiệu lực trong 48 giờ.",
    data: { id: invitationId, email, status: "pending", email_delivery_status: "sent" },
  });
});

app.post("/api/admin/employees/grant", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (yeuCauSchemaNhanVien(res)) return;
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!emailNhanVienHopLe(email)) return res.status(400).json({ success: false, message: "Địa chỉ email không hợp lệ" });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [[target]] = await connection.execute(
      "SELECT id, full_name, email, phone, avatar_url, role, is_active, must_change_password, created_at FROM users WHERE email = ? LIMIT 1 FOR UPDATE",
      [email],
    );
    if (!target) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Không tìm thấy tài khoản đã đăng ký với email này" });
    }
    if (target.role !== "customer") {
      await connection.rollback();
      return res.status(409).json({ success: false, message: target.role === "employee" ? "Tài khoản này đã là Nhân viên" : "Không thể đổi tài khoản Admin thành Nhân viên" });
    }
    await connection.execute("UPDATE users SET role = 'employee', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [target.id]);
    await connection.execute(
      `INSERT INTO employee_role_history
        (employee_user_id, admin_user_id, action, role_before, role_after)
       VALUES (?, ?, 'granted', 'customer', 'employee')`,
      [target.id, req.user.id],
    );
    await connection.execute(
      `UPDATE employee_invitations SET status = 'revoked', revoked_by_admin_id = ?, revoked_at = UTC_TIMESTAMP()
       WHERE email = ? AND status = 'pending'`,
      [req.user.id, email],
    );
    await connection.commit();
    return res.status(201).json({
      success: true,
      message: "Đã cấp quyền Nhân viên; email, mật khẩu và lịch sử mua hàng được giữ nguyên",
      data: chuanHoaNguoiDung({ ...target, role: "employee" }),
    });
  } catch (error) {
    await connection?.rollback().catch(() => {});
    console.error("Lỗi cấp quyền Nhân viên:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể cấp quyền Nhân viên" });
  } finally {
    connection?.release();
  }
});

app.patch("/api/admin/employees/invitations/:id/resend", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (yeuCauSchemaNhanVien(res)) return;
  if (!layDiaChiGiaoDien() || !cauHinhGuiThuNhanVienHopLe()) {
    return res.status(503).json({ success: false, code: "EMAIL_CONFIGURATION_REQUIRED", message: "Thiếu cấu hình URL giao diện hoặc SMTP; chưa gửi lại thư mời" });
  }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ success: false, message: "Mã lời mời không hợp lệ" });
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  let connection;
  let email;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [[invitation]] = await connection.execute(
      "SELECT id, email, status, email_delivery_status, updated_at, expires_at FROM employee_invitations WHERE id = ? FOR UPDATE",
      [id],
    );
    if (!invitation) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Không tìm thấy lời mời" });
    }
    if (invitation.status !== "pending") {
      await connection.rollback();
      return res.status(409).json({ success: false, message: "Chỉ có thể gửi lại lời mời đang chờ" });
    }
    const [[expired]] = await connection.execute(
      "SELECT expires_at <= UTC_TIMESTAMP() AS value FROM employee_invitations WHERE id = ?",
      [id],
    );
    if (Number(expired.value)) {
      await connection.execute("UPDATE employee_invitations SET status = 'expired' WHERE id = ?", [id]);
      await connection.commit();
      return res.status(410).json({ success: false, message: "Lời mời đã hết hạn; hãy tạo lời mời mới" });
    }
    if (invitation.email_delivery_status === "sending") {
      const [[stale]] = await connection.execute(
        "SELECT TIMESTAMPDIFF(SECOND, ?, CURRENT_TIMESTAMP) >= 300 AS value",
        [invitation.updated_at],
      );
      if (!Number(stale.value)) {
        await connection.rollback();
        return res.status(409).json({ success: false, message: "Email lời mời hiện đang được gửi; vui lòng chờ" });
      }
    }
    email = invitation.email;
    await connection.execute(
      `UPDATE employee_invitations
       SET token_hash = ?, email_delivery_status = 'sending', last_email_error_code = NULL,
           sent_at = NULL, expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 48 HOUR),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [tokenHash, id],
    );
    await connection.commit();
  } catch (error) {
    await connection?.rollback().catch(() => {});
    console.error("Lỗi chuẩn bị gửi lại lời mời:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể chuẩn bị gửi lại lời mời" });
  } finally {
    connection?.release();
  }
  const delivery = await guiVaCapNhatLoiMoi({ invitationId: id, email, token, tokenHash });
  if (!delivery.success) return res.status(delivery.status).json({ success: false, code: delivery.error_code || "EMPLOYEE_INVITATION_EMAIL_FAILED", message: delivery.message });
  return res.json({ success: true, message: "Đã gửi lại lời mời; liên kết trước đó không còn hiệu lực", data: { id, email_delivery_status: "sent" } });
});

app.patch("/api/admin/employees/invitations/:id/revoke", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (yeuCauSchemaNhanVien(res)) return;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ success: false, message: "Mã lời mời không hợp lệ" });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [[invitation]] = await connection.execute("SELECT id, status FROM employee_invitations WHERE id = ? FOR UPDATE", [id]);
    if (!invitation) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Không tìm thấy lời mời" });
    }
    if (invitation.status !== "pending") {
      await connection.rollback();
      return res.status(409).json({ success: false, message: "Lời mời không còn ở trạng thái chờ" });
    }
    await connection.execute(
      `UPDATE employee_invitations SET status = 'revoked', revoked_by_admin_id = ?, revoked_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [req.user.id, id],
    );
    await connection.commit();
    return res.json({ success: true, message: "Đã thu hồi lời mời; liên kết không còn hiệu lực" });
  } catch (error) {
    await connection?.rollback().catch(() => {});
    console.error("Lỗi thu hồi lời mời Nhân viên:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể thu hồi lời mời" });
  } finally {
    connection?.release();
  }
});

app.get("/api/admin/employees/:id/history", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (yeuCauSchemaNhanVien(res)) return;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ success: false, message: "Mã Nhân viên không hợp lệ" });
  try {
    const [[employee]] = await pool.execute(
      "SELECT id FROM users WHERE id = ? AND EXISTS (SELECT 1 FROM employee_role_history WHERE employee_user_id = users.id) LIMIT 1",
      [id],
    );
    if (!employee) return res.status(404).json({ success: false, message: "Không tìm thấy Nhân viên" });
    const [rows] = await pool.execute(
      `SELECT h.id, h.action, h.role_before, h.role_after, h.created_at,
              a.full_name AS admin_name, i.email AS invitation_email
       FROM employee_role_history h
       LEFT JOIN users a ON a.id = h.admin_user_id
       LEFT JOIN employee_invitations i ON i.id = h.invitation_id
       WHERE h.employee_user_id = ? ORDER BY h.created_at DESC, h.id DESC LIMIT 100`,
      [id],
    );
    return res.json({ success: true, data: rows.map((row) => ({ ...row, id: Number(row.id) })) });
  } catch (error) {
    console.error("Lỗi tải lịch sử quyền Nhân viên:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể tải lịch sử quyền Nhân viên" });
  }
});

app.get("/api/admin/employee-role-history", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (yeuCauSchemaNhanVien(res)) return;
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  let limit;
  try {
    limit = req.query.limit === undefined ? 100 : docSoNguyenDuong(req.query.limit, "Số lượng sự kiện");
    if (limit > 100) throw new LoiApiDonHang(400, "Tối đa 100 sự kiện lịch sử");
  } catch (error) {
    if (error instanceof LoiApiDonHang) return res.status(error.status).json({ success: false, message: error.message });
    console.error("Lỗi xác thực bộ lọc lịch sử Nhân viên:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể tải lịch sử phân quyền" });
  }
  const filter = q ? "AND (employee.full_name LIKE ? OR employee.email LIKE ?)" : "";
  const params = q ? [`%${q}%`, `%${q}%`, limit] : [limit];
  try {
    const [rows] = await pool.execute(
      `SELECT h.id, h.employee_user_id, employee.full_name AS employee_name,
              employee.email AS employee_email, employee.role AS current_role,
              h.action, h.role_before, h.role_after, h.created_at,
              admin.full_name AS admin_name, invitation.email AS invitation_email
       FROM employee_role_history h
       INNER JOIN users employee ON employee.id = h.employee_user_id
       LEFT JOIN users admin ON admin.id = h.admin_user_id
       LEFT JOIN employee_invitations invitation ON invitation.id = h.invitation_id
       WHERE 1 = 1 ${filter}
       ORDER BY h.created_at DESC, h.id DESC LIMIT ?`,
      params,
    );
    return res.json({
      success: true,
      data: rows.map((row) => ({ ...row, id: Number(row.id), employee_user_id: Number(row.employee_user_id) })),
    });
  } catch (error) {
    console.error("Lỗi tải lịch sử phân quyền Nhân viên:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể tải lịch sử phân quyền" });
  }
});

app.patch("/api/admin/employees/:id", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (yeuCauSchemaNhanVien(res)) return;
  const id = Number(req.params.id);
  const { full_name: fullName, phone } = req.body || {};
  if (!Number.isSafeInteger(id) || id < 1 || typeof fullName !== "string" || !fullName.trim() ||
      fullName.trim().length > 100 || (phone !== null && phone !== undefined && (typeof phone !== "string" || phone.length > 20))) {
    return res.status(400).json({ success: false, message: "Thông tin cập nhật không hợp lệ" });
  }
  try {
    const [result] = await pool.execute(
      "UPDATE users SET full_name = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND role = 'employee'",
      [fullName.trim(), phone?.trim() || null, id],
    );
    if (!result.affectedRows) {
      const [[exists]] = await pool.execute("SELECT id FROM users WHERE id = ? AND role = 'employee' LIMIT 1", [id]);
      if (!exists) return res.status(404).json({ success: false, message: "Không tìm thấy nhân viên" });
    }
    const [[row]] = await pool.execute(
      "SELECT id, full_name, email, phone, avatar_url, role, is_active, must_change_password, created_at FROM users WHERE id = ? AND role = 'employee'",
      [id],
    );
    return res.json({ success: true, data: chuanHoaNguoiDung(row) });
  } catch (error) {
    console.error("Lỗi cập nhật nhân viên:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể cập nhật nhân viên" });
  }
});

app.patch("/api/admin/employees/:id/status", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (yeuCauSchemaNhanVien(res)) return;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1 || typeof req.body?.is_active !== "boolean") {
    return res.status(400).json({ success: false, message: "Trạng thái tài khoản không hợp lệ" });
  }
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [[target]] = await connection.execute(
      "SELECT id, is_active FROM users WHERE id = ? AND role = 'employee' FOR UPDATE",
      [id],
    );
    if (!target) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Không tìm thấy nhân viên" });
    }
    const active = Boolean(target.is_active);
    if (active !== req.body.is_active) {
      await connection.execute("UPDATE users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.body.is_active, id]);
      await connection.execute(
        `INSERT INTO employee_role_history
          (employee_user_id, admin_user_id, action, role_before, role_after)
         VALUES (?, ?, ?, 'employee', 'employee')`,
        [id, req.user.id, req.body.is_active ? "activated" : "deactivated"],
      );
    }
    await connection.commit();
    return res.json({ success: true, message: req.body.is_active ? "Đã kích hoạt nhân viên" : "Đã khóa nhân viên" });
  } catch (error) {
    await connection?.rollback().catch(() => {});
    console.error("Lỗi cập nhật trạng thái nhân viên:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể cập nhật trạng thái nhân viên" });
  } finally {
    connection?.release();
  }
});

app.post("/api/admin/employees/:id/password-reset", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (yeuCauSchemaNhanVien(res)) return;
  const id = Number(req.params.id);
  const password = req.body?.temporary_password;
  if (!Number.isSafeInteger(id) || id < 1 || typeof password !== "string" || password.length < 12 || password.length > 72) {
    return res.status(400).json({ success: false, message: "Mật khẩu tạm thời phải có từ 12 đến 72 ký tự" });
  }
  try {
    const [result] = await pool.execute(
      "UPDATE users SET password = ?, must_change_password = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND role = 'employee'",
      [await bcrypt.hash(password, 12), id],
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Không tìm thấy nhân viên" });
    return res.json({ success: true, message: "Đã đặt lại mật khẩu; nhân viên phải đổi mật khẩu khi đăng nhập" });
  } catch (error) {
    console.error("Lỗi đặt lại mật khẩu nhân viên:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể đặt lại mật khẩu nhân viên" });
  }
});

app.patch("/api/admin/users/:id/role", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (yeuCauSchemaNhanVien(res)) return;
  const id = Number(req.params.id);
  const nextRole = req.body?.role;
  if (!Number.isSafeInteger(id) || id < 1 || !["customer", "employee", "admin"].includes(nextRole)) {
    return res.status(400).json({ success: false, message: "Vai trò không hợp lệ" });
  }
  if (id === req.user.id && nextRole !== "admin") {
    return res.status(409).json({ success: false, message: "Không thể tự hạ quyền tài khoản Admin đang đăng nhập" });
  }
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [[target]] = await connection.execute("SELECT id, email, role, is_active FROM users WHERE id = ? FOR UPDATE", [id]);
    if (!target) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Không tìm thấy tài khoản" });
    }
    if (target.role === "admin" && target.is_active && nextRole !== "admin") {
      const [activeAdmins] = await connection.execute("SELECT id FROM users WHERE role = 'admin' AND is_active = 1 FOR UPDATE");
      if (activeAdmins.length <= 1) {
        await connection.rollback();
        return res.status(409).json({ success: false, message: "Không thể hạ quyền Admin cuối cùng đang hoạt động" });
      }
    }
    if (target.role !== nextRole) {
      await connection.execute("UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [nextRole, id]);
      if (target.role === "employee" || nextRole === "employee") {
        await connection.execute(
          `INSERT INTO employee_role_history
            (employee_user_id, admin_user_id, action, role_before, role_after)
           VALUES (?, ?, ?, ?, ?)`,
          [id, req.user.id, nextRole === "employee" ? "granted" : "revoked", target.role, nextRole],
        );
      }
      if (nextRole === "employee") {
        await connection.execute(
          `UPDATE employee_invitations SET status = 'revoked', revoked_by_admin_id = ?, revoked_at = UTC_TIMESTAMP()
           WHERE email = ? AND status = 'pending'`,
          [req.user.id, target.email],
        );
      }
    }
    await connection.commit();
    return res.json({ success: true, message: "Đã cập nhật vai trò tài khoản" });
  } catch (error) {
    await connection?.rollback().catch(() => {});
    console.error("Lỗi cập nhật vai trò:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể cập nhật vai trò" });
  } finally {
    connection?.release();
  }
});

function hashEmployeeInvitationToken(token) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return crypto.createHash("sha256").update(token).digest("hex");
}

app.get("/api/employee-invitations/:token", async (req, res) => {
  if (yeuCauSchemaNhanVien(res)) return;
  const tokenHash = hashEmployeeInvitationToken(req.params.token);
  if (!tokenHash) return res.status(400).json({ success: false, message: "Liên kết lời mời không hợp lệ" });
  try {
    const [[invitation]] = await pool.execute(
      `SELECT id, email, status, email_delivery_status, expires_at,
              expires_at <= UTC_TIMESTAMP() AS is_expired
       FROM employee_invitations WHERE token_hash = ? LIMIT 1`,
      [tokenHash],
    );
    if (!invitation) return res.status(404).json({ success: false, message: "Không tìm thấy lời mời" });
    if (invitation.status === "pending" && Number(invitation.is_expired)) {
      await pool.execute("UPDATE employee_invitations SET status = 'expired' WHERE id = ? AND status = 'pending'", [invitation.id]);
      return res.status(410).json({ success: false, message: "Lời mời đã hết hạn; hãy liên hệ Admin để được mời lại" });
    }
    if (invitation.status !== "pending") return res.status(410).json({ success: false, message: "Lời mời đã được sử dụng hoặc thu hồi" });
    if (invitation.email_delivery_status !== "sent") return res.status(409).json({ success: false, message: "Email lời mời chưa được gửi thành công" });
    return res.json({ success: true, data: { email: invitation.email, expires_at: invitation.expires_at } });
  } catch (error) {
    console.error("Lỗi xác minh lời mời Nhân viên:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể xác minh lời mời" });
  }
});

app.post("/api/employee-invitations/:token/accept", async (req, res) => {
  if (yeuCauSchemaNhanVien(res)) return;
  const tokenHash = hashEmployeeInvitationToken(req.params.token);
  if (!tokenHash) return res.status(400).json({ success: false, message: "Liên kết lời mời không hợp lệ" });
  const fullName = typeof req.body?.full_name === "string" ? req.body.full_name.trim() : "";
  const phone = req.body?.phone == null ? null : typeof req.body.phone === "string" ? req.body.phone.trim() : undefined;
  const password = req.body?.password;
  if (!fullName || fullName.length > 100 || phone === undefined || (phone && phone.length > 20) ||
      typeof password !== "string" || password.length < 12 || password.length > 72) {
    return res.status(400).json({ success: false, message: "Họ tên, số điện thoại hoặc mật khẩu không hợp lệ" });
  }
  let connection;
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [[invitation]] = await connection.execute(
      `SELECT id, email, invited_by_admin_id, status, email_delivery_status,
              expires_at <= UTC_TIMESTAMP() AS is_expired
       FROM employee_invitations WHERE token_hash = ? FOR UPDATE`,
      [tokenHash],
    );
    if (!invitation) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Không tìm thấy lời mời" });
    }
    if (invitation.status !== "pending") {
      await connection.rollback();
      return res.status(410).json({ success: false, message: "Lời mời đã được sử dụng hoặc thu hồi" });
    }
    if (Number(invitation.is_expired)) {
      await connection.execute("UPDATE employee_invitations SET status = 'expired' WHERE id = ?", [invitation.id]);
      await connection.commit();
      return res.status(410).json({ success: false, message: "Lời mời đã hết hạn; hãy liên hệ Admin để được mời lại" });
    }
    if (invitation.email_delivery_status !== "sent") {
      await connection.rollback();
      return res.status(409).json({ success: false, message: "Email lời mời chưa được gửi thành công" });
    }
    const [[existing]] = await connection.execute("SELECT id FROM users WHERE email = ? LIMIT 1 FOR UPDATE", [invitation.email]);
    if (existing) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: "Email đã có tài khoản; hãy liên hệ Admin để cấp quyền cho tài khoản hiện có" });
    }
    const [created] = await connection.execute(
      `INSERT INTO users
        (full_name, email, password, phone, role, is_active, must_change_password)
       VALUES (?, ?, ?, ?, 'employee', 1, 0)`,
      [fullName, invitation.email, passwordHash, phone || null],
    );
    await connection.execute(
      `UPDATE employee_invitations
       SET status = 'accepted', accepted_user_id = ?, accepted_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [created.insertId, invitation.id],
    );
    await connection.execute(
      `INSERT INTO employee_role_history
        (employee_user_id, admin_user_id, invitation_id, action, role_before, role_after)
       VALUES (?, ?, ?, 'invitation_accepted', NULL, 'employee')`,
      [created.insertId, invitation.invited_by_admin_id, invitation.id],
    );
    await connection.commit();
    return res.status(201).json({ success: true, message: "Đã tạo tài khoản Nhân viên. Bạn có thể đăng nhập bằng email và mật khẩu vừa thiết lập." });
  } catch (error) {
    await connection?.rollback().catch(() => {});
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, message: "Email đã có tài khoản hoặc lời mời đã được chấp nhận" });
    console.error("Lỗi chấp nhận lời mời Nhân viên:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể chấp nhận lời mời" });
  } finally {
    connection?.release();
  }
});

app.get("/api/employee/dashboard", xacThucToken, yeuCauQuyenNhanVien, async (_req, res) => {
  try {
    const [statusRows] = await pool.execute("SELECT status, COUNT(*) AS total FROM orders GROUP BY status");
    const byStatus = Object.fromEntries(statusRows.map((row) => [row.status, Number(row.total)]));
    const [[orderCount]] = await pool.execute("SELECT COUNT(*) AS total FROM orders");
    const [[lowStock]] = await pool.execute("SELECT COUNT(*) AS total FROM products WHERE stock BETWEEN 1 AND 5 AND active = 1");
    let reviewsNeedingAttention = null;
    if (coCotDanhGiaTaiKhoan) {
      const [[reviewCount]] = await pool.execute("SELECT COUNT(*) AS total FROM product_reviews WHERE is_visible = 0");
      reviewsNeedingAttention = Number(reviewCount.total);
    }
    return res.json({ success: true, data: { total_orders: Number(orderCount.total), pending_orders: byStatus.pending_confirmation || 0, processing_orders: (byStatus.confirmed || 0) + (byStatus.preparing || 0), shipping_orders: byStatus.shipping || 0, low_stock_products: Number(lowStock.total), reviews_needing_attention: reviewsNeedingAttention } });
  } catch (error) {
    console.error("Lỗi tải tổng quan nhân viên:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể tải tổng quan nhân viên" });
  }
});

app.get("/api/employee/vouchers", xacThucToken, yeuCauQuyenNhanVien, async (_req, res) => {
  if (voucherTableUnavailable(res)) return;
  try {
    const [rows] = await pool.execute("SELECT id, code, campaign_name, description, discount_type, discount_value, minimum_subtotal, maximum_discount, quantity_limit, used_count, starts_at, ends_at, is_active, CASE WHEN is_active = 0 THEN 'inactive' WHEN starts_at > UTC_TIMESTAMP() THEN 'scheduled' WHEN ends_at < UTC_TIMESTAMP() THEN 'expired' WHEN used_count >= quantity_limit THEN 'exhausted' ELSE 'active' END AS status FROM vouchers ORDER BY created_at DESC, id DESC LIMIT 200");
    return res.json({ success: true, data: rows });
  } catch (error) { console.error("Lỗi tra cứu voucher nhân viên:", error.code || "UNKNOWN"); return res.status(500).json({ success: false, message: "Không thể tải danh sách Voucher" }); }
});

app.get("/api/checkout/config", async (req, res) => {
  try {
    const [regions] = coBangKhuVucVanChuyen
      ? await pool.execute("SELECT region_code, region_name, fee FROM shipping_regions WHERE is_active = TRUE AND fee IS NOT NULL ORDER BY id")
      : [[]];
    res.json({
      success: true,
      payment_methods: ["cod"],
      shipping_fee: null,
      shipping_regions_available: coBangKhuVucVanChuyen && coCotSnapshotKhuVucVanChuyen,
      shipping_regions: regions.map((row) => ({ ...row, fee: Number(row.fee) })),
      voucher_available:
        coBangVoucher &&
        coCotVoucherDonHang &&
        coCotTrangThaiLuotVoucher &&
        coCotMetadataVoucher,
    });
  } catch (error) {
    console.error("Lỗi tải cấu hình checkout:", error.code || "UNKNOWN");
    res.status(500).json({
      success: false,
      message: "Không thể tải cấu hình thanh toán và giao hàng",
    });
  }
});

function chuanHoaThoiGianVoucher(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new LoiApiDonHang(400, `${field} là bắt buộc`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new LoiApiDonHang(400, `${field} không hợp lệ`);
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function docDuLieuVoucher(body) {
  const code = chuanHoaMaVoucher(body?.code);
  if (!code) throw new LoiApiDonHang(400, "Mã voucher là bắt buộc");
  const campaignName = typeof body?.campaign_name === "string" ? body.campaign_name.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const discountType = body?.discount_type;
  const discountValue = Number(body?.discount_value);
  const minimumSubtotal = Number(body?.minimum_subtotal ?? 0);
  const maximumDiscount = body?.maximum_discount == null || body.maximum_discount === "" ? null : Number(body.maximum_discount);
  const quantityLimit = Number(body?.quantity_limit);
  const perCustomerLimit = body?.per_customer_limit == null || body.per_customer_limit === "" ? null : Number(body.per_customer_limit);
  const startsAt = chuanHoaThoiGianVoucher(body?.starts_at, "Thời gian bắt đầu");
  const endsAt = chuanHoaThoiGianVoucher(body?.ends_at, "Thời gian kết thúc");
  if (!campaignName || campaignName.length > 150) throw new LoiApiDonHang(400, "Tên chương trình phải có từ 1 đến 150 ký tự");
  if (description.length > 500) throw new LoiApiDonHang(400, "Mô tả chương trình tối đa 500 ký tự");
  if (!['percentage', 'fixed'].includes(discountType)) throw new LoiApiDonHang(400, "Loại giảm giá không hợp lệ");
  const moneyFormat = (value) => /^(?:\d+)(?:\.\d{1,2})?$/.test(String(value));
  if (!moneyFormat(body?.discount_value) || !Number.isFinite(discountValue) || discountValue <= 0 || discountValue > 9999999999.99 || (discountType === "percentage" && discountValue > 100)) {
    throw new LoiApiDonHang(400, discountType === "percentage" ? "Giá trị phần trăm phải lớn hơn 0 và không vượt quá 100" : "Giá trị giảm tiền không hợp lệ");
  }
  if (!moneyFormat(body?.minimum_subtotal ?? 0) || !Number.isFinite(minimumSubtotal) || minimumSubtotal < 0 || minimumSubtotal > 999999999999.99) throw new LoiApiDonHang(400, "Đơn hàng tối thiểu không hợp lệ");
  if (maximumDiscount !== null && (!moneyFormat(body.maximum_discount) || !Number.isFinite(maximumDiscount) || maximumDiscount <= 0 || maximumDiscount > 999999999999.99 || discountType !== "percentage")) throw new LoiApiDonHang(400, "Mức giảm tối đa chỉ áp dụng cho mã phần trăm và phải lớn hơn 0");
  if (!Number.isSafeInteger(quantityLimit) || quantityLimit < 1 || quantityLimit > 2147483647) throw new LoiApiDonHang(400, "Số lượng phát hành phải là số nguyên dương");
  if (perCustomerLimit !== null && (!Number.isSafeInteger(perCustomerLimit) || perCustomerLimit < 1 || perCustomerLimit > 2147483647)) throw new LoiApiDonHang(400, "Giới hạn trên mỗi khách phải là số nguyên dương hoặc để trống");
  if (new Date(endsAt + "Z") <= new Date(startsAt + "Z")) throw new LoiApiDonHang(400, "Thời gian kết thúc phải sau thời gian bắt đầu");
  if (typeof body.is_active !== "boolean") throw new LoiApiDonHang(400, "Trạng thái kích hoạt không hợp lệ");
  return { code, campaignName, description: description || null, discountType, discountValue, minimumSubtotal, maximumDiscount, quantityLimit, perCustomerLimit, startsAt, endsAt, isActive: body.is_active };
}

function voucherTableUnavailable(res) {
  if (coBangVoucher && coCotVoucherDonHang && coCotTrangThaiLuotVoucher && coCotMetadataVoucher) return false;
  res.status(503).json({ success: false, message: "Voucher cần các migration 004, 006 và 007 được áp dụng trước khi sử dụng" });
  return true;
}

app.get("/api/admin/vouchers", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (voucherTableUnavailable(res)) return;
  const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
  const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 20));
  const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const type = ["percentage", "fixed"].includes(req.query.type) ? req.query.type : "all";
  const status = ["active", "inactive", "scheduled", "expired", "exhausted"].includes(req.query.status) ? req.query.status : "all";
  let dateFrom = null;
  let dateTo = null;
  for (const [key, label] of [["date_from", "Ngày bắt đầu lọc"], ["date_to", "Ngày kết thúc lọc"]]) {
    const value = req.query[key];
    if (value === undefined || value === "") continue;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return res.status(400).json({ success: false, message: `${label} không hợp lệ` });
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      return res.status(400).json({ success: false, message: `${label} không hợp lệ` });
    }
    if (key === "date_from") dateFrom = value;
    else dateTo = value;
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return res.status(400).json({ success: false, message: "Ngày bắt đầu không thể sau ngày kết thúc" });
  }
  const where = [];
  const params = [];
  if (query) { where.push("(code LIKE ? OR campaign_name LIKE ?)"); const term = `%${query.replace(/[\\%_]/g, "\\$&")}%`; params.push(term, term); }
  if (type !== "all") { where.push("discount_type = ?"); params.push(type); }
  if (dateFrom) { where.push("ends_at >= ?"); params.push(`${dateFrom} 00:00:00`); }
  if (dateTo) { where.push("starts_at < DATE_ADD(?, INTERVAL 1 DAY)"); params.push(`${dateTo} 00:00:00`); }
  if (status === "inactive") where.push("is_active = 0");
  if (status === "scheduled") where.push("is_active = 1 AND starts_at > UTC_TIMESTAMP()");
  if (status === "expired") where.push("is_active = 1 AND ends_at < UTC_TIMESTAMP()");
  if (status === "exhausted") where.push("used_count >= quantity_limit");
  if (status === "active") where.push("is_active = 1 AND starts_at <= UTC_TIMESTAMP() AND ends_at >= UTC_TIMESTAMP() AND used_count < quantity_limit");
  const filter = where.length ? `WHERE ${where.join(" AND ")}` : "";
  try {
    const [[count]] = await pool.execute(`SELECT COUNT(*) AS total FROM vouchers ${filter}`, params);
    const [rows] = await pool.execute(
      `SELECT id, code, campaign_name, description, discount_type, discount_value, minimum_subtotal,
              maximum_discount, quantity_limit, per_customer_limit, used_count, starts_at, ends_at, is_active,
              CASE WHEN is_active = 0 THEN 'inactive' WHEN starts_at > UTC_TIMESTAMP() THEN 'scheduled'
                   WHEN ends_at < UTC_TIMESTAMP() THEN 'expired' WHEN used_count >= quantity_limit THEN 'exhausted' ELSE 'active' END AS status
       FROM vouchers ${filter} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit],
    );
    const ids = rows.map((row) => row.id);
    const usageMap = new Map();
    if (ids.length) {
      const [usageRows] = await pool.execute(
        `SELECT voucher_id,
          SUM(CASE WHEN usage_status = 'reserved' THEN 1 ELSE 0 END) AS reserved_count,
          SUM(CASE WHEN usage_status = 'redeemed' THEN 1 ELSE 0 END) AS redeemed_count
         FROM voucher_redemptions WHERE voucher_id IN (${ids.map(() => "?").join(",")}) GROUP BY voucher_id`, ids,
      );
      for (const usage of usageRows) usageMap.set(Number(usage.voucher_id), usage);
    }
    res.json({ success: true, data: rows.map((row) => ({ ...row, reserved_count: Number(usageMap.get(Number(row.id))?.reserved_count || 0), redeemed_count: Number(usageMap.get(Number(row.id))?.redeemed_count || 0) })), pagination: { page, limit, total: Number(count.total), total_pages: Math.ceil(Number(count.total) / limit) } });
  } catch (error) {
    console.error("Lỗi lấy mã giảm giá quản trị:", error.code || "UNKNOWN");
    res.status(500).json({ success: false, message: "Không thể tải danh sách mã giảm giá" });
  }
});

app.get("/api/admin/vouchers/:id", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (voucherTableUnavailable(res)) return;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ success: false, message: "Mã voucher không hợp lệ" });
  try {
    const [[voucher]] = await pool.execute(
      `SELECT id, code, campaign_name, description, discount_type, discount_value, minimum_subtotal,
        maximum_discount, quantity_limit, per_customer_limit, used_count, starts_at, ends_at, is_active, created_at, updated_at,
        CASE WHEN is_active = 0 THEN 'inactive' WHEN starts_at > UTC_TIMESTAMP() THEN 'scheduled'
          WHEN ends_at < UTC_TIMESTAMP() THEN 'expired' WHEN used_count >= quantity_limit THEN 'exhausted' ELSE 'active' END AS status
       FROM vouchers WHERE id = ? LIMIT 1`, [id],
    );
    if (!voucher) return res.status(404).json({ success: false, message: "Không tìm thấy voucher" });
    const [redemptions] = await pool.execute(
      `SELECT r.order_id, r.voucher_code_snapshot, r.discount_amount, r.usage_status, r.customer_id, r.created_at,
        COALESCE(u.full_name, o.recipient_name) AS customer_name,
        o.status AS order_status, o.total_amount
       FROM voucher_redemptions r INNER JOIN orders o ON o.id = r.order_id
       LEFT JOIN users u ON u.id = COALESCE(r.customer_id, o.customer_id)
       WHERE r.voucher_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT 100`, [id],
    );
    const [[usageSummary]] = await pool.execute(
      `SELECT SUM(CASE WHEN usage_status = 'reserved' THEN 1 ELSE 0 END) AS reserved_count,
        SUM(CASE WHEN usage_status = 'redeemed' THEN 1 ELSE 0 END) AS redeemed_count,
        SUM(CASE WHEN usage_status = 'released' THEN 1 ELSE 0 END) AS released_count
       FROM voucher_redemptions WHERE voucher_id = ?`, [id],
    );
    return res.json({ success: true, data: { voucher: { ...voucher, id: Number(voucher.id), discount_value: Number(voucher.discount_value), minimum_subtotal: Number(voucher.minimum_subtotal), maximum_discount: voucher.maximum_discount == null ? null : Number(voucher.maximum_discount), quantity_limit: Number(voucher.quantity_limit), per_customer_limit: voucher.per_customer_limit == null ? null : Number(voucher.per_customer_limit), used_count: Number(voucher.used_count), is_active: Boolean(voucher.is_active) }, usage_summary: { reserved_count: Number(usageSummary.reserved_count || 0), redeemed_count: Number(usageSummary.redeemed_count || 0), released_count: Number(usageSummary.released_count || 0) }, redemptions: redemptions.map((row) => ({ ...row, order_id: String(row.order_id), customer_id: row.customer_id == null ? null : Number(row.customer_id), discount_amount: Number(row.discount_amount), total_amount: Number(row.total_amount) })) } });
  } catch (error) {
    console.error("Lỗi tải chi tiết voucher:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể tải chi tiết voucher" });
  }
});

app.post("/api/admin/vouchers", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (voucherTableUnavailable(res)) return;
  try {
    const data = docDuLieuVoucher(req.body);
    const [result] = await pool.execute(
      `INSERT INTO vouchers (code, campaign_name, description, discount_type, discount_value, minimum_subtotal,
        maximum_discount, quantity_limit, per_customer_limit, starts_at, ends_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.code, data.campaignName, data.description, data.discountType, data.discountValue, data.minimumSubtotal, data.maximumDiscount, data.quantityLimit, data.perCustomerLimit, data.startsAt, data.endsAt, data.isActive],
    );
    res.status(201).json({ success: true, message: "Đã tạo mã giảm giá", data: { id: String(result.insertId) } });
  } catch (error) {
    if (error instanceof LoiApiDonHang) return res.status(error.status).json({ success: false, message: error.message });
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, message: "Mã giảm giá đã tồn tại" });
    console.error("Lỗi tạo mã giảm giá:", error.code || "UNKNOWN");
    res.status(500).json({ success: false, message: "Không thể tạo mã giảm giá" });
  }
});

app.put("/api/admin/vouchers/:id", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (voucherTableUnavailable(res)) return;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ success: false, message: "Mã chương trình không hợp lệ" });
  let connection;
  try {
    const data = docDuLieuVoucher(req.body);
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [[existing]] = await connection.execute("SELECT used_count FROM vouchers WHERE id = ? FOR UPDATE", [id]);
    if (!existing) { await connection.rollback(); return res.status(404).json({ success: false, message: "Không tìm thấy mã giảm giá" }); }
    if (data.quantityLimit < Number(existing.used_count)) throw new LoiApiDonHang(409, "Số lượng phát hành không thể thấp hơn số lượt đã sử dụng");
    await connection.execute(
      `UPDATE vouchers SET code = ?, campaign_name = ?, description = ?, discount_type = ?, discount_value = ?,
        minimum_subtotal = ?, maximum_discount = ?, quantity_limit = ?, per_customer_limit = ?, starts_at = ?, ends_at = ?, is_active = ?
       WHERE id = ?`,
      [data.code, data.campaignName, data.description, data.discountType, data.discountValue, data.minimumSubtotal, data.maximumDiscount, data.quantityLimit, data.perCustomerLimit, data.startsAt, data.endsAt, data.isActive, id],
    );
    await connection.commit();
    res.json({ success: true, message: "Đã cập nhật mã giảm giá" });
  } catch (error) {
    await connection?.rollback().catch(() => {});
    if (error instanceof LoiApiDonHang) return res.status(error.status).json({ success: false, message: error.message });
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, message: "Mã giảm giá đã tồn tại" });
    console.error("Lỗi sửa mã giảm giá:", error.code || "UNKNOWN");
    res.status(500).json({ success: false, message: "Không thể cập nhật mã giảm giá" });
  } finally { connection?.release(); }
});

app.patch("/api/admin/vouchers/:id/active", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (voucherTableUnavailable(res)) return;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1 || typeof req.body?.is_active !== "boolean") return res.status(400).json({ success: false, message: "Thông tin trạng thái mã giảm giá không hợp lệ" });
  try {
    const [result] = await pool.execute("UPDATE vouchers SET is_active = ? WHERE id = ?", [req.body.is_active, id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Không tìm thấy mã giảm giá" });
    res.json({ success: true, message: req.body.is_active ? "Đã kích hoạt mã giảm giá" : "Đã tạm ngừng mã giảm giá" });
  } catch (error) {
    console.error("Lỗi đổi trạng thái voucher:", error.code || "UNKNOWN");
    res.status(500).json({ success: false, message: "Không thể cập nhật trạng thái mã giảm giá" });
  }
});

app.delete("/api/admin/vouchers/:id", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (voucherTableUnavailable(res)) return;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ success: false, message: "Mã voucher không hợp lệ" });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [[voucher]] = await connection.execute("SELECT id, code FROM vouchers WHERE id = ? FOR UPDATE", [id]);
    if (!voucher) { await connection.rollback(); return res.status(404).json({ success: false, message: "Không tìm thấy voucher" }); }
    const [[history]] = await connection.execute(
      `SELECT
        (SELECT COUNT(*) FROM voucher_redemptions WHERE voucher_id = ?) AS redemption_count,
        (SELECT COUNT(*) FROM orders WHERE voucher_id = ? OR (voucher_id IS NULL AND voucher_code = ?)) AS order_count`,
      [id, id, voucher.code],
    );
    if (Number(history.redemption_count) > 0 || Number(history.order_count) > 0) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: "Voucher đã có lịch sử đơn hàng hoặc lượt sử dụng; hãy tạm ngừng thay vì xóa để bảo toàn lịch sử." });
    }
    await connection.execute("DELETE FROM vouchers WHERE id = ?", [id]);
    await connection.commit();
    return res.json({ success: true, message: "Đã xóa voucher chưa được sử dụng" });
  } catch (error) {
    await connection?.rollback().catch(() => {});
    console.error("Lỗi xóa voucher:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể xóa voucher" });
  } finally { connection?.release(); }
});

app.get("/api/vouchers/available", xacThucTokenTuyChon, async (req, res) => {
  if (voucherTableUnavailable(res)) return;
  try {
    const customerId = req.user?.id ?? null;
    const [rows] = await pool.execute(
      `SELECT v.id, v.code, v.campaign_name, v.description, v.discount_type, v.discount_value,
        v.minimum_subtotal, v.maximum_discount, v.per_customer_limit, v.starts_at, v.ends_at,
        v.quantity_limit - v.used_count AS remaining_count
       FROM vouchers v
       LEFT JOIN (
         SELECT voucher_id, COUNT(*) AS used_count FROM voucher_redemptions
         WHERE customer_id = ? AND usage_status <> 'released' GROUP BY voucher_id
       ) usage_by_customer ON usage_by_customer.voucher_id = v.id
       WHERE v.is_active = 1 AND v.starts_at <= UTC_TIMESTAMP() AND v.ends_at >= UTC_TIMESTAMP()
         AND v.used_count < v.quantity_limit
         AND (v.per_customer_limit IS NULL OR (? IS NOT NULL AND COALESCE(usage_by_customer.used_count, 0) < v.per_customer_limit))
       ORDER BY v.ends_at ASC, v.id ASC LIMIT 100`,
      [customerId, customerId],
    );
    return res.json({ success: true, data: rows.map((row) => ({
      id: String(row.id), code: row.code, campaign_name: row.campaign_name, description: row.description,
      discount_type: row.discount_type, discount_value: Number(row.discount_value),
      minimum_subtotal: Number(row.minimum_subtotal), maximum_discount: row.maximum_discount == null ? null : Number(row.maximum_discount),
      per_customer_limit: row.per_customer_limit == null ? null : Number(row.per_customer_limit),
      starts_at: row.starts_at, ends_at: row.ends_at, remaining_count: Number(row.remaining_count),
    })) });
  } catch (error) {
    console.error("Lỗi lấy voucher khả dụng:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể tải mã giảm giá khả dụng" });
  }
});

app.post("/api/vouchers/validate", xacThucTokenTuyChon, async (req, res) => {
  if (voucherTableUnavailable(res)) return;
  try {
    const code = chuanHoaMaVoucher(req.body?.code);
    if (!code) throw new LoiApiDonHang(400, "Vui lòng nhập mã giảm giá");
    if (!Array.isArray(req.body?.items) || req.body.items.length < 1 || req.body.items.length > 100) throw new LoiApiDonHang(400, "Danh sách sản phẩm không hợp lệ");
    const items = req.body.items.map((item, index) => ({ productId: docSoNguyenDuong(item?.product_id, `Mã sản phẩm thứ ${index + 1}`), quantity: docSoNguyenDuong(item?.quantity, `Số lượng thứ ${index + 1}`) }));
    if (new Set(items.map(({ productId }) => productId)).size !== items.length || items.some(({ quantity }) => quantity > 1000000)) throw new LoiApiDonHang(400, "Sản phẩm hoặc số lượng không hợp lệ");
    const ids = items.map((item) => item.productId).sort((a, b) => a - b);
    const [products] = await pool.execute(`SELECT id, price, active, stock FROM products WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
    const productMap = new Map(products.map((product) => [Number(product.id), product]));
    let subtotalCents = 0n;
    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product || !product.active || Number(product.stock) < item.quantity) throw new LoiApiDonHang(409, "Giỏ hàng có sản phẩm không còn khả dụng hoặc không đủ tồn kho");
      subtotalCents += doiSangSoTienXu(product.price) * BigInt(item.quantity);
    }
    if (subtotalCents > 99999999999999n) throw new LoiApiDonHang(400, "Tổng tiền giỏ hàng vượt giới hạn cho phép");
    const checked = await kiemTraVoucher(pool, code, subtotalCents, false, req.user?.id ?? null);
    res.json({ success: true, data: { code: checked.voucher.code, campaign_name: checked.voucher.campaign_name, description: checked.voucher.description || null, discount_type: checked.voucher.discount_type, discount_value: Number(checked.voucher.discount_value), minimum_subtotal: Number(checked.voucher.minimum_subtotal), maximum_discount: checked.voucher.maximum_discount == null ? null : Number(checked.voucher.maximum_discount), subtotal: Number(doiTuSoTienXu(subtotalCents)), discount_amount: Number(doiTuSoTienXu(checked.discountCents)), total_after_discount: Number(doiTuSoTienXu(subtotalCents - checked.discountCents)) } });
  } catch (error) {
    if (error instanceof LoiApiDonHang) return res.status(error.status).json({ success: false, message: error.message });
    console.error("Lỗi xác minh mã giảm giá:", error.code || "UNKNOWN");
    res.status(500).json({ success: false, message: "Không thể xác minh mã giảm giá" });
  }
});

app.post("/api/orders", xacThucTokenTuyChon, async (req, res) => {
  let connection;
  let transactionStarted = false;
  let idempotencyKey = null;
  let requestFingerprint = null;
  const voucherSelectColumns = cotVoucherDonHangSelect();

  try {
    if (!coBangKhuVucVanChuyen || !coCotSnapshotKhuVucVanChuyen) {
      throw new LoiApiDonHang(503, "Chức năng phí vận chuyển theo khu vực chưa được kích hoạt; đơn hàng chưa được tạo");
    }
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new LoiApiDonHang(400, "Dữ liệu đơn hàng không hợp lệ");
    }
    const paymentMethod = body.payment_method;
    if (paymentMethod !== "cod") {
      throw new LoiApiDonHang(
        400,
        "Phương thức thanh toán không hợp lệ; hiện chỉ hỗ trợ COD",
      );
    }
    const voucherCode = chuanHoaMaVoucher(body.voucher_code);
    const shippingRegionCode = typeof body.shipping_region_code === "string" ? body.shipping_region_code.trim() : "";
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/.test(shippingRegionCode)) {
      throw new LoiApiDonHang(400, "Vui lòng chọn khu vực giao hàng hợp lệ");
    }
    if (voucherCode && (!coBangVoucher || !coCotVoucherDonHang || !coCotTrangThaiLuotVoucher || !coCotMetadataVoucher)) {
      throw new LoiApiDonHang(503, "Chức năng mã giảm giá chưa được kích hoạt trong cơ sở dữ liệu");
    }

    const addressId = req.user
      ? docSoNguyenDuong(body.address_id, "Địa chỉ nhận hàng")
      : null;
    let shippingDetails;
    if (!req.user) {
      const guest = body.guest;
      const recipientName =
        typeof guest?.recipient_name === "string"
          ? guest.recipient_name.trim()
          : "";
      const recipientPhone =
        typeof guest?.recipient_phone === "string"
          ? guest.recipient_phone.trim()
          : "";
      const shippingAddress =
        typeof guest?.shipping_address === "string"
          ? guest.shipping_address.trim()
          : "";
      if (!recipientName || recipientName.length > 100) {
        throw new LoiApiDonHang(400, "Vui lòng nhập họ tên người nhận hợp lệ");
      }
      if (!/^[+\d][+\d\s().-]{5,19}$/.test(recipientPhone)) {
        throw new LoiApiDonHang(400, "Vui lòng nhập số điện thoại hợp lệ");
      }
      if (!shippingAddress || shippingAddress.length > 2000) {
        throw new LoiApiDonHang(400, "Vui lòng nhập địa chỉ nhận hàng hợp lệ");
      }
      shippingDetails = {
        id: null,
        recipient_name: recipientName,
        phone: recipientPhone,
        address: shippingAddress,
      };
    }
    if (
      !Array.isArray(body.items) ||
      body.items.length < 1 ||
      body.items.length > 100
    ) {
      throw new LoiApiDonHang(400, "Đơn hàng phải có từ 1 đến 100 sản phẩm");
    }

    const requestedItems = body.items.map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new LoiApiDonHang(400, `Sản phẩm thứ ${index + 1} không hợp lệ`);
      }
      const productId = docSoNguyenDuong(
        item.product_id,
        `Mã sản phẩm thứ ${index + 1}`,
      );
      const quantity = docSoNguyenDuong(
        item.quantity,
        `Số lượng sản phẩm thứ ${index + 1}`,
      );
      if (quantity > 1000000) {
        throw new LoiApiDonHang(
          400,
          "Số lượng mỗi sản phẩm vượt giới hạn cho phép",
        );
      }
      return { productId, quantity };
    });

    const requestedIds = requestedItems.map((item) => item.productId);
    if (new Set(requestedIds).size !== requestedIds.length) {
      throw new LoiApiDonHang(
        400,
        "Mỗi sản phẩm chỉ được xuất hiện một lần trong đơn hàng",
      );
    }

    const suppliedIdempotencyKey = req.get("Idempotency-Key");
    if (
      typeof suppliedIdempotencyKey !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        suppliedIdempotencyKey,
      )
    ) {
      throw new LoiApiDonHang(400, "Mã yêu cầu đặt hàng không hợp lệ");
    }
    idempotencyKey = suppliedIdempotencyKey.toLowerCase();
    const fingerprintInput = {
      customer_id: req.user?.id ?? null,
      address_id: addressId,
      guest: req.user ? null : shippingDetails,
      payment_method: paymentMethod,
      shipping_region_code: shippingRegionCode,
      ...(voucherCode ? { voucher_code: voucherCode } : {}),
      items: requestedItems
        .slice()
        .sort((left, right) => left.productId - right.productId),
    };
    requestFingerprint = crypto
      .createHash("sha256")
      .update(JSON.stringify(fingerprintInput))
      .digest("hex");

    const [existing] = await pool.execute(
      `SELECT id, customer_id, user_address_id, recipient_name, recipient_phone,
              shipping_address, subtotal, shipping_fee${cotKhuVucVanChuyenDonHangSelect()}, total_amount, status,
              payment_method, payment_status, created_at, updated_at,
              idempotency_key, request_fingerprint${voucherSelectColumns}
       FROM orders WHERE idempotency_key = ? LIMIT 1`,
      [idempotencyKey],
    );
    if (existing.length) {
      if (existing[0].request_fingerprint !== requestFingerprint) {
        throw new LoiApiDonHang(
          409,
          "Mã yêu cầu này đã được dùng cho nội dung đơn hàng khác",
        );
      }
      const itemsByOrder = await layChiTietDonHang(pool, [existing[0].id]);
      return res.status(200).json({
        success: true,
        message: "Đơn hàng đã được tạo trước đó",
        data: {
          ...chuanHoaDonHang(
            existing[0],
            itemsByOrder.get(String(existing[0].id)) || [],
          ),
          customer_type:
            existing[0].customer_id === null ? "guest" : "account",
        },
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [shippingRegions] = await connection.execute(
      "SELECT region_code, region_name, fee FROM shipping_regions WHERE region_code = ? AND is_active = TRUE FOR UPDATE",
      [shippingRegionCode],
    );
    if (!shippingRegions.length || shippingRegions[0].fee === null) {
      throw new LoiApiDonHang(
        409,
        "Khu vực giao hàng chưa có phí chính thức; đơn hàng chưa được tạo",
      );
    }
    const shippingFeeCents = doiSangSoTienXu(
      String(shippingRegions[0].fee),
    );
    const shippingRegion = shippingRegions[0];

    if (req.user) {
      const [addressRows] = await connection.execute(
        `SELECT id, recipient_name, phone, address
         FROM user_addresses
         WHERE id = ? AND user_id = ?
         FOR UPDATE`,
        [addressId, req.user.id],
      );
      if (!addressRows.length) {
        throw new LoiApiDonHang(400, "Địa chỉ nhận hàng không hợp lệ");
      }
      shippingDetails = addressRows[0];
    }

    const productsById = new Map();
    for (const productId of [...requestedIds].sort((a, b) => a - b)) {
      const [productRows] = await connection.execute(
        `SELECT id, name, category, image, price, stock, active
         FROM products
         WHERE id = ?
         FOR UPDATE`,
        [productId],
      );
      if (!productRows.length) {
        throw new LoiApiDonHang(404, `Không tìm thấy sản phẩm mã ${productId}`);
      }
      const product = productRows[0];
      if (!product.active) {
        throw new LoiApiDonHang(
          409,
          `Sản phẩm “${product.name}” hiện không kinh doanh`,
        );
      }
      const requested = requestedItems.find(
        (item) => item.productId === productId,
      );
      if (Number(product.stock) < requested.quantity) {
        throw new LoiApiDonHang(
          409,
          `Sản phẩm “${product.name}” không đủ tồn kho`,
        );
      }
      productsById.set(productId, product);
    }

    const orderItems = requestedItems.map(({ productId, quantity }) => {
      const product = productsById.get(productId);
      const unitPriceCents = doiSangSoTienXu(product.price);
      const lineTotalCents = unitPriceCents * BigInt(quantity);
      return {
        productId,
        product,
        quantity,
        unitPriceCents,
        lineTotalCents,
      };
    });

    const subtotalCents = orderItems.reduce(
      (sum, item) => sum + item.lineTotalCents,
      0n,
    );
    const voucherUse = voucherCode
      ? await kiemTraVoucher(connection, voucherCode, subtotalCents, true, req.user?.id ?? null)
      : null;
    const discountCents = voucherUse?.discountCents || 0n;
    const totalCents = subtotalCents + shippingFeeCents - discountCents;
    const maxOrderCents = 99999999999999n; // DECIMAL(14,2)
    if (totalCents > maxOrderCents) {
      throw new LoiApiDonHang(400, "Tổng tiền đơn hàng vượt giới hạn cho phép");
    }

    for (const item of orderItems) {
      const [stockResult] = await connection.execute(
        `UPDATE products
         SET stock = stock - ?
         WHERE id = ? AND active = 1 AND stock >= ?`,
        [item.quantity, item.productId, item.quantity],
      );
      if (stockResult.affectedRows !== 1) {
        throw new LoiApiDonHang(
          409,
          `Tồn kho sản phẩm “${item.product.name}” vừa thay đổi`,
        );
      }
    }

    const subtotal = doiTuSoTienXu(subtotalCents);
    const shippingFee = doiTuSoTienXu(shippingFeeCents);
    const totalAmount = doiTuSoTienXu(totalCents);
    const discountAmount = doiTuSoTienXu(discountCents);
    const orderInsertSql = coBangVoucher && coCotVoucherDonHang
      ? `INSERT INTO orders
        (customer_id, user_address_id, recipient_name, recipient_phone, shipping_address,
         subtotal, shipping_fee, shipping_region_code, shipping_region_name, total_amount, status, payment_method, payment_status,
         idempotency_key, request_fingerprint, voucher_id, voucher_code,
         voucher_campaign_name, voucher_discount_type, voucher_discount_value, discount_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_confirmation', ?, 'unpaid', ?, ?, ?, ?, ?, ?, ?, ?)`
      : `INSERT INTO orders
        (customer_id, user_address_id, recipient_name, recipient_phone,
         shipping_address, subtotal, shipping_fee, shipping_region_code, shipping_region_name, total_amount, status,
         payment_method, payment_status, idempotency_key, request_fingerprint)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_confirmation', ?, 'unpaid', ?, ?)`;
    const orderParams = [
        req.user ? req.user.id : null,
        shippingDetails.id,
        shippingDetails.recipient_name,
        shippingDetails.phone,
        shippingDetails.address,
        subtotal,
        shippingFee,
        shippingRegion.region_code,
        shippingRegion.region_name,
        totalAmount,
        paymentMethod,
        idempotencyKey,
        requestFingerprint,
      ];
    if (coBangVoucher && coCotVoucherDonHang) {
      orderParams.push(
        voucherUse?.voucher.id ?? null,
        voucherUse?.voucher.code ?? null,
        voucherUse?.voucher.campaign_name ?? null,
        voucherUse?.voucher.discount_type ?? null,
        voucherUse?.voucher.discount_value ?? null,
        discountAmount,
      );
    }
    const [orderResult] = await connection.execute(orderInsertSql, orderParams);

    const orderId = orderResult.insertId;
    for (const item of orderItems) {
      await connection.execute(
        `INSERT INTO order_items
          (order_id, product_id, product_name, product_category, product_image,
           unit_price, quantity, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.productId,
          item.product.name,
          item.product.category,
          item.product.image || null,
          doiTuSoTienXu(item.unitPriceCents),
          item.quantity,
          doiTuSoTienXu(item.lineTotalCents),
        ],
      );
    }

    if (coBangLichSuTonKho) {
      for (const item of orderItems) {
        const stockBefore = Number(item.product.stock);
        await connection.execute(
          `INSERT INTO inventory_movements
            (product_id, admin_user_id, movement_type, quantity, stock_before, stock_after, note)
           VALUES (?, NULL, 'sale', ?, ?, ?, ?)`,
          [item.productId, item.quantity, stockBefore, stockBefore - item.quantity, `Đơn hàng #${orderId}`],
        );
      }
    }

    if (voucherUse) {
      const [usageResult] = await connection.execute(
        "UPDATE vouchers SET used_count = used_count + 1 WHERE id = ? AND is_active = 1 AND starts_at <= UTC_TIMESTAMP() AND ends_at >= UTC_TIMESTAMP() AND used_count < quantity_limit",
        [voucherUse.voucher.id],
      );
      if (usageResult.affectedRows !== 1) throw new LoiApiDonHang(409, "Mã giảm giá vừa hết lượt sử dụng");
      await connection.execute(
        coCotTrangThaiLuotVoucher
          ? `INSERT INTO voucher_redemptions (voucher_id, order_id, customer_id, voucher_code_snapshot, discount_amount, usage_status)
             VALUES (?, ?, ?, ?, ?, 'reserved')`
          : `INSERT INTO voucher_redemptions (voucher_id, order_id, customer_id, voucher_code_snapshot, discount_amount)
             VALUES (?, ?, ?, ?, ?)`,
        [voucherUse.voucher.id, orderId, req.user?.id ?? null, voucherUse.voucher.code, discountAmount],
      );
    }

    if (req.user) {
      await connection.execute(
        "DELETE FROM user_cart_items WHERE user_id = ?",
        [req.user.id],
      );
    }

    await connection.commit();
    transactionStarted = false;

    const createdAt = new Date();
    res.status(201).json({
      success: true,
      message: "Đơn hàng đã được tạo và đang chờ xác nhận",
      data: {
        id: String(orderId),
        customer_type: req.user ? "account" : "guest",
        user_address_id:
          shippingDetails.id === null ? null : Number(shippingDetails.id),
        recipient_name: shippingDetails.recipient_name,
        recipient_phone: shippingDetails.phone,
        shipping_address: shippingDetails.address,
        subtotal: Number(subtotal),
        shipping_fee: Number(shippingFee),
          shipping_region_code: shippingRegion.region_code,
          shipping_region_name: shippingRegion.region_name,
        voucher_id: voucherUse ? Number(voucherUse.voucher.id) : null,
        voucher_code: voucherUse?.voucher.code || null,
        voucher_campaign_name: voucherUse?.voucher.campaign_name || null,
        voucher_discount_type: voucherUse?.voucher.discount_type || null,
        voucher_discount_value: voucherUse ? Number(voucherUse.voucher.discount_value) : null,
        discount_amount: Number(discountAmount),
        total_amount: Number(totalAmount),
        status: "pending_confirmation",
        payment_method: paymentMethod,
        payment_status: "unpaid",
        created_at: createdAt,
        updated_at: createdAt,
        items: orderItems.map((item) => ({
          product_id: item.productId,
          product_name: item.product.name,
          product_category: item.product.category,
          product_image: item.product.image || null,
          unit_price: Number(doiTuSoTienXu(item.unitPriceCents)),
          quantity: item.quantity,
          line_total: Number(doiTuSoTienXu(item.lineTotalCents)),
        })),
      },
    });
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch {
        /* kết nối có thể đã đóng */
      }
    }
    if (error instanceof LoiApiDonHang) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    if (error.code === "ER_DUP_ENTRY" && idempotencyKey) {
      try {
        const [existing] = await pool.execute(
          `SELECT id, customer_id, user_address_id, recipient_name, recipient_phone,
                  shipping_address, subtotal, shipping_fee${cotKhuVucVanChuyenDonHangSelect()}, total_amount, status,
                  payment_method, payment_status, created_at, updated_at,
                  idempotency_key, request_fingerprint${voucherSelectColumns}
           FROM orders WHERE idempotency_key = ? LIMIT 1`,
          [idempotencyKey],
        );
        if (
          existing.length &&
          existing[0].request_fingerprint === requestFingerprint
        ) {
          const itemsByOrder = await layChiTietDonHang(pool, [existing[0].id]);
          return res.status(200).json({
            success: true,
            message: "Đơn hàng đã được tạo trước đó",
            data: {
              ...chuanHoaDonHang(
                existing[0],
                itemsByOrder.get(String(existing[0].id)) || [],
              ),
              customer_type:
                existing[0].customer_id === null ? "guest" : "account",
            },
          });
        }
        if (existing.length) {
          return res.status(409).json({
            success: false,
            message: "Mã yêu cầu này đã được dùng cho nội dung đơn hàng khác",
          });
        }
      } catch (lookupError) {
        console.error(
          "Lỗi kiểm tra mã yêu cầu đặt hàng:",
          lookupError.code || "UNKNOWN",
        );
      }
    }
    console.error("Lỗi tạo đơn hàng:", error.code || "UNKNOWN");
    return res
      .status(500)
      .json({ success: false, message: "Không thể tạo đơn hàng" });
  } finally {
    connection?.release();
  }
});

app.get("/api/orders", xacThucToken, async (req, res) => {
  try {
    const page =
      req.query.page === undefined
        ? 1
        : docSoNguyenDuong(req.query.page, "Số trang");
    const limit =
      req.query.limit === undefined
        ? 20
        : docSoNguyenDuong(req.query.limit, "Số lượng mỗi trang");
    if (limit > 50)
      throw new LoiApiDonHang(400, "Số đơn hàng mỗi trang tối đa là 50");

    const status = req.query.status;
    if (status !== undefined && !ORDER_STATUSES.has(status)) {
      throw new LoiApiDonHang(400, "Trạng thái đơn hàng không hợp lệ");
    }

    const whereStatus = status ? " AND status = ?" : "";
    const values = status ? [req.user.id, status] : [req.user.id];
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM orders WHERE customer_id = ?${whereStatus}`,
      values,
    );
    const offset = (page - 1) * limit;
    if (!Number.isSafeInteger(offset))
      throw new LoiApiDonHang(400, "Số trang quá lớn");
    const [orders] = await pool.execute(
      `SELECT id, user_address_id, recipient_name, recipient_phone, shipping_address,
              subtotal, shipping_fee${cotKhuVucVanChuyenDonHangSelect()}, total_amount${cotVoucherDonHangSelect()}, status, payment_method,
              payment_status, created_at, updated_at
       FROM orders
       WHERE customer_id = ?${whereStatus}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...values, limit, offset],
    );
    const itemsByOrder = await layChiTietDonHang(
      pool,
      orders.map((order) => order.id),
    );

    res.json({
      success: true,
      count: Number(countRows[0].total),
      page,
      limit,
      data: orders.map((order) =>
        chuanHoaDonHang(order, itemsByOrder.get(String(order.id)) || []),
      ),
    });
  } catch (error) {
    if (error instanceof LoiApiDonHang) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    console.error("Lỗi lấy danh sách đơn hàng:", error.code || "UNKNOWN");
    return res
      .status(500)
      .json({ success: false, message: "Không thể lấy danh sách đơn hàng" });
  }
});

app.get("/api/orders/:id", xacThucToken, async (req, res) => {
  try {
    const orderId = docSoNguyenDuong(req.params.id, "Mã đơn hàng");
    const [orders] = await pool.execute(
      `SELECT id, user_address_id, recipient_name, recipient_phone, shipping_address,
              subtotal, shipping_fee${cotKhuVucVanChuyenDonHangSelect()}, total_amount${cotVoucherDonHangSelect()}, status, payment_method,
              payment_status, created_at, updated_at
       FROM orders
       WHERE id = ? AND customer_id = ?
       LIMIT 1`,
      [orderId, req.user.id],
    );
    if (!orders.length) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy đơn hàng" });
    }

    const itemsByOrder = await layChiTietDonHang(pool, [orders[0].id]);
    res.json({
      success: true,
      data: chuanHoaDonHang(
        orders[0],
        itemsByOrder.get(String(orders[0].id)) || [],
      ),
    });
  } catch (error) {
    if (error instanceof LoiApiDonHang) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    console.error("Lỗi lấy chi tiết đơn hàng:", error.code || "UNKNOWN");
    res
      .status(500)
      .json({ success: false, message: "Không thể lấy chi tiết đơn hàng" });
  }
});

app.post("/api/orders/lookup", gioiHanTraCuuDonKhach, async (req, res) => {
  try {
    const orderId = docSoNguyenDuong(req.body?.order_id, "Mã đơn hàng");
    const phone =
      typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
    if (!/^[+\d][+\d\s().-]{5,19}$/.test(phone)) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy đơn hàng phù hợp" });
    }

    const [orders] = await pool.execute(
      `SELECT id, customer_id, user_address_id, recipient_name, recipient_phone,
              shipping_address, subtotal, shipping_fee${cotKhuVucVanChuyenDonHangSelect()}, total_amount${cotVoucherDonHangSelect()}, status,
              payment_method, payment_status, created_at, updated_at
       FROM orders
       WHERE id = ? AND customer_id IS NULL AND recipient_phone = ?
       LIMIT 1`,
      [orderId, phone],
    );
    if (!orders.length) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy đơn hàng phù hợp" });
    }

    const itemsByOrder = await layChiTietDonHang(pool, [orders[0].id]);
    return res.json({
      success: true,
      data: chuanHoaDonHang(
        orders[0],
        itemsByOrder.get(String(orders[0].id)) || [],
      ),
    });
  } catch (error) {
    if (error instanceof LoiApiDonHang) {
      return res
        .status(error.status)
        .json({ success: false, message: "Thông tin tra cứu không hợp lệ" });
    }
    console.error("Lỗi tra cứu đơn khách:", error.code || "UNKNOWN");
    return res
      .status(500)
      .json({ success: false, message: "Không thể tra cứu đơn hàng" });
  }
});

app.get(
  "/api/admin/dashboard",
  xacThucToken,
  yeuCauQuyenQuanTri,
  async (req, res) => {
    try {
      const isCalendarDate = (value) => {
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const parsed = new Date(`${value}T00:00:00.000Z`);
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
      };
      const from = req.query.from;
      const to = req.query.to;
      if (!isCalendarDate(from) || !isCalendarDate(to) || from > to) {
        return res.status(400).json({
          success: false,
          message: "Khoảng ngày thống kê không hợp lệ",
        });
      }
      const daySpan = (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86400000;
      if (daySpan > 365) {
        return res.status(400).json({
          success: false,
          message: "Khoảng thống kê tối đa là 366 ngày",
        });
      }

      const periodValues = [from, to];
      const [productRows, orderCountRows, customerRows, revenueRows, statusRows, seriesRows, recentRows, topProductRows] = await Promise.all([
        pool.execute("SELECT COUNT(*) AS total FROM products"),
        pool.execute("SELECT COUNT(*) AS total FROM orders WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)", periodValues),
        pool.execute("SELECT COUNT(*) AS total FROM users WHERE role = 'customer'"),
        pool.execute("SELECT COALESCE(SUM(total_amount), 0) AS total FROM orders WHERE status = 'completed' AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)", periodValues),
        pool.execute("SELECT status, COUNT(*) AS count FROM orders WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY) GROUP BY status", periodValues),
        pool.execute(`SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS date,
          COUNT(*) AS order_count,
          COALESCE(SUM(CASE WHEN status = 'completed' THEN total_amount ELSE 0 END), 0) AS revenue
          FROM orders
          WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
          GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
          ORDER BY DATE_FORMAT(created_at, '%Y-%m-%d') ASC`, periodValues),
        pool.execute(`SELECT o.id, o.recipient_name, o.created_at, o.total_amount, o.status,
          COALESCE(NULLIF(u.full_name, ''), NULLIF(o.recipient_name, ''), 'Khách vãng lai') AS customer_name
          FROM orders o LEFT JOIN users u ON u.id = o.customer_id
          WHERE o.created_at >= ? AND o.created_at < DATE_ADD(?, INTERVAL 1 DAY)
          ORDER BY o.created_at DESC, o.id DESC LIMIT 8`, periodValues),
        pool.execute(`SELECT oi.product_id, COALESCE(p.name, oi.product_name) AS name,
          MAX(oi.product_image) AS image,
          SUM(oi.quantity) AS quantity_sold,
          SUM(oi.line_total) AS revenue
          FROM order_items oi
          INNER JOIN orders o ON o.id = oi.order_id
          LEFT JOIN products p ON p.id = oi.product_id
          WHERE o.status = 'completed' AND o.created_at >= ? AND o.created_at < DATE_ADD(?, INTERVAL 1 DAY)
          GROUP BY oi.product_id, oi.product_name, p.name
          ORDER BY quantity_sold DESC, revenue DESC LIMIT 5`, periodValues),
      ]);
      const number = (value) => Number(value) || 0;
      return res.json({
        success: true,
        period: { from, to },
        stats: {
          total_products: number(productRows[0][0].total),
          total_orders: number(orderCountRows[0][0].total),
          total_customers: number(customerRows[0][0].total),
          total_revenue: number(revenueRows[0][0].total),
        },
        orders_by_status: statusRows[0].map((row) => ({ status: row.status, count: number(row.count) })),
        series: seriesRows[0].map((row) => ({
          date: row.date,
          order_count: number(row.order_count),
          revenue: number(row.revenue),
        })),
        recent_orders: recentRows[0].map((row) => ({
          id: Number(row.id),
          customer_name: row.customer_name,
          created_at: row.created_at,
          total_amount: number(row.total_amount),
          status: row.status,
        })),
        top_products: topProductRows[0].map((row) => ({
          product_id: row.product_id === null ? null : Number(row.product_id),
          name: row.name,
          image: row.image || null,
          quantity_sold: number(row.quantity_sold),
          revenue: number(row.revenue),
        })),
      });
    } catch (error) {
      console.error("Lỗi lấy thống kê Dashboard Admin:", error.code || "UNKNOWN");
      return res.status(500).json({
        success: false,
        message: "Không thể tải thống kê quản trị",
      });
    }
  },
);

app.get(
  "/api/admin/orders",
  xacThucToken,
  yeuCauQuyenNhanVien,
  async (req, res) => {
    try {
      const page =
        req.query.page === undefined
          ? 1
          : docSoNguyenDuong(req.query.page, "Số trang");
      const limit =
        req.query.limit === undefined
          ? 20
          : docSoNguyenDuong(req.query.limit, "Số lượng mỗi trang");
      if (limit > 50)
        throw new LoiApiDonHang(400, "Số đơn hàng mỗi trang tối đa là 50");

      const conditions = [];
      const values = [];
      if (req.query.status !== undefined) {
        if (!ORDER_STATUSES.has(req.query.status))
          throw new LoiApiDonHang(400, "Trạng thái đơn hàng không hợp lệ");
        conditions.push("status = ?");
        values.push(req.query.status);
      }
      if (req.query.customer_type === "guest")
        conditions.push("customer_id IS NULL");
      else if (req.query.customer_type === "account")
        conditions.push("customer_id IS NOT NULL");
      else if (
        req.query.customer_type !== undefined &&
        req.query.customer_type !== "all"
      ) {
        throw new LoiApiDonHang(400, "Loại khách hàng không hợp lệ");
      }

      const where = conditions.length
        ? ` WHERE ${conditions.join(" AND ")}`
        : "";
      const [countRows] = await pool.execute(
        `SELECT COUNT(*) AS total FROM orders${where}`,
        values,
      );
      const offset = (page - 1) * limit;
      if (!Number.isSafeInteger(offset))
        throw new LoiApiDonHang(400, "Số trang quá lớn");
      const [orders] = await pool.execute(
        `SELECT id, customer_id,
              (SELECT full_name FROM users WHERE users.id = orders.customer_id LIMIT 1) AS customer_name,
              (SELECT email FROM users WHERE users.id = orders.customer_id LIMIT 1) AS customer_email,
              user_address_id, recipient_name, recipient_phone,
              shipping_address, subtotal, shipping_fee${cotKhuVucVanChuyenDonHangSelect()}, total_amount${cotVoucherDonHangSelect()}, status,
                payment_method, payment_status, created_at, updated_at
       FROM orders${where}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
        [...values, limit, offset],
      );
      const itemsByOrder = await layChiTietDonHang(
        pool,
        orders.map((order) => order.id),
      );
      return res.json({
        success: true,
        count: Number(countRows[0].total),
        page,
        limit,
        data: orders.map((order) => ({
          ...chuanHoaDonHang(order, itemsByOrder.get(String(order.id)) || []),
          customer_id:
            order.customer_id === null ? null : Number(order.customer_id),
          customer_name: order.customer_name || null,
          customer_email: order.customer_email || null,
          customer_type: order.customer_id === null ? "guest" : "account",
        })),
      });
    } catch (error) {
      if (error instanceof LoiApiDonHang) {
        return res
          .status(error.status)
          .json({ success: false, message: error.message });
      }
      console.error("Lỗi lấy danh sách đơn Admin:", error.code || "UNKNOWN");
      return res
        .status(500)
        .json({ success: false, message: "Không thể lấy danh sách đơn hàng" });
    }
  },
);

app.patch(
  "/api/admin/orders/:id/status",
  xacThucToken,
  yeuCauQuyenNhanVien,
  async (req, res) => {
    let connection;
    let transactionStarted = false;
    try {
      const orderId = docSoNguyenDuong(req.params.id, "Mã đơn hàng");
      const { status } = req.body || {};
      if (!ORDER_STATUSES.has(status))
        throw new LoiApiDonHang(400, "Trạng thái đơn hàng không hợp lệ");
      const transitions = {
        pending_confirmation: ["confirmed", "cancelled"],
        confirmed: ["preparing", "cancelled"],
        preparing: ["shipping", "cancelled"],
        shipping: ["completed"],
        completed: [],
        cancelled: [],
      };
      connection = await pool.getConnection();
      await connection.beginTransaction();
      transactionStarted = true;
      const [[currentOrder]] = await connection.execute(
        "SELECT id, status FROM orders WHERE id = ? FOR UPDATE", [orderId],
      );
      if (!currentOrder) throw new LoiApiDonHang(404, "Không tìm thấy đơn hàng");
      if (currentOrder.status !== status && !transitions[currentOrder.status]?.includes(status)) {
        throw new LoiApiDonHang(409, "Không thể chuyển đơn hàng theo thứ tự trạng thái hiện tại");
      }
      if (currentOrder.status !== status) {
        if (status === "cancelled") {
          const [items] = await connection.execute(
            "SELECT product_id, quantity FROM order_items WHERE order_id = ? AND product_id IS NOT NULL ORDER BY product_id ASC",
            [orderId],
          );
          for (const item of items) {
            const [[product]] = await connection.execute(
              "SELECT stock FROM products WHERE id = ? FOR UPDATE", [item.product_id],
            );
            if (!product) continue;
            const before = Number(product.stock);
            const quantity = Number(item.quantity);
            const after = before + quantity;
            if (!Number.isSafeInteger(after) || after > 4294967295) {
              throw new LoiApiDonHang(409, "Không thể hoàn kho vì tồn kho vượt giới hạn dữ liệu");
            }
            await connection.execute("UPDATE products SET stock = ? WHERE id = ?", [after, item.product_id]);
            if (coBangLichSuTonKho) {
              await connection.execute(
                `INSERT INTO inventory_movements
                  (product_id, admin_user_id, movement_type, quantity, stock_before, stock_after, note)
                 VALUES (?, ?, 'inbound', ?, ?, ?, ?)`,
                [item.product_id, req.user.id, quantity, before, after, `Hoàn kho khi hủy đơn #${orderId}`],
              );
            }
          }
          if (coCotTrangThaiLuotVoucher) {
            const [[redemption]] = await connection.execute(
              "SELECT voucher_id FROM voucher_redemptions WHERE order_id = ? AND usage_status = 'reserved' FOR UPDATE",
              [orderId],
            );
            if (redemption) {
              await connection.execute("UPDATE voucher_redemptions SET usage_status = 'released' WHERE order_id = ? AND usage_status = 'reserved'", [orderId]);
              await connection.execute("UPDATE vouchers SET used_count = IF(used_count > 0, used_count - 1, 0) WHERE id = ?", [redemption.voucher_id]);
            }
          }
        } else if (status === "completed" && coCotTrangThaiLuotVoucher) {
          await connection.execute(
            "UPDATE voucher_redemptions SET usage_status = 'redeemed' WHERE order_id = ? AND usage_status = 'reserved'",
            [orderId],
          );
        }
        await connection.execute("UPDATE orders SET status = ? WHERE id = ?", [status, orderId]);
      }
      await connection.commit();
      transactionStarted = false;
      const [orders] = await pool.execute(
        `SELECT id, customer_id, user_address_id, recipient_name, recipient_phone,
              shipping_address, subtotal, shipping_fee${cotKhuVucVanChuyenDonHangSelect()}, total_amount${cotVoucherDonHangSelect()}, status,
                payment_method, payment_status, created_at, updated_at
       FROM orders WHERE id = ? LIMIT 1`,
        [orderId],
      );
      const itemsByOrder = await layChiTietDonHang(pool, [orderId]);
      return res.json({
        success: true,
        data: {
          ...chuanHoaDonHang(
            orders[0],
            itemsByOrder.get(String(orderId)) || [],
          ),
          customer_id:
            orders[0].customer_id === null
              ? null
              : Number(orders[0].customer_id),
          customer_type: orders[0].customer_id === null ? "guest" : "account",
        },
      });
    } catch (error) {
      if (transactionStarted && connection) {
        try { await connection.rollback(); } catch { /* rollback best effort */ }
      }
      if (error instanceof LoiApiDonHang) {
        return res
          .status(error.status)
          .json({ success: false, message: error.message });
      }
      console.error("Lỗi cập nhật trạng thái đơn:", error.code || "UNKNOWN");
      return res
        .status(500)
        .json({ success: false, message: "Không thể cập nhật đơn hàng" });
    } finally {
      connection?.release();
    }
  },
);

// Danh sách khách hàng dành riêng cho Admin; không truy vấn cột mật khẩu.
app.get(
  "/api/admin/customers",
  xacThucToken,
  yeuCauQuyenNhanVien,
  async (req, res) => {
    try {
      const page =
        req.query.page === undefined
          ? 1
          : docSoNguyenDuong(req.query.page, "Số trang");
      const limit =
        req.query.limit === undefined
          ? 20
          : docSoNguyenDuong(req.query.limit, "Số lượng mỗi trang");
      if (limit > 50) {
        throw new LoiApiDonHang(400, "Số khách hàng mỗi trang tối đa là 50");
      }

      const search = req.query.q === undefined ? "" : req.query.q;
      if (typeof search !== "string" || search.trim().length > 100) {
        throw new LoiApiDonHang(400, "Từ khóa tìm kiếm không hợp lệ");
      }

      const conditions = ["role = ?"];
      const values = ["customer"];
      const normalizedSearch = search.trim();
      if (normalizedSearch) {
        const likeSearch = `%${normalizedSearch.replace(/[\\%_]/g, "\\$&")}%`;
        conditions.push("(full_name LIKE ? OR email LIKE ? OR phone LIKE ?)");
        values.push(likeSearch, likeSearch, likeSearch);
      }

      const where = ` WHERE ${conditions.join(" AND ")}`;
      const [countRows] = await pool.execute(
        `SELECT COUNT(*) AS total FROM users${where}`,
        values,
      );
      const offset = (page - 1) * limit;
      if (!Number.isSafeInteger(offset)) {
        throw new LoiApiDonHang(400, "Số trang quá lớn");
      }

      const [customers] = await pool.execute(
        `SELECT id, full_name, email, phone, avatar_url, role, created_at
         FROM users${where}
         ORDER BY created_at DESC, id DESC
         LIMIT ? OFFSET ?`,
        [...values, limit, offset],
      );

      return res.json({
        success: true,
        count: Number(countRows[0].total),
        page,
        limit,
        data: customers.map((customer) => ({
          id: Number(customer.id),
          full_name: customer.full_name,
          email: customer.email,
          phone: customer.phone,
          avatar_url: customer.avatar_url || null,
          role: customer.role,
          created_at: customer.created_at,
        })),
      });
    } catch (error) {
      if (error instanceof LoiApiDonHang) {
        return res
          .status(error.status)
          .json({ success: false, message: error.message });
      }
      console.error("Lỗi lấy danh sách khách hàng Admin:", error.code || "UNKNOWN");
      return res
        .status(500)
        .json({ success: false, message: "Không thể lấy danh sách khách hàng" });
    }
  },
);

// Chi tiết một khách hàng kèm các địa chỉ giao hàng được lưu trong tài khoản.
app.get(
  "/api/admin/customers/:id",
  xacThucToken,
  yeuCauQuyenNhanVien,
  async (req, res) => {
    try {
      const customerId = docSoNguyenDuong(req.params.id, "Mã khách hàng");
      const [customers] = await pool.execute(
        `SELECT id, full_name, email, phone, avatar_url, role, created_at
         FROM users
         WHERE id = ? AND role = ?
         LIMIT 1`,
        [customerId, "customer"],
      );
      if (!customers.length) {
        return res
          .status(404)
          .json({ success: false, message: "Không tìm thấy khách hàng" });
      }

      const [addresses] = await pool.execute(
        `SELECT id, recipient_name, phone, address, is_default, created_at
         FROM user_addresses
         WHERE user_id = ?
         ORDER BY is_default DESC, id DESC`,
        [customerId],
      );
      const [[orderSummary]] = await pool.execute(
        `SELECT COUNT(*) AS order_count,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_order_count,
          COALESCE(SUM(CASE WHEN status = 'completed' THEN total_amount ELSE 0 END), 0) AS completed_order_value
         FROM orders WHERE customer_id = ?`,
        [customerId],
      );
      const [recentOrders] = await pool.execute(
        `SELECT id, status, total_amount, created_at FROM orders
         WHERE customer_id = ? ORDER BY created_at DESC, id DESC LIMIT 50`,
        [customerId],
      );
      const customer = customers[0];
      return res.json({
        success: true,
        data: {
          id: Number(customer.id),
          full_name: customer.full_name,
          email: customer.email,
          phone: customer.phone,
          avatar_url: customer.avatar_url || null,
          role: customer.role,
          created_at: customer.created_at,
          order_summary: {
            order_count: Number(orderSummary.order_count || 0),
            completed_order_count: Number(orderSummary.completed_order_count || 0),
            completed_order_value: Number(orderSummary.completed_order_value || 0),
          },
          orders: recentOrders.map((order) => ({
            id: String(order.id), status: order.status,
            total_amount: Number(order.total_amount), created_at: order.created_at,
          })),
          addresses: addresses.map((address) => ({
            id: Number(address.id),
            recipient_name: address.recipient_name,
            phone: address.phone,
            address: address.address,
            is_default: Boolean(address.is_default),
            created_at: address.created_at,
          })),
        },
      });
    } catch (error) {
      if (error instanceof LoiApiDonHang) {
        return res
          .status(error.status)
          .json({ success: false, message: error.message });
      }
      console.error("Lỗi lấy chi tiết khách hàng Admin:", error.code || "UNKNOWN");
      return res
        .status(500)
        .json({ success: false, message: "Không thể lấy chi tiết khách hàng" });
    }
  },
);

// Đọc thư viện ảnh; khi migration chưa được áp dụng vẫn trả ảnh bìa hiện hành.
app.get("/api/products/:id/images", async (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isSafeInteger(productId) || productId < 1) return res.status(400).json({ success: false, message: "Mã sản phẩm không hợp lệ" });
  try {
    const [[product]] = await pool.execute("SELECT id, image FROM products WHERE id = ? LIMIT 1", [productId]);
    if (!product) return res.status(404).json({ success: false, message: "Không tìm thấy sản phẩm" });
    if (!coBangAnhSanPham) {
      const data = product.image ? [{ id: null, product_id: productId, image_url: product.image, file_name: null, sort_order: 0, is_primary: true }] : [];
      return res.json({ success: true, data, gallery_enabled: false });
    }
    const [images] = await pool.execute(
      "SELECT id, product_id, image_url, file_name, sort_order, is_primary, created_at FROM product_images WHERE product_id = ? ORDER BY sort_order, id",
      [productId],
    );
    return res.json({ success: true, data: images, gallery_enabled: true });
  } catch (error) {
    console.error("Lỗi đọc thư viện ảnh sản phẩm:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể tải thư viện ảnh sản phẩm" });
  }
});

// Lưu ảnh tham khảo cục bộ rồi liên kết trong MySQL theo mã sản phẩm.
app.post("/api/products/:id/images", xacThucToken, yeuCauQuyenQuanTri, kiemTraMaSanPhamGallery, xuLyUploadGallery, async (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isSafeInteger(productId) || productId < 1) return res.status(400).json({ success: false, message: "Mã sản phẩm không hợp lệ" });
  const uploaded = [];
  let committed = false;
  let connection;
  try {
    const uploadResults = await Promise.allSettled(req.files.map(luuTepGalleryCucBo));
    uploaded.push(...uploadResults.filter((result) => result.status === "fulfilled").map((result) => result.value));
    const uploadFailure = uploadResults.find((result) => result.status === "rejected");
    if (uploadFailure) throw uploadFailure.reason;
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [[product]] = await connection.execute("SELECT id, image FROM products WHERE id = ? FOR UPDATE", [productId]);
    if (!product) { await connection.rollback(); return res.status(404).json({ success: false, message: "Không tìm thấy sản phẩm" }); }
    const [[aggregate]] = await connection.execute("SELECT COALESCE(MAX(sort_order), -1) AS max_order, COUNT(*) AS total FROM product_images WHERE product_id = ?", [productId]);
    let order = Number(aggregate.max_order) + 1;
    const isFirst = Number(aggregate.total) === 0;
    for (const item of uploaded) {
      await connection.execute(
        "INSERT INTO product_images (product_id, image_url, file_name, sort_order, is_primary) VALUES (?, ?, ?, ?, ?)",
        [productId, item.image_url, item.file_name, order, isFirst && order === Number(aggregate.max_order) + 1],
      );
      order += 1;
    }
    const [images] = await connection.execute("SELECT id, product_id, image_url, file_name, sort_order, is_primary, created_at FROM product_images WHERE product_id = ? ORDER BY sort_order, id", [productId]);
    await connection.commit();
    committed = true;
    return res.status(201).json({ success: true, data: images });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    console.error("Lỗi lưu gallery sản phẩm:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể lưu ảnh sản phẩm" });
  } finally {
    if (connection) connection.release();
    if (!committed) {
      const cleanupResults = await Promise.allSettled(uploaded.map((item) => xoaTepGalleryCucBo(item.file_name)));
      if (cleanupResults.some((result) => result.status === "rejected")) console.error("Không thể dọn một số tệp gallery chưa được liên kết.");
    }
  }
});

// Lưu thứ tự riêng của ảnh tham khảo; không thay đổi ảnh bìa trong products.image.
app.put("/api/products/:id/images/order", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (!coBangAnhSanPham) return res.status(503).json({ success: false, message: "Thư viện ảnh sản phẩm chưa được kích hoạt trong cơ sở dữ liệu" });
  const productId = Number(req.params.id);
  const imageIds = req.body?.image_ids;
  if (!Number.isSafeInteger(productId) || productId < 1 || !Array.isArray(imageIds) || imageIds.some((id) => !Number.isSafeInteger(Number(id)) || Number(id) < 1) || new Set(imageIds.map(Number)).size !== imageIds.length) {
    return res.status(400).json({ success: false, message: "Danh sách thứ tự ảnh không hợp lệ" });
  }
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [[product]] = await connection.execute("SELECT id FROM products WHERE id = ? FOR UPDATE", [productId]);
    if (!product) { await connection.rollback(); return res.status(404).json({ success: false, message: "Không tìm thấy sản phẩm" }); }
    const [rows] = await connection.execute("SELECT id, image_url FROM product_images WHERE product_id = ? ORDER BY sort_order, id FOR UPDATE", [productId]);
    if (rows.length !== imageIds.length || rows.some((row) => !imageIds.map(Number).includes(Number(row.id)))) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: "Thư viện ảnh đã thay đổi. Hãy tải lại rồi thử lại." });
    }
    for (let index = 0; index < imageIds.length; index += 1) {
      await connection.execute("UPDATE product_images SET sort_order = ?, is_primary = ? WHERE id = ? AND product_id = ?", [index, index === 0, Number(imageIds[index]), productId]);
    }
    const [images] = await connection.execute("SELECT id, product_id, image_url, file_name, sort_order, is_primary, created_at FROM product_images WHERE product_id = ? ORDER BY sort_order, id", [productId]);
    await connection.commit();
    return res.json({ success: true, data: images });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    console.error("Lỗi sắp xếp ảnh sản phẩm:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể sắp xếp ảnh sản phẩm" });
  } finally {
    connection?.release();
  }
});

app.delete("/api/products/:id/images/:imageId", xacThucToken, yeuCauQuyenQuanTri, async (req, res) => {
  if (!coBangAnhSanPham) return res.status(503).json({ success: false, message: "Thư viện ảnh sản phẩm chưa được kích hoạt trong cơ sở dữ liệu" });
  const productId = Number(req.params.id);
  const imageId = Number(req.params.imageId);
  if (![productId, imageId].every((id) => Number.isSafeInteger(id) && id > 0)) return res.status(400).json({ success: false, message: "Mã ảnh không hợp lệ" });
  let connection;
  let removed;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [[product]] = await connection.execute("SELECT id FROM products WHERE id = ? FOR UPDATE", [productId]);
    if (!product) { await connection.rollback(); return res.status(404).json({ success: false, message: "Không tìm thấy sản phẩm" }); }
    const [[current]] = await connection.execute("SELECT id, image_url, file_name, is_primary FROM product_images WHERE id = ? AND product_id = ? FOR UPDATE", [imageId, productId]);
    if (!current) { await connection.rollback(); return res.status(404).json({ success: false, message: "Không tìm thấy ảnh trong thư viện sản phẩm" }); }
    removed = current;
    await connection.execute("DELETE FROM product_images WHERE id = ? AND product_id = ?", [imageId, productId]);
    const [remaining] = await connection.execute("SELECT id, image_url FROM product_images WHERE product_id = ? ORDER BY sort_order, id FOR UPDATE", [productId]);
    for (let index = 0; index < remaining.length; index += 1) {
      await connection.execute("UPDATE product_images SET sort_order = ?, is_primary = ? WHERE id = ? AND product_id = ?", [index, index === 0, Number(remaining[index].id), productId]);
    }
    const [images] = await connection.execute("SELECT id, product_id, image_url, file_name, sort_order, is_primary, created_at FROM product_images WHERE product_id = ? ORDER BY sort_order, id", [productId]);
    await connection.commit();
    try { await xoaAnhGalleryNeuKhongDuocThamChieu(removed); } catch (error) { console.error("Lỗi dọn tệp ảnh sản phẩm:", error.code || "UNKNOWN"); }
    return res.json({ success: true, data: images, message: "Đã xóa ảnh khỏi thư viện sản phẩm" });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    console.error("Lỗi xóa ảnh sản phẩm:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể xóa ảnh sản phẩm" });
  } finally {
    connection?.release();
  }
});

// Lấy danh sách sản phẩm
app.get("/api/products", async (req, res) => {
  try {
    const reviewJoin = coBangDanhGia
      ? `LEFT JOIN (
          SELECT r.product_id, ROUND(AVG(r.rating), 1) AS average_rating, COUNT(*) AS review_count
          FROM product_reviews r${coCotDanhGiaTaiKhoan ? " WHERE r.is_visible = TRUE" : ""}
          GROUP BY r.product_id
        ) review_stats ON review_stats.product_id = p.id`
      : "";
    const reviewColumns = coBangDanhGia
      ? "COALESCE(review_stats.average_rating, 0) AS average_rating, COALESCE(review_stats.review_count, 0) AS review_count"
      : "0 AS average_rating, 0 AS review_count";
    const [rows] = await pool.query(
      `SELECT p.*, ${reviewColumns}
       FROM products p ${reviewJoin} ORDER BY p.created_at DESC`,
    );

    const products = rows.map(chuanHoaSanPham);

    res.json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    console.error("Lỗi lấy sản phẩm:", error.message);

    res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách sản phẩm",
    });
  }
});

// Trả sản phẩm có số lượng bán thực tế cao nhất từ các đơn đã hoàn thành.
app.get("/api/products/best-sellers", async (req, res) => {
  const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset % 5 !== 0) {
    return res.status(400).json({
      success: false,
      message: "Vị trí trang sản phẩm bán chạy không hợp lệ",
    });
  }

  const salesJoin = `
    INNER JOIN (
      SELECT oi.product_id, SUM(oi.quantity) AS total_sold
      FROM orders AS o
      INNER JOIN order_items AS oi ON oi.order_id = o.id
      WHERE o.status = ? AND oi.product_id IS NOT NULL
      GROUP BY oi.product_id
    ) AS sold ON sold.product_id = p.id`;

  try {
    const [[totalRows], [rows]] = await Promise.all([
      pool.execute(
        `SELECT COUNT(*) AS total
         FROM products AS p ${salesJoin}
         WHERE p.active = TRUE AND sold.total_sold > 0`,
        ["completed"],
      ),
      pool.execute(
        `SELECT p.*, sold.total_sold AS sold_quantity
         FROM products AS p ${salesJoin}
         WHERE p.active = TRUE AND sold.total_sold > 0
         ORDER BY sold.total_sold DESC, p.id ASC
         LIMIT 5 OFFSET ?`,
        ["completed", offset],
      ),
    ]);

    let reviewStats = new Map();
    const productIds = rows.map((row) => row.id);
    if (coBangDanhGia && productIds.length) {
      const placeholders = productIds.map(() => "?").join(", ");
      const reviewVisibilityFilter = coCotDanhGiaTaiKhoan
        ? " AND is_visible = TRUE"
        : "";
      const [reviewRows] = await pool.execute(
        `SELECT product_id, ROUND(AVG(rating), 1) AS average_rating, COUNT(*) AS review_count
         FROM product_reviews
         WHERE product_id IN (${placeholders})${reviewVisibilityFilter}
         GROUP BY product_id`,
        productIds,
      );
      reviewStats = new Map(
        reviewRows.map((row) => [Number(row.product_id), row]),
      );
    }

    const total = Number(totalRows[0]?.total || 0);
    const data = rows.map((row) => {
      const review = reviewStats.get(Number(row.id));
      return {
        ...chuanHoaSanPham({
          ...row,
          average_rating: review?.average_rating || 0,
          review_count: review?.review_count || 0,
        }),
        sold_quantity: Number(row.sold_quantity),
      };
    });

    return res.json({
      success: true,
      count: data.length,
      total,
      offset,
      limit: 5,
      hasMore: offset + data.length < total,
      data,
    });
  } catch (error) {
    console.error("Lỗi lấy sản phẩm bán chạy:", error.code || "UNKNOWN");
    return res.status(500).json({
      success: false,
      message: "Không thể tải danh sách sản phẩm bán chạy",
    });
  }
});

// Lấy đánh giá và thống kê đánh giá
app.get("/api/products/:id/reviews", xacThucTokenTuyChon, async (req, res) => {
  try {
    const productId = Number(req.params.id);

    if (!Number.isSafeInteger(productId) || productId < 1) {
      return res.status(400).json({
        success: false,
        message: "ID sản phẩm không hợp lệ",
      });
    }

    const [products] = await pool.execute(
      "SELECT id FROM products WHERE id = ?",
      [productId],
    );

    if (!products.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sản phẩm",
      });
    }

    const reviewVisibilityFilter = coCotDanhGiaTaiKhoan
      ? " AND is_visible = TRUE"
      : "";
    const customerReviewFields = coCotDanhGiaTaiKhoan
      ? ", CASE WHEN customer_id = ? THEN TRUE ELSE FALSE END AS is_mine"
      : "";
    const [summaryRows] = await pool.execute(
      `SELECT
        COUNT(*) AS totalReviews,
        COALESCE(AVG(rating), 0) AS averageRating,
        SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) AS fiveStars,
        SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) AS fourStars,
        SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) AS threeStars,
        SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) AS twoStars,
        SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) AS oneStar,
        SUM(
          CASE
            WHEN media IS NOT NULL AND JSON_LENGTH(media) > 0 THEN 1
            ELSE 0
          END
        ) AS mediaCount
       FROM product_reviews
       WHERE product_id = ?${reviewVisibilityFilter}`,
      [productId],
    );

    const summaryRow = summaryRows[0];

    const summary = {
      averageRating: Number(Number(summaryRow.averageRating).toFixed(1)),
      totalReviews: Number(summaryRow.totalReviews),
      ratingCounts: {
        5: Number(summaryRow.fiveStars || 0),
        4: Number(summaryRow.fourStars || 0),
        3: Number(summaryRow.threeStars || 0),
        2: Number(summaryRow.twoStars || 0),
        1: Number(summaryRow.oneStar || 0),
      },
      mediaCount: Number(summaryRow.mediaCount || 0),
    };

    const [reviewRows] = await pool.execute(
      `SELECT
        id,
        product_id,
        customer_name,
        rating,
        comment,
        media${customerReviewFields},
        created_at
       FROM product_reviews
       WHERE product_id = ?${reviewVisibilityFilter}
       ORDER BY created_at DESC, id DESC`,
      coCotDanhGiaTaiKhoan ? [req.user?.id || 0, productId] : [productId],
    );

    const reviews = reviewRows.map(chuanHoaDanhGiaCongKhai);

    res.json({
      success: true,
      productId,
      summary,
      count: reviews.length,
      data: reviews,
    });
  } catch (error) {
    console.error("Lỗi lấy đánh giá sản phẩm:", error.message);

    res.status(500).json({
      success: false,
      message: "Không thể lấy đánh giá sản phẩm",
    });
  }
});

// Trả đánh giá của riêng tài khoản hiện tại, kể cả khi Admin đã ẩn đánh giá.
app.get("/api/products/:id/reviews/mine", xacThucToken, async (req, res) => {
  if (!coCotDanhGiaTaiKhoan) {
    return res.status(503).json({ success: false, message: "Đánh giá gắn với tài khoản chưa được kích hoạt" });
  }
  const productId = Number(req.params.id);
  if (!Number.isSafeInteger(productId) || productId < 1) {
    return res.status(400).json({ success: false, message: "ID sản phẩm không hợp lệ" });
  }
  try {
    const [[product]] = await pool.execute("SELECT id FROM products WHERE id = ? LIMIT 1", [productId]);
    if (!product) return res.status(404).json({ success: false, message: "Không tìm thấy sản phẩm" });
    const [[review]] = await pool.execute(
      `SELECT id, product_id, customer_name, rating, comment, media, is_visible, created_at
       FROM product_reviews
       WHERE product_id = ? AND customer_id = ?
       LIMIT 1`,
      [productId, req.user.id],
    );
    return res.json({
      success: true,
      data: review ? chuanHoaDanhGiaCuaToi(review) : null,
    });
  } catch (error) {
    console.error("Lỗi lấy đánh giá của khách hàng:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể tải đánh giá của bạn" });
  }
});

// Kiểm tra điều kiện gửi đánh giá cho khách đã mua và đơn đã hoàn thành.
app.get(
  "/api/products/:id/reviews/eligibility",
  xacThucToken,
  async (req, res) => {
    if (!coCotDanhGiaTaiKhoan) {
      return res.status(503).json({ success: false, message: "Chức năng đánh giá gắn với tài khoản chưa được kích hoạt trong cơ sở dữ liệu" });
    }
    try {
      const productId = Number(req.params.id);
      if (!Number.isSafeInteger(productId) || productId < 1) {
        return res.status(400).json({ success: false, message: "ID sản phẩm không hợp lệ" });
      }
      const [[product]] = await pool.execute(
        "SELECT id FROM products WHERE id = ? LIMIT 1",
        [productId],
      );
      if (!product) return res.status(404).json({ success: false, message: "Không tìm thấy sản phẩm" });
      const [[purchase]] = await pool.execute(
        `SELECT EXISTS(
          SELECT 1 FROM orders o
          INNER JOIN order_items oi ON oi.order_id = o.id
          WHERE o.customer_id = ? AND o.status = 'completed' AND oi.product_id = ?
        ) AS has_completed_purchase`,
        [req.user.id, productId],
      );
      const [[previous]] = await pool.execute(
        "SELECT id FROM product_reviews WHERE customer_id = ? AND product_id = ? LIMIT 1",
        [req.user.id, productId],
      );
      return res.json({
        success: true,
        data: {
          can_review: Boolean(purchase.has_completed_purchase) && !previous,
          has_completed_purchase: Boolean(purchase.has_completed_purchase),
          has_reviewed: Boolean(previous),
        },
      });
    } catch (error) {
      console.error("Lỗi kiểm tra điều kiện đánh giá:", error.code || "UNKNOWN");
      return res.status(500).json({ success: false, message: "Không thể kiểm tra điều kiện đánh giá" });
    }
  },
);

// Lưu một đánh giá gắn với tài khoản, chỉ sau khi đơn đã hoàn thành.
app.post(
  "/api/products/:id/reviews",
  xacThucToken,
  nhanTepDanhGia,
  async (req, res) => {
    if (!coCotDanhGiaTaiKhoan) {
      return res.status(503).json({ success: false, message: "Chức năng đánh giá gắn với tài khoản chưa được kích hoạt trong cơ sở dữ liệu" });
    }
    try {
      const productId = Number(req.params.id);
      const rating = Number(req.body?.rating);
      const comment = typeof req.body?.comment === "string" ? req.body.comment.trim() : "";
      if (!Number.isSafeInteger(productId) || productId < 1) {
        return res.status(400).json({ success: false, message: "ID sản phẩm không hợp lệ" });
      }
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ success: false, message: "Điểm đánh giá phải từ 1 đến 5 sao" });
      }
      if (comment.length > 3000) {
        return res.status(400).json({ success: false, message: "Nội dung đánh giá không được vượt quá 3000 ký tự" });
      }
      const [[product]] = await pool.execute("SELECT id FROM products WHERE id = ? LIMIT 1", [productId]);
      if (!product) return res.status(404).json({ success: false, message: "Không tìm thấy sản phẩm" });
      const [[user]] = await pool.execute(
        "SELECT full_name FROM users WHERE id = ? LIMIT 1",
        [req.user.id],
      );
      if (!user) return res.status(404).json({ success: false, message: "Không tìm thấy tài khoản" });
      const [[purchase]] = await pool.execute(
        `SELECT EXISTS(
          SELECT 1 FROM orders o
          INNER JOIN order_items oi ON oi.order_id = o.id
          WHERE o.customer_id = ? AND o.status = 'completed' AND oi.product_id = ?
        ) AS has_completed_purchase`,
        [req.user.id, productId],
      );
      if (!purchase.has_completed_purchase) {
        return res.status(403).json({ success: false, message: "Chỉ khách đã mua và có đơn hoàn thành mới được đánh giá sản phẩm này" });
      }
      const media = [];
      try {
        for (const file of req.files || []) media.push(await luuAnhDanhGia(file));
      } catch (error) {
        await xoaAnhDanhGiaChuaLienKet(media);
        throw error;
      }

      let result;
      let connection;
      let insertAttempted = false;
      let commitAttempted = false;
      let discardConnection = false;
      try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        insertAttempted = true;
        [result] = await connection.execute(
          `INSERT INTO product_reviews
            (product_id, customer_name, customer_id, rating, comment, media, is_visible)
           VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
          [productId, user.full_name, req.user.id, rating, comment || null, JSON.stringify(media)],
        );
        commitAttempted = true;
        await connection.commit();
      } catch (error) {
        let definitelyNotSaved = !insertAttempted;
        if (insertAttempted && !commitAttempted && connection) {
          try {
            await connection.rollback();
            definitelyNotSaved = true;
          } catch {
            // Không xóa ảnh khi không xác nhận được rollback.
            discardConnection = true;
          }
        }
        if (commitAttempted) {
          discardConnection = true;
          // Đóng kết nối để MySQL kết thúc transaction trước khi xác minh trạng thái commit.
          try {
            connection?.destroy();
            connection = null;
          } catch {
            // Nếu không đóng được kết nối, giữ ảnh vì trạng thái lưu còn chưa rõ.
          }
          // COMMIT có thể đã đến MySQL dù client nhận lỗi; chỉ dọn ảnh khi truy vấn xác nhận không có dòng.
          if (!connection && result?.insertId) {
            try {
              const [[persistedReview]] = await pool.execute(
                "SELECT id FROM product_reviews WHERE id = ? LIMIT 1",
                [result.insertId],
              );
              if (!persistedReview) await xoaAnhDanhGiaChuaLienKet(media);
            } catch {
              // Kết quả commit vẫn chưa xác định; giữ ảnh để tránh làm hỏng bản ghi đã lưu.
            }
          }
        }
        if (definitelyNotSaved) await xoaAnhDanhGiaChuaLienKet(media);
        throw error;
      } finally {
        if (discardConnection) connection?.destroy();
        else connection?.release();
      }

      // COMMIT đã thành công; lỗi đọc lại không được xóa ảnh mà dòng đánh giá đang tham chiếu.
      const [[review]] = await pool.execute(
        `SELECT id, product_id, customer_name, customer_id, rating, comment, media, is_visible, created_at
         FROM product_reviews WHERE id = ? LIMIT 1`,
        [result.insertId],
      );
      return res.status(201).json({
        success: true,
        message: "Đánh giá của bạn đã được đăng",
        data: chuanHoaDanhGiaCongKhai({ ...review, is_mine: true }),
      });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ success: false, message: "Bạn đã đánh giá sản phẩm này trước đó" });
      }
      console.error("Lỗi lưu đánh giá:", error.code || "UNKNOWN");
      return res.status(500).json({ success: false, message: "Không thể lưu đánh giá" });
    }
  },
);

// Khách chỉ được sửa đánh giá thuộc chính tài khoản; customer_id không nhận từ client.
app.put(
  "/api/products/:id/reviews/:reviewId",
  xacThucToken,
  nhanTepDanhGia,
  async (req, res) => {
    if (!coCotDanhGiaTaiKhoan) return res.status(503).json({ success: false, message: "Chức năng đánh giá theo tài khoản chưa được kích hoạt" });
    const productId = Number(req.params.id);
    const reviewId = Number(req.params.reviewId);
    const rating = Number(req.body?.rating);
    const comment = typeof req.body?.comment === "string" ? req.body.comment.trim() : "";
    if (![productId, reviewId].every((value) => Number.isSafeInteger(value) && value > 0)) return res.status(400).json({ success: false, message: "Mã đánh giá không hợp lệ" });
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length > 3000) return res.status(400).json({ success: false, message: "Điểm đánh giá phải từ 1 đến 5 sao và nội dung tối đa 3000 ký tự" });
    let uploaded = [];
    try {
      const [[review]] = await pool.execute("SELECT id, media FROM product_reviews WHERE id = ? AND product_id = ? AND customer_id = ? LIMIT 1", [reviewId, productId, req.user.id]);
      if (!review) return res.status(404).json({ success: false, message: "Không tìm thấy đánh giá của bạn" });
      let media = review.media;
      if (typeof media === "string") { try { media = JSON.parse(media); } catch { media = []; } }
      if (!Array.isArray(media)) media = [];
      if (media.length + (req.files?.length || 0) > 5) return res.status(400).json({ success: false, message: "Mỗi đánh giá tối đa 5 ảnh" });
      for (const file of req.files || []) uploaded.push(await luuAnhDanhGia(file));
      media = [...media, ...uploaded];
      await pool.execute("UPDATE product_reviews SET rating = ?, comment = ?, media = ? WHERE id = ? AND product_id = ? AND customer_id = ?", [rating, comment || null, JSON.stringify(media), reviewId, productId, req.user.id]);
      const [[updated]] = await pool.execute("SELECT id, product_id, customer_name, rating, comment, media, created_at, TRUE AS is_mine FROM product_reviews WHERE id = ? LIMIT 1", [reviewId]);
      return res.json({ success: true, message: "Đã cập nhật đánh giá", data: chuanHoaDanhGiaCongKhai(updated) });
    } catch (error) {
      await xoaAnhDanhGiaChuaLienKet(uploaded);
      console.error("Lỗi cập nhật đánh giá:", error.code || "UNKNOWN");
      return res.status(500).json({ success: false, message: "Không thể cập nhật đánh giá" });
    }
  },
);

// Khách chỉ được xóa đánh giá thuộc chính tài khoản.
app.delete("/api/products/:id/reviews/:reviewId", xacThucToken, async (req, res) => {
  if (!coCotDanhGiaTaiKhoan) return res.status(503).json({ success: false, message: "Chức năng đánh giá theo tài khoản chưa được kích hoạt" });
  const productId = Number(req.params.id);
  const reviewId = Number(req.params.reviewId);
  if (![productId, reviewId].every((value) => Number.isSafeInteger(value) && value > 0)) return res.status(400).json({ success: false, message: "Mã đánh giá không hợp lệ" });
  try {
    const [[review]] = await pool.execute("SELECT media FROM product_reviews WHERE id = ? AND product_id = ? AND customer_id = ? LIMIT 1", [reviewId, productId, req.user.id]);
    if (!review) return res.status(404).json({ success: false, message: "Không tìm thấy đánh giá của bạn" });
    let media = review.media;
    if (typeof media === "string") { try { media = JSON.parse(media); } catch { media = []; } }
    const [result] = await pool.execute("DELETE FROM product_reviews WHERE id = ? AND product_id = ? AND customer_id = ?", [reviewId, productId, req.user.id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Không tìm thấy đánh giá của bạn" });
    await xoaAnhDanhGiaChuaLienKet(Array.isArray(media) ? media : []);
    return res.json({ success: true, message: "Đã xóa đánh giá" });
  } catch (error) {
    console.error("Lỗi xóa đánh giá khách hàng:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể xóa đánh giá" });
  }
});

// Danh sách đánh giá chờ kiểm duyệt, chỉ Admin được xem.
app.get(
  "/api/admin/reviews",
  xacThucToken,
  yeuCauQuyenNhanVien,
  async (req, res) => {
    if (!coCotDanhGiaTaiKhoan) {
      return res.status(503).json({ success: false, message: "Chức năng kiểm duyệt đánh giá chưa được kích hoạt trong cơ sở dữ liệu" });
    }
    try {
      const [rows] = await pool.execute(
        `SELECT r.*, p.name AS product_name
         FROM product_reviews r
         INNER JOIN products p ON p.id = r.product_id
         ORDER BY r.is_visible ASC, r.created_at DESC, r.id DESC
         LIMIT 200`,
      );
      return res.json({ success: true, count: rows.length, data: rows.map(chuanHoaDanhGia) });
    } catch (error) {
      console.error("Lỗi lấy đánh giá quản trị:", error.code || "UNKNOWN");
      return res.status(500).json({ success: false, message: "Không thể tải danh sách đánh giá" });
    }
  },
);

// Ẩn đánh giá khỏi trang sản phẩm; thao tác chỉ dành cho Admin.
app.patch(
  "/api/admin/reviews/:id/visibility",
  xacThucToken,
  yeuCauQuyenNhanVien,
  async (req, res) => {
    if (!coCotDanhGiaTaiKhoan) {
      return res.status(503).json({ success: false, message: "Chức năng kiểm duyệt đánh giá chưa được kích hoạt trong cơ sở dữ liệu" });
    }
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1 || typeof req.body?.is_visible !== "boolean") {
      return res.status(400).json({ success: false, message: "Thông tin kiểm duyệt không hợp lệ" });
    }
    try {
      const [result] = await pool.execute(
        "UPDATE product_reviews SET is_visible = ? WHERE id = ?",
        [req.body.is_visible, id],
      );
      if (!result.affectedRows) return res.status(404).json({ success: false, message: "Không tìm thấy đánh giá" });
      return res.json({ success: true, message: req.body.is_visible ? "Đánh giá đã được hiển thị" : "Đánh giá đã được ẩn" });
    } catch (error) {
      console.error("Lỗi cập nhật hiển thị đánh giá:", error.code || "UNKNOWN");
      return res.status(500).json({ success: false, message: "Không thể cập nhật đánh giá" });
    }
  },
);

// Xóa đánh giá theo yêu cầu kiểm duyệt của Admin.
app.delete(
  "/api/admin/reviews/:id",
  xacThucToken,
  yeuCauQuyenQuanTri,
  async (req, res) => {
    if (!coCotDanhGiaTaiKhoan) {
      return res.status(503).json({ success: false, message: "Chức năng kiểm duyệt đánh giá chưa được kích hoạt trong cơ sở dữ liệu" });
    }
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ success: false, message: "ID đánh giá không hợp lệ" });
    try {
      const [[review]] = await pool.execute("SELECT media FROM product_reviews WHERE id = ? LIMIT 1", [id]);
      if (!review) return res.status(404).json({ success: false, message: "Không tìm thấy đánh giá" });
      let media = review.media;
      if (typeof media === "string") { try { media = JSON.parse(media); } catch { media = []; } }
      const [result] = await pool.execute("DELETE FROM product_reviews WHERE id = ?", [id]);
      if (!result.affectedRows) return res.status(404).json({ success: false, message: "Không tìm thấy đánh giá" });
      await xoaAnhDanhGiaChuaLienKet(Array.isArray(media) ? media : []);
      return res.json({ success: true, message: "Đã xóa đánh giá" });
    } catch (error) {
      console.error("Lỗi xóa đánh giá:", error.code || "UNKNOWN");
      return res.status(500).json({ success: false, message: "Không thể xóa đánh giá" });
    }
  },
);

// Thêm sản phẩm
app.post(
  "/api/products",
  xacThucToken,
  yeuCauQuyenQuanTri,
  xuLyUploadAnhSanPham,
  async (req, res) => {
    let productCreated = false;
    try {
      const errors = kiemTraDuLieuSanPham(req.body);

      if (req.body?.product_details !== undefined && !coCotChiTietSanPham) {
        await xoaTepAnhSanPham(req.file);
        return res.status(503).json({ success: false, message: "Cấu trúc lưu thông tin chi tiết sản phẩm chưa được kích hoạt trong database" });
      }

      if (errors.length) {
        await xoaTepAnhSanPham(req.file);
        return res.status(400).json({
          success: false,
          message: errors.join("; "),
        });
      }

      if (coBangLichSuTonKho && Number(req.body.stock || 0) !== 0) {
        await xoaTepAnhSanPham(req.file);
        return res.status(400).json({ success: false, message: "Tồn kho ban đầu phải được ghi nhận qua chức năng quản lý tồn kho" });
      }

      if (coBangDanhMuc) {
        const [categoryRows] = await pool.execute("SELECT id FROM categories WHERE name = ? LIMIT 1", [String(req.body.category || "").trim()]);
        if (!categoryRows.length) {
          await xoaTepAnhSanPham(req.file);
          return res.status(400).json({ success: false, message: "Danh mục sản phẩm không tồn tại" });
        }
      }

      const product = layGiaTriSanPham(req.body);
      if (req.file) product.image = `/uploads/products/${req.file.filename}`;
      const productColumns = ["name", "description", "price", "category", "image", "stock", "featured", "active"];
      const productValues = [
          product.name,
          product.description,
          product.price,
          product.category,
          product.image,
          product.stock,
          product.featured,
          product.active,
      ];
      if (req.body?.product_details !== undefined) {
        productColumns.push("product_details");
        const details = kiemTraChiTietSanPham(req.body.product_details).value;
        productValues.push(details === null ? null : JSON.stringify(details));
      }
      const placeholders = productColumns.map(() => "?").join(", ");
      const [result] = await pool.execute(
        `INSERT INTO products (${productColumns.map((column) => `\`${column}\``).join(", ")}) VALUES (${placeholders})`,
        productValues,
      );
      productCreated = result.affectedRows > 0;

      const [rows] = await pool.execute("SELECT * FROM products WHERE id = ?", [
        result.insertId,
      ]);

      res.status(201).json({
        success: true,
        message: "Thêm sản phẩm thành công",
        data: chuanHoaSanPham(rows[0]),
      });
    } catch (error) {
      if (req.file && !productCreated) {
        await xoaAnhSanPhamNeuKhongDuocThamChieu(`/uploads/products/${req.file.filename}`);
      }
      console.error("Lỗi thêm sản phẩm:", error.message);

      res.status(500).json({
        success: false,
        message: "Không thể thêm sản phẩm",
      });
    }
  },
);

// Cập nhật sản phẩm
app.put(
  "/api/products/:id",
  xacThucToken,
  yeuCauQuyenQuanTri,
  xuLyUploadAnhSanPham,
  async (req, res) => {
    let productImageLinked = false;
    try {
      const id = Number(req.params.id);

      if (!Number.isSafeInteger(id) || id < 1) {
        await xoaTepAnhSanPham(req.file);
        return res.status(400).json({
          success: false,
          message: "ID sản phẩm không hợp lệ",
        });
      }

      const errors = kiemTraDuLieuSanPham(req.body, true);

      if (req.body?.product_details !== undefined && !coCotChiTietSanPham) {
        await xoaTepAnhSanPham(req.file);
        return res.status(503).json({ success: false, message: "Cấu trúc lưu thông tin chi tiết sản phẩm chưa được kích hoạt trong database" });
      }

      if (errors.length) {
        await xoaTepAnhSanPham(req.file);
        return res.status(400).json({
          success: false,
          message: errors.join("; "),
        });
      }

      if (coBangLichSuTonKho && req.body.stock !== undefined) {
        await xoaTepAnhSanPham(req.file);
        return res.status(400).json({ success: false, message: "Hãy dùng chức năng quản lý tồn kho để ghi nhận mọi biến động số lượng" });
      }

      if (coBangDanhMuc && req.body.category !== undefined) {
        const [categoryRows] = await pool.execute("SELECT id FROM categories WHERE name = ? LIMIT 1", [String(req.body.category || "").trim()]);
        if (!categoryRows.length) {
          await xoaTepAnhSanPham(req.file);
          return res.status(400).json({ success: false, message: "Danh mục sản phẩm không tồn tại" });
        }
      }

      const updates = allowedFields.filter(
        (field) => req.body[field] !== undefined,
      );
      if (req.body?.product_details !== undefined) updates.push("product_details");

      if (req.file && !updates.includes("image")) {
        updates.push("image");
      }

      if (!updates.length) {
        await xoaTepAnhSanPham(req.file);
        return res.status(400).json({
          success: false,
          message: "Không có thông tin cần cập nhật",
        });
      }

      const [existingProductRows] = await pool.execute(
        "SELECT image FROM products WHERE id = ? LIMIT 1",
        [id],
      );
      if (!existingProductRows.length) {
        await xoaTepAnhSanPham(req.file);
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy sản phẩm",
        });
      }
      const oldProductImage = existingProductRows[0].image;

      const values = updates.map((field) => {
        if (field === "product_details") {
          const details = kiemTraChiTietSanPham(req.body.product_details).value;
          return details === null ? null : JSON.stringify(details);
        }
        const value = field === "image" && req.file
          ? `/uploads/products/${req.file.filename}`
          : req.body[field];

        if (field === "name" || field === "category") {
          return value.trim();
        }

        if (field === "price" || field === "stock") {
          return Number(value);
        }

        if (field === "featured" || field === "active") {
          return value === true || value === 1;
        }

        return value;
      });

      const setClause = updates.map((field) => `\`${field}\` = ?`).join(", ");

      const [result] = await pool.execute(
        `UPDATE products SET ${setClause} WHERE id = ?`,
        [...values, id],
      );
      productImageLinked = Boolean(req.file && result.affectedRows > 0);

      if (result.affectedRows === 0) {
        const [existing] = await pool.execute(
          "SELECT id FROM products WHERE id = ?",
          [id],
        );

        if (!existing.length) {
          await xoaTepAnhSanPham(req.file);
          return res.status(404).json({
            success: false,
            message: "Không tìm thấy sản phẩm",
          });
        }
      }

      const [rows] = await pool.execute("SELECT * FROM products WHERE id = ?", [
        id,
      ]);

      const currentProduct = chuanHoaSanPham(rows[0]);
      if (oldProductImage !== currentProduct.image) {
        await xoaAnhSanPhamNeuKhongDuocThamChieu(oldProductImage);
      }

      res.json({
        success: true,
        message: "Cập nhật sản phẩm thành công",
        data: currentProduct,
      });
    } catch (error) {
      if (req.file && !productImageLinked) {
        await xoaAnhSanPhamNeuKhongDuocThamChieu(`/uploads/products/${req.file.filename}`);
      }
      console.error("Lỗi cập nhật sản phẩm:", error.message);

      res.status(500).json({
        success: false,
        message: "Không thể cập nhật sản phẩm",
      });
    }
  },
);

// Xóa sản phẩm
app.delete(
  "/api/products/:id",
  xacThucToken,
  yeuCauQuyenQuanTri,
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (!Number.isSafeInteger(id) || id < 1) {
        return res.status(400).json({
          success: false,
          message: "ID sản phẩm không hợp lệ",
        });
      }

      const [existingProducts] = await pool.execute(
        "SELECT image FROM products WHERE id = ? LIMIT 1",
        [id],
      );
      if (!existingProducts.length) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy sản phẩm",
        });
      }

      const galleryImages = coBangAnhSanPham
        ? (await pool.execute(
          "SELECT image_url, file_name FROM product_images WHERE product_id = ?",
          [id],
        ))[0]
        : [];

      const [result] = await pool.execute("DELETE FROM products WHERE id = ?", [
        id,
      ]);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy sản phẩm",
        });
      }

      await xoaAnhSanPhamNeuKhongDuocThamChieu(existingProducts[0].image);
      const galleryCleanup = await Promise.allSettled(
        galleryImages.map((image) => xoaAnhGalleryNeuKhongDuocThamChieu(image)),
      );
      if (galleryCleanup.some((result) => result.status === "rejected")) {
        console.error("Không thể dọn một số tệp gallery sau khi xóa sản phẩm.");
      }

      res.json({
        success: true,
        message: "Xóa sản phẩm thành công",
      });
    } catch (error) {
      if (error.code === "ER_ROW_IS_REFERENCED_2" || error.code === "ER_ROW_IS_REFERENCED") {
        return res.status(409).json({
          success: false,
          message: "Không thể xóa sản phẩm vì sản phẩm đang được giỏ hàng, đơn hàng hoặc dữ liệu khác sử dụng.",
        });
      }
      console.error("Lỗi xóa sản phẩm:", error.message);

      res.status(500).json({
        success: false,
        message: "Không thể xóa sản phẩm",
      });
    }
  },
);

// =========================
// KHỞI ĐỘNG BACKEND
// =========================

// Kiểm tra kết nối dữ liệu rồi khởi chạy máy chủ HTTP.
async function khoiDongMayChu() {
  try {
    if (!process.env.DB_PASSWORD) {
      throw new Error("Chưa cấu hình DB_PASSWORD trong server/.env");
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("Chưa cấu hình JWT_SECRET trong server/.env");
    }

    const connection = await pool.getConnection();

    try {
      await connection.ping();
      const [tableRows] = await boKetNoiGoc.query("SHOW TABLES");
      const tableNames = tableRows.map((row) => Object.values(row)[0]);
      coSoDuLieuDungTenViet = tableNames.includes("san_pham") && !tableNames.includes("products");
      const userTableName = tableNames.includes("users") ? "users" : tableNames.includes("nguoi_dung") ? "nguoi_dung" : "";
      if (userTableName) {
        const [userColumns] = await boKetNoiGoc.query(`SHOW COLUMNS FROM \`${userTableName}\``);
        const userColumnMap = new Map(userColumns.map((column) => [column.Field, String(column.Type || "").toLowerCase()]));
        const roleType = userColumnMap.get(coSoDuLieuDungTenViet ? "vai_tro" : "role") || "";
        coRoleNhanVien = roleType.includes("employee") || roleType.includes("nhan_vien");
        coCotTrangThaiNguoiDung = userColumnMap.has(coSoDuLieuDungTenViet ? "dang_hoat_dong" : "is_active");
        coCotDoiMatKhauLanDau = userColumnMap.has(coSoDuLieuDungTenViet ? "doi_mat_khau_lan_dau" : "must_change_password");
      }
      const productTableForDetails = tableNames.includes("products")
        ? "products"
        : tableNames.includes("san_pham")
          ? "san_pham"
          : "";
      if (productTableForDetails && !coSoDuLieuDungTenViet) {
        const [productColumns] = await boKetNoiGoc.query(`SHOW COLUMNS FROM \`${productTableForDetails}\``);
        coCotChiTietSanPham = productColumns.some((column) => column.Field === "product_details");
      } else {
        coCotChiTietSanPham = false;
      }
      coBangDanhGia = tableNames.includes("product_reviews") || tableNames.includes("danh_gia_san_pham");
      coBangVoucher =
        (tableNames.includes("vouchers") || tableNames.includes("ma_giam_gia")) &&
        (tableNames.includes("voucher_redemptions") || tableNames.includes("luot_su_dung_ma_giam_gia"));
      coBangDanhMuc = tableNames.includes("categories") || tableNames.includes("danh_muc_san_pham");
      const galleryTableName = tableNames.includes("product_images")
        ? "product_images"
        : tableNames.includes("thu_vien_anh_san_pham")
          ? "thu_vien_anh_san_pham"
          : "";
      if (galleryTableName) {
        const [galleryColumns] = await boKetNoiGoc.query(`SHOW COLUMNS FROM \`${galleryTableName}\``);
        const requiredGalleryColumns = coSoDuLieuDungTenViet
          ? ["ma_anh", "ma_san_pham", "duong_dan_anh", "ten_tep", "thu_tu", "la_anh_chinh", "ngay_tao"]
          : ["id", "product_id", "image_url", "file_name", "sort_order", "is_primary", "created_at"];
        const actualGalleryColumns = new Set(galleryColumns.map((row) => row.Field));
        coBangAnhSanPham = requiredGalleryColumns.every((column) => actualGalleryColumns.has(column));
      } else {
        coBangAnhSanPham = false;
      }
      coBangLichSuTonKho = tableNames.includes("inventory_movements") || tableNames.includes("lich_su_ton_kho");
      coBangCauHinhVanChuyen = tableNames.includes("shipping_configuration") || tableNames.includes("cau_hinh_van_chuyen");
      if (tableNames.includes("employee_invitations")) {
        const [columns] = await boKetNoiGoc.query("SHOW COLUMNS FROM employee_invitations");
        const [indexes] = await boKetNoiGoc.query("SHOW INDEX FROM employee_invitations");
        const columnNames = new Set(columns.map((column) => column.Field));
        const hasUniqueIndex = (name, column) => indexes.some((index) =>
          index.Key_name === name && Number(index.Non_unique) === 0 && index.Column_name === column,
        );
        coBangLoiMoiNhanVien = [
          "id", "email", "token_hash", "invited_by_admin_id", "accepted_user_id",
          "revoked_by_admin_id", "status", "email_delivery_status", "last_email_error_code",
          "created_at", "sent_at", "expires_at", "accepted_at", "revoked_at", "updated_at", "pending_email",
        ].every((column) => columnNames.has(column)) &&
          hasUniqueIndex("uq_employee_invitations_token_hash", "token_hash") &&
          hasUniqueIndex("uq_employee_invitations_pending_email", "pending_email");
      }
      if (tableNames.includes("employee_role_history")) {
        const [columns] = await boKetNoiGoc.query("SHOW COLUMNS FROM employee_role_history");
        const columnNames = new Set(columns.map((column) => column.Field));
        coBangLichSuQuyenNhanVien = [
          "id", "employee_user_id", "admin_user_id", "invitation_id", "action",
          "role_before", "role_after", "created_at",
        ].every((column) => columnNames.has(column));
      }
      coSchemaQuanLyNhanVien = coRoleNhanVien && coCotTrangThaiNguoiDung &&
        coCotDoiMatKhauLanDau && coBangLoiMoiNhanVien && coBangLichSuQuyenNhanVien;
      const shippingRegionsTable = tableNames.includes("shipping_regions")
        ? "shipping_regions"
        : tableNames.includes("khu_vuc_van_chuyen")
          ? "khu_vuc_van_chuyen"
          : "";
      if (shippingRegionsTable) {
        const [shippingRegionColumns] = await boKetNoiGoc.query(`SHOW COLUMNS FROM \`${shippingRegionsTable}\``);
        const requiredShippingColumns = coSoDuLieuDungTenViet
          ? ["ma_khu_vuc", "ma_khu_vuc_van_chuyen", "ten_khu_vuc", "phi_van_chuyen", "dang_hoat_dong", "ngay_tao", "ngay_cap_nhat"]
          : ["id", "region_code", "region_name", "fee", "is_active", "created_at", "updated_at"];
        const actualShippingColumns = new Set(shippingRegionColumns.map((row) => row.Field));
        coBangKhuVucVanChuyen = requiredShippingColumns.every((column) => actualShippingColumns.has(column));
      } else {
        coBangKhuVucVanChuyen = false;
      }
      const voucherTableName = tableNames.includes("vouchers") ? "vouchers" : tableNames.includes("ma_giam_gia") ? "ma_giam_gia" : "";
      if (voucherTableName) {
        const [voucherColumns] = await boKetNoiGoc.query(`SHOW COLUMNS FROM \`${voucherTableName}\``);
        const voucherColumnNames = new Set(voucherColumns.map((row) => row.Field));
        coCotMetadataVoucher = voucherColumnNames.has(coSoDuLieuDungTenViet ? "mo_ta" : "description") &&
          voucherColumnNames.has(coSoDuLieuDungTenViet ? "gioi_han_moi_khach" : "per_customer_limit");
      }
      const redemptionTableName = tableNames.includes("voucher_redemptions") ? "voucher_redemptions" : tableNames.includes("luot_su_dung_ma_giam_gia") ? "luot_su_dung_ma_giam_gia" : "";
      if (redemptionTableName) {
        const [redemptionColumns] = await boKetNoiGoc.query(`SHOW COLUMNS FROM \`${redemptionTableName}\``);
        const redemptionColumnNames = new Set(redemptionColumns.map((row) => row.Field));
        coCotTrangThaiLuotVoucher = redemptionColumnNames.has(coSoDuLieuDungTenViet ? "trang_thai_su_dung" : "usage_status");
      }
      const orderTableName = tableNames.includes("orders") ? "orders" : tableNames.includes("don_hang") ? "don_hang" : "";
      if (orderTableName) {
        const [orderColumns] = await boKetNoiGoc.query(`SHOW COLUMNS FROM \`${orderTableName}\``);
        const orderColumnNames = new Set(orderColumns.map((row) => row.Field));
        const voucherOrderColumns = coSoDuLieuDungTenViet
          ? ["ma_chuong_trinh_giam_gia", "ma_voucher_luc_dat", "ten_chuong_trinh_luc_dat", "loai_giam_luc_dat", "gia_tri_giam_luc_dat", "so_tien_giam"]
          : ["voucher_id", "voucher_code", "voucher_campaign_name", "voucher_discount_type", "voucher_discount_value", "discount_amount"];
        coCotVoucherDonHang = voucherOrderColumns.every((column) => orderColumnNames.has(column));
        const shippingSnapshotColumns = coSoDuLieuDungTenViet
          ? ["ma_khu_vuc_van_chuyen", "ten_khu_vuc_van_chuyen"]
          : ["shipping_region_code", "shipping_region_name"];
        coCotSnapshotKhuVucVanChuyen = shippingSnapshotColumns.every((column) => orderColumnNames.has(column));
      }
      const reviewTableName = tableNames.includes("product_reviews")
        ? "product_reviews"
        : tableNames.includes("danh_gia_san_pham")
          ? "danh_gia_san_pham"
          : "";
      if (reviewTableName) {
        const [reviewColumns] = await boKetNoiGoc.query(`SHOW COLUMNS FROM \`${reviewTableName}\``);
        const reviewColumnNames = reviewColumns.map((row) => row.Field);
        const reviewCustomerColumn = coSoDuLieuDungTenViet ? "ma_nguoi_dung" : "customer_id";
        const reviewVisibleColumn = coSoDuLieuDungTenViet ? "dang_hien_thi" : "is_visible";
        coCotMediaDanhGia = reviewColumnNames.includes(coSoDuLieuDungTenViet ? "tep_dinh_kem" : "media");
        coCotDanhGiaTaiKhoan =
          reviewColumnNames.includes(reviewCustomerColumn) &&
          reviewColumnNames.includes(reviewVisibleColumn);
      }
      console.log("Đã kết nối MySQL thành công!");
      console.log(`Quản lý nhân viên: ${coSchemaQuanLyNhanVien ? "đã sẵn sàng" : "chưa có đủ schema"}`);
      console.log(
        `Schema database: ${coSoDuLieuDungTenViet ? "định danh tiếng Việt" : "định danh hiện có"}`,
      );
    } finally {
      connection.release();
    }

    const server = app.listen(PORT, async () => {
      console.log(`Backend Ánh Nguyệt đang chạy tại port ${PORT}`);
      try {
        const [healthResponse, productsResponse] = await Promise.all([
          fetch(`http://127.0.0.1:${PORT}/api/health`),
          fetch(`http://127.0.0.1:${PORT}/api/products`),
        ]);
        const [health, products] = await Promise.all([
          healthResponse.json(),
          productsResponse.json(),
        ]);

        if (
          !healthResponse.ok ||
          health.success !== true ||
          health.database !== "connected" ||
          health.databaseName !== DATABASE_NAME
        ) {
          throw new Error(`Health API không xác nhận database ${DATABASE_NAME}`);
        }
        if (
          !productsResponse.ok ||
          products.success !== true ||
          !Array.isArray(products.data)
        ) {
          throw new Error("GET /api/products không trả danh sách sản phẩm hợp lệ");
        }

        console.log(
          `BACKEND_READY database=${DATABASE_NAME} port=${PORT} products=${products.data.length}`,
        );
      } catch (error) {
        console.error("Backend chưa sẵn sàng:", error.message);
        server.close(() => {
          void pool.end().finally(() => process.exit(1));
        });
      }
    });
    server.once("error", (error) => {
      console.error(`Không thể mở Backend tại cổng ${PORT}:`, error.message);
      process.exit(1);
    });
  } catch (error) {
    console.error("Không thể khởi động backend:", error.message);
    process.exit(1);
  }
}

khoiDongMayChu();
