# Ánh Nguyệt

Website thương mại điện tử dùng HTML/CSS/JavaScript ES Modules, Node.js + Express và MySQL 8.4. Hướng dẫn chuẩn bị máy Windows khác nằm trong [HANDOFF.md](HANDOFF.md).

## Khởi chạy

1. Chuẩn bị Node.js LTS, MySQL và cấu hình cục bộ theo `server/.env.example` và `HANDOFF.md`.
2. Mở thư mục gốc dự án trong VS Code.
3. Cài bản mới nhất `tools/vscode-anhnguyet-launcher/anhnguyet-golive-1.2.2.vsix` qua Extensions: Install from VSIX, rồi reload VS Code.
4. Bấm **Go Live Ánh Nguyệt**.

Tiện ích kiểm tra backend, chuẩn bị thư viện Node nếu thiếu, khởi chạy Backend rồi mới mở Frontend. Nếu Live Server đã cài và hoạt động, tiện ích dùng Live Server; nếu không, nó dùng máy chủ Frontend tích hợp. Tiện ích không cài phần mềm Windows, không tạo/khôi phục database và không chạy migration.

URL mặc định:

- Cửa hàng: `http://127.0.0.1:5500/frontend/index.html`
- Đăng nhập Admin: `http://127.0.0.1:5500/frontend/admin-login.html`

Nếu cổng 5500 đang được cấu hình khác, dùng URL mà Go Live thông báo.

## An toàn dữ liệu

- Không đưa `server/.env`, SQL backup, dữ liệu cá nhân hoặc thư mục upload vào gói bàn giao công khai.
- Database chính và dữ liệu Admin phải được chuẩn bị/chuyển giao riêng qua quy trình được chủ sở hữu phê duyệt.
- Ảnh sản phẩm cũ theo tên file vẫn có thể nằm ở `frontend/images/products/`; ảnh upload mới, avatar và ảnh đánh giá lưu trong `server/uploads/`. Git bỏ qua uploads.
- Go Live chỉ chạy khi backend xác nhận đã kết nối đúng database `anh_nguyet`. Nó không sửa `.env` hay thay đổi schema.

Frontend là website tĩnh; Tailwind CSS đã được biên dịch vào `frontend/site.css`. Không cần Vite hoặc cài package frontend.
