// Migration Việt hóa được lưu trữ, không còn thuộc quy ước schema tiếng Anh.
throw new Error(
  "Migration Việt hóa đã bị vô hiệu hóa theo quy ước tên bảng/cột tiếng Anh.",
);

// Phục hồi và chuẩn hóa schema chỉ khi biến đích chỉ rõ database thử nghiệm mới.
const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");

const DATABASE_THU_NGHIEM = process.env.ANH_NGUYET_TEST_DB || "";
const THU_MUC_MIGRATION = path.join(__dirname, "..", "di_chuyen_du_lieu");
const DANH_SACH_BANG = [
  ["users", "nguoi_dung"],
  ["products", "san_pham"],
  ["user_addresses", "dia_chi_nguoi_dung"],
  ["product_reviews", "danh_gia_san_pham"],
  ["orders", "don_hang"],
  ["order_items", "chi_tiet_don_hang"],
  ["user_cart_items", "chi_tiet_gio_hang"],
];

if (
  !/^anh_nguyet_viet_hoa_test_[0-9]{8}_[a-z0-9]{2,8}$/.test(DATABASE_THU_NGHIEM)
) {
  throw new Error(
    "Hãy chỉ định tên database thử nghiệm mới bằng ANH_NGUYET_TEST_DB",
  );
}
if (
  [
    "anh_nguyet",
    "anh_nguyet_restore_test_20261106",
    "anh_nguyet_viet_hoa_test_20261107",
  ].includes(DATABASE_THU_NGHIEM)
) {
  throw new Error("Từ chối database chính hoặc database thử nghiệm cũ");
}

process.env.DB_NAME = DATABASE_THU_NGHIEM;
require("dotenv").config({ quiet: true });
process.env.DB_NAME = DATABASE_THU_NGHIEM;

const CAU_HINH_KET_NOI = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD,
  database: DATABASE_THU_NGHIEM,
  multipleStatements: true,
};

// Kiểm tra bảng có tồn tại trong đúng schema thử nghiệm hay không.
async function coBang(ketNoi, tenBang) {
  const [dong] = await ketNoi.execute(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [DATABASE_THU_NGHIEM, tenBang],
  );
  return dong.length > 0;
}

// Đọc metadata một cột để migration có thể tiếp tục an toàn.
async function layCot(ketNoi, tenBang, tenCot) {
  const [dong] = await ketNoi.execute(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [DATABASE_THU_NGHIEM, tenBang, tenCot],
  );
  return dong[0] || null;
}

// Đọc cấu trúc index hiện tại trước khi đổi tên.
async function layIndex(ketNoi, tenBang, tenIndex) {
  const [dong] = await ketNoi.execute(
    `SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?
     ORDER BY SEQ_IN_INDEX`,
    [DATABASE_THU_NGHIEM, tenBang, tenIndex],
  );
  return dong;
}

// Đọc nội dung migration từ thư mục của dự án.
function docCauLenh(tenTep) {
  return fs.readFileSync(path.join(THU_MUC_MIGRATION, tenTep), "utf8");
}

// Đếm bản ghi để so sánh dữ liệu trước và sau migration.
async function demBanGhi(ketNoi, tenBang) {
  const [dong] = await ketNoi.query(
    `SELECT COUNT(*) AS tong FROM \`${tenBang}\``,
  );
  return Number(dong[0].tong);
}

// Tạo hoặc xác nhận cấu trúc nền cho đơn hàng và chi tiết đơn.
async function damBaoBangDonHang(ketNoi) {
  const coBangDon = await coBang(ketNoi, "orders");
  const coBangChiTiet = await coBang(ketNoi, "order_items");
  if (!coBangDon || !coBangChiTiet) {
    await ketNoi.query(docCauLenh("20261106_tao_don_hang.sql"));
  }
  if (
    !(await coBang(ketNoi, "orders")) ||
    !(await coBang(ketNoi, "order_items"))
  ) {
    throw new Error("Không tạo đủ bảng đơn hàng nền tảng");
  }
}

