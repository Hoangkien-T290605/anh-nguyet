
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Kết nối MySQL bằng connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "anh_nguyet",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Chuẩn hóa dữ liệu để tương thích với giao diện đang dùng product._id
function formatProduct(row) {
  return {
    ...row,
    _id: String(row.id),
    price: Number(row.price),
    stock: Number(row.stock),
    featured: Boolean(row.featured),
    active: Boolean(row.active),
  };
}

function validateProduct(body, partial = false) {
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

function getProductValues(body) {
  return {
    name: body.name.trim(),
    description: body.description ?? "",
    price: Number(body.price),
    category: body.category.trim(),
    image: body.image ?? "",
    stock: body.stock === undefined ? 0 : Number(body.stock),
    featured: body.featured === true || body.featured === 1,
    active: body.active === undefined
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

// API kiểm tra backend
app.get("/api/hello", (req, res) => {
  res.json({
    success: true,
    message: "Backend Ánh Nguyệt đang hoạt động!",
  });
});

// Kiểm tra kết nối database
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      success: true,
      database: "connected",
    });
  } catch (error) {
    console.error("Lỗi kiểm tra MySQL:", error.message);

    res.status(503).json({
      success: false,
      database: "disconnected",
    });
  }
});

// Lấy danh sách sản phẩm
app.get("/api/products", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM products ORDER BY created_at DESC"
    );

    const products = rows.map(formatProduct);

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

// Thêm sản phẩm
app.post("/api/products", async (req, res) => {
  try {
    const errors = validateProduct(req.body);

    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: errors.join("; "),
      });
    }

    const product = getProductValues(req.body);

    const [result] = await pool.execute(
      `INSERT INTO products
        (name, description, price, category, image, stock, featured, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        product.name,
        product.description,
        product.price,
        product.category,
        product.image,
        product.stock,
        product.featured,
        product.active,
      ]
    );

    const [rows] = await pool.execute(
      "SELECT * FROM products WHERE id = ?",
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: "Thêm sản phẩm thành công",
      data: formatProduct(rows[0]),
    });
  } catch (error) {
    console.error("Lỗi thêm sản phẩm:", error.message);

    res.status(500).json({
      success: false,
      message: "Không thể thêm sản phẩm",
    });
  }
});

// Cập nhật sản phẩm
app.put("/api/products/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "ID sản phẩm không hợp lệ",
      });
    }

    const errors = validateProduct(req.body, true);

    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: errors.join("; "),
      });
    }

    const updates = allowedFields.filter(
      (field) => req.body[field] !== undefined
    );

    if (!updates.length) {
      return res.status(400).json({
        success: false,
        message: "Không có thông tin cần cập nhật",
      });
    }

    const values = updates.map((field) => {
      const value = req.body[field];

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
      [...values, id]
    );

    if (result.affectedRows === 0) {
      const [existing] = await pool.execute(
        "SELECT id FROM products WHERE id = ?",
        [id]
      );

      if (!existing.length) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy sản phẩm",
        });
      }
    }

    const [rows] = await pool.execute(
      "SELECT * FROM products WHERE id = ?",
      [id]
    );

    res.json({
      success: true,
      message: "Cập nhật sản phẩm thành công",
      data: formatProduct(rows[0]),
    });
  } catch (error) {
    console.error("Lỗi cập nhật sản phẩm:", error.message);

    res.status(500).json({
      success: false,
      message: "Không thể cập nhật sản phẩm",
    });
  }
});

// Xóa sản phẩm
app.delete("/api/products/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "ID sản phẩm không hợp lệ",
      });
    }

    const [result] = await pool.execute(
      "DELETE FROM products WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sản phẩm",
      });
    }

    res.json({
      success: true,
      message: "Xóa sản phẩm thành công",
    });
  } catch (error) {
    console.error("Lỗi xóa sản phẩm:", error.message);

    res.status(500).json({
      success: false,
      message: "Không thể xóa sản phẩm",
    });
  }
});

// Khởi động backend sau khi kiểm tra kết nối database
async function startServer() {
  try {
    if (!process.env.DB_PASSWORD) {
      throw new Error("Chưa cấu hình DB_PASSWORD trong server/.env");
    }

    const connection = await pool.getConnection();

    try {
      await connection.ping();
      console.log("Đã kết nối MySQL thành công!");
    } finally {
      connection.release();
    }

    app.listen(PORT, () => {
      console.log(`Backend Ánh Nguyệt đang chạy tại port ${PORT}`);
    });
  } catch (error) {
    console.error("Không thể khởi động backend:", error.message);
    process.exit(1);
  }
}

startServer();
