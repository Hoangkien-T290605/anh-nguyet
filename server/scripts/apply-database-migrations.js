const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
require('../node_modules/dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('../node_modules/mysql2/promise');

function getArgument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const backupPath = getArgument('backup');
  if (!backupPath) throw new Error('Pass --backup=<verified pre-migration dump path>.');
  const backup = path.resolve(process.cwd(), backupPath);
  if (!fs.existsSync(backup) || fs.statSync(backup).size < 1000) {
    throw new Error('Verified pre-migration backup is missing or unexpectedly small.');
  }
  const dbName = process.env.DB_NAME || 'anh_nguyet';
  if (dbName !== 'anh_nguyet') throw new Error('Refusing to migrate a database other than anh_nguyet.');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: dbName,
    multipleStatements: true,
  });
  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(100) NOT NULL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    const directory = path.join(process.cwd(), 'database', 'migrations');
    const files = fs.readdirSync(directory).filter((file) => /^\d{3}_.+\.sql$/.test(file)).sort();
    for (const file of files) {
      const version = file.slice(0, 3);
      const sql = fs.readFileSync(path.join(directory, file), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      const [rows] = await connection.execute('SELECT checksum FROM schema_migrations WHERE version = ?', [version]);
      if (rows.length) {
        if (rows[0].checksum !== checksum) throw new Error(`Applied migration ${version} has changed; refusing to rerun it.`);
        console.log(`${version}: already applied`);
        continue;
      }
      console.log(`${version}: applying ${file}`);
      await connection.query(sql);
      await connection.execute('INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)', [version, file, checksum]);
      console.log(`${version}: applied`);
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`Migration stopped: ${error.code || error.message}`);
  process.exitCode = 1;
});
