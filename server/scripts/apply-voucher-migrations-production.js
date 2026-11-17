const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const mysql = require("../node_modules/mysql2/promise");
require("../node_modules/dotenv").config({
  path: path.join(__dirname, "..", ".env"),
  quiet: true,
});

const ROOT = path.resolve(__dirname, "..", "..");
const MIGRATIONS = path.join(ROOT, "database", "migrations");
const BACKUPS = path.join(ROOT, "database", "backups");
const TEST_ARTIFACTS = path.join(__dirname, "..", ".test-artifacts", "voucher-migrations");
const PRODUCTION_DATABASE = "anh_nguyet";
const TRUSTED_SERVERS_PATH = path.join(__dirname, "voucher-migration-trusted-servers.json");
const TEST_DATABASE_PATTERN = /^anh_nguyet_voucher_migration_test_\d{8}_[a-z0-9]+(?:_[a-z0-9]+)*$/;
const VOUCHER_MIGRATIONS = new Map([
  ["004", "004_vouchers.sql"],
  ["005", "005_admin_categories_inventory.sql"],
  ["006", "006_voucher_redemption_lifecycle.sql"],
  ["007", "007_voucher_metadata_limits.sql"],
  ["008", "008_product_image_gallery.sql"],
  ["010", "010_product_details_json.sql"],
  ["011", "011_official_vouchers.sql"],
  // 009 bị lệch checksum đã ghim; không thực thi lại lịch sử. Dùng migration mới 012.
  ["012", "012_shipping_regions_replacement.sql"],
  ["013", "013_align_official_voucher_utc_window.sql"],
  ["014", "014_employee_roles_and_accounts.sql"],
]);
const APPROVED_MIGRATION_CHECKSUMS = new Map([
  ["000", "b78daeece6620f8c398e8770eec6d7ad91a60e4d10a19a2c246ff37716cb2c23"],
  ["001", "804e98f4767d85a6549e403fd8fb11938bc87925d9bb7e825262c6ba6a2916bb"],
  ["002", "16bf987241fb46bae8df3bfd043feb85db09db0ff02f90d8e472d400e3eae885"],
  ["003", "ced9db01ae5061d92192d5931646336c5b4089f95019cc62ce95eadc44a6a1b1"],
  ["004", "4db29d799a77a99c50aef4da1bd15012df20ba0589fc6b4d40327cbc3eb96aca"],
  ["005", "0beac919bd7d9382b6d06a89def630c72286a65286b75f6933c2fb8527bbc40b"],
  ["006", "8bb0475b1ecc5a83691a98306c45b28894cb4df3e9293405f4b2722cccd70339"],
  ["007", "2f7789ca3c35099dc95ce91985a8d4493d94e9f34ab378bbf7d80854822a7c8e"],
  ["008", "64b9a1b7ad843cf1b070d56c4d73650cb2bb4130f113f5f9af868efc7999efcc"],
  ["009", "9eaf12129e58d23c06d9931a73212008c725005c96ec8833b79fc53c1227fcb5"],
  ["010", "6230307e0d4662202449c7fa3d31c7832c57648f730a7e997fc6e049f71a2969"],
  ["011", "b2a0142306dee0a751c5ad91a3f62766ae72786d91c728acb5e65bbcd88d3822"],
  ["012", "73593653ba7701271306b029063ac94ae37fa7220994061f3c8cd37b931eb393"],
  ["013", "99884e615f393298afea4738a602eb87016034a683a329b76bac21304f2db038"],
  ["014", "3642c1680bfee7ad7724f6e5f237c193bcf57de2d94b96cb31e5bd94ee04f52a"],
]);
const MIGRATION_DEPENDENCIES = new Map([
  ["004", []],
  ["005", []],
  ["006", ["004"]],
  ["007", ["004", "006"]],
  ["008", []],
  ["010", []],
  ["011", ["004", "006", "007"]],
  ["012", []],
  ["013", ["011"]],
  ["014", []],
]);
const BASELINE_KEY = "orders_000_contract_v1";
const RECONCILE_APPROVALS = new Map([["005", "I_APPROVE_RECONCILE_005"]]);
const INITIAL_INVENTORY_NOTE = "Ảnh chụp tồn đầu kỳ khi triển khai quản lý kho";

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

function fail(message) {
  throw new Error(message);
}

function checksum(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function checksumMatches(recorded, source) {
  return recorded === checksum(source);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  if (value instanceof Date) return JSON.stringify({ $date: value.toISOString() });
  if (Buffer.isBuffer(value)) return JSON.stringify({ $buffer: value.toString("base64") });
  return JSON.stringify(value);
}

function evidenceKey() {
  const key = process.env.VOUCHER_MIGRATION_EVIDENCE_KEY;
  if (typeof key !== "string" || Buffer.byteLength(key, "utf8") < 32) {
    fail("Thiếu VOUCHER_MIGRATION_EVIDENCE_KEY (tối thiểu 32 byte); từ chối tạo hoặc xác minh bằng chứng.");
  }
  return key;
}

function signEvidence(value) {
  return crypto.createHmac("sha256", evidenceKey()).update(stableJson(value)).digest("hex");
}

function trustedServerFor(mode) {
  let policy;
  try { policy = JSON.parse(fs.readFileSync(TRUSTED_SERVERS_PATH, "utf8")); }
  catch { fail("Không đọc được allowlist server migration; từ chối kết nối."); }
  const entry = policy?.[mode];
  if (!entry || typeof entry.host !== "string" || !Number.isInteger(entry.port) || !/^[0-9a-f-]{36}$/i.test(entry.serverUuid || "")) {
    fail(`Chưa có server identity được phê duyệt cho chế độ ${mode}; từ chối thực thi.`);
  }
  return entry;
}

function assertTrustedIdentity(configured, actual, mode) {
  const approved = trustedServerFor(mode);
  if (configured.host !== approved.host || configured.port !== approved.port ||
      actual.port !== approved.port || String(actual.server_uuid).toLowerCase() !== approved.serverUuid.toLowerCase()) {
    fail(`MySQL server identity không khớp allowlist ${mode}; từ chối thực thi.`);
  }
  return { host: approved.host, port: approved.port, serverUuid: approved.serverUuid.toLowerCase() };
}

async function verifyConnectionIdentity(connection, mode) {
  const configured = { host: process.env.DB_HOST || "localhost", port: Number(process.env.DB_PORT) || 3306 };
  if (!Number.isInteger(configured.port) || configured.port < 1 || configured.port > 65535) fail("DB_PORT không hợp lệ.");
  const [[actual]] = await connection.query("SELECT DATABASE() AS database_name, @@server_uuid AS server_uuid, @@port AS port");
  return { ...assertTrustedIdentity(configured, actual, mode), database: actual.database_name };
}

async function acquireMigrationLock(connection, database) {
  const lockName = `anhnguyet:voucher-migration:${checksum(database).slice(0, 32)}`;
  const [[row]] = await connection.execute("SELECT GET_LOCK(?, 0) AS acquired", [lockName]);
  if (Number(row.acquired) !== 1) fail("Đang có runner migration khác giữ khóa; tiến trình này dừng mà không chạy DDL.");
  return lockName;
}

async function releaseMigrationLock(connection, lockName) {
  if (!lockName) return;
  const [[row]] = await connection.execute("SELECT RELEASE_LOCK(?) AS released", [lockName]);
  if (Number(row.released) !== 1) fail("Không xác minh được việc giải phóng advisory lock; cần kiểm tra kết nối thủ công.");
}

function assertChecksum(recorded, source, label) {
  if (!checksumMatches(recorded, source)) fail(`${label}: checksum không khớp.`);
}

function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    if (lineComment) {
      if (char === "\n") {
        lineComment = false;
        current += "\n";
      }
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      current += char;
      if (char === "\\" && next) {
        current += next;
        index += 1;
      } else if (char === quote && next === quote) {
        current += next;
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "-" && next === "-") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) statements.push(current.trim());
  if (quote || blockComment) fail("SQL migration chứa chuỗi hoặc comment chưa đóng.");
  return statements;
}

