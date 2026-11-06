const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// =========================
// CẤU HÌNH UPLOAD ẢNH
// =========================

const avatarDirectory = path.join(__dirname, "uploads", "avatars");

fs.mkdirSync(avatarDirectory, { recursive: true });

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const allowedImageTypes = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const avatarStorage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, avatarDirectory);
  },

  filename: (req, file, callback) => {
    const extension = allowedImageTypes[file.mimetype];
    const filename =
      `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`;

    callback(null, filename);
  },
});

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, callback) => {
    if (!allowedImageTypes[file.mimetype]) {
      return callback(
        new Error("Chỉ chấp nhận ảnh JPG, PNG, WEBP hoặc GIF")
      );
    }

    callback(null, true);
  },
}).single("avatar");

async function deleteOldAvatar(avatarUrl) {
  if (
    typeof avatarUrl !== "string" ||
    !avatarUrl.startsWith("/uploads/avatars/")
  ) {
    return;
  }

  const filename = path.basename(avatarUrl);

  if (!filename || filename === "." || filename === "..") {
    return;
  }

  const filePath = path.join(avatarDirectory, filename);

  try {
    await fs.promises.unlink(filePath);
    console.log("Đã xóa ảnh đại diện cũ:", filename);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Lỗi xóa ảnh đại diện cũ:", error.message);
    }
  }
}

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
// QUẢN LÝ MÃ OTP ĐỔI MẬT KHẨU
// =========================

const passwordOtpStore = new Map();

function createMailTransporter() {
  const email = process.env.GMAIL_USER;
  const appPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");

  if (!email || !appPassword) {
    throw new Error(
      "Chưa cấu hình GMAIL_USER và GMAIL_APP_PASSWORD trong file .env"
    );
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: email,
      pass: appPassword,
    },
  });
}

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
    avatar_url: row.avatar_url || null,
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
    latitude:
      row.latitude === null || row.latitude === undefined
        ? null
        : Number(row.latitude),
    longitude:
      row.longitude === null || row.longitude === undefined
        ? null
        : Number(row.longitude),
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

// Kiểm tra tọa độ bản đồ
function validateCoordinates(body) {
  const { latitude, longitude } = body;

  if (
    (latitude === null) !== (longitude === null)
  ) {
    return "Vui lòng cung cấp đầy đủ kinh độ và vĩ độ";
  }

  if (latitude === undefined && longitude === undefined) {
    return null;
  }

  if (latitude === null && longitude === null) {
    return null;
  }

  if (
    latitude === undefined ||
    longitude === undefined ||
    latitude === "" ||
    longitude === "" ||
    !Number.isFinite(Number(latitude)) ||
    !Number.isFinite(Number(longitude))
  ) {
    return "Tọa độ bản đồ không hợp lệ";
  }

  if (Number(latitude) < -90 || Number(latitude) > 90) {
    return "Vĩ độ phải nằm trong khoảng -90 đến 90";
  }

  if (Number(longitude) < -180 || Number(longitude) > 180) {
    return "Kinh độ phải nằm trong khoảng -180 đến 180";
  }

  return null;
}

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

  return validateCoordinates(body);
}

const ORDER_STATUSES = new Set([
  "pending_confirmation",
  "confirmed",
  "preparing",
  "shipping",
  "completed",
  "cancelled",
]);

class OrderApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parsePositiveInteger(value, fieldName) {
  const normalized = typeof value === "string" ? value.trim() : value;
  if (
    (typeof normalized !== "number" && !/^\d+$/.test(String(normalized))) ||
    !Number.isSafeInteger(Number(normalized)) ||
    Number(normalized) < 1
  ) {
    throw new OrderApiError(400, `${fieldName} không hợp lệ`);
  }
  return Number(normalized);
}

function toMoneyCents(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) throw new Error("Giá sản phẩm trong database không hợp lệ");
  return BigInt(match[1]) * 100n + BigInt((match[2] || "").padEnd(2, "0"));
}

