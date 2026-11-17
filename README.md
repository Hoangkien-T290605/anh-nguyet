# Ánh Nguyệt

Website thương mại điện tử dùng HTML/CSS/JavaScript ES Modules, Node.js + Express và MySQL 8.4. Hướng dẫn chuẩn bị máy Windows khác nằm trong [HANDOFF.md](HANDOFF.md).

## Khởi chạy

1. Chuẩn bị Node.js LTS, MySQL và cấu hình cục bộ theo `server/.env.example` và `HANDOFF.md`.
2. Mở thư mục gốc dự án trong VS Code.
3. Chấp thuận Workspace Trust và Automatic Tasks nếu VS Code hỏi. Task trong workspace tự chạy `npm run dev` tại `server`, với `DB_NAME=anh_nguyet` và `PORT=5000`.
4. Mở `frontend/index.html` trong editor rồi bấm **Go Live** gốc của Live Server.

Backend chỉ sẵn sàng khi health xác nhận database `anh_nguyet` và `/api/products` trả danh sách. Nếu cổng 5000 đã bị tiến trình khác chiếm, Backend báo lỗi; task không dừng tiến trình đó. Live Server phục vụ thư mục `frontend` ở cổng 5500.

URL mặc định:

- Cửa hàng: `http://127.0.0.1:5500/index.html`
- Đăng nhập Admin: `http://127.0.0.1:5500/admin-login.html`

Live Server gốc mở file HTML đang active. Hãy active `frontend/index.html` trước khi bấm Go Live để mở cửa hàng. Nếu cổng 5500 bận, dùng cổng Live Server thông báo.

## An toàn dữ liệu

- Không đưa `server/.env`, SQL backup, dữ liệu cá nhân hoặc thư mục upload vào gói bàn giao công khai.
- Database chính và dữ liệu Admin phải được chuẩn bị/chuyển giao riêng qua quy trình được chủ sở hữu phê duyệt.
- Ảnh sản phẩm cũ theo tên file vẫn có thể nằm ở `frontend/images/products/`; ảnh upload mới, avatar và ảnh đánh giá lưu trong `server/uploads/`. Git bỏ qua uploads.
- Workspace task không sửa `.env`, không thay đổi schema và không chạy migration.

Frontend là website tĩnh; Tailwind CSS đã được biên dịch vào `frontend/site.css`. Không cần Vite hoặc cài package frontend.
