// Kiểm thử API đơn hàng trên môi trường được cấu hình riêng, không dùng production.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const CSDL_THU_NGHIEM = "anh_nguyet_restore_test_20261106";
const URL_API_THU_NGHIEM = "http://127.0.0.1:5011/api";
process.env.DB_NAME = CSDL_THU_NGHIEM;
require("dotenv").config({ quiet: true });

const mysql = require("mysql2/promise");
const jwt = require("jsonwebtoken");

const duLieuTam = { userIds: [], addressIds: [], productIds: [] };
let ketNoiThuNghiem;

// Gửi yêu cầu HTTP đến API thử nghiệm và gắn JWT nếu bài kiểm tra cần.
function guiYeuCauThuNghiem(duongDan, { token, ...options } = {}) {
  return fetch(`${URL_API_THU_NGHIEM}${duongDan}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

// Chạy một ca kiểm tra rồi ghi kết quả bằng tiếng Việt.
async function chayKiemTra(tenKiemTra, hamKiemTra) {
  await hamKiemTra();
  console.log(`ĐẠT: ${tenKiemTra}`);
}

// Xóa dữ liệu tạm chỉ trong database thử nghiệm sau khi hoàn thành kiểm tra.
async function donDepDuLieuThuNghiem() {
  if (!ketNoiThuNghiem) return;
  if (duLieuTam.userIds.length) {
    await ketNoiThuNghiem.execute(
      `DELETE FROM orders WHERE customer_id IN (${duLieuTam.userIds.map(() => "?").join(",")})`,
      duLieuTam.userIds,
    );
  }
  if (duLieuTam.addressIds.length) {
    await ketNoiThuNghiem.execute(
      `DELETE FROM user_addresses WHERE id IN (${duLieuTam.addressIds.map(() => "?").join(",")})`,
      duLieuTam.addressIds,
    );
  }
  if (duLieuTam.productIds.length) {
    await ketNoiThuNghiem.execute(
      `DELETE FROM products WHERE id IN (${duLieuTam.productIds.map(() => "?").join(",")})`,
      duLieuTam.productIds,
    );
  }
  if (duLieuTam.userIds.length) {
    await ketNoiThuNghiem.execute(
      `DELETE FROM users WHERE id IN (${duLieuTam.userIds.map(() => "?").join(",")})`,
      duLieuTam.userIds,
    );
  }
}

// Xác minh database, chạy các ca API và luôn dọn dữ liệu kiểm thử.
async function chayKiemThu() {
  if (process.env.DB_NAME !== CSDL_THU_NGHIEM) {
    throw new Error("Đã dừng kiểm thử vì database đích không khớp");
  }

  ketNoiThuNghiem = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD,
    database: CSDL_THU_NGHIEM,
  });

  let failure;
  try {
    const [[currentDatabase]] = await ketNoiThuNghiem.query(
      "SELECT DATABASE() AS name",
    );
    assert.equal(currentDatabase.name, CSDL_THU_NGHIEM);

    const suffix = crypto.randomBytes(8).toString("hex");
    for (const number of [1, 2]) {
      const [userResult] = await ketNoiThuNghiem.execute(
        "INSERT INTO users (full_name, email, password) VALUES (?, ?, ?)",
        [
          `Kiểm thử API đơn hàng ${number}`,
          `order-api-test-${suffix}-${number}@example.invalid`,
          "test-only-not-a-password-hash",
        ],
      );
      duLieuTam.userIds.push(userResult.insertId);
    }

    for (let index = 0; index < 2; index += 1) {
      const [addressResult] = await ketNoiThuNghiem.execute(
        `INSERT INTO user_addresses (user_id, recipient_name, phone, address, is_default)
         VALUES (?, ?, ?, ?, 1)`,
        [
          duLieuTam.userIds[index],
          `Người nhận kiểm thử ${index + 1}`,
          "0000000000",
          "Test-only delivery address",
        ],
      );
      duLieuTam.addressIds.push(addressResult.insertId);
    }

    // Tạo một sản phẩm tạm để kiểm tra tồn kho và trạng thái kinh doanh.
    // Tạo một sản phẩm tạm để kiểm tra tồn kho và trạng thái kinh doanh.
    async function taoSanPhamThuNghiem(name, stock, active = 1) {
      const [result] = await ketNoiThuNghiem.execute(
        "INSERT INTO products (name, price, category, stock, active) VALUES (?, ?, ?, ?, ?)",
        [name, "12.34", "Test duLieuTam", stock, active],
      );
      duLieuTam.productIds.push(result.insertId);
      return result.insertId;
    }

    const availableProductId = await taoSanPhamThuNghiem(
      "Kiểm thử API đơn hàng available",
      7,
    );
    const emptyProductId = await taoSanPhamThuNghiem(
      "Kiểm thử API đơn hàng empty",
      0,
    );
    const limitedProductId = await taoSanPhamThuNghiem(
      "Kiểm thử API đơn hàng limited",
      1,
    );
    const inactiveProductId = await taoSanPhamThuNghiem(
      "Kiểm thử API đơn hàng inactive",
      3,
      0,
    );
    const concurrentProductId = await taoSanPhamThuNghiem(
      "Kiểm thử API đơn hàng concurrent",
      5,
    );
    const tokens = duLieuTam.userIds.map((id, index) =>
      jwt.sign(
        { id, email: `duLieuTam-${index}@example.invalid` },
        process.env.JWT_SECRET,
        { expiresIn: "5m" },
      ),
    );

    await chayKiemTra(
      "unauthenticated create and list are rejected",
      async () => {
        const body = JSON.stringify({
          address_id: duLieuTam.addressIds[0],
          items: [{ product_id: availableProductId, quantity: 1 }],
        });
        assert.equal(
          (await guiYeuCauThuNghiem("/orders", { method: "POST", body }))
            .status,
          401,
        );
        assert.equal((await guiYeuCauThuNghiem("/orders")).status, 401);
      },
    );

    await chayKiemTra("another customer's address is rejected", async () => {
      const response = await guiYeuCauThuNghiem("/orders", {
        token: tokens[0],
        method: "POST",
        body: JSON.stringify({
          address_id: duLieuTam.addressIds[1],
          items: [{ product_id: availableProductId, quantity: 1 }],
        }),
      });
      assert.equal(response.status, 400);
    });

    await chayKiemTra(
      "missing and inactive products are rejected",
      async () => {
        const missing = await guiYeuCauThuNghiem("/orders", {
          token: tokens[0],
          method: "POST",
          body: JSON.stringify({
            address_id: duLieuTam.addressIds[0],
            items: [{ product_id: 2147483647, quantity: 1 }],
          }),
        });
        const inactive = await guiYeuCauThuNghiem("/orders", {
          token: tokens[0],
          method: "POST",
          body: JSON.stringify({
            address_id: duLieuTam.addressIds[0],
            items: [{ product_id: inactiveProductId, quantity: 1 }],
          }),
        });
        assert.equal(missing.status, 404);
        assert.equal(inactive.status, 409);
      },
    );

    await chayKiemTra("zero and insufficient stock are rejected", async () => {
      const noStock = await guiYeuCauThuNghiem("/orders", {
        token: tokens[0],
        method: "POST",
        body: JSON.stringify({
          address_id: duLieuTam.addressIds[0],
          items: [{ product_id: emptyProductId, quantity: 1 }],
        }),
      });
      const insufficient = await guiYeuCauThuNghiem("/orders", {
        token: tokens[0],
        method: "POST",
        body: JSON.stringify({
          address_id: duLieuTam.addressIds[0],
          items: [{ product_id: limitedProductId, quantity: 2 }],
        }),
      });
      assert.equal(noStock.status, 409);
      assert.equal(insufficient.status, 409);
    });

    let ownOrderId;
    await chayKiemTra(
      "order uses the database price and decrements stock",
      async () => {
        const response = await guiYeuCauThuNghiem("/orders", {
          token: tokens[0],
          method: "POST",
          body: JSON.stringify({
            address_id: duLieuTam.addressIds[0],
            items: [{ product_id: availableProductId, quantity: 2, price: 0 }],
          }),
        });
        assert.equal(response.status, 201);
        const result = await response.json();
        ownOrderId = result.data.id;
        assert.equal(result.data.status, "pending_confirmation");
        assert.equal(result.data.subtotal, 24.68);
        assert.equal(result.data.items[0].unit_price, 12.34);
        const [[product]] = await ketNoiThuNghiem.execute(
          "SELECT stock FROM products WHERE id = ?",
          [availableProductId],
        );
        assert.equal(product.stock, 5);
      },
    );

    await chayKiemTra("customer can list and read own order", async () => {
      const list = await (
        await guiYeuCauThuNghiem("/orders", { token: tokens[0] })
      ).json();
      assert.ok(list.data.some((order) => order.id === ownOrderId));
      const detail = await guiYeuCauThuNghiem(`/orders/${ownOrderId}`, {
        token: tokens[0],
      });
      assert.equal(detail.status, 200);
      assert.equal((await detail.json()).data.items.length, 1);
    });

    await chayKiemTra(
      "customer cannot list or read another customer's order",
      async () => {
        const list = await (
          await guiYeuCauThuNghiem("/orders", { token: tokens[1] })
        ).json();
        assert.equal(list.data.length, 0);
        assert.equal(
          (
            await guiYeuCauThuNghiem(`/orders/${ownOrderId}`, {
              token: tokens[1],
            })
          ).status,
          404,
        );
      },
    );

    await chayKiemTra(
      "concurrent orders cannot oversell locked stock",
      async () => {
        const body = JSON.stringify({
          address_id: duLieuTam.addressIds[0],
          items: [{ product_id: concurrentProductId, quantity: 4 }],
        });
        const responses = await Promise.all([
          guiYeuCauThuNghiem("/orders", {
            token: tokens[0],
            method: "POST",
            body,
          }),
          guiYeuCauThuNghiem("/orders", {
            token: tokens[0],
            method: "POST",
            body,
          }),
        ]);
        assert.deepEqual(
          responses.map((response) => response.status).sort(),
          [201, 409],
        );
        const [[product]] = await ketNoiThuNghiem.execute(
          "SELECT stock FROM products WHERE id = ?",
          [concurrentProductId],
        );
        assert.equal(product.stock, 1);
      },
    );
  } catch (error) {
    failure = error;
  } finally {
    try {
      await donDepDuLieuThuNghiem();
      console.log(
        "Đã dọn dữ liệu kiểm thử trong database thử nghiệm đã xác minh.",
      );
    } catch (error) {
      failure = failure || error;
      console.error(
        `Dọn dữ liệu kiểm thử thất bại (${error.code || "UNKNOWN"}).`,
      );
    }
    await ketNoiThuNghiem.end();
  }

  if (failure) throw failure;
  console.log("Tất cả ca kiểm tra API đơn hàng đều đạt.");
}

chayKiemThu().catch((error) => {
  console.error(
    `Kiểm thử API đơn hàng thất bại (${error.code || error.message}).`,
  );
  process.exitCode = 1;
});
