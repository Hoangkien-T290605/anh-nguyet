# Ánh Nguyệt Go Live

Tiện ích workspace VS Code dành cho dự án Ánh Nguyệt. Mở thư mục gốc có `server/package.json`, `frontend/index.html`, `index.html` và `server/.env`, sau đó bấm **Go Live Ánh Nguyệt**. Tiện ích xác định đường dẫn từ workspace nên không bị khóa vào một ổ hoặc thư mục cụ thể.

## Quy trình khởi chạy

- Kiểm tra Node.js 20+, npm, file `.env` (chỉ kiểm tra tồn tại, không đọc/in nội dung) và cổng dịch vụ.
- Nếu dependency Backend thiếu, cài theo `server/package-lock.json`, rồi chạy `npm run dev` với `DB_NAME=anh_nguyet` và `PORT=5000`.
- Chỉ mở Frontend sau khi health xác nhận kết nối database `anh_nguyet`, `/api/hello` và `/api/products` thành công.
- Tái sử dụng dịch vụ hợp lệ; không dừng tiến trình chiếm cổng nếu không xác định được.
- Dùng Live Server nếu đã cài và có lệnh tương thích; nếu không, dùng máy chủ tích hợp chỉ phục vụ trang gốc và `frontend/`.
- Nếu cổng Frontend cấu hình sẵn đang bận bởi một dịch vụ không phù hợp, thử cổng trống kế tiếp; URL thực tế sẽ hiện trong thông báo.
- Tự mở trang chủ sau khi sẵn sàng. Nút dừng chỉ nhắm tới dịch vụ do extension khởi chạy và báo nếu Windows không cho dừng.

Tiện ích không cài Node/MySQL, không tạo hoặc khôi phục database, không sửa `.env` và không chạy migration. Máy mới phải được cấu hình database và `.env` trước lần chạy đầu. Cổng Frontend mặc định 5500; URL thực tế hiện trong thông báo VS Code.
