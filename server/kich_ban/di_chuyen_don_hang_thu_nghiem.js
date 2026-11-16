const fs = require("node:fs");
throw new Error(
  "Migration script đã lưu trữ và bị vô hiệu hóa. Hãy dùng server/scripts/apply-database-migrations.js trên database thử nghiệm được cho phép.",
);

const path = require("node:path");

const CSDL_THU_NGHIEM = "anh_nguyet_restore_test_20261106";
process.env.DB_NAME = CSDL_THU_NGHIEM;
require("dotenv").config({ quiet: true });

if (process.env.DB_NAME !== CSDL_THU_NGHIEM) {
  throw new Error(
    "Migration bị dừng vì database đích không phải database thử nghiệm đã chỉ định.",
  );
}

// Kiểm tra và áp dụng cấu trúc đơn hàng chỉ trên database thử nghiệm được chỉ định.
const mysql = require("mysql2/promise");
const duongDanMigration = path.join(
  __dirname,
  "..",
  "di_chuyen_du_lieu",
  "20261106_tao_don_hang.sql",
);

// Kết nối đúng database thử nghiệm, áp dụng migration và đóng kết nối sau cùng.
async function chayMigration() {
  const ketNoiThuNghiem = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD,
    database: CSDL_THU_NGHIEM,
    multipleStatements: true,
  });

  try {
    const [[row]] = await ketNoiThuNghiem.query(
      "SELECT DATABASE() AS database_name",
    );
    if (row.database_name !== CSDL_THU_NGHIEM) {
      throw new Error("Migration bị dừng vì xác thực database đích thất bại.");
    }
    const sql = fs.readFileSync(duongDanMigration, "utf8");
    await ketNoiThuNghiem.query(sql);
    console.log(`Đã áp dụng migration vào ${CSDL_THU_NGHIEM}.`);
  } finally {
    await ketNoiThuNghiem.end();
  }
}

chayMigration().catch((error) => {
  console.error(`Migration thất bại (${error.code || "UNKNOWN"}).`);
  process.exitCode = 1;
});
