
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Schema sản phẩm
const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Tên sản phẩm là bắt buộc"],
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    price: {
      type: Number,
      required: [true, "Giá sản phẩm là bắt buộc"],
      min: [0, "Giá không được âm"],
    },
    category: {
      type: String,
      required: [true, "Danh mục là bắt buộc"],
      trim: true,
    },
    image: {
      type: String,
      default: "",
    },
    stock: {
      type: Number,
      default: 0,
      min: 0,
    },
    featured: {
      type: Boolean,
      default: false,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const Product = mongoose.model("Product", productSchema);

// API kiểm tra backend
app.get("/api/hello", (req, res) => {
  res.json({
    success: true,
    message: "Backend Ánh Nguyệt đang hoạt động!",
  });
});

// Kiểm tra trạng thái kết nối database
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

// Lấy danh sách sản phẩm
app.get("/api/products", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });

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
    const product = await Product.create(req.body);

    res.status(201).json({
      success: true,
      message: "Thêm sản phẩm thành công",
      data: product,
    });
  } catch (error) {
    const isValidationError =
      error.name === "ValidationError" ||
      error.name === "CastError";

    res.status(isValidationError ? 400 : 500).json({
      success: false,
      message: isValidationError
        ? error.message
        : "Không thể thêm sản phẩm",
    });
  }
});

// Cập nhật sản phẩm
app.put("/api/products/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "ID sản phẩm không hợp lệ",
      });
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sản phẩm",
      });
    }

    res.json({
      success: true,
      message: "Cập nhật sản phẩm thành công",
      data: product,
    });
  } catch (error) {
    const isValidationError =
      error.name === "ValidationError" ||
      error.name === "CastError";

    res.status(isValidationError ? 400 : 500).json({
      success: false,
      message: isValidationError
        ? error.message
        : "Không thể cập nhật sản phẩm",
    });
  }
});

// Xóa sản phẩm
app.delete("/api/products/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "ID sản phẩm không hợp lệ",
      });
    }

    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
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

// Khởi động server sau khi kết nối database
async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("Chưa cấu hình MONGODB_URI trong file server/.env");
    }

    await mongoose.connect(process.env.MONGODB_URI);

    console.log("Đã kết nối MongoDB Atlas thành công!");

    app.listen(PORT, () => {
      console.log(`Backend Ánh Nguyệt đang chạy tại port ${PORT}`);
    });
  } catch (error) {
    console.error("Không thể khởi động backend:", error.message);
    process.exit(1);
  }
}

startServer();
