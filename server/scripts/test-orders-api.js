const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const TEST_DATABASE = "anh_nguyet_restore_test_20261106";
const TEST_API = "http://127.0.0.1:5011/api";
process.env.DB_NAME = TEST_DATABASE;
require("dotenv").config({ quiet: true });

const mysql = require("mysql2/promise");
const jwt = require("jsonwebtoken");

const fixture = { userIds: [], addressIds: [], productIds: [] };
let connection;

function request(path, { token, ...options } = {}) {
  return fetch(`${TEST_API}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

async function runCheck(name, callback) {
  await callback();
  console.log(`PASS ${name}`);
}

async function cleanup() {
  if (!connection) return;
  if (fixture.userIds.length) {
    await connection.execute(
      `DELETE FROM orders WHERE customer_id IN (${fixture.userIds.map(() => "?").join(",")})`,
      fixture.userIds
    );
  }
  if (fixture.addressIds.length) {
    await connection.execute(
      `DELETE FROM user_addresses WHERE id IN (${fixture.addressIds.map(() => "?").join(",")})`,
      fixture.addressIds
    );
  }
  if (fixture.productIds.length) {
    await connection.execute(
      `DELETE FROM products WHERE id IN (${fixture.productIds.map(() => "?").join(",")})`,
      fixture.productIds
    );
  }
  if (fixture.userIds.length) {
    await connection.execute(
      `DELETE FROM users WHERE id IN (${fixture.userIds.map(() => "?").join(",")})`,
      fixture.userIds
    );
  }
}

async function main() {
  if (process.env.DB_NAME !== TEST_DATABASE) {
    throw new Error("Order API test aborted: target database mismatch");
  }

  connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD,
    database: TEST_DATABASE,
  });

  let failure;
  try {
    const [[currentDatabase]] = await connection.query("SELECT DATABASE() AS name");
    assert.equal(currentDatabase.name, TEST_DATABASE);

    const suffix = crypto.randomBytes(8).toString("hex");
    for (const number of [1, 2]) {
      const [userResult] = await connection.execute(
        "INSERT INTO users (full_name, email, password) VALUES (?, ?, ?)",
        [`Order API Test ${number}`, `order-api-test-${suffix}-${number}@example.invalid`, "test-only-not-a-password-hash"]
      );
      fixture.userIds.push(userResult.insertId);
    }

    for (let index = 0; index < 2; index += 1) {
      const [addressResult] = await connection.execute(
        `INSERT INTO user_addresses (user_id, recipient_name, phone, address, is_default)
         VALUES (?, ?, ?, ?, 1)`,
        [fixture.userIds[index], `Test Recipient ${index + 1}`, "0000000000", "Test-only delivery address"]
      );
      fixture.addressIds.push(addressResult.insertId);
    }

    async function addProduct(name, stock, active = 1) {
      const [result] = await connection.execute(
        "INSERT INTO products (name, price, category, stock, active) VALUES (?, ?, ?, ?, ?)",
        [name, "12.34", "Test fixture", stock, active]
      );
      fixture.productIds.push(result.insertId);
      return result.insertId;
    }

    const availableProductId = await addProduct("Order API fixture available", 7);
    const emptyProductId = await addProduct("Order API fixture empty", 0);
    const limitedProductId = await addProduct("Order API fixture limited", 1);
    const inactiveProductId = await addProduct("Order API fixture inactive", 3, 0);
    const concurrentProductId = await addProduct("Order API fixture concurrent", 5);
    const tokens = fixture.userIds.map((id, index) => jwt.sign(
      { id, email: `fixture-${index}@example.invalid` },
      process.env.JWT_SECRET,
      { expiresIn: "5m" }
    ));

    await runCheck("unauthenticated create and list are rejected", async () => {
      const body = JSON.stringify({ address_id: fixture.addressIds[0], items: [{ product_id: availableProductId, quantity: 1 }] });
      assert.equal((await request("/orders", { method: "POST", body })).status, 401);
      assert.equal((await request("/orders")).status, 401);
    });

    await runCheck("another customer's address is rejected", async () => {
      const response = await request("/orders", {
        token: tokens[0], method: "POST",
        body: JSON.stringify({ address_id: fixture.addressIds[1], items: [{ product_id: availableProductId, quantity: 1 }] }),
      });
      assert.equal(response.status, 400);
    });

    await runCheck("missing and inactive products are rejected", async () => {
      const missing = await request("/orders", {
        token: tokens[0], method: "POST",
        body: JSON.stringify({ address_id: fixture.addressIds[0], items: [{ product_id: 2147483647, quantity: 1 }] }),
      });
      const inactive = await request("/orders", {
        token: tokens[0], method: "POST",
        body: JSON.stringify({ address_id: fixture.addressIds[0], items: [{ product_id: inactiveProductId, quantity: 1 }] }),
      });
      assert.equal(missing.status, 404);
      assert.equal(inactive.status, 409);
    });

    await runCheck("zero and insufficient stock are rejected", async () => {
      const noStock = await request("/orders", {
        token: tokens[0], method: "POST",
        body: JSON.stringify({ address_id: fixture.addressIds[0], items: [{ product_id: emptyProductId, quantity: 1 }] }),
      });
      const insufficient = await request("/orders", {
        token: tokens[0], method: "POST",
        body: JSON.stringify({ address_id: fixture.addressIds[0], items: [{ product_id: limitedProductId, quantity: 2 }] }),
      });
      assert.equal(noStock.status, 409);
      assert.equal(insufficient.status, 409);
    });

    let ownOrderId;
    await runCheck("order uses the database price and decrements stock", async () => {
      const response = await request("/orders", {
        token: tokens[0], method: "POST",
        body: JSON.stringify({ address_id: fixture.addressIds[0], items: [{ product_id: availableProductId, quantity: 2, price: 0 }] }),
      });
      assert.equal(response.status, 201);
      const result = await response.json();
      ownOrderId = result.data.id;
      assert.equal(result.data.status, "pending_confirmation");
      assert.equal(result.data.subtotal, 24.68);
      assert.equal(result.data.items[0].unit_price, 12.34);
      const [[product]] = await connection.execute("SELECT stock FROM products WHERE id = ?", [availableProductId]);
      assert.equal(product.stock, 5);
    });

    await runCheck("customer can list and read own order", async () => {
      const list = await (await request("/orders", { token: tokens[0] })).json();
      assert.ok(list.data.some((order) => order.id === ownOrderId));
      const detail = await request(`/orders/${ownOrderId}`, { token: tokens[0] });
      assert.equal(detail.status, 200);
      assert.equal((await detail.json()).data.items.length, 1);
    });

    await runCheck("customer cannot list or read another customer's order", async () => {
      const list = await (await request("/orders", { token: tokens[1] })).json();
      assert.equal(list.data.length, 0);
      assert.equal((await request(`/orders/${ownOrderId}`, { token: tokens[1] })).status, 404);
    });

    await runCheck("concurrent orders cannot oversell locked stock", async () => {
      const body = JSON.stringify({ address_id: fixture.addressIds[0], items: [{ product_id: concurrentProductId, quantity: 4 }] });
      const responses = await Promise.all([
        request("/orders", { token: tokens[0], method: "POST", body }),
        request("/orders", { token: tokens[0], method: "POST", body }),
      ]);
      assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
      const [[product]] = await connection.execute("SELECT stock FROM products WHERE id = ?", [concurrentProductId]);
      assert.equal(product.stock, 1);
    });
  } catch (error) {
    failure = error;
  } finally {
    try {
      await cleanup();
      console.log("Temporary fixtures cleaned from the verified test database.");
    } catch (error) {
      failure = failure || error;
      console.error(`Fixture cleanup failed (${error.code || "UNKNOWN"}).`);
    }
    await connection.end();
  }

  if (failure) throw failure;
  console.log("All order API checks passed.");
}

main().catch((error) => {
  console.error(`Order API tests failed (${error.code || error.message}).`);
  process.exitCode = 1;
});