// Chỉ thêm cột khi chưa có; nếu đã tồn tại thì xác nhận định nghĩa khớp.
async function themHoacXacNhanCot(ketNoi, tenBang, tenCot, kieuCot, cauLenh) {
  const cot = await layCot(ketNoi, tenBang, tenCot);
  if (cot) {
    if (cot.COLUMN_TYPE !== kieuCot || cot.IS_NULLABLE !== "YES") {
      throw new Error(
        `Cột ${tenBang}.${tenCot} đã tồn tại nhưng khác định nghĩa`,
      );
    }
    return;
  }
  await ketNoi.query(cauLenh);
  const cotSauKhiThem = await layCot(ketNoi, tenBang, tenCot);
  if (
    !cotSauKhiThem ||
    cotSauKhiThem.COLUMN_TYPE !== kieuCot ||
    cotSauKhiThem.IS_NULLABLE !== "YES"
  ) {
    throw new Error(`Không xác minh được cột ${tenBang}.${tenCot}`);
  }
}

// Bổ sung cấu trúc đơn hàng/giỏ hàng còn thiếu theo schema đã kiểm tra.
async function damBaoMigrationGioHangVaDonHang(ketNoi) {
  let cotKhach = await layCot(ketNoi, "orders", "customer_id");
  if (!cotKhach)
    throw new Error("Thiếu orders.customer_id; dừng trước khi nâng schema");
  if (cotKhach.IS_NULLABLE !== "YES") {
    await ketNoi.query("ALTER TABLE orders MODIFY COLUMN customer_id INT NULL");
  }

  await themHoacXacNhanCot(
    ketNoi,
    "orders",
    "idempotency_key",
    "char(36)",
    "ALTER TABLE orders ADD COLUMN idempotency_key CHAR(36) NULL",
  );
  await themHoacXacNhanCot(
    ketNoi,
    "orders",
    "request_fingerprint",
    "char(64)",
    "ALTER TABLE orders ADD COLUMN request_fingerprint CHAR(64) NULL",
  );

  const indexIdempotency = await layIndex(
    ketNoi,
    "orders",
    "uq_orders_idempotency_key",
  );
  if (!indexIdempotency.length) {
    await ketNoi.query(
      "ALTER TABLE orders ADD UNIQUE KEY uq_orders_idempotency_key (idempotency_key)",
    );
  } else if (
    indexIdempotency.length !== 1 ||
    Number(indexIdempotency[0].NON_UNIQUE) !== 0 ||
    indexIdempotency[0].COLUMN_NAME !== "idempotency_key"
  ) {
    throw new Error(
      "Index uq_orders_idempotency_key đã tồn tại nhưng không đúng định nghĩa",
    );
  }

  const vaiTro = await layCot(ketNoi, "users", "role");
  if (!vaiTro) {
    await ketNoi.query(
      "ALTER TABLE users ADD COLUMN role ENUM('customer', 'admin') NOT NULL DEFAULT 'customer'",
    );
  } else if (
    vaiTro.COLUMN_TYPE !== "enum('customer','admin')" ||
    String(vaiTro.COLUMN_DEFAULT).replaceAll("'", "") !== "customer" ||
    vaiTro.IS_NULLABLE !== "NO"
  ) {
    throw new Error("users.role đã tồn tại nhưng không đúng định nghĩa");
  }

  const coGioHang = await coBang(ketNoi, "user_cart_items");
  if (!coGioHang) {
    const sql = docCauLenh("20261107_don_khach_va_gio_hang_tai_khoan.sql");
    const cauTaoBang = sql.match(
      /CREATE TABLE IF NOT EXISTS user_cart_items \([\s\S]*?\) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;/,
    );
    if (!cauTaoBang)
      throw new Error(
        "Không tìm thấy định nghĩa bảng giỏ hàng trong migration",
      );
    await ketNoi.query(cauTaoBang[0]);
  }

  const [cartColumns] = await ketNoi.execute(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
     FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user_cart_items'`,
    [DATABASE_THU_NGHIEM],
  );
  const columnShape = new Map(
    cartColumns.map((column) => [
      column.COLUMN_NAME,
      `${column.COLUMN_TYPE}|${column.IS_NULLABLE}`,
    ]),
  );
  const expectedShape = new Map([
    ["user_id", "int|NO"],
    ["product_id", "int unsigned|NO"],
    ["quantity", "int unsigned|NO"],
    ["created_at", "timestamp|NO"],
    ["updated_at", "timestamp|NO"],
  ]);
  if (
    columnShape.size !== expectedShape.size ||
    [...expectedShape].some(([name, shape]) => columnShape.get(name) !== shape)
  ) {
    throw new Error("Bảng user_cart_items không khớp cấu trúc mong đợi");
  }

  const [cartForeignKeys] = await ketNoi.execute(
    `SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = 'user_cart_items'
       AND CONSTRAINT_NAME IN ('fk_user_cart_user','fk_user_cart_product')`,
    [DATABASE_THU_NGHIEM],
  );
  if (cartForeignKeys.length !== 2)
    throw new Error("Thiếu khóa ngoại trong user_cart_items");
  const [check] = await ketNoi.execute(
    `SELECT CONSTRAINT_NAME FROM information_schema.CHECK_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND CONSTRAINT_NAME = 'chk_user_cart_quantity'`,
    [DATABASE_THU_NGHIEM],
  );
  if (!check.length)
    throw new Error("Thiếu CHECK quantity > 0 trong user_cart_items");
}

