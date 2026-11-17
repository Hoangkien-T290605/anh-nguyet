# Ánh Nguyệt Frontend

Frontend tĩnh dùng HTML5, Tailwind CSS đã biên dịch trong `site.css`, CSS tùy chỉnh và JavaScript ES Modules. Không cần Vite, React, npm install hay build để chạy.

## Chạy bằng Live Server chính thức

Mở thư mục gốc dự án trong VS Code, mở `frontend/index.html` làm editor đang active rồi bấm **Go Live** của Live Server. Workspace đặt root `/frontend` và cổng `5500`, nên trang chủ là `http://127.0.0.1:5500/index.html`.

Workspace task chạy Backend khi mở dự án; Live Server chỉ phục vụ Frontend. Nếu VS Code hỏi Workspace Trust hoặc Automatic Tasks, cần chấp thuận để Backend tự chạy.

## Cấu hình API

Sửa `config.js` để đặt origin Backend, không thêm `/api`. Mặc định đang là `http://127.0.0.1:5000`; ứng dụng tự nối `/api`.

Tailwind được đóng gói sẵn trong `site.css`; không có CDN hoặc CSS import cần bundler lúc chạy.

## Khu vực Admin và Employee

Admin dùng `admin-login.html`; Nhân viên dùng `employee-login.html`. Các trang gọi Backend xác minh JWT và role trước khi render, còn Backend áp dụng quyền riêng trên từng API. Admin quản lý quyền trong `admin-employees.html`: cấp quyền tài khoản Customer đã có hoặc gửi email mời tới `employee-invite.html` để người nhận tự thiết lập mật khẩu. Lời mời chỉ dùng một lần, hết hạn sau 48 giờ; yêu cầu cấu hình `FRONTEND_BASE_URL` và SMTP ở Backend. Migration `014_employee_roles_and_accounts.sql` phải được triển khai qua runner an toàn trước khi mở các API Employee; thiếu schema không chặn chức năng Admin hiện có. Lịch sử/điều chỉnh kho cần migration `005`; tra cứu Voucher cần `004`, `006` và `007`.

## Hình ảnh

Ảnh mới được Backend phục vụ từ `/uploads/avatars/`, `/uploads/products/` và `/uploads/reviews/`. Ảnh sản phẩm cũ lưu bằng tên file vẫn được tải từ `images/products/`. `server/uploads/` không nằm trong Git; cần sao lưu cùng database khi bàn giao.
