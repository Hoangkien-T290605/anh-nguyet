const fs = require("node:fs");
const path = require("node:path");

const TEST_DATABASE = "anh_nguyet_restore_test_20261106";
process.env.DB_NAME = TEST_DATABASE;
require("dotenv").config({ quiet: true });

if (process.env.DB_NAME !== TEST_DATABASE) {
  throw new Error("Migration bị dừng vì database đích không phải database thử nghiệm đã chỉ định.");
}

const mysql = require("mysql2/promise");
const migrationPath = path.join(__dirname, "..", "migrations", "20261106_create_orders.sql");

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD,
    database: TEST_DATABASE,
    multipleStatements: true,
  });

  try {
    const [[row]] = await connection.query("SELECT DATABASE() AS database_name");
    if (row.database_name !== TEST_DATABASE) {
      throw new Error("Migration bị dừng vì xác thực database đích thất bại.");
    }
    const sql = fs.readFileSync(migrationPath, "utf8");
    await connection.query(sql);
    console.log(`Đã áp dụng migration vào ${TEST_DATABASE}.`);
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error(`Migration thất bại (${error.code || "UNKNOWN"}).`);
  process.exitCode = 1;
});