// Đổi tên bảng theo trạng thái thực tế để có thể tiếp tục sau gián đoạn.
async function doiTenBang(ketNoi, tenCu, tenMoi) {
  const coTenCu = await coBang(ketNoi, tenCu);
  const coTenMoi = await coBang(ketNoi, tenMoi);
  if (coTenCu && !coTenMoi) {
    await ketNoi.query(`RENAME TABLE \`${tenCu}\` TO \`${tenMoi}\``);
  } else if (coTenCu === coTenMoi) {
    throw new Error(
      `Trạng thái đổi tên bảng không rõ ràng: ${tenCu} / ${tenMoi}`,
    );
  }
}

// Đổi tên cột và xác nhận kết quả trong schema đích.
async function doiTenCot(ketNoi, tenBang, tenCu, tenMoi) {
  const cotCu = await layCot(ketNoi, tenBang, tenCu);
  const cotMoi = await layCot(ketNoi, tenBang, tenMoi);
  if (cotCu && !cotMoi) {
    await ketNoi.query(
      `ALTER TABLE \`${tenBang}\` RENAME COLUMN \`${tenCu}\` TO \`${tenMoi}\``,
    );
  } else if (cotCu === cotMoi) {
    throw new Error(
      `Trạng thái đổi tên cột không rõ ràng: ${tenBang}.${tenCu} / ${tenMoi}`,
    );
  }
}

// Đổi tên index nếu tên cũ còn tồn tại và tên mới chưa được dùng.
async function doiTenIndex(ketNoi, tenBang, tenCu, tenMoi) {
  const indexCu = await layIndex(ketNoi, tenBang, tenCu);
  const indexMoi = await layIndex(ketNoi, tenBang, tenMoi);
  if (indexCu.length && !indexMoi.length) {
    await ketNoi.query(
      `ALTER TABLE \`${tenBang}\` RENAME INDEX \`${tenCu}\` TO \`${tenMoi}\``,
    );
  } else if (Boolean(indexCu.length) === Boolean(indexMoi.length)) {
    throw new Error(
      `Trạng thái đổi tên index không rõ ràng: ${tenBang}.${tenCu} / ${tenMoi}`,
    );
  }
}

// Kiểm tra CHECK constraint trước khi migration tạo lại ràng buộc.
async function coRangBuocKiemTra(ketNoi, tenRangBuoc) {
  const [dong] = await ketNoi.execute(
    `SELECT CONSTRAINT_NAME FROM information_schema.CHECK_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND CONSTRAINT_NAME = ?`,
    [DATABASE_THU_NGHIEM, tenRangBuoc],
  );
  return dong.length > 0;
}

// Đọc danh sách đổi tên từ migration để xử lý tiếp tục có kiểm soát.
function phanTichMigrationDoiTen(sql) {
  const blockBang = sql.match(/RENAME TABLE([\s\S]*?);/);
  if (!blockBang) throw new Error("Migration thiếu danh sách đổi tên bảng");
  const bang = [...blockBang[1].matchAll(/([a-z_]+)\s+TO\s+([a-z_]+)/g)];
  const cot = [];
  const index = [];
  for (const match of sql.matchAll(/ALTER TABLE\s+([a-z_]+)([\s\S]*?);/g)) {
    const tenBang = match[1];
    for (const columnMatch of match[2].matchAll(
      /RENAME COLUMN\s+([a-z_]+)\s+TO\s+([a-z_]+)/g,
    )) {
      cot.push([tenBang, columnMatch[1], columnMatch[2]]);
    }
    for (const indexMatch of match[2].matchAll(
      /RENAME INDEX\s+([a-z_]+)\s+TO\s+([a-z_]+)/g,
    )) {
      index.push([tenBang, indexMatch[1], indexMatch[2]]);
    }
  }
  return { bang: bang.map((match) => [match[1], match[2]]), cot, index };
}

