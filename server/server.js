
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

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

// =========================
// HÀM HỖ TRỢ
// =========================

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

function formatReview(row) {
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
    rating: Number(row.rating),
    media,
  };
}

function formatUser(row) {
  return {
    id: Number(row.id),
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function formatAddress(row) {
  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    recipient_name: row.recipient_name,
    phone: row.phone,
    address: row.address,
    is_default: Boolean(row.is_default),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// Xác thực JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Vui lòng đăng nhập để tiếp tục",
    });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn",
    });
  }
}

// Kiểm tra dữ liệu sản phẩm
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

  if (
    body.description !== undefined &&
    typeof body.description !== "string"
  ) {
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

// Kiểm tra dữ liệu địa chỉ
function validateAddress(body) {
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

  if (
    typeof body.address !== "string" ||
    !body.address.trim()
  ) {
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

  return null;
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
      [normalizedEmail]
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
      ]
    );

    const [rows] = await pool.execute(
      `SELECT id, full_name, email, phone, address, created_at, updated_at
       FROM users WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: "Đăng ký tài khoản thành công",
      user: formatUser(rows[0]),
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

    const [rows] = await pool.execute(
      "SELECT * FROM users WHERE email = ?",
      [normalizedEmail]
    );

    if (!rows.length) {
      return res.status(401).json({
        success: false,
        message: "Email hoặc mật khẩu không chính xác",
      });
    }

    const userRow = rows[0];
    const passwordMatches = await bcrypt.compare(
      password,
      userRow.password
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Email hoặc mật khẩu không chính xác",
      });
    }

    const user = formatUser(userRow);
    const token = createToken(user);

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

// Lấy thông tin tài khoản đang đăng nhập
app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, full_name, email, phone, address, created_at, updated_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài khoản",
      });
    }

    res.json({
      success: true,
      user: formatUser(rows[0]),
    });
  } catch (error) {
    console.error("Lỗi lấy thông tin tài khoản:", error.message);

    res.status(500).json({
      success: false,
      message: "Không thể lấy thông tin tài khoản",
    });
  }
});

// Cập nhật thông tin tài khoản
app.put("/api/auth/me", authenticateToken, async (req, res) => {
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

    values.push(req.user.id);

    await pool.execute(
      `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
      values
    );

    const [rows] = await pool.execute(
      `SELECT id, full_name, email, phone, address, created_at, updated_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài khoản",
      });
    }

    res.json({
      success: true,
      message: "Cập nhật thông tin thành công",
      user: formatUser(rows[0]),
    });
  } catch (error) {
    console.error("Lỗi cập nhật tài khoản:", error.message);

    res.status(500).json({
      success: false,
      message: "Không thể cập nhật thông tin tài khoản",
    });
  }
});

// =========================
// API QUẢN LÝ ĐỊA CHỈ
// =========================

// Lấy danh sách địa chỉ của tài khoản
app.get("/api/auth/addresses", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT *
       FROM user_addresses
       WHERE user_id = ?
       ORDER BY is_default DESC, created_at DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      count: rows.length,
      data: rows.map(formatAddress),
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
app.post("/api/auth/addresses", authenticateToken, async (req, res) => {
  const validationError = validateAddress(req.body);

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
      [req.user.id]
    );

    const shouldBeDefault =
      req.body.is_default === true ||
      req.body.is_default === 1 ||
      existingRows.length === 0;

    if (shouldBeDefault) {
      await connection.execute(
        "UPDATE user_addresses SET is_default = FALSE WHERE user_id = ?",
        [req.user.id]
      );
    }

    const [result] = await connection.execute(
      `INSERT INTO user_addresses
        (user_id, recipient_name, phone, address, is_default)
       VALUES (?, ?, ?, ?, ?)`,
      [
        req.user.id,
        req.body.recipient_name.trim(),
        req.body.phone.trim(),
        req.body.address.trim(),
        shouldBeDefault,
      ]
    );

    const [rows] = await connection.execute(
      "SELECT * FROM user_addresses WHERE id = ? AND user_id = ?",
      [result.insertId, req.user.id]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      message: "Thêm địa chỉ thành công",
      data: formatAddress(rows[0]),
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
app.put("/api/auth/addresses/:id", authenticateToken, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      success: false,
      message: "ID địa chỉ không hợp lệ",
    });
  }

  const validationError = validateAddress(req.body);

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
      [id, req.user.id]
    );

    if (!existingRows.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy địa chỉ",
      });
    }

    const shouldBeDefault =
      req.body.is_default === undefined
        ? Boolean(existingRows[0].is_default)
        : req.body.is_default === true || req.body.is_default === 1;

    if (shouldBeDefault) {
      await connection.execute(
        "UPDATE user_addresses SET is_default = FALSE WHERE user_id = ?",
        [req.user.id]
      );
    }

    await connection.execute(
      `UPDATE user_addresses
       SET recipient_name = ?, phone = ?, address = ?, is_default = ?
       WHERE id = ? AND user_id = ?`,
      [
        req.body.recipient_name.trim(),
        req.body.phone.trim(),
        req.body.address.trim(),
        shouldBeDefault,
        id,
        req.user.id,
      ]
    );

    const [rows] = await connection.execute(
      "SELECT * FROM user_addresses WHERE id = ? AND user_id = ?",
      [id, req.user.id]
    );

    await connection.commit();

    res.json({
      success: true,
      message: "Cập nhật địa chỉ thành công",
      data: formatAddress(rows[0]),
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
app.patch(
  "/api/auth/addresses/:id/default",
  authenticateToken,
  async (req, res) => {
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
        "SELECT id FROM user_addresses WHERE id = ? AND user_id = ?",
        [id, req.user.id]
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
        [req.user.id]
      );

      await connection.execute(
        "UPDATE user_addresses SET is_default = TRUE WHERE id = ? AND user_id = ?",
        [id, req.user.id]
      );

      const [rows] = await connection.execute(
        "SELECT * FROM user_addresses WHERE id = ? AND user_id = ?",
        [id, req.user.id]
      );

      await connection.commit();

      res.json({
        success: true,
        message: "Đã đặt địa chỉ mặc định",
        data: formatAddress(rows[0]),
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
  }
);

// Xóa địa chỉ
app.delete(
  "/api/auth/addresses/:id",
  authenticateToken,
  async (req, res) => {
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
        [id, req.user.id]
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
        [id, req.user.id]
      );

      if (wasDefault) {
        const [remainingRows] = await connection.execute(
          `SELECT id
           FROM user_addresses
           WHERE user_id = ?
           ORDER BY created_at ASC, id ASC
           LIMIT 1`,
          [req.user.id]
        );

        if (remainingRows.length) {
          await connection.execute(
            "UPDATE user_addresses SET is_default = TRUE WHERE id = ? AND user_id = ?",
            [remainingRows[0].id, req.user.id]
          );
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
  }
);

// =========================
// API SẢN PHẨM
// =========================

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

// Lấy đánh giá và thống kê đánh giá
app.get("/api/products/:id/reviews", async (req, res) => {
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
      [productId]
    );

    if (!products.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sản phẩm",
      });
    }

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
       WHERE product_id = ?`,
      [productId]
    );

    const summaryRow = summaryRows[0];

    const summary = {
      averageRating: Number(
        Number(summaryRow.averageRating).toFixed(1)
      ),
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
        media,
        created_at
       FROM product_reviews
       WHERE product_id = ?
       ORDER BY created_at DESC, id DESC`,
      [productId]
    );

    const reviews = reviewRows.map(formatReview);

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

    const setClause = updates
      .map((field) => `\`${field}\` = ?`)
      .join(", ");

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

// =========================
// KHỞI ĐỘNG BACKEND
// =========================

async function startServer() {
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
