# Ánh Nguyệt

Website dùng Frontend tĩnh HTML5, Tailwind CSS đã biên dịch và JavaScript ES Modules; Backend Node.js + Express.js; MySQL 8.4.

## Chạy Frontend

Mở `C:\AnhNguyet\index.html` trong VS Code, chọn **Go Live**, rồi truy cập `http://127.0.0.1:5500/`. Trang gốc chuyển hướng tới `frontend/index.html`.

Frontend không cần React, Vite, npm install hoặc build. Các style Tailwind và CSS tùy chỉnh đã nằm trong `frontend/site.css`.

## Chạy Backend thử nghiệm

Từ PowerShell tại `C:\AnhNguyet`, chạy:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\server\start-test.ps1
```

Script cố định Backend vào database `anh_nguyet_restore_test_20261106`, cổng `5011`. Frontend gọi API tại `http://127.0.0.1:5011/api`, cấu hình trong `frontend/config.js`.

Không dùng script này để chạy production. Không chỉnh `.env` hoặc database để đổi môi trường Frontend.