// Đếm dữ liệu theo tên bảng cũ hoặc mới tùy trạng thái migration.
async function demTheoAnhXa(ketNoi, daDoiTen) {
  const ketQua = {};
  for (const [tenCu, tenMoi] of DANH_SACH_BANG) {
    const tenBang = daDoiTen ? tenMoi : tenCu;
    if (await coBang(ketNoi, tenBang))
      ketQua[tenCu] = await demBanGhi(ketNoi, tenBang);
  }
  return ketQua;
}

// Xác nhận database đích, áp dụng migration và kiểm tra sau cùng.
async function chay() {
  const ketNoi = await mysql.createConnection(CAU_HINH_KET_NOI);
  try {
    const [[dinhDanh]] = await ketNoi.query(
      "SELECT DATABASE() AS ten_db, VERSION() AS phien_ban",
    );
    if (dinhDanh.ten_db !== DATABASE_THU_NGHIEM)
      throw new Error("Database đích không khớp; dừng migration");
    const [coBangNao] = await ketNoi.execute(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? LIMIT 1",
      [DATABASE_THU_NGHIEM],
    );
    if (!coBangNao.length)
      throw new Error(
        "Database thử nghiệm chưa được khôi phục backup; dừng migration",
      );
    const coBangVietHoa = await coBang(ketNoi, "nguoi_dung");
    const truoc = await demTheoAnhXa(ketNoi, coBangVietHoa);

    if (!coBangVietHoa) {
      await damBaoBangDonHang(ketNoi);
      await damBaoMigrationGioHangVaDonHang(ketNoi);
    }

    const truocDoiTen = await demTheoAnhXa(ketNoi, false);

    const migrationDoiTen = docCauLenh(
      "20261108_viet_hoa_dinh_danh_co_so_du_lieu.sql",
    );
    const anhXa = phanTichMigrationDoiTen(migrationDoiTen);
    for (const [tenCu, tenMoi] of anhXa.bang)
      await doiTenBang(ketNoi, tenCu, tenMoi);
    if (await coRangBuocKiemTra(ketNoi, "chk_review_rating")) {
      await ketNoi.query(
        "ALTER TABLE danh_gia_san_pham DROP CHECK chk_review_rating",
      );
    }
    if (await coRangBuocKiemTra(ketNoi, "chk_user_cart_quantity")) {
      await ketNoi.query(
        "ALTER TABLE chi_tiet_gio_hang DROP CHECK chk_user_cart_quantity",
      );
    }
    for (const [tenBang, tenCu, tenMoi] of anhXa.cot)
      await doiTenCot(ketNoi, tenBang, tenCu, tenMoi);
    if (!(await coRangBuocKiemTra(ketNoi, "ck_danh_gia_san_pham_so_sao"))) {
      await ketNoi.query(
        "ALTER TABLE danh_gia_san_pham ADD CONSTRAINT ck_danh_gia_san_pham_so_sao CHECK (so_sao BETWEEN 1 AND 5)",
      );
    }
    if (!(await coRangBuocKiemTra(ketNoi, "ck_chi_tiet_gio_hang_so_luong"))) {
      await ketNoi.query(
        "ALTER TABLE chi_tiet_gio_hang ADD CONSTRAINT ck_chi_tiet_gio_hang_so_luong CHECK (so_luong > 0)",
      );
    }
    for (const [tenBang, tenCu, tenMoi] of anhXa.index)
      await doiTenIndex(ketNoi, tenBang, tenCu, tenMoi);

    const sau = await demTheoAnhXa(ketNoi, true);
    for (const [tenBangCu, soLuong] of Object.entries(truocDoiTen)) {
      if (sau[tenBangCu] !== soLuong)
        throw new Error(`Số lượng bản ghi thay đổi trong bảng ${tenBangCu}`);
    }
    for (const tenBangMoi of ["orders", "order_items", "user_cart_items"]) {
      if (!(tenBangMoi in truocDoiTen) && sau[tenBangMoi] !== 0) {
        throw new Error(`Bảng mới ${tenBangMoi} có dữ liệu ngoài dự kiến`);
      }
    }

    const [tables] = await ketNoi.execute(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
      [DATABASE_THU_NGHIEM],
    );
    const bangThucTe = new Set(tables.map((row) => row.TABLE_NAME));
    for (const [, tenMoi] of DANH_SACH_BANG)
      if (!bangThucTe.has(tenMoi)) throw new Error(`Thiếu bảng ${tenMoi}`);
    for (const [tenCu] of DANH_SACH_BANG)
      if (bangThucTe.has(tenCu)) throw new Error(`Còn bảng tên cũ ${tenCu}`);

    const [foreignKeys] = await ketNoi.execute(
      `SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE CONSTRAINT_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [DATABASE_THU_NGHIEM],
    );
    if (foreignKeys.length !== 8)
      throw new Error(
        `Số khóa ngoại sau đổi tên không đúng: ${foreignKeys.length}`,
      );

    const [vaiTro] = await ketNoi.execute(
      `SELECT COLUMN_TYPE, COLUMN_DEFAULT, IS_NULLABLE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'nguoi_dung' AND COLUMN_NAME = 'vai_tro'`,
      [DATABASE_THU_NGHIEM],
    );
    if (
      vaiTro.length !== 1 ||
      vaiTro[0].COLUMN_TYPE !== "enum('customer','admin')" ||
      String(vaiTro[0].COLUMN_DEFAULT).replaceAll("'", "") !== "customer" ||
      vaiTro[0].IS_NULLABLE !== "NO"
    ) {
      throw new Error("Cấu trúc nguoi_dung.vai_tro không hợp lệ");
    }

    const [indexes] = await ketNoi.execute(
      `SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ? AND INDEX_NAME IN (
         'uq_nguoi_dung_email','ix_dia_chi_nguoi_dung_ma_nguoi_dung',
         'ix_danh_gia_san_pham_ma_san_pham','ix_danh_gia_san_pham_ma_san_pham_so_sao',
         'ix_don_hang_nguoi_dat_ngay_tao','ix_don_hang_trang_thai_ngay_tao',
         'ix_don_hang_ma_dia_chi','uq_don_hang_ma_yeu_cau',
         'ix_chi_tiet_don_hang_ma_don_hang','ix_chi_tiet_don_hang_ma_san_pham',
         'ix_chi_tiet_gio_hang_ma_san_pham')
       GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE`,
      [DATABASE_THU_NGHIEM],
    );
    if (indexes.length !== 11)
      throw new Error(`Số index đã Việt hóa không đúng: ${indexes.length}`);

    const [checkVietHoa] = await ketNoi.execute(
      `SELECT CONSTRAINT_NAME FROM information_schema.CHECK_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = ?
         AND CONSTRAINT_NAME IN ('ck_danh_gia_san_pham_so_sao','ck_chi_tiet_gio_hang_so_luong')`,
      [DATABASE_THU_NGHIEM],
    );
    if (checkVietHoa.length !== 2)
      throw new Error("Thiếu CHECK constraint đã Việt hóa");

    const [[donHang]] = await ketNoi.query(
      "SELECT COUNT(*) AS tong FROM don_hang",
    );
    const [[chiTietDon]] = await ketNoi.query(
      "SELECT COUNT(*) AS tong FROM chi_tiet_don_hang",
    );
    const [[chiTietGio]] = await ketNoi.query(
      "SELECT COUNT(*) AS tong FROM chi_tiet_gio_hang",
    );
    console.log(
      JSON.stringify({
        database: dinhDanh.ten_db,
        mysql: dinhDanh.phien_ban,
        record_counts_before_migrations: truoc,
        record_counts_before_rename: truocDoiTen,
        record_counts_after: sau,
        new_orders: Number(donHang.tong),
        new_order_items: Number(chiTietDon.tong),
        account_cart_items: Number(chiTietGio.tong),
        tables: [...bangThucTe].sort(),
        foreign_keys: foreignKeys.length,
        renamed_indexes: indexes.length,
        renamed_checks: checkVietHoa.length,
      }),
    );
  } finally {
    await ketNoi.end();
  }
}

chay().catch((error) => {
  console.error(`Migration thử nghiệm dừng: ${error.code || error.message}`);
  process.exitCode = 1;
});
