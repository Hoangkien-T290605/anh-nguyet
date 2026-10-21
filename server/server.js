
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// API kiểm tra backend
app.get("/api/hello", (req, res) => {
  res.json({
    success: true,
    message: "Backend Ánh Nguyệt đang hoạt động!",
  });
});

// Khởi động server
app.listen(PORT, () => {
  console.log(`Backend Ánh Nguyệt đang chạy tại port ${PORT}`);
});
