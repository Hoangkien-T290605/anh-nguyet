# Ánh Nguyệt Frontend

Frontend tĩnh dùng HTML5, Tailwind CSS đã biên dịch trong `site.css`, CSS tùy chỉnh và JavaScript ES Modules. Không cần Vite, React, npm install hay build để chạy.

## Chạy bằng Go Live Ánh Nguyệt

Mở thư mục gốc dự án bằng VS Code và bấm **Go Live Ánh Nguyệt**. Tiện ích gọi Live Server nếu đã cài, nếu không thì dùng server Frontend tích hợp. Trang gốc chuyển hướng tới `frontend/index.html`; các trang con dùng đường dẫn tương đối.

## Môi trường Backend thử nghiệm

Giữ `config.js` cho cấu hình thường dùng. Để chuyển tab Live Server sang Backend thử nghiệm cổng `5011`, mở `http://127.0.0.1:5500/frontend/test-environment.html`. Chỉ tab đó dùng URL thử nghiệm; mở lại đường dẫn này với `?mode=normal` để xóa lựa chọn thử nghiệm.

Backend thử nghiệm được khóa vào `anh_nguyet_customer_test_20261109_a`. Database này cần được tạo và phục hồi riêng trước khi khởi động Backend; trang thử nghiệm không tự tạo database.

## Cấu hình API

Sửa `config.js` để đặt origin Backend, không thêm `/api`. Mặc định đang là `http://127.0.0.1:5000`; ứng dụng tự nối `/api`.

Tailwind được đóng gói sẵn trong `site.css`; không có CDN hoặc CSS import cần bundler lúc chạy.

## Hình ảnh

Ảnh mới được Backend phục vụ từ `/uploads/avatars/`, `/uploads/products/` và `/uploads/reviews/`. Ảnh sản phẩm cũ lưu bằng tên file vẫn được tải từ `images/products/`. `server/uploads/` không nằm trong Git; cần sao lưu cùng database khi bàn giao.