function validateRestoreStatements(statements, sourceDatabase) {
  let useCount = 0;
  let tableCount = 0;
  const identifier = "(?:`[A-Za-z0-9_]+`|[A-Za-z0-9_]+)";
  for (const statement of statements) {
    const use = statement.match(/^USE\s+`?([A-Za-z0-9_]+)`?$/i);
    if (use) {
      useCount += 1;
      if (use[1] !== sourceDatabase) fail("Backup USE không khớp nguồn đã xác minh.");
      continue;
    }
    if (/^SET\s+NAMES\s+[A-Za-z0-9_]+(?:\s+COLLATE\s+[A-Za-z0-9_]+)?$/i.test(statement) ||
        /^SET\s+(?:FOREIGN_KEY_CHECKS|UNIQUE_CHECKS|SQL_NOTES)\s*=\s*[01]$/i.test(statement) ||
        /^SET\s+(?:CHARACTER_SET_CLIENT|CHARACTER_SET_RESULTS|COLLATION_CONNECTION|TIME_ZONE|SQL_MODE)\s*=\s*(?:NULL|'[^']*'|"[^"]*"|[A-Za-z0-9_+.-]+)$/i.test(statement) ||
        /^SET\s+@OLD_[A-Za-z0-9_]+\s*=\s*@@[A-Za-z0-9_]+(?:\s*,\s*(?:CHARACTER_SET_CLIENT|CHARACTER_SET_RESULTS|COLLATION_CONNECTION|TIME_ZONE|UNIQUE_CHECKS|FOREIGN_KEY_CHECKS|SQL_MODE|SQL_NOTES)\s*=\s*(?:[01]|NULL|'[^']*'|"[^"]*"|@@[A-Za-z0-9_]+))*$/i.test(statement)) continue;
    const create = statement.match(new RegExp(`^CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${identifier})\\s*\\(`, "i"));
    if (create && !/\b(?:SELECT|LIKE)\b/i.test(statement) && !/\bREFERENCES\s+`?[A-Za-z0-9_]+`?\s*\./i.test(statement)) { tableCount += 1; continue; }
    if (new RegExp(`^DROP\\s+TABLE\\s+IF\\s+EXISTS\\s+${identifier}$`, "i").test(statement)) continue;
    if (new RegExp(`^INSERT\\s+INTO\\s+${identifier}(?:\\s*\\([^)]*\\))?\\s+VALUES\\s*\\(`, "i").test(statement) &&
        !/\b(?:SELECT|OUTFILE|DUMPFILE|LOAD_FILE|SLEEP|BENCHMARK)\b/i.test(statement)) continue;
    if (/^(?:LOCK\s+TABLES\s+`?[A-Za-z0-9_]+`?\s+WRITE|UNLOCK\s+TABLES)$/i.test(statement)) continue;
    if (new RegExp(`^ALTER\\s+TABLE\\s+${identifier}\\s+(?:DISABLE|ENABLE)\\s+KEYS$`, "i").test(statement)) continue;
    fail("Backup chứa câu lệnh ngoài tập cho phép restore cô lập; dừng trước khi thực thi.");
  }
  if (useCount !== 1 || tableCount < 1) fail("Backup phải có đúng một USE nguồn và ít nhất một CREATE TABLE hợp lệ.");
}

async function currentDatabase(connection, expected) {
  const [[row]] = await connection.query("SELECT DATABASE() AS database_name");
  if (row.database_name !== expected) fail("Database thực tế không khớp đích đã xác nhận; dừng trước DDL.");
  return row.database_name;
}

async function assertWritableTarget(connection, mode = "test", productionAuthorized = false) {
  const identity = await verifyConnectionIdentity(connection, mode);
  if (mode === "production") {
    if (identity.database !== PRODUCTION_DATABASE || !productionAuthorized) {
      fail("Runner từ chối thao tác ghi production khi chưa có xác nhận và bằng chứng backup/restore.");
    }
    return identity.database;
  }
  if (identity.database === PRODUCTION_DATABASE || !TEST_DATABASE_PATTERN.test(identity.database || "")) {
    fail("Runner test chỉ được ghi vào database có tên voucher_migration_test được cho phép.");
  }
  return identity.database;
}

async function tableExists(connection, table) {
  const [[row]] = await connection.execute(
    "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
    [table],
  );
  return Number(row.n) === 1;
}

async function readBaseContract(connection) {
  const tables = ["orders", "order_items", "users", "user_addresses", "products"];
  for (const table of tables) if (!(await tableExists(connection, table))) fail(`Baseline không hợp lệ: thiếu bảng ${table}.`);
  const [columns] = await connection.execute(
    `SELECT TABLE_NAME,COLUMN_NAME,ORDINAL_POSITION,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA,GENERATION_EXPRESSION,CHARACTER_SET_NAME,COLLATION_NAME
       FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?,?,?,?,?) ORDER BY TABLE_NAME,ORDINAL_POSITION`, tables,
  );
  const [indexes] = await connection.execute(
    `SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,SUB_PART,INDEX_TYPE,IS_VISIBLE,EXPRESSION
       FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?,?,?,?,?) ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX`, tables,
  );
  const [foreignKeys] = await connection.execute(
    `SELECT k.TABLE_NAME,k.CONSTRAINT_NAME,k.COLUMN_NAME,k.ORDINAL_POSITION,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,k.POSITION_IN_UNIQUE_CONSTRAINT AS REFERENCED_ORDINAL_POSITION,r.DELETE_RULE,r.UPDATE_RULE
       FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r
         ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME
       WHERE k.CONSTRAINT_SCHEMA=DATABASE() AND k.TABLE_NAME IN ('orders','order_items') AND k.REFERENCED_TABLE_NAME IS NOT NULL
       ORDER BY k.TABLE_NAME,k.CONSTRAINT_NAME,k.ORDINAL_POSITION`,
  );
  const [engines] = await connection.execute(
    `SELECT TABLE_NAME,TABLE_TYPE,ENGINE,TABLE_COLLATION,CREATE_OPTIONS FROM information_schema.TABLES
       WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?,?,?,?,?) ORDER BY TABLE_NAME`, tables,
  );
  const [checks] = await connection.execute(
    `SELECT tc.TABLE_NAME,tc.CONSTRAINT_NAME,cc.CHECK_CLAUSE,tc.ENFORCED FROM information_schema.TABLE_CONSTRAINTS tc
       JOIN information_schema.CHECK_CONSTRAINTS cc ON cc.CONSTRAINT_SCHEMA=tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME=tc.CONSTRAINT_NAME
       WHERE tc.CONSTRAINT_SCHEMA=DATABASE() AND tc.TABLE_NAME IN ('orders','order_items') AND tc.CONSTRAINT_TYPE='CHECK'`,
  );
  const columnMap = new Map(columns.map((row) => [`${row.TABLE_NAME}.${row.COLUMN_NAME}`, row]));
  const expected = {
    orders: {
      id:["bigint unsigned","NO",null,"auto_increment"], customer_id:["int",["NO","YES"],null,""], user_address_id:["int","YES",null,""],
      recipient_name:["varchar(100)","NO",null,""], recipient_phone:["varchar(20)","NO",null,""], shipping_address:["text","NO",null,""],
      subtotal:["decimal(14,2)","NO",null,""], shipping_fee:["decimal(14,2)","YES",null,""], total_amount:["decimal(14,2)","NO",null,""],
      status:["enum('pending_confirmation','confirmed','preparing','shipping','completed','cancelled')","NO","pending_confirmation",""],
      created_at:["timestamp","NO","CURRENT_TIMESTAMP","DEFAULT_GENERATED"], updated_at:["timestamp","NO","CURRENT_TIMESTAMP","DEFAULT_GENERATED on update CURRENT_TIMESTAMP"],
      idempotency_key:["char(36)","YES",null,""], request_fingerprint:["char(64)","YES",null,""], payment_method:["varchar(20)","YES",null,""], payment_status:["enum('pending','unpaid','paid')","NO","pending",""],
      voucher_id:["bigint unsigned","YES",null,""], voucher_code:["varchar(40)","YES",null,""], voucher_campaign_name:["varchar(150)","YES",null,""], voucher_discount_type:["varchar(20)","YES",null,""], voucher_discount_value:["decimal(12,2)","YES",null,""], discount_amount:["decimal(14,2)","NO","0.00",""],
      shipping_region_code:["varchar(32)","YES",null,""], shipping_region_name:["varchar(100)","YES",null,""]
    },
    order_items: {
      id:["bigint unsigned","NO",null,"auto_increment"], order_id:["bigint unsigned","NO",null,""], product_id:["int unsigned","YES",null,""], product_name:["varchar(255)","NO",null,""],
      product_category:["varchar(100)","NO",null,""], product_image:["varchar(2048)","YES",null,""], unit_price:["decimal(12,2)","NO",null,""], quantity:["int unsigned","NO",null,""],
      line_total:["decimal(14,2)","NO",null,""], created_at:["timestamp","NO","CURRENT_TIMESTAMP","DEFAULT_GENERATED"]
    }
  };
  const optionalOrderColumns = new Set(["idempotency_key","request_fingerprint","payment_method","payment_status","voucher_id","voucher_code","voucher_campaign_name","voucher_discount_type","voucher_discount_value","discount_amount","shipping_region_code","shipping_region_name"]);
  for (const table of ["orders","order_items"]) {
    const rows = columns.filter((row) => row.TABLE_NAME === table);
    for (const row of rows) if (!expected[table][row.COLUMN_NAME]) fail(`Baseline có cột ngoài hợp đồng trong ${table}.${row.COLUMN_NAME}.`);
    for (const [name,[type,nullable,def,extra]] of Object.entries(expected[table])) {
      const row=columnMap.get(`${table}.${name}`);
      if (!row) { if (table === "orders" && optionalOrderColumns.has(name)) continue; fail(`Baseline thiếu cột ${table}.${name}.`); }
      const nullOk=Array.isArray(nullable)?nullable.includes(row.IS_NULLABLE):row.IS_NULLABLE===nullable;
      if(row.COLUMN_TYPE!==type||!nullOk||row.COLUMN_DEFAULT!==def||row.EXTRA!==extra||row.GENERATION_EXPRESSION!=="") fail(`Baseline sai type/null/default/extra tại ${table}.${name}.`);
    }
  }
  const voucherColumns=["voucher_id","voucher_code","voucher_campaign_name","voucher_discount_type","voucher_discount_value","discount_amount"];
  const voucherCount=voucherColumns.filter((name)=>columnMap.has(`orders.${name}`)).length;
  if(voucherCount!==0&&voucherCount!==voucherColumns.length) fail("Nhóm cột voucher trên orders chưa đầy đủ.");
  for(const [table,type] of [["users","int"],["products","int unsigned"],["user_addresses","int"]]){const row=columnMap.get(`${table}.id`);if(!row||row.COLUMN_TYPE!==type||row.IS_NULLABLE!=="NO"||row.EXTRA!=="auto_increment")fail(`Baseline sai khóa tham chiếu ${table}.id.`);}
  const grouped=new Map();for(const row of indexes){const key=`${row.TABLE_NAME}.${row.INDEX_NAME}`;grouped.set(key,[...(grouped.get(key)||[]),row]);}
  const expectedIndexes={"orders.PRIMARY":["id",0],"orders.fk_orders_user_address":["user_address_id",1],"orders.idx_orders_customer_created":["customer_id,created_at",1],"orders.idx_orders_status_created":["status,created_at",1],"order_items.PRIMARY":["id",0],"order_items.idx_order_items_order":["order_id",1],"order_items.idx_order_items_product":["product_id",1],"users.PRIMARY":["id",0],"products.PRIMARY":["id",0],"user_addresses.PRIMARY":["id",0]};
  if(columnMap.has("orders.idempotency_key"))expectedIndexes["orders.uq_orders_idempotency_key"]=["idempotency_key",0];
  const hasVoucherColumns = ["voucher_id","voucher_code","voucher_campaign_name","voucher_discount_type","voucher_discount_value","discount_amount"].every((name) => columnMap.has(`orders.${name}`));
  if (hasVoucherColumns && columnMap.has("orders.voucher_id")) expectedIndexes["orders.idx_orders_voucher_id"]=["voucher_id",1];
  const scoped=indexes.filter((row)=>["orders","order_items"].includes(row.TABLE_NAME));
  if(scoped.some((row)=>!Object.hasOwn(expectedIndexes,`${row.TABLE_NAME}.${row.INDEX_NAME}`)))fail("Baseline có index ngoài hợp đồng trên bảng nền.");
  for(const [key,[cols,nonUnique]] of Object.entries(expectedIndexes)){const rows=grouped.get(key)||[];if(rows.map((row)=>row.COLUMN_NAME).join(",")!==cols||rows.some((row)=>Number(row.NON_UNIQUE)!==nonUnique||row.INDEX_TYPE!=="BTREE"||row.IS_VISIBLE!=="YES"||row.SUB_PART!==null||row.EXPRESSION!==null))fail(`Baseline sai index ${key}.`);}
  const expectedFks=[["orders","fk_orders_customer","customer_id","users","id","RESTRICT"],["orders","fk_orders_user_address","user_address_id","user_addresses","id","SET NULL"],["order_items","fk_order_items_order","order_id","orders","id","CASCADE"],["order_items","fk_order_items_product","product_id","products","id","SET NULL"]];
  if (hasVoucherColumns) expectedFks.push(["orders","fk_orders_voucher","voucher_id","vouchers","id","SET NULL"]);
  if(foreignKeys.length!==expectedFks.length)fail("Baseline có số lượng foreign key sai.");
  for(const [table,name,col,ref,refCol,del] of expectedFks)if(!foreignKeys.some((row)=>row.TABLE_NAME===table&&row.CONSTRAINT_NAME===name&&row.COLUMN_NAME===col&&row.ORDINAL_POSITION===1&&row.REFERENCED_TABLE_NAME===ref&&row.REFERENCED_COLUMN_NAME===refCol&&Number(row.REFERENCED_ORDINAL_POSITION)===1&&row.DELETE_RULE===del&&row.UPDATE_RULE==="NO ACTION"))fail(`Baseline thiếu/sai foreign key ${table}.${name}.`);
  const expectedOrderChecks = hasVoucherColumns ? 1 : 0;
  if(checks.filter((row)=>row.TABLE_NAME==="orders").length!==expectedOrderChecks || checks.some((row)=>row.TABLE_NAME==="order_items"))fail("Baseline có CHECK ngoài cấu trúc Voucher đã biết trên orders/order_items.");
  if (hasVoucherColumns) assertCheck({ checks }, "orders", "chk_orders_discount_amount", "discount_amount >= 0");
  if(engines.length!==tables.length||engines.some((row)=>row.TABLE_TYPE!=="BASE TABLE"||row.ENGINE!=="InnoDB")||engines.some((row)=>["orders","order_items"].includes(row.TABLE_NAME)&&row.TABLE_COLLATION!=="utf8mb4_0900_ai_ci"))fail("Baseline yêu cầu InnoDB cho bảng nền và collation migration 000 cho orders/order_items.");
  return { tables:engines,columns,indexes,foreignKeys,checks };
}

function baselineEvidence(contract) {
  const baselineOrderColumns = new Set(["id", "customer_id", "user_address_id", "recipient_name", "recipient_phone", "shipping_address", "subtotal", "shipping_fee", "total_amount", "status", "created_at", "updated_at"]);
  const baselineOrderIndexes = new Set(["PRIMARY", "fk_orders_user_address", "idx_orders_customer_created", "idx_orders_status_created"]);
  const baselineForeignKeys = new Set(["fk_orders_customer", "fk_orders_user_address", "fk_order_items_order", "fk_order_items_product"]);
  const orders = contract.columns.filter((row) => row.TABLE_NAME === "orders" && baselineOrderColumns.has(row.COLUMN_NAME)).map((row, index) => ({
    ...row,
    ORDINAL_POSITION: index + 1,
    IS_NULLABLE: row.COLUMN_NAME === "customer_id" ? "000-not-null-or-001-nullable" : row.IS_NULLABLE,
  }));
  const orderItems = contract.columns.filter((row) => row.TABLE_NAME === "order_items").map((row, index) => ({ ...row, ORDINAL_POSITION: index + 1 }));
  const required = {
    orders,
    order_items: orderItems,
    keys: contract.indexes.filter((row) => baselineOrderIndexes.has(row.INDEX_NAME) || row.TABLE_NAME === "order_items"),
    foreignKeys: contract.foreignKeys.filter((row) => baselineForeignKeys.has(row.CONSTRAINT_NAME)),
    engines: contract.tables,
  };
  return required;
}

async function baselineFingerprint(connection) {
  const contract = await readBaseContract(connection);
  return checksum(stableJson(baselineEvidence(contract)));
}

async function ensureBaseline(connection, options = {}) {
  const mode = options.mode || "test";
  if (mode === "production" && options.allowCreateBaseline === true &&
      (options.baselineProvisioningApproval !== "I_APPROVE_PRODUCTION_BASELINE" || options.backupProofVerified !== true)) {
    fail("Baseline production chỉ được tạo qua lệnh riêng có phê duyệt và backup/restore attestation hợp lệ.");
  }
  const identity = await verifyConnectionIdentity(connection, mode);
  if ((mode === "production" && identity.database !== PRODUCTION_DATABASE) ||
      (mode !== "production" && (identity.database === PRODUCTION_DATABASE || !TEST_DATABASE_PATTERN.test(identity.database || "")))) {
    fail("Database baseline không khớp allowlist; từ chối xác minh.");
  }
  if (options.allowCreateBaseline === true) await assertWritableTarget(connection, mode, options.productionAuthorized === true);
  const fingerprint = await baselineFingerprint(connection);
  const evidence = baselineEvidence(await readBaseContract(connection));
  const evidenceJson = stableJson(evidence);
  const evidenceSha256 = checksum(evidenceJson);
  const signed = { baselineKey: BASELINE_KEY, contractFingerprint: fingerprint, evidenceSha256 };
  const signature = signEvidence(signed);
  const baselineExists = await tableExists(connection, "schema_baselines");
  if (!baselineExists && options.allowCreateBaseline !== true) {
    fail("Thiếu schema_baselines; preflight chỉ đọc không được tự tạo baseline.");
  }
  if (!baselineExists) {
    await connection.query(`CREATE TABLE schema_baselines (
      baseline_key VARCHAR(100) NOT NULL PRIMARY KEY,
      contract_fingerprint CHAR(64) NOT NULL,
      evidence_json JSON NOT NULL,
      evidence_sha256 CHAR(64) NOT NULL,
      signature_hmac CHAR(64) NOT NULL,
      verified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
  }
  const [[record]] = await connection.execute(
    "SELECT contract_fingerprint,evidence_json,evidence_sha256,signature_hmac FROM schema_baselines WHERE baseline_key = ?",
    [BASELINE_KEY],
  );
  if (record) {
    let storedEvidence;
    try { storedEvidence = typeof record.evidence_json === "string" ? JSON.parse(record.evidence_json) : record.evidence_json; }
    catch { fail("Baseline evidence không phải JSON hợp lệ; cần đối soát thủ công."); }
    const expectedSignature = signEvidence({
      baselineKey: BASELINE_KEY,
      contractFingerprint: record.contract_fingerprint,
      evidenceSha256: record.evidence_sha256,
    });
    const signatureBytes = Buffer.from(String(record.signature_hmac || ""), "hex");
    const expectedBytes = Buffer.from(expectedSignature, "hex");
    if (record.contract_fingerprint !== fingerprint || record.evidence_sha256 !== checksum(stableJson(storedEvidence)) ||
        stableJson(storedEvidence) !== evidenceJson || signatureBytes.length !== expectedBytes.length ||
        !crypto.timingSafeEqual(signatureBytes, expectedBytes) || record.evidence_sha256 !== evidenceSha256) {
      fail("Baseline fingerprint/evidence/chữ ký không khớp schema hiện tại; cần đối soát thủ công.");
    }
  } else {
    if (options.allowCreateBaseline !== true) fail("Thiếu baseline evidence được ký; không tự công nhận baseline.");
    await connection.execute(
      "INSERT INTO schema_baselines (baseline_key, contract_fingerprint, evidence_json, evidence_sha256, signature_hmac) VALUES (?, ?, ?, ?, ?)",
      [BASELINE_KEY, fingerprint, evidenceJson, evidenceSha256, signature],
    );
    const [[written]] = await connection.execute(
      "SELECT contract_fingerprint,evidence_json,evidence_sha256,signature_hmac FROM schema_baselines WHERE baseline_key = ?",
      [BASELINE_KEY],
    );
    if (!written || written.contract_fingerprint !== fingerprint || written.evidence_sha256 !== evidenceSha256 || written.signature_hmac !== signature) {
      fail("Không xác minh được baseline evidence sau khi ghi; dừng để đối soát.");
    }
  }
  return fingerprint;
}

function approvedMigrationSource(version, filename, migrationDirectory = MIGRATIONS) {
  const source = fs.readFileSync(path.join(migrationDirectory, filename), "utf8");
  const expected = APPROVED_MIGRATION_CHECKSUMS.get(version);
  if (!expected) fail(`Không có checksum được duyệt cho migration ${version}.`);
  assertChecksum(expected, source, `Source migration ${version}`);
  return source;
}

async function verifyHistoricalLedger(connection) {
  for (const version of ["001", "002"]) {
    const [[row]] = await connection.execute("SELECT checksum, name FROM schema_migrations WHERE version = ?", [version]);
    const filename = fs.readdirSync(MIGRATIONS).find((name) => name.startsWith(`${version}_`));
    if (!row || row.name !== filename) {
      fail(`Ledger cũ ${version} thiếu hoặc checksum không khớp; từ chối migration production.`);
    }
    const source = approvedMigrationSource(version, filename);
    assertChecksum(row.checksum, source, `Ledger ${version}`);
  }
  const meta = await metadata(connection);
  const [[employeeLedger]] = await connection.execute("SELECT checksum, name FROM schema_migrations WHERE version = '014'");
  if (employeeLedger) {
    const filename = VOUCHER_MIGRATIONS.get("014");
    if (employeeLedger.name !== filename) fail("Ledger 014 có tên migration không khớp.");
    assertChecksum(employeeLedger.checksum, approvedMigrationSource("014", filename), "Ledger 014");
    assertEmployeeRoles014(meta);
    await verifyMigrationData(connection, "014");
  } else if (migrationHasAnyObject(meta, "014")) {
    fail("Phát hiện một phần schema migration 014 nhưng ledger chưa ghi nhận; cần đối soát thủ công.");
  }
  assertColumns(meta, [
    ["users", "role", employeeLedger ? "enum('customer','employee','admin')" : "enum('customer','admin')", "NO", "customer"],
    ["orders", "customer_id", "int", "YES"], ["orders", "idempotency_key", "char(36)", "YES"],
    ["orders", "request_fingerprint", "char(64)", "YES"], ["orders", "payment_method", "varchar(20)", "YES"],
    ["orders", "payment_status", "enum('pending','unpaid','paid')", "NO", "pending"],
    ["user_cart_items", "user_id", "int", "NO"], ["user_cart_items", "product_id", "int unsigned", "NO"],
    ["user_cart_items", "quantity", "int unsigned", "NO"], ["shipping_configuration", "flat_fee", "decimal(12,2)", "YES"],
  ], "Baseline migration 001-002");
  for (const table of ["user_cart_items", "shipping_configuration"]) assertTable(meta, table);
  assertIndex(meta, "orders", "uq_orders_idempotency_key", ["idempotency_key"], true);
  assertIndex(meta, "user_cart_items", "PRIMARY", ["user_id", "product_id"], true);
  assertIndex(meta, "user_cart_items", "idx_user_cart_product", ["product_id"], false);
  assertForeignKey(meta, "user_cart_items", "fk_user_cart_user", "user_id", "users", "id", "CASCADE");
  assertForeignKey(meta, "user_cart_items", "fk_user_cart_product", "product_id", "products", "id", "RESTRICT");
  assertCheck(meta, "user_cart_items", "chk_user_cart_quantity", "quantity > 0");
  assertIndex(meta, "shipping_configuration", "PRIMARY", ["id"], true);
  assertCheck(meta, "shipping_configuration", "chk_shipping_configuration_singleton", "id = 1");
  assertCheck(meta, "shipping_configuration", "chk_shipping_configuration_fee", "flat_fee IS NULL OR flat_fee >= 0");
  const [[reviewMigration]] = await connection.execute("SELECT checksum, name FROM schema_migrations WHERE version = '003'");
  const hasReviewMigrationObjects = meta.tables.some((row) => row.TABLE_NAME === "user_favorites") || meta.columns.some((row) => row.TABLE_NAME === "product_reviews" && ["customer_id", "is_visible"].includes(row.COLUMN_NAME));
  if (!reviewMigration && hasReviewMigrationObjects) {
    fail("Phát hiện một phần schema migration 003 nhưng ledger chưa ghi nhận; cần đối soát thủ công.");
  }
  if (reviewMigration) {
    const filename = fs.readdirSync(MIGRATIONS).find((name) => name.startsWith("003_"));
    if (!filename || reviewMigration.name !== filename) fail("Ledger 003 có tên migration không khớp.");
    assertChecksum(reviewMigration.checksum, approvedMigrationSource("003", filename), "Ledger 003");
    assertColumns(meta, [
      ["user_favorites", "user_id", "int", "NO"], ["user_favorites", "product_id", "int unsigned", "NO"],
      ["product_reviews", "customer_id", "int", "YES"], ["product_reviews", "is_visible", "tinyint(1)", "NO", "1"],
    ], "003 đã ghi nhận");
    for (const table of ["user_favorites", "product_reviews"]) assertTable(meta, table);
    assertIndex(meta, "user_favorites", "PRIMARY", ["user_id", "product_id"], true);
    assertIndex(meta, "user_favorites", "idx_user_favorites_product", ["product_id"], false);
    assertForeignKey(meta, "user_favorites", "fk_user_favorites_user", "user_id", "users", "id", "CASCADE");
    assertForeignKey(meta, "user_favorites", "fk_user_favorites_product", "product_id", "products", "id", "CASCADE");
    assertIndex(meta, "product_reviews", "uq_product_reviews_customer_product", ["customer_id", "product_id"], true);
    assertIndex(meta, "product_reviews", "idx_product_reviews_visible_created", ["is_visible", "created_at"], false);
    assertForeignKey(meta, "product_reviews", "fk_product_reviews_customer", "customer_id", "users", "id", "SET NULL");
  }
}

async function metadata(connection) {
  const [tables] = await connection.execute(
    "SELECT TABLE_NAME,TABLE_TYPE,ENGINE,TABLE_COLLATION,CREATE_OPTIONS,AUTO_INCREMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME",
  );
  const [columns] = await connection.execute(
    `SELECT TABLE_NAME,COLUMN_NAME,ORDINAL_POSITION,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA,GENERATION_EXPRESSION,CHARACTER_SET_NAME,COLLATION_NAME
       FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION`,
  );
  const [indexes] = await connection.execute(
    `SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,SUB_PART,INDEX_TYPE,IS_VISIBLE,EXPRESSION FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX`,
  );
  const [foreignKeys] = await connection.execute(
    `SELECT k.TABLE_NAME,k.CONSTRAINT_NAME,k.COLUMN_NAME,k.ORDINAL_POSITION,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,k.POSITION_IN_UNIQUE_CONSTRAINT AS REFERENCED_ORDINAL_POSITION,r.DELETE_RULE,r.UPDATE_RULE
       FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r
         ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME
      WHERE k.CONSTRAINT_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL`,
  );
  const [checks] = await connection.execute(
    `SELECT tc.TABLE_NAME,tc.CONSTRAINT_NAME,cc.CHECK_CLAUSE,tc.ENFORCED FROM information_schema.TABLE_CONSTRAINTS tc
       JOIN information_schema.CHECK_CONSTRAINTS cc ON cc.CONSTRAINT_SCHEMA=tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME=tc.CONSTRAINT_NAME
      WHERE tc.CONSTRAINT_SCHEMA=DATABASE() AND tc.CONSTRAINT_TYPE='CHECK'`,
  );
  return { tables, columns, indexes, foreignKeys, checks };
}

function quoteIdentifier(value) { return `\`${String(value).replaceAll("`", "``")}\``; }

function canonicalRowValue(value) {
  if (value instanceof Date) return { $date: value.toISOString() };
  if (Buffer.isBuffer(value)) return { $buffer: value.toString("base64") };
  if (value && typeof value === "object") return JSON.parse(stableJson(value));
  return value;
}

async function fullDatabaseSnapshot(connection) {
  const rawSchema = await metadata(connection);
  const [[unsupported]] = await connection.execute(
    `SELECT
      (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='VIEW') AS views_count,
      (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()) AS triggers_count,
      (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE()) AS routines_count,
      (SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA=DATABASE()) AS events_count`,
  );
  if (Object.values(unsupported).some((count) => Number(count) > 0)) {
    fail("Không tạo restore snapshot nếu database có view/trigger/routine/event chưa được đưa vào hợp đồng snapshot.");
  }
  const normalizedTables = [];
  for (const sourceTable of rawSchema.tables) {
    const table = { ...sourceTable };
    const autoIncrementColumn = rawSchema.columns.find((column) =>
      column.TABLE_NAME === table.TABLE_NAME && /auto_increment/i.test(column.EXTRA || ""));
    if (autoIncrementColumn) {
      if (table.AUTO_INCREMENT == null) {
        const [[sequence]] = await connection.query(
          `SELECT MAX(${quoteIdentifier(autoIncrementColumn.COLUMN_NAME)}) AS maximum_value FROM ${quoteIdentifier(table.TABLE_NAME)}`,
        );
        table.AUTO_INCREMENT = String(BigInt(sequence.maximum_value ?? 0) + 1n);
      } else {
        table.AUTO_INCREMENT = String(table.AUTO_INCREMENT);
      }
    }
    normalizedTables.push(table);
  }
  rawSchema.tables = normalizedTables;
  const schema = Object.fromEntries(Object.entries(rawSchema).map(([name, rows]) => [
    name,
    [...rows].sort((left, right) => stableJson(left).localeCompare(stableJson(right))),
  ]));
  const data = [];
  for (const table of [...schema.tables].sort((left, right) => left.TABLE_NAME.localeCompare(right.TABLE_NAME))) {
    const [rows] = await connection.query(`SELECT * FROM ${quoteIdentifier(table.TABLE_NAME)}`);
    const canonicalRows = rows.map((row) => Object.fromEntries(
      Object.keys(row).sort().map((column) => [column, canonicalRowValue(row[column])]),
    ));
    canonicalRows.sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
    const serialized = canonicalRows.map(stableJson);
    data.push({ table: table.TABLE_NAME, rowCount: rows.length, rowsSha256: checksum(serialized.join("\n")) });
  }
  const schemaSha256 = checksum(stableJson(schema));
  const dataSha256 = checksum(stableJson(data));
  const [[identity]] = await connection.query("SELECT DATABASE() AS database_name");
  return { database: identity.database_name, schema, data, schemaSha256, dataSha256, snapshotSha256: checksum(`${schemaSha256}:${dataSha256}`) };
}

function makeRestoreAttestation({ backupPath, sourceIdentity, restoredIdentity, sourceSnapshot, restoredSnapshot, mode = "production" }) {
  const sourceMode = mode === "production" ? "production" : "test";
  const approvedSource = assertTrustedIdentity(sourceIdentity, { server_uuid: sourceIdentity.serverUuid, port: sourceIdentity.port }, sourceMode);
  const approvedRestore = assertTrustedIdentity(restoredIdentity, { server_uuid: restoredIdentity.serverUuid, port: restoredIdentity.port }, "test");
  const sourceAllowed = mode === "production" ? sourceIdentity.database === PRODUCTION_DATABASE : TEST_DATABASE_PATTERN.test(sourceIdentity.database || "");
  if (!sourceAllowed || !TEST_DATABASE_PATTERN.test(restoredIdentity.database || "")) fail("Restore attestation yêu cầu database nguồn/đích đúng allowlist.");
  if (sourceSnapshot.snapshotSha256 !== restoredSnapshot.snapshotSha256) fail("Snapshot schema/dữ liệu trước và sau restore không khớp.");
  const backupSha256 = verifyBackupArtifact(backupPath, checksum(fs.readFileSync(backupPath)), sourceIdentity.database).actualHash;
  const payload = {
    version: 1,
    sourceDatabase: sourceIdentity.database,
    sourceHost: approvedSource.host,
    sourcePort: approvedSource.port,
    sourceServerUuid: approvedSource.serverUuid,
    restoredDatabase: restoredIdentity.database,
    restoredHost: approvedRestore.host,
    restoredPort: approvedRestore.port,
    restoredServerUuid: approvedRestore.serverUuid,
    backupSha256,
    schemaSha256: sourceSnapshot.schemaSha256,
    dataSha256: sourceSnapshot.dataSha256,
    snapshotSha256: sourceSnapshot.snapshotSha256,
    createdAt: new Date().toISOString(),
  };
  return { ...payload, hmacSha256: signEvidence(payload) };
}

async function restoreBackupToIsolatedDatabase({ backupPath, expectedHash, sourceConnection, restoredDatabase, mode = "test" }) {
  if (!TEST_DATABASE_PATTERN.test(restoredDatabase || "") || restoredDatabase === PRODUCTION_DATABASE) {
    fail("Restore chỉ được tạo database cô lập theo allowlist.");
  }
  const sourceIdentity = await verifyConnectionIdentity(sourceConnection, mode);
  const sourceAllowed = mode === "production" ? sourceIdentity.database === PRODUCTION_DATABASE : TEST_DATABASE_PATTERN.test(sourceIdentity.database || "");
  if (!sourceAllowed) fail("Database nguồn restore không khớp chế độ đã chọn.");
  const backup = verifyBackupArtifact(backupPath, expectedHash, sourceIdentity.database);
  const bytes = fs.readFileSync(backup.backupPath);
  const statements = splitSqlStatements(bytes.toString("utf8"));
  validateRestoreStatements(statements, sourceIdentity.database);
  const sourceSnapshotBefore = await fullDatabaseSnapshot(sourceConnection);
  const admin = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost", port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root", password: process.env.DB_PASSWORD, multipleStatements: false,
  });
  let restored;
  try {
    const adminIdentity = await verifyConnectionIdentity(admin, "test");
    if (adminIdentity.database !== null) fail("Restore admin connection phải không chọn database.");
    const [[existing]] = await admin.execute("SELECT COUNT(*) AS n FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?", [restoredDatabase]);
    if (Number(existing.n) !== 0) fail("Database restore đã tồn tại; không ghi đè hoặc tái sử dụng.");
    await admin.query(`CREATE DATABASE ${quoteIdentifier(restoredDatabase)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  } finally {
    await admin.end();
  }

  restored = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost", port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root", password: process.env.DB_PASSWORD, database: restoredDatabase,
    multipleStatements: false, dateStrings: true,
  });
  try {
    const restoredIdentity = await verifyConnectionIdentity(restored, "test");
    const [[restoreSession]] = await restored.query("SELECT @@session.time_zone AS time_zone");
    const originalTimeZone = restoreSession.time_zone;
    // mysqldump emits TIMESTAMP values in UTC; match that session timezone while restoring.
    await restored.query("SET time_zone = '+00:00'");
    await restored.query("SET FOREIGN_KEY_CHECKS = 0");
    try {
      for (const statement of statements) {
        if (/^USE\s+/i.test(statement)) continue;
        await restored.query(statement);
      }
    } finally {
      try {
        await restored.query("SET FOREIGN_KEY_CHECKS = 1");
      } finally {
        await restored.execute("SET time_zone = ?", [originalTimeZone]);
      }
    }
    const [sourceSnapshotAfter, restoredSnapshot] = await Promise.all([
      fullDatabaseSnapshot(sourceConnection), fullDatabaseSnapshot(restored),
    ]);
    if (sourceSnapshotBefore.snapshotSha256 !== sourceSnapshotAfter.snapshotSha256 || sourceSnapshotBefore.snapshotSha256 !== restoredSnapshot.snapshotSha256) {
      fail("Schema hoặc dữ liệu sau restore không khớp snapshot nguồn.");
    }
    const report = makeRestoreAttestation({ backupPath, sourceIdentity, restoredIdentity, sourceSnapshot: sourceSnapshotBefore, restoredSnapshot, mode });
    return { backupSha256: backup.actualHash, restoredDatabase, snapshotSha256: restoredSnapshot.snapshotSha256, report };
  } finally {
    await restored.end();
  }
}

function verifyRestoreAttestation(report, backupSha256, sourceAllowlist, testAllowlist, mode = "production") {
  const expectedSourceDatabase = mode === "production" ? PRODUCTION_DATABASE : null;
  const sourceDatabaseValid = expectedSourceDatabase ? report?.sourceDatabase === expectedSourceDatabase : TEST_DATABASE_PATTERN.test(report?.sourceDatabase || "");
  if (!report || report.version !== 1 || !sourceDatabaseValid ||
      report.sourceHost !== sourceAllowlist.host || report.sourcePort !== sourceAllowlist.port ||
      report.sourceServerUuid !== sourceAllowlist.serverUuid.toLowerCase() || report.restoredHost !== testAllowlist.host ||
      report.restoredPort !== testAllowlist.port || report.restoredServerUuid !== testAllowlist.serverUuid.toLowerCase() ||
      report.backupSha256 !== backupSha256 || !TEST_DATABASE_PATTERN.test(report.restoredDatabase || "") ||
      typeof report.schemaSha256 !== "string" || !/^[a-f0-9]{64}$/.test(report.schemaSha256) ||
      typeof report.dataSha256 !== "string" || !/^[a-f0-9]{64}$/.test(report.dataSha256) ||
      report.snapshotSha256 !== checksum(`${report.schemaSha256}:${report.dataSha256}`)) {
    fail("Restore attestation thiếu trường hoặc không khớp nguồn, backup, database cô lập và snapshot.");
  }
  const { hmacSha256, ...payload } = report;
  const expected = signEvidence(payload);
  const supplied = Buffer.from(String(hmacSha256 || ""), "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  if (supplied.length !== expectedBytes.length || !crypto.timingSafeEqual(supplied, expectedBytes)) {
    fail("Chữ ký HMAC restore attestation không hợp lệ.");
  }
}

function verifyBackupArtifact(backupPath, expectedHash, sourceDatabase = PRODUCTION_DATABASE) {
  if (!/^[a-f0-9]{64}$/i.test(expectedHash || "")) fail("SHA-256 dự kiến không hợp lệ.");
  let resolved;
  if (sourceDatabase === PRODUCTION_DATABASE) {
    resolved = resolveFileWithinDirectory(BACKUPS, backupPath, "Backup production");
  } else {
    if (!TEST_DATABASE_PATTERN.test(sourceDatabase || "")) fail("Database nguồn backup không thuộc allowlist.");
    resolved = resolveFileWithinDirectory(TEST_ARTIFACTS, backupPath, "Backup kiểm thử");
  }
  if (fs.statSync(resolved).size < 1000) {
    fail("Backup phải là file đủ kích thước trong backups.");
  }
  const bytes = fs.readFileSync(resolved);
  const actualHash = checksum(bytes);
  if (actualHash !== expectedHash.toLowerCase()) fail("SHA-256 backup không khớp.");
  const sql = bytes.toString("utf8");
  const statements = splitSqlStatements(sql);
  validateRestoreStatements(statements, sourceDatabase);
  return { backupPath: resolved, actualHash, sourceDatabase };
}

function resolveFileWithinDirectory(directory, candidatePath, label) {
  let rootReal;
  let fileReal;
  try {
    rootReal = fs.realpathSync(directory);
    fileReal = fs.realpathSync(path.resolve(candidatePath));
  } catch {
    fail(`${label} phải tồn tại trong thư mục được phép.`);
  }
  const projectRoot = fs.realpathSync(ROOT);
  const directoryRelative = path.relative(projectRoot, rootReal);
  if (!directoryRelative || directoryRelative.startsWith("..") || path.isAbsolute(directoryRelative)) {
    fail(`${label}: thư mục gốc không nằm trong dự án.`);
  }
  const relative = path.relative(rootReal, fileReal);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || !fs.statSync(fileReal).isFile()) {
    fail(`${label} phải là file thật bên trong thư mục được phép.`);
  }
  return fileReal;
}

async function orderDataFingerprint(connection) {
  const [orders] = await connection.query("SELECT id,subtotal,shipping_fee,total_amount,status,customer_id FROM orders ORDER BY id");
  const [items] = await connection.query("SELECT id,order_id,product_id,product_name,unit_price,quantity,line_total FROM order_items ORDER BY id");
  return checksum(JSON.stringify({ orders, items }));
}

async function userAccountFingerprint(connection) {
  const [users] = await connection.query("SELECT id,email,password,role FROM users ORDER BY id");
  return checksum(stableJson(users));
}

function columnMap(meta) {
  return new Map(meta.columns.map((row) => [`${row.TABLE_NAME}.${row.COLUMN_NAME}`, row]));
}

function assertColumns(meta, expected, stage) {
  const found = columnMap(meta);
  for (const [table, name, type, nullable, defaultValue, extra] of expected) {
    const row = found.get(`${table}.${name}`);
    if (!row || row.COLUMN_TYPE !== type || row.IS_NULLABLE !== nullable ||
        (defaultValue !== undefined && String(row.COLUMN_DEFAULT) !== String(defaultValue)) ||
        (extra !== undefined && row.EXTRA !== extra)) {
      fail(`${stage}: cột ${table}.${name} thiếu hoặc sai kiểu/NULL/default.`);
    }
  }
}

function assertExactColumnNames(meta, table, expectedNames, stage) {
  const actual = meta.columns.filter((row) => row.TABLE_NAME === table).map((row) => row.COLUMN_NAME).sort();
  const expected = [...expectedNames].sort();
  if (stableJson(actual) !== stableJson(expected)) fail(`${stage}: danh sách cột ${table} thiếu hoặc có cột ngoài hợp đồng.`);
}

function assertExactNames(actualNames, expectedNames, label) {
  const actual = [...new Set(actualNames)].sort();
  const expected = [...new Set(expectedNames)].sort();
  if (stableJson(actual) !== stableJson(expected)) fail(`${label}: tập đối tượng thiếu hoặc có phần tử ngoài hợp đồng.`);
}

function assertIndex(meta, table, name, expectedColumns, unique) {
  const rows = meta.indexes.filter((row) => row.TABLE_NAME === table && row.INDEX_NAME === name).sort((a, b) => a.SEQ_IN_INDEX - b.SEQ_IN_INDEX);
  if (rows.map((row) => row.COLUMN_NAME).join(",") !== expectedColumns.join(",") || rows.some((row) =>
    Number(row.NON_UNIQUE) !== (unique ? 0 : 1) || row.INDEX_TYPE !== "BTREE" || row.IS_VISIBLE !== "YES" || row.SUB_PART !== null || row.EXPRESSION !== null)) {
    fail(`Index ${table}.${name} thiếu hoặc không đúng cấu trúc.`);
  }
}

function assertTable(meta, table) {
  const row = meta.tables.find((item) => item.TABLE_NAME === table);
  if (!row || row.ENGINE !== "InnoDB" || row.TABLE_COLLATION !== "utf8mb4_0900_ai_ci") {
    fail(`Bảng ${table} thiếu hoặc engine/collation không đúng.`);
  }
}

function assertForeignKey(meta, table, name, column, refTable, refColumn, rule, updateRule = "NO ACTION") {
  if (!meta.foreignKeys.some((row) => row.TABLE_NAME === table && row.CONSTRAINT_NAME === name && row.COLUMN_NAME === column && row.REFERENCED_TABLE_NAME === refTable && row.REFERENCED_COLUMN_NAME === refColumn && row.DELETE_RULE === rule && row.UPDATE_RULE === updateRule)) {
    fail(`Khóa ngoại ${table}.${name} thiếu hoặc sai quan hệ/delete rule.`);
  }
}

function normalizeCheckExpression(value) {
  let expression = String(value).toLowerCase()
    .replaceAll("`", "")
    .replace(/\\+'/g, "'")
    .replace(/_[a-z0-9]+(?=')/g, "")
    .replace(/\s+/g, "");
  const enclosesEntireExpression = (candidate) => {
    if (!candidate.startsWith("(") || !candidate.endsWith(")")) return false;
    let depth = 0;
    for (let index = 0; index < candidate.length; index += 1) {
      if (candidate[index] === "(") depth += 1;
      if (candidate[index] === ")") depth -= 1;
      if (depth === 0 && index !== candidate.length - 1) return false;
      if (depth < 0) return false;
    }
    return depth === 0;
  };
  let previous;
  do {
    previous = expression;
    expression = expression.replace(/\(([^()]*)\)/g, (whole, inner) => /\b(and|or)\b/i.test(inner) ? whole : inner);
    while (enclosesEntireExpression(expression)) expression = expression.slice(1, -1);
  } while (expression !== previous);
  return expression;
}

function assertCheck(meta, table, name, expression) {
  const row = meta.checks.find((item) => item.TABLE_NAME === table && item.CONSTRAINT_NAME === name);
  if (!row || row.ENFORCED !== "YES" || normalizeCheckExpression(row.CHECK_CLAUSE) !== normalizeCheckExpression(expression)) {
    fail(`CHECK ${table}.${name} thiếu hoặc sai điều kiện.`);
  }
}

function assertVoucher004(meta) {
  assertTable(meta, "orders");
  assertTable(meta, "users");
  assertTable(meta, "vouchers");
  assertTable(meta, "voucher_redemptions");
  assertColumns(meta, [
    ["vouchers", "id", "bigint unsigned", "NO", null, "auto_increment"], ["vouchers", "code", "varchar(40)", "NO", null, ""],
    ["vouchers", "campaign_name", "varchar(150)", "NO", null, ""], ["vouchers", "discount_type", "enum('percentage','fixed')", "NO", null, ""],
    ["vouchers", "discount_value", "decimal(12,2)", "NO", null, ""], ["vouchers", "minimum_subtotal", "decimal(14,2)", "NO", "0.00", ""],
    ["vouchers", "maximum_discount", "decimal(14,2)", "YES", null, ""], ["vouchers", "quantity_limit", "int unsigned", "NO", null, ""],
    ["vouchers", "used_count", "int unsigned", "NO", "0", ""], ["vouchers", "starts_at", "datetime", "NO", null, ""],
    ["vouchers", "ends_at", "datetime", "NO", null, ""], ["vouchers", "is_active", "tinyint(1)", "NO", "1", ""],
    ["vouchers", "created_at", "timestamp", "NO", "CURRENT_TIMESTAMP", "DEFAULT_GENERATED"], ["vouchers", "updated_at", "timestamp", "NO", "CURRENT_TIMESTAMP", "DEFAULT_GENERATED on update CURRENT_TIMESTAMP"],
    ["orders", "voucher_id", "bigint unsigned", "YES", null, ""], ["orders", "voucher_code", "varchar(40)", "YES", null, ""],
    ["orders", "voucher_campaign_name", "varchar(150)", "YES", null, ""], ["orders", "voucher_discount_type", "varchar(20)", "YES", null, ""],
    ["orders", "voucher_discount_value", "decimal(12,2)", "YES", null, ""], ["orders", "discount_amount", "decimal(14,2)", "NO", "0.00", ""],
    ["voucher_redemptions", "id", "bigint unsigned", "NO", null, "auto_increment"], ["voucher_redemptions", "voucher_id", "bigint unsigned", "NO", null, ""],
    ["voucher_redemptions", "order_id", "bigint unsigned", "NO", null, ""], ["voucher_redemptions", "customer_id", "int", "YES", null, ""],
    ["voucher_redemptions", "voucher_code_snapshot", "varchar(40)", "NO", null, ""], ["voucher_redemptions", "discount_amount", "decimal(14,2)", "NO", null, ""],
    ["voucher_redemptions", "created_at", "timestamp", "NO", "CURRENT_TIMESTAMP", "DEFAULT_GENERATED"],
  ], "004");
  const voucherColumnNames = ["id","code","campaign_name","discount_type","discount_value","minimum_subtotal","maximum_discount","quantity_limit","used_count","starts_at","ends_at","is_active","created_at","updated_at"];
  const redemptionColumnNames = ["id","voucher_id","order_id","customer_id","voucher_code_snapshot","discount_amount","created_at"];
  if (meta.columns.some((row) => row.TABLE_NAME === "vouchers" && ["description","per_customer_limit"].includes(row.COLUMN_NAME))) voucherColumnNames.push("description","per_customer_limit");
  if (meta.columns.some((row) => row.TABLE_NAME === "voucher_redemptions" && row.COLUMN_NAME === "usage_status")) redemptionColumnNames.push("usage_status");
  assertExactColumnNames(meta, "vouchers", voucherColumnNames, "004");
  assertExactColumnNames(meta, "voucher_redemptions", redemptionColumnNames, "004");
  assertIndex(meta, "vouchers", "PRIMARY", ["id"], true);
  assertIndex(meta, "voucher_redemptions", "PRIMARY", ["id"], true);
  assertIndex(meta, "vouchers", "uq_vouchers_code", ["code"], true);
  assertIndex(meta, "vouchers", "idx_vouchers_active_dates", ["is_active", "starts_at", "ends_at"], false);
  assertIndex(meta, "orders", "idx_orders_voucher_id", ["voucher_id"], false);
  assertIndex(meta, "voucher_redemptions", "uq_voucher_redemptions_order", ["order_id"], true);
  assertIndex(meta, "voucher_redemptions", "idx_voucher_redemptions_voucher", ["voucher_id", "created_at"], false);
  assertIndex(meta, "voucher_redemptions", "idx_voucher_redemptions_customer", ["customer_id", "created_at"], false);
  assertForeignKey(meta, "orders", "fk_orders_voucher", "voucher_id", "vouchers", "id", "SET NULL");
  assertForeignKey(meta, "voucher_redemptions", "fk_voucher_redemptions_voucher", "voucher_id", "vouchers", "id", "RESTRICT");
  assertForeignKey(meta, "voucher_redemptions", "fk_voucher_redemptions_order", "order_id", "orders", "id", "CASCADE");
  assertForeignKey(meta, "voucher_redemptions", "fk_voucher_redemptions_customer", "customer_id", "users", "id", "SET NULL");
  assertExactNames(meta.indexes.filter((row) => ["vouchers","voucher_redemptions"].includes(row.TABLE_NAME)).map((row) => `${row.TABLE_NAME}.${row.INDEX_NAME}`), [
    "vouchers.PRIMARY","vouchers.uq_vouchers_code","vouchers.idx_vouchers_active_dates",
    "voucher_redemptions.PRIMARY","voucher_redemptions.uq_voucher_redemptions_order","voucher_redemptions.idx_voucher_redemptions_voucher","voucher_redemptions.idx_voucher_redemptions_customer",
    ...(redemptionColumnNames.includes("usage_status") ? ["voucher_redemptions.idx_voucher_redemptions_status"] : []),
  ], "Index Voucher");
  assertExactNames(meta.foreignKeys.filter((row) => ["orders","order_items","voucher_redemptions"].includes(row.TABLE_NAME)).map((row) => row.CONSTRAINT_NAME), [
    "fk_orders_customer","fk_orders_user_address","fk_order_items_order","fk_order_items_product",
    ...(meta.columns.some((row) => row.TABLE_NAME === "orders" && row.COLUMN_NAME === "voucher_id") ? ["fk_orders_voucher"] : []),
    "fk_voucher_redemptions_voucher","fk_voucher_redemptions_order","fk_voucher_redemptions_customer",
  ], "Foreign key Voucher");
  for (const [name, clause] of [
    ["chk_vouchers_discount_value", "discount_value > 0"], ["chk_vouchers_percentage", "discount_type <> 'percentage' OR discount_value <= 100"],
    ["chk_vouchers_minimum", "minimum_subtotal >= 0"], ["chk_vouchers_max_discount", "maximum_discount IS NULL OR maximum_discount > 0"],
    ["chk_vouchers_quantity", "quantity_limit > 0 AND used_count <= quantity_limit"], ["chk_vouchers_dates", "ends_at > starts_at"],
    ["chk_orders_discount_amount", "discount_amount >= 0"],
  ]) assertCheck(meta, name === "chk_orders_discount_amount" ? "orders" : "vouchers", name, clause);
  assertCheck(meta, "voucher_redemptions", "chk_voucher_redemptions_discount", "discount_amount >= 0");
  assertExactNames(meta.checks.filter((row) => ["orders","vouchers","voucher_redemptions"].includes(row.TABLE_NAME)).map((row) => `${row.TABLE_NAME}.${row.CONSTRAINT_NAME}`), [
    "vouchers.chk_vouchers_discount_value","vouchers.chk_vouchers_percentage","vouchers.chk_vouchers_minimum","vouchers.chk_vouchers_max_discount","vouchers.chk_vouchers_quantity","vouchers.chk_vouchers_dates","orders.chk_orders_discount_amount","voucher_redemptions.chk_voucher_redemptions_discount",
    ...(voucherColumnNames.includes("per_customer_limit") ? ["vouchers.chk_vouchers_customer_limit"] : []),
  ], "CHECK Voucher");
  if (redemptionColumnNames.includes("usage_status")) assertVoucher006(meta);
  if (voucherColumnNames.includes("per_customer_limit")) assertVoucher007(meta);
}

function assertAdminCategoriesInventory005(meta) {
  assertTable(meta, "categories");
  assertTable(meta, "inventory_movements");
  assertColumns(meta, [
    ["categories", "id", "int unsigned", "NO", null, "auto_increment"],
    ["categories", "name", "varchar(100)", "NO", null, ""],
    ["categories", "description", "varchar(500)", "YES", null, ""],
    ["categories", "created_at", "timestamp", "NO", "CURRENT_TIMESTAMP", "DEFAULT_GENERATED"],
    ["categories", "updated_at", "timestamp", "NO", "CURRENT_TIMESTAMP", "DEFAULT_GENERATED on update CURRENT_TIMESTAMP"],
    ["inventory_movements", "id", "bigint unsigned", "NO", null, "auto_increment"],
    ["inventory_movements", "product_id", "int unsigned", "NO", null, ""],
    ["inventory_movements", "admin_user_id", "int", "YES", null, ""],
    ["inventory_movements", "movement_type", "enum('inbound','outbound','sale')", "NO", null, ""],
    ["inventory_movements", "quantity", "int unsigned", "NO", null, ""],
    ["inventory_movements", "stock_before", "int unsigned", "NO", null, ""],
    ["inventory_movements", "stock_after", "int unsigned", "NO", null, ""],
    ["inventory_movements", "note", "varchar(500)", "NO", null, ""],
    ["inventory_movements", "created_at", "timestamp", "NO", "CURRENT_TIMESTAMP", "DEFAULT_GENERATED"],
  ], "005");
  assertExactColumnNames(meta, "categories", ["id", "name", "description", "created_at", "updated_at"], "005");
  assertExactColumnNames(meta, "inventory_movements", ["id", "product_id", "admin_user_id", "movement_type", "quantity", "stock_before", "stock_after", "note", "created_at"], "005");
  assertIndex(meta, "categories", "PRIMARY", ["id"], true);
  assertIndex(meta, "categories", "uq_categories_name", ["name"], true);
  assertIndex(meta, "inventory_movements", "PRIMARY", ["id"], true);
  assertIndex(meta, "inventory_movements", "idx_inventory_movements_product_created", ["product_id", "created_at", "id"], false);
  assertIndex(meta, "inventory_movements", "idx_inventory_movements_admin_created", ["admin_user_id", "created_at"], false);
  assertExactNames(meta.indexes.filter((row) => ["categories", "inventory_movements"].includes(row.TABLE_NAME)).map((row) => `${row.TABLE_NAME}.${row.INDEX_NAME}`), ["categories.PRIMARY", "categories.uq_categories_name", "inventory_movements.PRIMARY", "inventory_movements.idx_inventory_movements_product_created", "inventory_movements.idx_inventory_movements_admin_created"], "Index danh mục/kho");
  assertForeignKey(meta, "inventory_movements", "fk_inventory_movements_product", "product_id", "products", "id", "RESTRICT");
  assertForeignKey(meta, "inventory_movements", "fk_inventory_movements_admin", "admin_user_id", "users", "id", "SET NULL");
  assertExactNames(meta.foreignKeys.filter((row) => row.TABLE_NAME === "inventory_movements").map((row) => row.CONSTRAINT_NAME), ["fk_inventory_movements_product", "fk_inventory_movements_admin"], "FK lịch sử tồn kho");
  assertCheck(meta, "inventory_movements", "chk_inventory_movements_quantity", "quantity > 0");
  assertCheck(meta, "inventory_movements", "chk_inventory_movements_stock", "(movement_type = 'inbound' AND stock_after = stock_before + quantity) OR (movement_type = 'outbound' AND stock_before = stock_after + quantity) OR (movement_type = 'sale' AND stock_before = stock_after + quantity)");
  assertExactNames(meta.checks.filter((row) => row.TABLE_NAME === "inventory_movements").map((row) => row.CONSTRAINT_NAME), ["chk_inventory_movements_quantity", "chk_inventory_movements_stock"], "CHECK lịch sử tồn kho");
}

function assertVoucher006(meta) {
  assertTable(meta, "voucher_redemptions");
  assertColumns(meta, [["voucher_redemptions", "usage_status", "enum('reserved','redeemed','released')", "NO", "redeemed"]], "006");
  assertIndex(meta, "voucher_redemptions", "idx_voucher_redemptions_status", ["usage_status", "voucher_id"], false);
}

function assertVoucher007(meta) {
  assertTable(meta, "vouchers");
  assertColumns(meta, [["vouchers", "description", "varchar(500)", "YES"], ["vouchers", "per_customer_limit", "int unsigned", "YES"]], "007");
  assertCheck(meta, "vouchers", "chk_vouchers_customer_limit", "per_customer_limit IS NULL OR per_customer_limit > 0");
}

function assertGallery008(meta) {
  assertTable(meta, "product_images");
  assertColumns(meta, [
    ["product_images", "id", "bigint unsigned", "NO", null, "auto_increment"],
    ["product_images", "product_id", "int unsigned", "NO", null, ""],
    ["product_images", "image_url", "varchar(2048)", "NO", null, ""],
    ["product_images", "file_name", "varchar(255)", "YES", null, ""],
    ["product_images", "sort_order", "int unsigned", "NO", "0", ""],
    ["product_images", "is_primary", "tinyint(1)", "NO", "0", ""],
    ["product_images", "created_at", "timestamp", "NO", "CURRENT_TIMESTAMP", "DEFAULT_GENERATED"],
  ], "008");
  assertExactColumnNames(meta, "product_images", ["id", "product_id", "image_url", "file_name", "sort_order", "is_primary", "created_at"], "008");
  assertIndex(meta, "product_images", "PRIMARY", ["id"], true);
  assertIndex(meta, "product_images", "uq_product_images_file_name", ["file_name"], true);
  assertIndex(meta, "product_images", "idx_product_images_product_order", ["product_id", "sort_order", "id"], false);
  assertForeignKey(meta, "product_images", "fk_product_images_product", "product_id", "products", "id", "CASCADE");
  assertExactNames(meta.indexes.filter((row) => row.TABLE_NAME === "product_images").map((row) => row.INDEX_NAME), ["PRIMARY", "uq_product_images_file_name", "idx_product_images_product_order"], "Index thư viện ảnh");
  assertExactNames(meta.foreignKeys.filter((row) => row.TABLE_NAME === "product_images").map((row) => row.CONSTRAINT_NAME), ["fk_product_images_product"], "Khóa ngoại thư viện ảnh");
}

function assertShippingRegions009(meta, version = "009") {
  assertTable(meta, "shipping_regions");
  assertColumns(meta, [
    ["shipping_regions", "id", "smallint unsigned", "NO", null, "auto_increment"],
    ["shipping_regions", "region_code", "varchar(32)", "NO", null, ""],
    ["shipping_regions", "region_name", "varchar(100)", "NO", null, ""],
    ["shipping_regions", "fee", "decimal(12,2)", "YES", null, ""],
    ["shipping_regions", "is_active", "tinyint(1)", "NO", "0", ""],
    ["shipping_regions", "created_at", "timestamp", "NO", "CURRENT_TIMESTAMP", "DEFAULT_GENERATED"],
    ["shipping_regions", "updated_at", "timestamp", "NO", "CURRENT_TIMESTAMP", "DEFAULT_GENERATED on update CURRENT_TIMESTAMP"],
    ["orders", "shipping_region_code", "varchar(32)", "YES", null, ""],
    ["orders", "shipping_region_name", "varchar(100)", "YES", null, ""],
  ], version);
  assertExactColumnNames(meta, "shipping_regions", ["id", "region_code", "region_name", "fee", "is_active", "created_at", "updated_at"], version);
  assertIndex(meta, "shipping_regions", "PRIMARY", ["id"], true);
  assertIndex(meta, "shipping_regions", "uq_shipping_regions_code", ["region_code"], true);
  assertIndex(meta, "shipping_regions", "idx_shipping_regions_active_code", ["is_active", "region_code"], false);
  assertExactNames(meta.indexes.filter((row) => row.TABLE_NAME === "shipping_regions").map((row) => row.INDEX_NAME), ["PRIMARY", "uq_shipping_regions_code", "idx_shipping_regions_active_code"], "Index khu vực vận chuyển");
  assertCheck(meta, "shipping_regions", "chk_shipping_regions_fee", "fee IS NULL OR fee >= 0");
  assertExactNames(meta.checks.filter((row) => row.TABLE_NAME === "shipping_regions").map((row) => row.CONSTRAINT_NAME), ["chk_shipping_regions_fee"], "CHECK khu vực vận chuyển");
  if (meta.foreignKeys.some((row) => row.TABLE_NAME === "shipping_regions")) fail(`${version}: bảng khu vực không được có khóa ngoại ngoài hợp đồng.`);
}

function assertShippingRegions012(meta) {
  assertShippingRegions009(meta, "012");
}

function assertProductDetails010(meta) {
  assertTable(meta, "products");
  assertColumns(meta, [["products", "product_details", "json", "YES", null, ""]], "010");
}

function assertOfficialVouchers011(meta) {
  assertVoucher004(meta);
  assertVoucher006(meta);
  assertVoucher007(meta);
}

function assertOfficialVouchers013(meta) {
  assertOfficialVouchers011(meta);
}

function assertEmployeeRoles014(meta) {
  assertTable(meta, "employee_invitations");
  assertTable(meta, "employee_role_history");
  assertColumns(meta, [
    ["users", "role", "enum('customer','employee','admin')", "NO", "customer"],
    ["users", "is_active", "tinyint(1)", "NO", "1"],
    ["users", "must_change_password", "tinyint(1)", "NO", "0"],
    ["employee_invitations", "id", "bigint unsigned", "NO", null, "auto_increment"],
    ["employee_invitations", "email", "varchar(150)", "NO", null, ""],
    ["employee_invitations", "token_hash", "char(64)", "NO", null, ""],
    ["employee_invitations", "invited_by_admin_id", "int", "NO", null, ""],
    ["employee_invitations", "accepted_user_id", "int", "YES", null, ""],
    ["employee_invitations", "revoked_by_admin_id", "int", "YES", null, ""],
    ["employee_invitations", "status", "enum('pending','accepted','expired','revoked')", "NO", "pending", ""],
    ["employee_invitations", "email_delivery_status", "enum('pending','sending','sent','failed')", "NO", "pending", ""],
    ["employee_invitations", "last_email_error_code", "varchar(64)", "YES"],
    ["employee_invitations", "created_at", "timestamp", "NO", "CURRENT_TIMESTAMP", "DEFAULT_GENERATED"],
    ["employee_invitations", "sent_at", "datetime", "YES"],
    ["employee_invitations", "expires_at", "datetime", "NO", null, ""],
    ["employee_invitations", "accepted_at", "datetime", "YES"],
    ["employee_invitations", "revoked_at", "datetime", "YES"],
    ["employee_invitations", "updated_at", "timestamp", "NO", "CURRENT_TIMESTAMP", "DEFAULT_GENERATED on update CURRENT_TIMESTAMP"],
    ["employee_invitations", "pending_email", "varchar(150)", "YES", null, "STORED GENERATED"],
    ["employee_role_history", "id", "bigint unsigned", "NO", null, "auto_increment"],
    ["employee_role_history", "employee_user_id", "int", "NO", null, ""],
    ["employee_role_history", "admin_user_id", "int", "YES", null, ""],
    ["employee_role_history", "invitation_id", "bigint unsigned", "YES", null, ""],
    ["employee_role_history", "action", "enum('granted','revoked','activated','deactivated','invitation_accepted')", "NO", null, ""],
    ["employee_role_history", "role_before", "enum('customer','employee','admin')", "YES", null, ""],
    ["employee_role_history", "role_after", "enum('customer','employee','admin')", "NO", null, ""],
    ["employee_role_history", "created_at", "timestamp", "NO", "CURRENT_TIMESTAMP", "DEFAULT_GENERATED"],
  ], "014");
  assertExactColumnNames(meta, "employee_invitations", [
    "id", "email", "token_hash", "invited_by_admin_id", "accepted_user_id", "revoked_by_admin_id",
    "status", "email_delivery_status", "last_email_error_code", "created_at", "sent_at", "expires_at",
    "accepted_at", "revoked_at", "updated_at", "pending_email",
  ], "014");
  assertExactColumnNames(meta, "employee_role_history", [
    "id", "employee_user_id", "admin_user_id", "invitation_id", "action", "role_before", "role_after", "created_at",
  ], "014");
  const pendingEmail = meta.columns.find((row) => row.TABLE_NAME === "employee_invitations" && row.COLUMN_NAME === "pending_email");
  const pendingExpression = String(pendingEmail?.GENERATION_EXPRESSION || "")
    .replaceAll("`", "")
    .replace(/\\+'/g, "'")
    .replace(/_[a-z0-9]+(?=')/gi, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
  if (!pendingEmail || !/status\s*=\s*'pending'.*then email/i.test(pendingExpression)) {
    fail("014: cột pending_email không ràng buộc duy nhất lời mời đang chờ.");
  }
  assertIndex(meta, "employee_invitations", "PRIMARY", ["id"], true);
  assertIndex(meta, "employee_invitations", "uq_employee_invitations_token_hash", ["token_hash"], true);
  assertIndex(meta, "employee_invitations", "uq_employee_invitations_pending_email", ["pending_email"], true);
  assertIndex(meta, "employee_invitations", "fk_employee_invitations_accepted_user", ["accepted_user_id"], false);
  assertIndex(meta, "employee_invitations", "fk_employee_invitations_revoker", ["revoked_by_admin_id"], false);
  assertIndex(meta, "employee_invitations", "idx_employee_invitations_status_expiry", ["status", "expires_at"], false);
  assertIndex(meta, "employee_invitations", "idx_employee_invitations_inviter", ["invited_by_admin_id", "created_at"], false);
  assertIndex(meta, "employee_role_history", "PRIMARY", ["id"], true);
  assertIndex(meta, "employee_role_history", "fk_employee_role_history_invitation", ["invitation_id"], false);
  assertIndex(meta, "employee_role_history", "idx_employee_role_history_user_created", ["employee_user_id", "created_at", "id"], false);
  assertIndex(meta, "employee_role_history", "idx_employee_role_history_admin_created", ["admin_user_id", "created_at"], false);
  assertExactNames(meta.indexes.filter((row) => ["employee_invitations", "employee_role_history"].includes(row.TABLE_NAME)).map((row) => `${row.TABLE_NAME}.${row.INDEX_NAME}`), [
    "employee_invitations.PRIMARY", "employee_invitations.uq_employee_invitations_token_hash",
    "employee_invitations.uq_employee_invitations_pending_email", "employee_invitations.idx_employee_invitations_status_expiry",
    "employee_invitations.idx_employee_invitations_inviter", "employee_invitations.fk_employee_invitations_accepted_user",
    "employee_invitations.fk_employee_invitations_revoker", "employee_role_history.PRIMARY",
    "employee_role_history.fk_employee_role_history_invitation", "employee_role_history.idx_employee_role_history_user_created",
    "employee_role_history.idx_employee_role_history_admin_created",
  ], "Index Employee");
  for (const [table, name, column, refTable, refColumn, rule] of [
    ["employee_invitations", "fk_employee_invitations_inviter", "invited_by_admin_id", "users", "id", "RESTRICT"],
    ["employee_invitations", "fk_employee_invitations_accepted_user", "accepted_user_id", "users", "id", "RESTRICT"],
    ["employee_invitations", "fk_employee_invitations_revoker", "revoked_by_admin_id", "users", "id", "SET NULL"],
    ["employee_role_history", "fk_employee_role_history_employee", "employee_user_id", "users", "id", "RESTRICT"],
    ["employee_role_history", "fk_employee_role_history_admin", "admin_user_id", "users", "id", "SET NULL"],
    ["employee_role_history", "fk_employee_role_history_invitation", "invitation_id", "employee_invitations", "id", "SET NULL"],
  ]) assertForeignKey(meta, table, name, column, refTable, refColumn, rule);
  assertExactNames(meta.foreignKeys.filter((row) => ["employee_invitations", "employee_role_history"].includes(row.TABLE_NAME)).map((row) => row.CONSTRAINT_NAME), [
    "fk_employee_invitations_inviter", "fk_employee_invitations_accepted_user", "fk_employee_invitations_revoker",
    "fk_employee_role_history_employee", "fk_employee_role_history_admin", "fk_employee_role_history_invitation",
  ], "Foreign key Employee");
}

const validators = new Map([["004", assertVoucher004], ["005", assertAdminCategoriesInventory005], ["006", assertVoucher006], ["007", assertVoucher007], ["008", assertGallery008], ["010", assertProductDetails010], ["011", assertOfficialVouchers011], ["012", assertShippingRegions012], ["013", assertOfficialVouchers013], ["014", assertEmployeeRoles014]]);

function migrationHasAnyObject(meta, version) {
  if (version === "004") return meta.columns.some((row) => ["vouchers", "voucher_redemptions"].includes(row.TABLE_NAME) || (row.TABLE_NAME === "orders" && (row.COLUMN_NAME.startsWith("voucher_") || row.COLUMN_NAME === "discount_amount"))) || meta.indexes.some((row) => row.TABLE_NAME === "orders" && row.INDEX_NAME === "idx_orders_voucher_id") || meta.foreignKeys.some((row) => row.CONSTRAINT_NAME === "fk_orders_voucher") || meta.checks.some((row) => ["chk_orders_discount_amount", "chk_vouchers_discount_value", "chk_voucher_redemptions_discount"].includes(row.CONSTRAINT_NAME));
  if (version === "005") return meta.tables.some((row) => ["categories", "inventory_movements"].includes(row.TABLE_NAME)) || meta.columns.some((row) => ["categories", "inventory_movements"].includes(row.TABLE_NAME));
  if (version === "006") return meta.columns.some((row) => row.TABLE_NAME === "voucher_redemptions" && row.COLUMN_NAME === "usage_status") || meta.indexes.some((row) => row.TABLE_NAME === "voucher_redemptions" && row.INDEX_NAME === "idx_voucher_redemptions_status");
  if (version === "007") return meta.columns.some((row) => row.TABLE_NAME === "vouchers" && ["description", "per_customer_limit"].includes(row.COLUMN_NAME)) || meta.checks.some((row) => row.CONSTRAINT_NAME === "chk_vouchers_customer_limit");
  if (version === "012") return meta.tables.some((row) => row.TABLE_NAME === "shipping_regions") || meta.columns.some((row) => row.TABLE_NAME === "orders" && ["shipping_region_code", "shipping_region_name"].includes(row.COLUMN_NAME));
  if (version === "010") return meta.columns.some((row) => row.TABLE_NAME === "products" && row.COLUMN_NAME === "product_details");
  if (version === "011") return false;
  if (version === "013") return false;
  if (version === "014") return meta.columns.some((row) =>
    row.TABLE_NAME === "users" && ["is_active", "must_change_password"].includes(row.COLUMN_NAME)) ||
    meta.columns.some((row) => row.TABLE_NAME === "users" && row.COLUMN_NAME === "role" && row.COLUMN_TYPE.includes("employee")) ||
    meta.tables.some((row) => ["employee_invitations", "employee_role_history"].includes(row.TABLE_NAME));
  return meta.tables.some((row) => row.TABLE_NAME === "product_images") || meta.columns.some((row) => row.TABLE_NAME === "product_images");
}

async function validatePreexistingMigration(connection, version, file) {
  if (version === "012") {
    const [legacyShippingRows] = await connection.execute(
      "SELECT name,checksum FROM schema_migrations WHERE version = '009'",
    );
    if (legacyShippingRows.length) {
      fail("Ledger có migration 009 nhưng checksum/bản nguồn cần được đối soát trước; không áp dụng migration thay thế 012.");
    }
  }
  const approvedSource = approvedMigrationSource(version, file);
  const [rows] = await connection.execute("SELECT name,checksum FROM schema_migrations WHERE version = ?", [version]);
  const meta = await metadata(connection);
  const hasObjects = migrationHasAnyObject(meta, version);
  if (rows.length) {
    if (rows[0].name !== file) fail(`Ledger ${version} có tên migration không khớp; cần đối soát.`);
    assertChecksum(rows[0].checksum, approvedSource, `Ledger ${version}`);
    validators.get(version)(meta);
    await verifyMigrationData(connection, version);
    return "applied";
  }
  if (version === "011" && await tableExists(connection, "vouchers")) {
    const [[existingVouchers]] = await connection.execute(
      "SELECT COUNT(*) AS total FROM vouchers WHERE code IN ('ANHNGUYET10','ANHNGUYET20','CHAOMUNG30')",
    );
    if (Number(existingVouchers.total) > 0) {
      fail("Đã có một phần hoặc toàn bộ Voucher chính thức nhưng ledger 011 chưa ghi nhận; cần đối soát thủ công, không tự chạy lại.");
    }
  }
  if (hasObjects) {
    try {
      validators.get(version)(meta);
      await verifyMigrationData(connection, version);
    } catch (error) {
      fail(`Phát hiện migration ${version} dở dang hoặc đối tượng cùng tên sai cấu trúc. Không tự chạy lại: ${error.message}`);
    }
    fail(`Schema migration ${version} đã đầy đủ nhưng ledger chưa ghi nhận; cần đối soát thủ công, không tự nhận là đã chạy.`);
  }
  return "absent";
}

async function verifyMigrationData(connection, version) {
  if (version === "014") {
    const [[invalidRoles]] = await connection.execute(
      "SELECT COUNT(*) AS total FROM users WHERE role NOT IN ('customer','employee','admin')",
    );
    if (Number(invalidRoles.total) !== 0) fail("Migration 014: có role users ngoài customer/employee/admin.");
    return;
  }
  if (version === "005") {
    const [[missingCategories]] = await connection.execute(
      `SELECT COUNT(DISTINCT TRIM(p.category)) AS total
       FROM products p LEFT JOIN categories c ON c.name = TRIM(p.category)
       WHERE p.category IS NOT NULL AND TRIM(p.category) <> '' AND c.id IS NULL`,
    );
    if (Number(missingCategories.total) !== 0) fail("Migration 005: còn danh mục sản phẩm chưa có bản ghi quản lý.");
    return;
  }
  if (version === "012") {
    const [seed] = await connection.execute(
      `SELECT region_code, region_name, fee, is_active FROM shipping_regions
       WHERE region_code IN ('NOI_THANH','NGOAI_THANH','TINH_THANH_KHAC') ORDER BY region_code`,
    );
    const expected = new Map([
      ["NOI_THANH", ["Nội thành", 20000, 1]],
      ["NGOAI_THANH", ["Ngoại thành", 30000, 1]],
      ["TINH_THANH_KHAC", ["Tỉnh/thành khác", 35000, 1]],
    ]);
    if (seed.length !== expected.size || seed.some((row) => {
      const want = expected.get(row.region_code);
      return !want || row.region_name !== want[0] || Number(row.fee) !== want[1] || Number(row.is_active) !== want[2];
    })) fail("Migration 012: ba khu vực hoặc phí vận chuyển đã xác nhận chưa được khởi tạo đúng.");
    return;
  }
  if (version === "011") {
    const [rows] = await connection.execute(
      `SELECT code, campaign_name, discount_type, discount_value, minimum_subtotal, maximum_discount,
              quantity_limit, used_count, starts_at, ends_at, is_active, per_customer_limit
       FROM vouchers WHERE code IN ('ANHNGUYET10','ANHNGUYET20','CHAOMUNG30') ORDER BY code`,
    );
    const expected = new Map([
      ["ANHNGUYET10", ["percentage", 10, 100000, 50000]],
      ["ANHNGUYET20", ["fixed", 20000, 150000, null]],
      ["CHAOMUNG30", ["fixed", 30000, 200000, null]],
    ]);
    if (rows.length !== expected.size || rows.some((row) => {
      const want = expected.get(row.code);
      const durationDays = (new Date(row.ends_at) - new Date(row.starts_at)) / 86400000;
      return !want || row.campaign_name !== row.code || row.discount_type !== want[0] ||
        Number(row.discount_value) !== want[1] || Number(row.minimum_subtotal) !== want[2] ||
        (row.maximum_discount == null ? null : Number(row.maximum_discount)) !== want[3] ||
        Number(row.quantity_limit) !== 100 || Number(row.used_count) !== 0 || Number(row.is_active) !== 1 ||
        row.per_customer_limit !== null || durationDays < 365 || durationDays > 366;
    })) fail("Migration 011: thông số hoặc thời hạn Voucher chính thức không đúng hợp đồng đã xác nhận.");
    return;
  }
  if (version === "013") {
    await verifyMigrationData(connection, "011");
    const [rows] = await connection.execute(
      `SELECT code, starts_at, ends_at,
              starts_at <= UTC_TIMESTAMP() AS started,
              ends_at >= UTC_TIMESTAMP() AS not_expired,
              ends_at = DATE_ADD(starts_at, INTERVAL 1 YEAR) AS one_year
       FROM vouchers WHERE code IN ('ANHNGUYET10','ANHNGUYET20','CHAOMUNG30') ORDER BY code`,
    );
    if (rows.length !== 3 || rows.some((row) => Number(row.started) !== 1 || Number(row.not_expired) !== 1 || Number(row.one_year) !== 1)) {
      fail("Migration 013: Voucher chính thức chưa bắt đầu theo UTC hoặc thời hạn không đúng một năm.");
    }
    return;
  }
  if (version !== "008") return;
  const [[invalidGallery]] = await connection.execute(
    `SELECT COUNT(*) AS total
     FROM products p
     LEFT JOIN (
       SELECT product_id, SUM(is_primary = 1) AS primary_count,
              MAX(CASE WHEN is_primary = 1 THEN image_url END) AS primary_url
       FROM product_images GROUP BY product_id
     ) g ON g.product_id = p.id
     WHERE (p.image IS NOT NULL AND TRIM(p.image) <> '' AND g.product_id IS NULL)
        OR (g.product_id IS NOT NULL AND (g.primary_count <> 1 OR NOT (p.image <=> g.primary_url)))`,
  );
  if (Number(invalidGallery.total) !== 0) {
    fail("Migration 008: ảnh bìa và ảnh chính trong thư viện chưa đồng bộ đầy đủ.");
  }
}

async function validateMigrationDependency(connection, version) {
  const validator = validators.get(version);
  if (validator) {
    validator(await metadata(connection));
    return;
  }
  if (version === "003") {
    await verifyHistoricalLedger(connection);
    return;
  }
  fail(`Không có validator đã duyệt cho migration phụ thuộc ${version}.`);
}

function backupProof() {
  const backup = argument("backup");
  const expectedHash = argument("backup-sha256")?.toLowerCase();
  const restoreReport = argument("restore-report");
  if (!backup || !/^[a-f0-9]{64}$/.test(expectedHash || "") || !restoreReport) {
    fail("Production yêu cầu backup, SHA-256 và báo cáo restore thử nghiệm đã xác minh.");
  }
  const backupPath = path.resolve(ROOT, backup);
  const { actualHash } = verifyBackupArtifact(backupPath, expectedHash, PRODUCTION_DATABASE);
  const reportPath = resolveFileWithinDirectory(BACKUPS, path.resolve(ROOT, restoreReport), "Báo cáo restore");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  verifyRestoreAttestation(report, actualHash, trustedServerFor("production"), trustedServerFor("test"));
  return { backupPath, actualHash, reportPath, attestation: report };
}

function resolveTarget() {
  const mode = argument("mode");
  const requestedDatabase = argument("database");
  const provisionBaselineValue = argument("provision-baseline");
  const reconcileVersion = argument("reconcile-complete");
  if (provisionBaselineValue && provisionBaselineValue !== "I_APPROVE_PRODUCTION_BASELINE") {
    fail("Giá trị --provision-baseline không hợp lệ.");
  }
  if (mode === "test") {
    if (provisionBaselineValue) fail("Không cho phép provision production baseline trong chế độ test.");
    if (!TEST_DATABASE_PATTERN.test(requestedDatabase || "") || requestedDatabase === PRODUCTION_DATABASE) fail("Chế độ test chỉ cho phép tên database cô lập theo mẫu đã định.");
    trustedServerFor("test");
    return { mode, database: requestedDatabase };
  }
  if (mode === "production") {
    if (requestedDatabase !== PRODUCTION_DATABASE || argument("confirm-production") !== PRODUCTION_DATABASE) fail("Production cần chỉ rõ --database=anh_nguyet và --confirm-production=anh_nguyet.");
    trustedServerFor("production");
    const apply = argument("apply-production") === "I_APPROVE_VOUCHER_SCHEMA_CHANGES";
    if (argument("apply-production") && !apply) fail("Giá trị --apply-production không hợp lệ.");
    if (apply && provisionBaselineValue) fail("Provision baseline và chạy migration phải là hai bước riêng biệt.");
    if (reconcileVersion && (!RECONCILE_APPROVALS.has(reconcileVersion) || argument("reconcile-approval") !== RECONCILE_APPROVALS.get(reconcileVersion))) {
      fail("Đối soát migration hoàn tất cần phiên bản được hỗ trợ và cờ phê duyệt tường minh.");
    }
    if (reconcileVersion && (!apply || argument("migration") || provisionBaselineValue)) {
      fail("Đối soát migration hoàn tất phải chạy riêng, có phê duyệt production và không kèm danh sách migration.");
    }
    if (!reconcileVersion && argument("reconcile-approval")) fail("Không nhận cờ reconcile-approval nếu không chỉ định reconcile-complete.");
    return { mode, database: PRODUCTION_DATABASE, proof: backupProof(), apply, provisionBaseline: Boolean(provisionBaselineValue), reconcileVersion };
  }
  fail("Chọn --mode=test hoặc --mode=production.");
}

async function verifyEmployee014InitialData(connection) {
  const [[invitations]] = await connection.execute("SELECT COUNT(*) AS total FROM employee_invitations");
  const [[history]] = await connection.execute("SELECT COUNT(*) AS total FROM employee_role_history");
  const [[nonDefaultFlags]] = await connection.execute(
    "SELECT COUNT(*) AS total FROM users WHERE is_active <> 1 OR must_change_password <> 0",
  );
  if (Number(invitations.total) !== 0 || Number(history.total) !== 0 || Number(nonDefaultFlags.total) !== 0) {
    fail("Migration 014 không được tạo dữ liệu lời mời/lịch sử hoặc thay đổi cờ mặc định tài khoản hiện có.");
  }
}

async function applySelectedMigrationsUnlocked(connection, selected, options = {}) {
  await currentDatabase(connection, options.database);
  await assertWritableTarget(connection, options.mode || "test", options.productionAuthorized === true);
  await readBaseContract(connection);
  if (!(await tableExists(connection, "schema_migrations"))) fail("Thiếu schema_migrations; không ghi baseline hoặc áp dụng Voucher migration.");
  const selectedVersions = selected || [...VOUCHER_MIGRATIONS.keys()];
  await verifyHistoricalLedger(connection);
  if (new Set(selectedVersions).size !== selectedVersions.length) fail("Danh sách migration có phiên bản trùng.");
  const selectedIndex = new Map(selectedVersions.map((version, index) => [version, index]));
  const states = new Map();
  for (const version of selectedVersions) {
    const file = VOUCHER_MIGRATIONS.get(version);
    if (!file) fail(`Migration ${version} nằm ngoài danh sách migration production được phê duyệt.`);
    approvedMigrationSource(version, file);
    states.set(version, await validatePreexistingMigration(connection, version, file));
  }
  for (const version of selectedVersions) {
    for (const dependency of MIGRATION_DEPENDENCIES.get(version)) {
      if (selectedIndex.has(dependency)) {
        if (selectedIndex.get(dependency) >= selectedIndex.get(version)) fail(`Thứ tự migration sai: ${dependency} phải đứng trước ${version}.`);
        continue;
      }
      const [dependencyRows] = await connection.execute("SELECT name,checksum FROM schema_migrations WHERE version = ?", [dependency]);
      const dependencyFile = VOUCHER_MIGRATIONS.get(dependency) || fs.readdirSync(MIGRATIONS).find((name) => name.startsWith(`${dependency}_`));
      const dependencySource = approvedMigrationSource(dependency, dependencyFile);
      if (!dependencyRows.length || dependencyRows[0].name !== dependencyFile || !checksumMatches(dependencyRows[0].checksum, dependencySource)) {
        fail(`Migration ${version} yêu cầu migration ${dependency} đã áp dụng và checksum/name hợp lệ.`);
      }
      await validateMigrationDependency(connection, dependency);
    }
  }
  await ensureBaseline(connection, {
    ...options,
    allowCreateBaseline: options.mode !== "production",
  });
  for (const version of selectedVersions) {
    const file = VOUCHER_MIGRATIONS.get(version);
    const state = states.get(version);
    if (state === "applied") {
      console.log(`${version}: đã áp dụng, cấu trúc và checksum hợp lệ.`);
      continue;
    }
    const sql = approvedMigrationSource(version, file);
    const statements = splitSqlStatements(sql);
    const beforeSchema = checksum(JSON.stringify(await metadata(connection)));
    const orderDataBefore = await orderDataFingerprint(connection);
    const userDataBefore = await userAccountFingerprint(connection);
    console.log(`${version}: thực thi ${file} (${statements.length} câu lệnh).`);
    for (let index = 0; index < statements.length; index += 1) {
      await connection.query(statements[index]);
      if (options.stopAfterStatement === index + 1) fail(`Đã mô phỏng dừng giữa chừng sau câu ${index + 1}; ledger chưa ghi.`);
    }
    validators.get(version)(await metadata(connection));
    await verifyMigrationData(connection, version);
    if (version === "014") await verifyEmployee014InitialData(connection);
    const afterSchema = checksum(JSON.stringify(await metadata(connection)));
    const orderDataAfter = await orderDataFingerprint(connection);
    if (orderDataBefore !== orderDataAfter) fail(`${version}: phát hiện dữ liệu orders/order_items thay đổi; ledger chưa ghi.`);
    const userDataAfter = await userAccountFingerprint(connection);
    if (userDataBefore !== userDataAfter) fail(`${version}: phát hiện users(id,email,password,role) thay đổi; ledger chưa ghi.`);
    await connection.execute(
      "INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)",
      [version, file, checksum(sql)],
    );
    const [[ledger]] = await connection.execute("SELECT name,checksum FROM schema_migrations WHERE version = ?", [version]);
    if (!ledger || ledger.name !== file || !checksumMatches(ledger.checksum, sql)) {
      fail(`${version}: không xác minh được ledger sau khi ghi; dừng để đối soát thủ công.`);
    }
    console.log(`${version}: schema ${beforeSchema} -> ${afterSchema}; fingerprint users/orders không đổi; ledger đã ghi sau kiểm chứng.`);
  }
  console.log(`Các migration được chọn đã kiểm tra xong trên ${options.database}. Migration 005 ${selectedVersions.includes("005") ? "đã được chạy/đối chiếu" : "không nằm trong lượt này"}.`);
}

async function applySelectedMigrations(connection, selected, options = {}) {
  const database = options.database;
  await currentDatabase(connection, database);
  await assertWritableTarget(connection, options.mode || "test", options.productionAuthorized === true);
  const lockName = await acquireMigrationLock(connection, database);
  try {
    return await applySelectedMigrationsUnlocked(connection, selected, options);
  } finally {
    await releaseMigrationLock(connection, lockName);
  }
}

async function reconcileCompletedMigration005(connection, restoredConnection) {
  await currentDatabase(connection, PRODUCTION_DATABASE);
  await assertWritableTarget(connection, "production", true);
  await readBaseContract(connection);
  await verifyHistoricalLedger(connection);
  await ensureBaseline(connection, { mode: "production", allowCreateBaseline: false });

  const file = VOUCHER_MIGRATIONS.get("005");
  const sql = approvedMigrationSource("005", file);
  const [[ledger]] = await connection.execute("SELECT name,checksum FROM schema_migrations WHERE version = '005'");
  if (ledger) fail("Ledger 005 đã tồn tại; nhánh đối soát chỉ áp dụng khi DDL hoàn tất nhưng ledger còn thiếu.");

  const meta = await metadata(connection);
  if (!migrationHasAnyObject(meta, "005")) fail("Không tìm thấy đối tượng DDL của migration 005 để đối soát.");
  validators.get("005")(meta);
  await verifyMigrationData(connection, "005");

  const openingSql = `SELECT
    (SELECT COUNT(*) FROM products WHERE stock > 0) AS expected_products,
    (SELECT COUNT(*) FROM inventory_movements WHERE note = ?) AS opening_rows,
    (SELECT COUNT(DISTINCT product_id) FROM inventory_movements WHERE note = ?) AS distinct_products,
    (SELECT COUNT(*) FROM inventory_movements m INNER JOIN products p ON p.id = m.product_id
      WHERE m.note = ? AND m.movement_type = 'inbound' AND m.quantity > 0
        AND m.stock_before = 0 AND m.stock_after = m.quantity AND m.quantity = p.stock) AS matching_rows,
    (SELECT COUNT(*) FROM inventory_movements m LEFT JOIN products p ON p.id = m.product_id
      WHERE m.note = ? AND (p.id IS NULL OR p.stock <= 0 OR m.movement_type <> 'inbound'
        OR m.quantity <= 0 OR m.stock_before <> 0 OR m.stock_after <> m.quantity OR m.quantity <> p.stock)) AS invalid_rows`;
  const [[opening]] = await connection.execute(openingSql, Array(4).fill(INITIAL_INVENTORY_NOTE));
  const expectedProducts = Number(opening.expected_products);
  if (Number(opening.opening_rows) !== expectedProducts ||
      Number(opening.distinct_products) !== expectedProducts ||
      Number(opening.matching_rows) !== expectedProducts || Number(opening.invalid_rows) !== 0) {
    fail("Không thể đối soát migration 005: bản ghi tồn đầu kỳ không khớp số sản phẩm/tồn kho hiện tại.");
  }

  await currentDatabase(restoredConnection, "anh_nguyet_voucher_migration_test_20261116_prodrestore03");
  const [productionOrders, restoredOrders] = await Promise.all([
    orderDataFingerprint(connection), orderDataFingerprint(restoredConnection),
  ]);
  if (productionOrders !== restoredOrders) fail("Không thể đối soát migration 005: fingerprint orders/order_items khác backup đã restore.");

  await connection.execute(
    "INSERT INTO schema_migrations (version,name,checksum) VALUES (?,?,?)",
    ["005", file, checksum(sql)],
  );
  const [[recorded]] = await connection.execute("SELECT name,checksum FROM schema_migrations WHERE version = '005'");
  if (!recorded || recorded.name !== file || !checksumMatches(recorded.checksum, sql)) {
    fail("Đối soát 005 chưa được xác minh trong ledger; dừng để kiểm tra thủ công.");
  }
  console.log(`005: DDL hiện hữu đã được xác minh đầy đủ; inventory=${expectedProducts}; fingerprint đơn hàng khớp backup restore; ledger ghi nhận sau phê duyệt.`);
}

async function reconcileCompletedMigration014(connection, sourceConnection) {
  const [[target]] = await connection.query("SELECT DATABASE() AS database_name");
  if (!TEST_DATABASE_PATTERN.test(target.database_name || "")) {
    fail("Đối soát 014 chỉ được ghi ledger trên database kiểm thử cô lập.");
  }
  await currentDatabase(connection, target.database_name);
  const targetIdentity = await verifyConnectionIdentity(connection, "test");
  await assertWritableTarget(connection, "test", false);
  const sourceIdentity = await verifyConnectionIdentity(sourceConnection, "production");
  await currentDatabase(sourceConnection, PRODUCTION_DATABASE);
  if (sourceIdentity.database !== PRODUCTION_DATABASE) fail("Nguồn đối soát 014 phải là database production đã xác minh.");
  await verifyHistoricalLedger(sourceConnection);

  const meta = await metadata(connection);
  assertEmployeeRoles014(meta);
  await verifyMigrationData(connection, "014");
  await verifyEmployee014InitialData(connection);
  const [targetLedger] = await connection.query("SELECT version,name,checksum FROM schema_migrations WHERE version <> '014' ORDER BY version");
  const [sourceLedger] = await sourceConnection.query("SELECT version,name,checksum FROM schema_migrations ORDER BY version");
  if (stableJson(targetLedger) !== stableJson(sourceLedger)) {
    fail("Đối soát 014 bị dừng: ledger của database thử nghiệm khác nguồn production.");
  }

  const [sourceSnapshot, targetSnapshot] = await Promise.all([
    fullDatabaseSnapshot(sourceConnection), fullDatabaseSnapshot(connection),
  ]);
  const excludedTables = new Set(["users", "employee_invitations", "employee_role_history"]);
  const unchangedData = (snapshot) => snapshot.data.filter((row) => !excludedTables.has(row.table));
  if (stableJson(unchangedData(sourceSnapshot)) !== stableJson(unchangedData(targetSnapshot)) ||
      await userAccountFingerprint(sourceConnection) !== await userAccountFingerprint(connection)) {
    fail("Đối soát 014 bị dừng: dữ liệu ngoài các cột trạng thái mới không khớp nguồn.");
  }
  const [[existing]] = await connection.execute("SELECT version FROM schema_migrations WHERE version = '014'");
  if (existing) fail("Ledger 014 đã tồn tại; đối soát chỉ hỗ trợ DDL hoàn tất nhưng ledger vắng mặt.");
  const file = VOUCHER_MIGRATIONS.get("014");
  const sql = approvedMigrationSource("014", file);
  await connection.execute(
    "INSERT INTO schema_migrations (version,name,checksum) VALUES (?,?,?)",
    ["014", file, checksum(sql)],
  );
  const [[recorded]] = await connection.execute("SELECT name,checksum FROM schema_migrations WHERE version = '014'");
  if (!recorded || recorded.name !== file || !checksumMatches(recorded.checksum, sql)) {
    fail("Đối soát 014 không xác minh được ledger sau khi ghi.");
  }
  console.log(`014: schema và dữ liệu được xác minh trên ${targetIdentity.database}; ledger test ghi nhận sau khi đối chiếu production.`);
}

async function main() {
  const target = resolveTarget();
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD,
    database: target.database,
    multipleStatements: false,
    dateStrings: true,
  });
  try {
    const identity = await verifyConnectionIdentity(connection, target.mode);
    await currentDatabase(connection, target.database);
    if (target.reconcileVersion) {
      const restoredDatabase = target.proof.attestation.restoredDatabase;
      const restoredConnection = await mysql.createConnection({
        host: process.env.DB_HOST || "localhost", port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || "root", password: process.env.DB_PASSWORD,
        database: restoredDatabase, multipleStatements: false, dateStrings: true,
      });
      try {
        const restoredIdentity = await verifyConnectionIdentity(restoredConnection, "test");
        if (restoredIdentity.database !== restoredDatabase) fail("Restore attestation trỏ đến database khác; không đối soát migration.");
        const lockName = await acquireMigrationLock(connection, target.database);
        try {
          await reconcileCompletedMigration005(connection, restoredConnection);
        } finally {
          await releaseMigrationLock(connection, lockName);
        }
      } finally {
        await restoredConnection.end();
      }
      return;
    }
    if (target.provisionBaseline) {
      const lockName = await acquireMigrationLock(connection, target.database);
      try {
        await assertWritableTarget(connection, "production", true);
        await verifyHistoricalLedger(connection);
        const fingerprint = await ensureBaseline(connection, {
          mode: "production",
          allowCreateBaseline: true,
          productionAuthorized: true,
          baselineProvisioningApproval: "I_APPROVE_PRODUCTION_BASELINE",
          backupProofVerified: Boolean(target.proof?.attestation),
        });
        console.log(`Production baseline đã được tạo/xác minh dưới advisory lock; fingerprint=${fingerprint}; không chạy migration.`);
      } finally {
        await releaseMigrationLock(connection, lockName);
      }
      return;
    }
    if (target.mode === "production") {
      console.log(`Đích production xác minh: ${target.database}; server UUID=${identity.serverUuid}; backup attestation đã ký.`);
      if (!target.apply) {
        const lockName = await acquireMigrationLock(connection, target.database);
        try {
        await readBaseContract(connection);
        await ensureBaseline(connection, { mode: "production", allowCreateBaseline: false });
        const selected = argument("migration") ? argument("migration").split(",") : [...VOUCHER_MIGRATIONS.keys()];
        await verifyHistoricalLedger(connection);
        const selectedIndex = new Map(selected.map((version, index) => [version, index]));
        for (const version of selected) {
          const file = VOUCHER_MIGRATIONS.get(version);
          if (!file) fail(`Migration ${version} nằm ngoài phạm vi Voucher.`);
          approvedMigrationSource(version, file);
          await validatePreexistingMigration(connection, version, file);
          for (const dependency of MIGRATION_DEPENDENCIES.get(version)) {
            if (selectedIndex.has(dependency)) {
              if (selectedIndex.get(dependency) >= selectedIndex.get(version)) fail(`Thứ tự migration sai: ${dependency} phải đứng trước ${version}.`);
              continue;
            }
            const [rows] = await connection.execute("SELECT name,checksum FROM schema_migrations WHERE version = ?", [dependency]);
            const dependencyFile = VOUCHER_MIGRATIONS.get(dependency) || fs.readdirSync(MIGRATIONS).find((name) => name.startsWith(`${dependency}_`));
            const dependencySource = approvedMigrationSource(dependency, dependencyFile);
            if (!rows.length || rows[0].name !== dependencyFile || !checksumMatches(rows[0].checksum, dependencySource)) fail(`Dependency ${dependency} chưa được xác minh.`);
            await validateMigrationDependency(connection, dependency);
          }
        }
        console.log("Production preflight chỉ đọc đạt; không có DDL hoặc ghi ledger. Cần cờ phê duyệt riêng mới cho phép áp dụng.");
        } finally { await releaseMigrationLock(connection, lockName); }
        return;
      }
    }
    if (target.mode === "production" && argument("test-stop-after")) fail("Không được dùng cờ mô phỏng lỗi trong production.");
    const selection = argument("migration") ? argument("migration").split(",") : undefined;
    await applySelectedMigrations(connection, selection, {
      database: target.database,
      mode: target.mode,
      productionAuthorized: target.mode === "production" && target.apply,
      stopAfterStatement: Number(argument("test-stop-after")) || 0,
    });
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Voucher migration stopped: ${error.code || error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  applySelectedMigrations,
  splitSqlStatements,
  validateRestoreStatements,
  stableJson,
  metadata,
  fullDatabaseSnapshot,
  makeRestoreAttestation,
  restoreBackupToIsolatedDatabase,
  verifyRestoreAttestation,
  verifyBackupArtifact,
  verifyConnectionIdentity,
  assertTrustedIdentity,
  trustedServerFor,
  assertWritableTarget,
  acquireMigrationLock,
  releaseMigrationLock,
  validatePreexistingMigration,
  approvedMigrationSource,
  normalizeCheckExpression,
  assertCheck,
  assertColumns,
  assertIndex,
  migrationHasAnyObject,
  readBaseContract,
  baselineEvidence,
  baselineFingerprint,
  ensureBaseline,
  checksum,
  checksumMatches,
  assertChecksum,
  orderDataFingerprint,
  assertVoucher004,
  assertVoucher006,
  assertVoucher007,
  assertGallery008,
  assertShippingRegions009,
  assertProductDetails010,
  assertOfficialVouchers011,
  assertEmployeeRoles014,
  assertAdminCategoriesInventory005,
  reconcileCompletedMigration005,
  reconcileCompletedMigration014,
};