function fromMoneyCents(cents) {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

function formatOrderItem(row) {
  return {
    id: String(row.id),
    product_id: row.product_id === null ? null : Number(row.product_id),
    product_name: row.product_name,
    product_category: row.product_category,
    product_image: row.product_image,
    unit_price: Number(row.unit_price),
    quantity: Number(row.quantity),
    line_total: Number(row.line_total),
  };
}

function formatOrder(row, items = []) {
  return {
    id: String(row.id),
    user_address_id: row.user_address_id === null ? null : Number(row.user_address_id),
    recipient_name: row.recipient_name,
    recipient_phone: row.recipient_phone,
    shipping_address: row.shipping_address,
    subtotal: Number(row.subtotal),
    shipping_fee: row.shipping_fee === null ? null : Number(row.shipping_fee),
    total_amount: Number(row.total_amount),
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    items,
  };
}

async function loadOrderItems(connection, orderIds) {
  if (!orderIds.length) return new Map();
  const placeholders = orderIds.map(() => "?").join(",");
  const [rows] = await connection.execute(
    `SELECT id, order_id, product_id, product_name, product_category,
            product_image, unit_price, quantity, line_total
     FROM order_items
     WHERE order_id IN (${placeholders})
     ORDER BY id ASC`,
    orderIds
  );
  const grouped = new Map();
  for (const row of rows) {
    const key = String(row.order_id);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(formatOrderItem(row));
  }
  return grouped;
}

// Đồng bộ địa chỉ mặc định vào hồ sơ tài khoản
async function syncDefaultAddressToProfile(connection, userId, address) {
  await connection.execute(
    "UPDATE users SET address = ? WHERE id = ?",
    [address || null, userId]
  );
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
      `SELECT id, full_name, email, phone, address, avatar_url,
              created_at, updated_at
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

// Lấy thông tin tài khoản
app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, full_name, email, phone, address, avatar_url,
              created_at, updated_at
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

// Cập nhật thông tin tài khoản và đồng bộ địa chỉ
app.put("/api/auth/me", authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();

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

    await connection.beginTransaction();

    const [userRows] = await connection.execute(
      `SELECT id, full_name, phone, address
       FROM users WHERE id = ? FOR UPDATE`,
      [req.user.id]
    );

    if (!userRows.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài khoản",
      });
    }

    const currentUser = userRows[0];

    values.push(req.user.id);

    await connection.execute(
      `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
      values
    );

    if (address !== undefined && address?.trim()) {
      const [defaultRows] = await connection.execute(
        `SELECT id
         FROM user_addresses
         WHERE user_id = ? AND is_default = TRUE
         LIMIT 1`,
        [req.user.id]
      );

      if (defaultRows.length) {
        await connection.execute(
          `UPDATE user_addresses
           SET address = ?, latitude = NULL, longitude = NULL
           WHERE id = ? AND user_id = ?`,
          [
            address.trim(),
            defaultRows[0].id,
            req.user.id,
          ]
        );
      } else if (phone?.trim() || currentUser.phone) {
        const recipientPhone = phone?.trim() || currentUser.phone;

        await connection.execute(
          `UPDATE user_addresses
           SET is_default = FALSE
           WHERE user_id = ?`,
          [req.user.id]
        );

        await connection.execute(
          `INSERT INTO user_addresses
            (user_id, recipient_name, phone, address, is_default)
           VALUES (?, ?, ?, ?, TRUE)`,
          [
            req.user.id,
            full_name?.trim() || currentUser.full_name,
            recipientPhone,
            address.trim(),
          ]
        );
      }
    }

    const [rows] = await connection.execute(
      `SELECT id, full_name, email, phone, address, avatar_url,
              created_at, updated_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    await connection.commit();

    res.json({
      success: true,
      message: "Cập nhật thông tin thành công",
      user: formatUser(rows[0]),
    });
  } catch (error) {
    await connection.rollback();

    console.error("Lỗi cập nhật tài khoản:", error.message);

    res.status(500).json({
      success: false,
      message: "Không thể cập nhật thông tin tài khoản",
    });
  } finally {
    connection.release();
  }
});

// =========================
// API ĐỔI MẬT KHẨU BẰNG OTP
// =========================

// Bước 1: Kiểm tra mật khẩu hiện tại và gửi OTP
app.post(
  "/api/auth/change-password/request-otp",
  authenticateToken,
  async (req, res) => {
    try {
      const {
        current_password,
        new_password,
        confirm_password,
      } = req.body;

      if (
        typeof current_password !== "string" ||
        !current_password ||
        typeof new_password !== "string" ||
        typeof confirm_password !== "string"
      ) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng nhập đầy đủ thông tin mật khẩu",
        });
      }

      if (new_password.length < 8) {
        return res.status(400).json({
          success: false,
          message: "Mật khẩu mới phải có ít nhất 8 ký tự",
        });
      }

      if (new_password.length > 72) {
        return res.status(400).json({
          success: false,
          message: "Mật khẩu mới không được vượt quá 72 ký tự",
        });
      }

      if (new_password !== confirm_password) {
        return res.status(400).json({
          success: false,
          message: "Mật khẩu xác nhận không khớp",
        });
      }

      const [users] = await pool.execute(
        "SELECT id, email, password FROM users WHERE id = ?",
        [req.user.id]
      );

      if (!users.length) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy tài khoản",
        });
      }

      const user = users[0];

      const passwordMatches = await bcrypt.compare(
        current_password,
        user.password
      );

      if (!passwordMatches) {
        return res.status(400).json({
          success: false,
          message: "Mật khẩu hiện tại không chính xác",
        });
      }

      const isSamePassword = await bcrypt.compare(
        new_password,
        user.password
      );

      if (isSamePassword) {
        return res.status(400).json({
          success: false,
          message: "Mật khẩu mới phải khác mật khẩu hiện tại",
        });
      }

      if (!user.email) {
        return res.status(400).json({
          success: false,
          message: "Tài khoản chưa có địa chỉ email",
        });
      }

      const otp = crypto.randomInt(100000, 1000000).toString();

      const otpHash = crypto
        .createHash("sha256")
        .update(otp)
        .digest("hex");

      const newPasswordHash = await bcrypt.hash(new_password, 12);

      passwordOtpStore.set(String(req.user.id), {
        otpHash,
        newPasswordHash,
        expiresAt: Date.now() + 5 * 60 * 1000,
        attempts: 0,
      });

      try {
        const transporter = createMailTransporter();

        await transporter.sendMail({
          from: `"Ánh Nguyệt" <${process.env.GMAIL_USER}>`,
          to: user.email,
          subject: "Mã xác nhận đổi mật khẩu - Ánh Nguyệt",
          text:
            `Xin chào,\n\n` +
            `Mã OTP để xác nhận đổi mật khẩu của bạn là: ${otp}\n\n` +
            `Mã có hiệu lực trong 5 phút.\n` +
            `Vui lòng không chia sẻ mã này với bất kỳ ai.\n\n` +
            `Trân trọng,\nÁnh Nguyệt`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#342747">
              <h2 style="color:#8056a8">Ánh Nguyệt</h2>
              <h3>Xác nhận đổi mật khẩu</h3>
              <p>Xin chào,</p>
              <p>Mã OTP xác nhận đổi mật khẩu của bạn là:</p>
              <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#8056a8;padding:18px 0">
                ${otp}
              </div>
              <p>Mã có hiệu lực trong <strong>5 phút</strong>.</p>
              <p>Vui lòng không chia sẻ mã này với bất kỳ ai.</p>
              <hr style="border:none;border-top:1px solid #eee">
              <p style="color:#888;font-size:12px">
                Email tự động từ hệ thống Ánh Nguyệt. Vui lòng không trả lời email này.
              </p>
            </div>
          `,
        });
      } catch (mailError) {
        passwordOtpStore.delete(String(req.user.id));

        console.error("Lỗi gửi email OTP:", mailError.message);

        return res.status(500).json({
          success: false,
          message:
            "Không thể gửi mã OTP. Vui lòng kiểm tra cấu hình email trong server/.env",
        });
      }

      res.json({
        success: true,
        message: "Mã OTP đã được gửi đến email đăng ký của bạn",
      });
    } catch (error) {
      console.error("Lỗi yêu cầu OTP đổi mật khẩu:", error.message);

      res.status(500).json({
        success: false,
        message: "Không thể gửi mã OTP",
      });
    }
  }
);

