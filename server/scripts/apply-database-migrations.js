const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
require("../node_modules/dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});
const mysql = require("../node_modules/mysql2/promise");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const TEST_DATABASE = "anh_nguyet_customer_test_20261109_a";
const MIGRATION_DIRECTORY = path.join(PROJECT_ROOT, "database", "migrations");
const PRIVATE_BACKUP_DIRECTORY = path.join(PROJECT_ROOT, "backups");
const EXPECTED_MIGRATIONS = [
  "000_create_orders.sql",
  "001_cart_orders_integrity.sql",
  "002_cod_shipping_configuration.sql",
  "003_account_favorites_reviews.sql",
  "004_vouchers.sql",
];

function getArgument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function resolveVerifiedBackup(value) {
  if (!value) throw new Error("Pass --backup=<sanitized SQL working-copy path>.");
  const backupPath = path.resolve(PROJECT_ROOT, value);
  const relative = path.relative(PRIVATE_BACKUP_DIRECTORY, backupPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Backup must be a working copy under the ignored backups directory.");
  }
  if (!fs.existsSync(backupPath) || fs.statSync(backupPath).size < 1000) {
    throw new Error("The sanitized SQL working copy is missing or unexpectedly small.");
  }
  const sql = fs.readFileSync(backupPath, "utf8");
  const useTargets = [...sql.matchAll(/^\s*USE\s+`?([^`;\s]+)`?\s*;/gim)].map(
    (match) => match[1],
  );
  if (useTargets.length !== 1 || useTargets.some((name) => name !== TEST_DATABASE)) {
    throw new Error("Backup contains a USE target other than the approved test database.");
  }
  if (/^\s*(CREATE|DROP)\s+DATABASE\b/im.test(sql)) {
    throw new Error("Backup must not create or drop databases.");
  }
  return backupPath;
}

async function verifyBaseSchema(connection) {
  const [rows] = await connection.execute(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN ('users', 'products', 'user_addresses', 'product_reviews')`,
  );
  const present = new Set(rows.map((row) => row.TABLE_NAME));
  const missing = ["users", "products", "user_addresses", "product_reviews"].filter(
    (table) => !present.has(table),
  );
  if (missing.length) {
    throw new Error(`Base schema is incomplete; missing tables: ${missing.join(", " )}. No migration was run.`);
  }
}

