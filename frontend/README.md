# Ánh Nguyệt Frontend

Frontend tĩnh dùng HTML5, Tailwind CSS đã biên dịch trong `site.css`, CSS tùy chỉnh và JavaScript ES Modules. Không cần Vite, React, npm install hay build để chạy.

## Chạy bằng Live Server

Mở `C:\AnhNguyet\index.html` trong VS Code và chọn **Go Live**. Trang gốc chuyển hướng tới `frontend/index.html`. Các trang con dùng đường dẫn tương đối.

## Cấu hình API

Sửa `config.js` để đặt origin Backend, không thêm `/api`. Mặc định đang là `http://127.0.0.1:5000`; ứng dụng tự nối `/api`.

Tailwind được đóng gói sẵn trong `site.css`; không có CDN hoặc CSS import cần bundler lúc chạy.