// Bước 2: Xác nhận OTP và cập nhật mật khẩu
app.post(
  "/api/auth/change-password/verify-otp",
  authenticateToken,
  async (req, res) => {
    try {
      const { otp } = req.body;

      if (
        typeof otp !== "string" ||
        !/^\d{6}$/.test(otp)
      ) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng nhập mã OTP gồm 6 chữ số",
        });
      }

      const userId = String(req.user.id);
      const otpData = passwordOtpStore.get(userId);

      if (!otpData) {
        return res.status(400).json({
          success: false,
          message: "Không tìm thấy mã OTP. Vui lòng yêu cầu gửi mã mới",
        });
      }

      if (Date.now() > otpData.expiresAt) {
        passwordOtpStore.delete(userId);

        return res.status(400).json({
          success: false,
          message: "Mã OTP đã hết hạn. Vui lòng yêu cầu gửi mã mới",
        });
      }

      if (otpData.attempts >= 5) {
        passwordOtpStore.delete(userId);

        return res.status(400).json({
          success: false,
          message: "Bạn đã nhập sai OTP quá số lần cho phép. Vui lòng gửi mã mới",
        });
      }

      const submittedOtpHash = crypto
        .createHash("sha256")
        .update(otp)
        .digest("hex");

      if (submittedOtpHash !== otpData.otpHash) {
        otpData.attempts += 1;

        if (otpData.attempts >= 5) {
          passwordOtpStore.delete(userId);
        }

        return res.status(400).json({
          success: false,
          message: "Mã OTP không chính xác",
        });
      }

      const [result] = await pool.execute(
        `UPDATE users
         SET password = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [otpData.newPasswordHash, req.user.id]
      );

      if (result.affectedRows === 0) {
        passwordOtpStore.delete(userId);

        return res.status(404).json({
          success: false,
          message: "Không tìm thấy tài khoản để cập nhật mật khẩu",
        });
      }

      passwordOtpStore.delete(userId);

      res.json({
        success: true,
        message: "Đổi mật khẩu thành công",
      });
    } catch (error) {
      console.error("Lỗi xác nhận OTP:", error.message);

      res.status(500).json({
        success: false,
        message: "Không thể xác nhận OTP và đổi mật khẩu",
      });
    }
  }
);

// =========================
// API ẢNH ĐẠI DIỆN
// =========================

app.post(
  "/api/auth/avatar",
  authenticateToken,
  (req, res, next) => {
    uploadAvatar(req, res, (error) => {
      if (error) {
        let message = error.message;

        if (error instanceof multer.MulterError) {
          if (error.code === "LIMIT_FILE_SIZE") {
            message = "Ảnh đại diện không được vượt quá 5MB";
          } else {
            message = "Không thể tải ảnh lên";
          }
        }

        return res.status(400).json({
          success: false,
          message,
        });
      }

      next();
    });
  },
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng chọn ảnh đại diện",
      });
    }

    const newAvatarUrl = `/uploads/avatars/${req.file.filename}`;

    try {
      const [existingRows] = await pool.execute(
        "SELECT avatar_url FROM users WHERE id = ?",
        [req.user.id]
      );

      if (!existingRows.length) {
        await deleteOldAvatar(newAvatarUrl);

        return res.status(404).json({
          success: false,
          message: "Không tìm thấy tài khoản",
        });
      }

      const oldAvatarUrl = existingRows[0].avatar_url;

      await pool.execute(
        "UPDATE users SET avatar_url = ? WHERE id = ?",
        [newAvatarUrl, req.user.id]
      );

      const [rows] = await pool.execute(
        `SELECT id, full_name, email, phone, address, avatar_url,
                created_at, updated_at
         FROM users WHERE id = ?`,
        [req.user.id]
      );

      if (oldAvatarUrl && oldAvatarUrl !== newAvatarUrl) {
        await deleteOldAvatar(oldAvatarUrl);
      }

      res.json({
        success: true,
        message: "Cập nhật ảnh đại diện thành công",
        avatar_url: newAvatarUrl,
        user: formatUser(rows[0]),
      });
    } catch (error) {
      await deleteOldAvatar(newAvatarUrl);

      console.error("Lỗi upload ảnh đại diện:", error.message);

      res.status(500).json({
        success: false,
        message: "Không thể cập nhật ảnh đại diện",
      });
    }
  }
);

// =========================
// API QUẢN LÝ ĐỊA CHỈ
// =========================

// Lấy danh sách địa chỉ
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
        (user_id, recipient_name, phone, address,
         is_default, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        req.body.recipient_name.trim(),
        req.body.phone.trim(),
        req.body.address.trim(),
        shouldBeDefault,
        req.body.latitude ?? null,
        req.body.longitude ?? null,
      ]
    );

    if (shouldBeDefault) {
      await syncDefaultAddressToProfile(
        connection,
        req.user.id,
        req.body.address.trim()
      );
    }

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

    const oldAddress = existingRows[0];

    const shouldBeDefault =
      req.body.is_default === undefined
        ? Boolean(oldAddress.is_default)
        : req.body.is_default === true || req.body.is_default === 1;

    const latitude =
      req.body.latitude === undefined
        ? oldAddress.latitude
        : req.body.latitude;

    const longitude =
      req.body.longitude === undefined
        ? oldAddress.longitude
        : req.body.longitude;

    if (shouldBeDefault) {
      await connection.execute(
        "UPDATE user_addresses SET is_default = FALSE WHERE user_id = ?",
        [req.user.id]
      );
    }

    await connection.execute(
      `UPDATE user_addresses
       SET recipient_name = ?,
           phone = ?,
           address = ?,
           is_default = ?,
           latitude = ?,
           longitude = ?
       WHERE id = ? AND user_id = ?`,
      [
        req.body.recipient_name.trim(),
        req.body.phone.trim(),
        req.body.address.trim(),
        shouldBeDefault,
        latitude,
        longitude,
        id,
        req.user.id,
      ]
    );

    if (shouldBeDefault) {
      await syncDefaultAddressToProfile(
        connection,
        req.user.id,
        req.body.address.trim()
      );
    }

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

      await connection.execute(
        "UPDATE user_addresses SET is_default = FALSE WHERE user_id = ?",
        [req.user.id]
      );

      await connection.execute(
        `UPDATE user_addresses
         SET is_default = TRUE
         WHERE id = ? AND user_id = ?`,
        [id, req.user.id]
      );

      await syncDefaultAddressToProfile(
        connection,
        req.user.id,
        existingRows[0].address
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
          `SELECT *
           FROM user_addresses
           WHERE user_id = ?
           ORDER BY created_at ASC, id ASC
           LIMIT 1`,
          [req.user.id]
        );

        if (remainingRows.length) {
          await connection.execute(
            `UPDATE user_addresses
             SET is_default = TRUE
             WHERE id = ? AND user_id = ?`,
            [remainingRows[0].id, req.user.id]
          );

          await syncDefaultAddressToProfile(
            connection,
            req.user.id,
            remainingRows[0].address
          );
        } else {
          await syncDefaultAddressToProfile(
            connection,
            req.user.id,
            null
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

// =========================
// API ĐƠN HÀNG
// =========================

app.post("/api/orders", authenticateToken, async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new OrderApiError(400, "Dữ liệu đơn hàng không hợp lệ");
    }

    const addressId = parsePositiveInteger(body.address_id, "Địa chỉ nhận hàng");
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) {
      throw new OrderApiError(400, "Đơn hàng phải có từ 1 đến 100 sản phẩm");
    }

    const requestedItems = body.items.map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new OrderApiError(400, `Sản phẩm thứ ${index + 1} không hợp lệ`);
      }
      const productId = parsePositiveInteger(item.product_id, `Mã sản phẩm thứ ${index + 1}`);
      const quantity = parsePositiveInteger(item.quantity, `Số lượng sản phẩm thứ ${index + 1}`);
      if (quantity > 1000000) {
        throw new OrderApiError(400, "Số lượng mỗi sản phẩm vượt giới hạn cho phép");
      }
      return { productId, quantity };
    });

    const requestedIds = requestedItems.map((item) => item.productId);
    if (new Set(requestedIds).size !== requestedIds.length) {
      throw new OrderApiError(400, "Mỗi sản phẩm chỉ được xuất hiện một lần trong đơn hàng");
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [addressRows] = await connection.execute(
      `SELECT id, recipient_name, phone, address
       FROM user_addresses
       WHERE id = ? AND user_id = ?
       FOR UPDATE`,
      [addressId, req.user.id]
    );
    if (!addressRows.length) {
      throw new OrderApiError(400, "Địa chỉ nhận hàng không hợp lệ");
    }
    const address = addressRows[0];

    const productsById = new Map();
    for (const productId of [...requestedIds].sort((a, b) => a - b)) {
      const [productRows] = await connection.execute(
        `SELECT id, name, category, image, price, stock, active
         FROM products
         WHERE id = ?
         FOR UPDATE`,
        [productId]
      );
      if (!productRows.length) {
        throw new OrderApiError(404, `Không tìm thấy sản phẩm mã ${productId}`);
      }
      const product = productRows[0];
      if (!product.active) {
        throw new OrderApiError(409, `Sản phẩm “${product.name}” hiện không kinh doanh`);
      }
      const requested = requestedItems.find((item) => item.productId === productId);
      if (Number(product.stock) < requested.quantity) {
        throw new OrderApiError(409, `Sản phẩm “${product.name}” không đủ tồn kho`);
      }
      productsById.set(productId, product);
    }

    const orderItems = requestedItems.map(({ productId, quantity }) => {
      const product = productsById.get(productId);
      const unitPriceCents = toMoneyCents(product.price);
      const lineTotalCents = unitPriceCents * BigInt(quantity);
      return {
        productId,
        product,
        quantity,
        unitPriceCents,
        lineTotalCents,
      };
    });

    const subtotalCents = orderItems.reduce((sum, item) => sum + item.lineTotalCents, 0n);
    const maxOrderCents = 99999999999999n; // DECIMAL(14,2)
    if (subtotalCents > maxOrderCents) {
      throw new OrderApiError(400, "Tổng tiền đơn hàng vượt giới hạn cho phép");
    }

    for (const item of orderItems) {
      const [stockResult] = await connection.execute(
        `UPDATE products
         SET stock = stock - ?
         WHERE id = ? AND active = 1 AND stock >= ?`,
        [item.quantity, item.productId, item.quantity]
      );
      if (stockResult.affectedRows !== 1) {
        throw new OrderApiError(409, `Tồn kho sản phẩm “${item.product.name}” vừa thay đổi`);
      }
    }

    const subtotal = fromMoneyCents(subtotalCents);
    const [orderResult] = await connection.execute(
      `INSERT INTO orders
        (customer_id, user_address_id, recipient_name, recipient_phone,
         shipping_address, subtotal, shipping_fee, total_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'pending_confirmation')`,
      [
        req.user.id,
        address.id,
        address.recipient_name,
        address.phone,
        address.address,
        subtotal,
        subtotal,
      ]
    );

    const orderId = orderResult.insertId;
    for (const item of orderItems) {
      await connection.execute(
        `INSERT INTO order_items
          (order_id, product_id, product_name, product_category, product_image,
           unit_price, quantity, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.productId,
          item.product.name,
          item.product.category,
          item.product.image || null,
          fromMoneyCents(item.unitPriceCents),
          item.quantity,
          fromMoneyCents(item.lineTotalCents),
        ]
      );
    }

    await connection.commit();
    transactionStarted = false;

    const createdAt = new Date();
    res.status(201).json({
      success: true,
      message: "Đơn hàng đã được tạo và đang chờ xác nhận",
      data: {
        id: String(orderId),
        user_address_id: Number(address.id),
        recipient_name: address.recipient_name,
        recipient_phone: address.phone,
        shipping_address: address.address,
        subtotal: Number(subtotal),
        shipping_fee: null,
        total_amount: Number(subtotal),
        status: "pending_confirmation",
        created_at: createdAt,
        updated_at: createdAt,
        items: orderItems.map((item) => ({
          product_id: item.productId,
          product_name: item.product.name,
          product_category: item.product.category,
          product_image: item.product.image || null,
          unit_price: Number(fromMoneyCents(item.unitPriceCents)),
          quantity: item.quantity,
          line_total: Number(fromMoneyCents(item.lineTotalCents)),
        })),
      },
    });
  } catch (error) {
    if (transactionStarted && connection) {
      try { await connection.rollback(); } catch { /* kết nối có thể đã đóng */ }
    }
    if (error instanceof OrderApiError) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error("Lỗi tạo đơn hàng:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể tạo đơn hàng" });
  } finally {
    connection?.release();
  }
});