async function verifyFinalSchema(connection) {
  const requiredColumns = {
    users: ["role"],
    orders: ["customer_id", "idempotency_key", "request_fingerprint", "payment_method", "payment_status"],
    user_cart_items: ["user_id", "product_id", "quantity"],
    product_reviews: ["customer_id", "is_visible"],
    shipping_configuration: ["flat_fee"],
    user_favorites: ["user_id", "product_id", "created_at"],
  };
  for (const [table, expected] of Object.entries(requiredColumns)) {
    const [rows] = await connection.execute(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table],
    );
    const present = new Set(rows.map((row) => row.COLUMN_NAME));
    const missing = expected.filter((column) => !present.has(column));
    if (missing.length) {
      throw new Error(`Post-migration check failed for ${table}; missing: ${missing.join(", ")}.`);
    }
  }

  const [[cartForeignKey]] = await connection.execute(
    `SELECT rc.DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS rc
     INNER JOIN information_schema.KEY_COLUMN_USAGE kcu
       ON kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
      AND kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
      AND kcu.TABLE_NAME = rc.TABLE_NAME
     WHERE rc.CONSTRAINT_SCHEMA = DATABASE()
       AND rc.TABLE_NAME = 'user_cart_items' AND kcu.COLUMN_NAME = 'product_id'
       AND kcu.REFERENCED_TABLE_NAME = 'products'`,
  );
  if (cartForeignKey?.DELETE_RULE !== "RESTRICT") {
    throw new Error("Post-migration check failed: user_cart_items.product_id must retain ON DELETE RESTRICT.");
  }

  const [favoriteForeignKeys] = await connection.execute(
    `SELECT kcu.COLUMN_NAME, kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME,
            rc.DELETE_RULE
     FROM information_schema.KEY_COLUMN_USAGE kcu
     INNER JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
       ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
      AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
      AND rc.TABLE_NAME = kcu.TABLE_NAME
     WHERE kcu.CONSTRAINT_SCHEMA = DATABASE() AND kcu.TABLE_NAME = 'user_favorites'
       AND kcu.REFERENCED_TABLE_NAME IS NOT NULL`,
  );
  const favoriteUserForeignKey = favoriteForeignKeys.find(
    (row) => row.COLUMN_NAME === "user_id",
  );
  const favoriteProductForeignKey = favoriteForeignKeys.find(
    (row) => row.COLUMN_NAME === "product_id",
  );
  if (
    favoriteUserForeignKey?.REFERENCED_TABLE_NAME !== "users" ||
    favoriteUserForeignKey?.REFERENCED_COLUMN_NAME !== "id" ||
    favoriteUserForeignKey?.DELETE_RULE !== "CASCADE" ||
    favoriteProductForeignKey?.REFERENCED_TABLE_NAME !== "products" ||
    favoriteProductForeignKey?.REFERENCED_COLUMN_NAME !== "id" ||
    favoriteProductForeignKey?.DELETE_RULE !== "CASCADE"
  ) {
    throw new Error("Post-migration check failed: favorite foreign keys do not match the expected structure.");
  }

  const [reviewIndexes] = await connection.execute(
    `SELECT INDEX_NAME, SEQ_IN_INDEX, COLUMN_NAME, NON_UNIQUE
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_reviews'
       AND INDEX_NAME IN ('uq_product_reviews_customer_product', 'idx_product_reviews_visible_created')
     ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
  );
  const grouped = new Map();
  for (const row of reviewIndexes) {
    const list = grouped.get(row.INDEX_NAME) || [];
    list.push(row);
    grouped.set(row.INDEX_NAME, list);
  }
  const uniqueReviewIndex = grouped.get("uq_product_reviews_customer_product") || [];
  const visibleReviewIndex = grouped.get("idx_product_reviews_visible_created") || [];
  if (
    uniqueReviewIndex.length !== 2 ||
    uniqueReviewIndex[0].COLUMN_NAME !== "customer_id" ||
    uniqueReviewIndex[1].COLUMN_NAME !== "product_id" ||
    uniqueReviewIndex.some((row) => Number(row.NON_UNIQUE) !== 0) ||
    visibleReviewIndex.length !== 2 ||
    visibleReviewIndex[0].COLUMN_NAME !== "is_visible" ||
    visibleReviewIndex[1].COLUMN_NAME !== "created_at"
  ) {
    throw new Error("Post-migration check failed: review indexes do not match the expected structure.");
  }

  const [[reviewCustomerColumn]] = await connection.execute(
    `SELECT COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_reviews'
       AND COLUMN_NAME = 'customer_id'`,
  );
  const [[reviewVisibilityColumn]] = await connection.execute(
    `SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_reviews'
       AND COLUMN_NAME = 'is_visible'`,
  );
  const [[reviewCustomerForeignKey]] = await connection.execute(
    `SELECT kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME, rc.DELETE_RULE
     FROM information_schema.KEY_COLUMN_USAGE kcu
     INNER JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
       ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
      AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
      AND rc.TABLE_NAME = kcu.TABLE_NAME
     WHERE kcu.CONSTRAINT_SCHEMA = DATABASE() AND kcu.TABLE_NAME = 'product_reviews'
       AND kcu.CONSTRAINT_NAME = 'fk_product_reviews_customer'
       AND kcu.COLUMN_NAME = 'customer_id'`,
  );
  if (
    reviewCustomerColumn?.COLUMN_TYPE !== "int" ||
    reviewCustomerColumn?.IS_NULLABLE !== "YES" ||
    reviewVisibilityColumn?.COLUMN_TYPE !== "tinyint(1)" ||
    reviewVisibilityColumn?.IS_NULLABLE !== "NO" ||
    Number(reviewVisibilityColumn?.COLUMN_DEFAULT) !== 1 ||
    reviewCustomerForeignKey?.REFERENCED_TABLE_NAME !== "users" ||
    reviewCustomerForeignKey?.REFERENCED_COLUMN_NAME !== "id" ||
    reviewCustomerForeignKey?.DELETE_RULE !== "SET NULL"
  ) {
    throw new Error("Post-migration check failed: account-review columns or foreign key do not match.");
  }
}

async function captureSchema(connection) {
  const [tables] = await connection.execute(
    `SELECT TABLE_NAME, ENGINE, TABLE_COLLATION
     FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
     ORDER BY TABLE_NAME`,
  );
  const [columns] = await connection.execute(
    `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
     FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
     ORDER BY TABLE_NAME, ORDINAL_POSITION`,
  );
  const [indexes] = await connection.execute(
    `SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
     FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
     ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
  );
  const [foreignKeys] = await connection.execute(
    `SELECT kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, kcu.COLUMN_NAME,
            kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME, rc.DELETE_RULE
     FROM information_schema.KEY_COLUMN_USAGE kcu
     INNER JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
       ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
      AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
      AND rc.TABLE_NAME = kcu.TABLE_NAME
     WHERE kcu.CONSTRAINT_SCHEMA = DATABASE()
       AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
     ORDER BY kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION`,
  );
  const [checks] = await connection.execute(
    `SELECT tc.TABLE_NAME, tc.CONSTRAINT_NAME, cc.CHECK_CLAUSE
     FROM information_schema.TABLE_CONSTRAINTS tc
     INNER JOIN information_schema.CHECK_CONSTRAINTS cc
       ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
      AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
     WHERE tc.CONSTRAINT_SCHEMA = DATABASE() AND tc.CONSTRAINT_TYPE = 'CHECK'
     ORDER BY tc.TABLE_NAME, tc.CONSTRAINT_NAME`,
  );
  const snapshot = { tables, columns, indexes, foreignKeys, checks };
  return {
    snapshot,
    fingerprint: crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
    summary: {
      tables: tables.map((row) => row.TABLE_NAME),
      column_count: columns.length,
      index_count: indexes.length,
      foreign_keys: foreignKeys.map(
        (row) => `${row.TABLE_NAME}.${row.CONSTRAINT_NAME}:${row.COLUMN_NAME}->${row.REFERENCED_TABLE_NAME}.${row.REFERENCED_COLUMN_NAME}/${row.DELETE_RULE}`,
      ),
      checks: checks.map((row) => `${row.TABLE_NAME}.${row.CONSTRAINT_NAME}`),
    },
  };
}