app.get("/api/orders", authenticateToken, async (req, res) => {
  try {
    const page = req.query.page === undefined ? 1 : parsePositiveInteger(req.query.page, "Số trang");
    const limit = req.query.limit === undefined ? 20 : parsePositiveInteger(req.query.limit, "Số lượng mỗi trang");
    if (limit > 50) throw new OrderApiError(400, "Số đơn hàng mỗi trang tối đa là 50");

    const status = req.query.status;
    if (status !== undefined && !ORDER_STATUSES.has(status)) {
      throw new OrderApiError(400, "Trạng thái đơn hàng không hợp lệ");
    }

    const whereStatus = status ? " AND status = ?" : "";
    const values = status ? [req.user.id, status] : [req.user.id];
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM orders WHERE customer_id = ?${whereStatus}`,
      values
    );
    const offset = (page - 1) * limit;
    if (!Number.isSafeInteger(offset)) throw new OrderApiError(400, "Số trang quá lớn");
    const [orders] = await pool.execute(
      `SELECT id, user_address_id, recipient_name, recipient_phone, shipping_address,
              subtotal, shipping_fee, total_amount, status, created_at, updated_at
       FROM orders
       WHERE customer_id = ?${whereStatus}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );
    const itemsByOrder = await loadOrderItems(pool, orders.map((order) => order.id));

    res.json({
      success: true,
      count: Number(countRows[0].total),
      page,
      limit,
      data: orders.map((order) => formatOrder(order, itemsByOrder.get(String(order.id)) || [])),
    });
  } catch (error) {
    if (error instanceof OrderApiError) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error("Lỗi lấy danh sách đơn hàng:", error.code || "UNKNOWN");
    return res.status(500).json({ success: false, message: "Không thể lấy danh sách đơn hàng" });
  }
});

app.get("/api/orders/:id", authenticateToken, async (req, res) => {
  try {
    const orderId = parsePositiveInteger(req.params.id, "Mã đơn hàng");
    const [orders] = await pool.execute(
      `SELECT id, user_address_id, recipient_name, recipient_phone, shipping_address,
              subtotal, shipping_fee, total_amount, status, created_at, updated_at
       FROM orders
       WHERE id = ? AND customer_id = ?
       LIMIT 1`,
      [orderId, req.user.id]
    );
    if (!orders.length) {
      return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng" });
    }

    const itemsByOrder = await loadOrderItems(pool, [orders[0].id]);
    res.json({
      success: true,
      data: formatOrder(orders[0], itemsByOrder.get(String(orders[0].id)) || []),
    });
  } catch (error) {
    if (error instanceof OrderApiError) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error("Lỗi lấy chi tiết đơn hàng:", error.code || "UNKNOWN");
    res.status(500).json({ success: false, message: "Không thể lấy chi tiết đơn hàng" });
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