async function assertColumn(connection, table, column, expected) {
  const [[actual]] = await connection.execute(
    `SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  if (!actual) throw new Error(`Schema check failed: ${table}.${column} is missing.`);
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) {
      throw new Error(`Schema check failed: ${table}.${column} has unexpected ${key}.`);
    }
  }
}

async function assertMigrationResult(connection, version, previousShippingFee) {
  if (version === "000") {
    for (const table of ["orders", "order_items"]) {
      const [[row]] = await connection.execute(
        `SELECT COUNT(*) AS present FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [table],
      );
      if (Number(row.present) !== 1) throw new Error(`Migration 000 did not create ${table}.`);
    }
    await assertColumn(connection, "orders", "id", { COLUMN_TYPE: "bigint unsigned", IS_NULLABLE: "NO" });
    await assertColumn(connection, "order_items", "order_id", { COLUMN_TYPE: "bigint unsigned", IS_NULLABLE: "NO" });
  } else if (version === "001") {
    await assertColumn(connection, "users", "role", { IS_NULLABLE: "NO", COLUMN_DEFAULT: "customer" });
    await assertColumn(connection, "orders", "customer_id", { COLUMN_TYPE: "int", IS_NULLABLE: "YES" });
    for (const column of ["idempotency_key", "request_fingerprint"]) {
      await assertColumn(connection, "orders", column, {});
    }
    const [[fk]] = await connection.execute(
      `SELECT rc.DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS rc
       INNER JOIN information_schema.KEY_COLUMN_USAGE kcu
         ON kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
        AND kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
        AND kcu.TABLE_NAME = rc.TABLE_NAME
       WHERE rc.CONSTRAINT_SCHEMA = DATABASE() AND rc.TABLE_NAME = 'user_cart_items'
         AND kcu.COLUMN_NAME = 'product_id' AND kcu.REFERENCED_TABLE_NAME = 'products'`,
    );
    if (fk?.DELETE_RULE !== "RESTRICT") {
      throw new Error("Migration 001 must preserve user_cart_items.product_id ON DELETE RESTRICT.");
    }
  } else if (version === "002") {
    await assertColumn(connection, "orders", "payment_method", {});
    await assertColumn(connection, "orders", "payment_status", {});
    const [feeRows] = await connection.execute(
      "SELECT flat_fee FROM shipping_configuration WHERE id = 1",
    );
    const fee = feeRows.length ? feeRows[0].flat_fee : undefined;
    if (previousShippingFee === undefined ? fee !== null : fee !== previousShippingFee) {
      throw new Error("Migration 002 changed or failed to preserve the configured shipping fee.");
    }
  } else if (version === "003") {
    await verifyFinalSchema(connection);
  } else if (version === "004") {
    for (const [table, columns] of Object.entries({
      vouchers: ["code", "campaign_name", "discount_type", "discount_value", "minimum_subtotal", "maximum_discount", "quantity_limit", "used_count", "starts_at", "ends_at", "is_active"],
      orders: ["voucher_id", "voucher_code", "voucher_campaign_name", "voucher_discount_type", "voucher_discount_value", "discount_amount"],
      voucher_redemptions: ["voucher_id", "order_id", "customer_id", "voucher_code_snapshot", "discount_amount"],
    })) {
      const [rows] = await connection.execute(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [table],
      );
      const found = new Set(rows.map((row) => row.COLUMN_NAME));
      const missing = columns.filter((column) => !found.has(column));
      if (missing.length) throw new Error(`Migration 004 verification failed for ${table}; missing: ${missing.join(", ")}.`);
    }
    const [orderIndex] = await connection.execute(
      `SELECT COLUMN_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'voucher_redemptions'
         AND INDEX_NAME = 'uq_voucher_redemptions_order' AND NON_UNIQUE = 0`,
    );
    if (orderIndex.length !== 1 || orderIndex[0].COLUMN_NAME !== "order_id") {
      throw new Error("Migration 004 verification failed: each order must have at most one voucher redemption.");
    }
    const [foreignKeys] = await connection.execute(
      `SELECT kcu.TABLE_NAME, kcu.COLUMN_NAME, kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME, rc.DELETE_RULE
       FROM information_schema.KEY_COLUMN_USAGE kcu
       INNER JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
         ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
        AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        AND rc.TABLE_NAME = kcu.TABLE_NAME
       WHERE kcu.CONSTRAINT_SCHEMA = DATABASE() AND kcu.CONSTRAINT_NAME IN
         ('fk_orders_voucher', 'fk_voucher_redemptions_voucher', 'fk_voucher_redemptions_order', 'fk_voucher_redemptions_customer')`,
    );
    if (foreignKeys.length !== 4) throw new Error("Migration 004 verification failed: one or more voucher foreign keys are missing.");
  }
}

async function readShippingFee(connection) {
  const [[table]] = await connection.execute(
    `SELECT COUNT(*) AS present FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipping_configuration'`,
  );
  if (Number(table.present) === 0) return undefined;
  const [rows] = await connection.execute(
    "SELECT flat_fee FROM shipping_configuration WHERE id = 1",
  );
  return rows.length ? rows[0].flat_fee : null;
}

async function main() {
  const requestedDatabase = getArgument("database");
  if (requestedDatabase !== TEST_DATABASE || requestedDatabase === "anh_nguyet") {
    throw new Error(`Refusing migration. The only allowed target is ${TEST_DATABASE}.`);
  }

  const backupPath = resolveVerifiedBackup(getArgument("backup"));
  const requestedMigration = getArgument("migration");
  if (!requestedMigration || !/^00[0-4]$/.test(requestedMigration)) {
    throw new Error("Pass --migration=000, 001, 002, 003 or 004; migrations run one at a time for verification.");
  }
  if (!fs.existsSync(MIGRATION_DIRECTORY)) {
    throw new Error("Canonical migration directory is missing.");
  }
  const migrationFiles = fs
    .readdirSync(MIGRATION_DIRECTORY)
    .filter((file) => /^\d{3}_.+\.sql$/.test(file))
    .sort();
  if (JSON.stringify(migrationFiles) !== JSON.stringify(EXPECTED_MIGRATIONS)) {
    throw new Error("Canonical migration directory differs from the approved 000–004 sequence.");
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD,
    database: requestedDatabase,
    multipleStatements: true,
  });

  try {
    const [[identity]] = await connection.query("SELECT DATABASE() AS database_name");
    if (identity.database_name !== TEST_DATABASE) {
      throw new Error("Connected schema did not match the approved test database; no DDL was run.");
    }

    console.log(`Verified target: ${identity.database_name}`);
    console.log(`Verified working backup: ${path.relative(PROJECT_ROOT, backupPath)}`);
    await verifyBaseSchema(connection);

    const [[ledger]] = await connection.execute(
      `SELECT COUNT(*) AS present FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schema_migrations'`,
    );
    if (Number(ledger.present) === 0) {
      await connection.query(`
        CREATE TABLE schema_migrations (
          version VARCHAR(100) NOT NULL PRIMARY KEY,
          name VARCHAR(200) NOT NULL,
          checksum CHAR(64) NOT NULL,
          applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      `);
      console.log("Migration ledger initialized in the verified test database.");
    }

    const targetFile = EXPECTED_MIGRATIONS.find((file) => file.startsWith(`${requestedMigration}_`));
    const sql = fs.readFileSync(path.join(MIGRATION_DIRECTORY, targetFile), "utf8");
    const checksum = crypto.createHash("sha256").update(sql).digest("hex");
    const [rows] = await connection.execute(
      "SELECT checksum FROM schema_migrations WHERE version = ?",
      [requestedMigration],
    );
    if (rows.length) {
      if (rows[0].checksum !== checksum) {
        throw new Error(`Applied migration ${requestedMigration} has a different checksum; stopped.`);
      }
      await assertMigrationResult(connection, requestedMigration, await readShippingFee(connection));
      console.log(`${requestedMigration}: already applied; schema checks passed.`);
      return;
    }

    const requiredPrevious = EXPECTED_MIGRATIONS
      .filter((file) => Number(file.slice(0, 3)) < Number(requestedMigration))
      .map((file) => file.slice(0, 3));
    for (const previous of requiredPrevious) {
      const [previousRows] = await connection.execute(
        "SELECT version FROM schema_migrations WHERE version = ?",
        [previous],
      );
      if (!previousRows.length) {
        throw new Error(`Migration ${requestedMigration} requires ${previous} to be recorded first.`);
      }
    }

    const before = await captureSchema(connection);
    const previousShippingFee = await readShippingFee(connection);
    console.log(`${requestedMigration} schema before: ${JSON.stringify(before.summary)}; sha256=${before.fingerprint}`);
    console.log(`${requestedMigration}: applying ${targetFile}`);
    await connection.query(sql);
    await assertMigrationResult(connection, requestedMigration, previousShippingFee);
    const after = await captureSchema(connection);
    console.log(`${requestedMigration} schema after: ${JSON.stringify(after.summary)}; sha256=${after.fingerprint}`);
    await connection.execute(
      "INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)",
      [requestedMigration, targetFile, checksum],
    );
    console.log(`${requestedMigration}: applied and verified.`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`Migration stopped: ${error.code || error.message}`);
  process.exitCode = 1;
});
