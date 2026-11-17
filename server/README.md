# Backend Ánh Nguyệt

Express API dùng MySQL 8.4. Node.js 20 trở lên và npm là yêu cầu vận hành. Cài thư viện trong thư mục này bằng `npm.cmd ci` trong PowerShell Windows hoặc `npm ci` trong Git Bash; lệnh chạy chuẩn là `npm.cmd run dev` trong PowerShell Windows hoặc `npm run dev` trong Git Bash (Go Live gọi lệnh này sau khi kiểm tra môi trường).

## Cấu hình cục bộ

1. Sao chép `.env.example` thành `.env`.
2. Điền `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` và một `JWT_SECRET` ngẫu nhiên riêng cho môi trường này. Không sao chép `.env` lên GitHub hoặc gửi kèm mã nguồn.
3. Với lời mời Employee, cấu hình `FRONTEND_BASE_URL` bằng origin công khai của Frontend (không có đường dẫn con) và thiết lập SMTP. Để dùng Gmail, điền `GMAIL_USER` cùng `GMAIL_APP_PASSWORD`; có thể dùng cấu hình `SMTP_HOST` thay thế. Không dùng địa chỉ localhost cho lời mời gửi tới người dùng bên ngoài.
4. Nếu dùng chức năng gửi OTP, cần cấu hình SMTP như trên.
5. Chuẩn bị schema/dữ liệu trước khi chạy; Backend không tự tạo database hoặc chạy migration.

## Ảnh nội bộ

Ảnh upload mới được lưu trong `uploads/avatars/`, `uploads/products/` và `uploads/reviews/`, sau đó truy cập qua `/uploads/...`. Ảnh tham khảo sản phẩm được liên kết bằng `product_images.product_id`, đồng thời lưu URL, tên tệp và thứ tự hiển thị trong MySQL; chúng không ghi đè ảnh chính ở `products.image`. Thư mục này bị Git bỏ qua vì chứa ảnh người dùng và ảnh kinh doanh. Khi sao lưu hoặc chuyển máy, giữ nguyên cấu trúc thư mục và tên file để các đường dẫn đã lưu trong MySQL tiếp tục đúng. Không xóa ảnh cũ nếu chưa đối chiếu tất cả bản ghi tham chiếu.

Ảnh sản phẩm cũ có thể được phục vụ từ `frontend/images/products/` khi file ảnh tương ứng hiện diện. Backup upload hiện tại không chứa ảnh sản phẩm cũ; các URL trong dữ liệu MySQL không tự khôi phục được file. Ảnh upload mới không ghi vào thư mục tương thích này.

## Sao lưu và phục hồi

Sao lưu database và uploads cùng một mốc vận hành để đường dẫn ảnh khớp dữ liệu. Nên dùng MySQL login path đã cấu hình cục bộ thay vì đặt mật khẩu trong command line:

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path (Resolve-Path '..').Path 'database\backups'
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$dump = Join-Path $backupDir "anh-nguyet-$stamp.sql"
mysqldump --login-path=anhnguyet --single-transaction --routines --triggers --events --default-character-set=utf8mb4 --result-file="$dump" anh_nguyet
Get-FileHash -Algorithm SHA256 $dump
```

Lưu riêng file dump cùng hash trong nơi được bảo vệ, không commit vào Git. Sao chép `server/uploads/` và, nếu cần các ảnh sản phẩm cũ, `frontend/images/products/` vào kho bàn giao có quyền truy cập giới hạn. Trước phục hồi, tạo một database cô lập mới đã được xác nhận; không nạp dump vào database có dữ liệu. Chỉ xác minh checksum và phục hồi theo quy trình được chủ database phê duyệt. Không phục hồi tự động khi khởi chạy website.

## Kiểm tra dịch vụ

- `GET /api/health` xác nhận trạng thái kết nối MySQL và tên database đang dùng.
- `GET /api/hello` xác nhận API phản hồi.
- `GET /api/products` xác nhận dữ liệu sản phẩm có thể đọc.
- Upload cần JWT/quyền phù hợp với endpoint; ảnh chỉ được xóa sau khi không còn bản ghi tham chiếu.

Go Live yêu cầu health báo database `anh_nguyet` trước khi mở Frontend. Đặt `DB_NAME` hoặc chạy migration không phải chức năng của Go Live trên database máy nhận.

## Tài khoản Employee

Migration `014_employee_roles_and_accounts.sql` bổ sung role Employee, cờ trạng thái, lời mời một lần (chỉ lưu SHA-256 token) và lịch sử phân quyền; chỉ chạy qua runner được phê duyệt sau backup và restore kiểm chứng. Admin có thể cấp role cho Customer hiện có mà không đổi email/mật khẩu/lịch sử đơn hàng, hoặc mời email chưa đăng ký. Người nhận tự đặt tên/mật khẩu; lời mời hết hạn sau 48 giờ và có thể gửi lại/thu hồi. API quản lý Employee yêu cầu toàn bộ schema 014; thiếu schema không khóa các API Admin nghiệp vụ hiện có. JWT được đối chiếu role/trạng thái từ MySQL mỗi request; cờ khóa/buộc đổi mật khẩu chỉ áp dụng cho Employee. Email không được coi là gửi thành công nếu SMTP thất bại. Không sửa `.env` hoặc tự chạy migration trong lúc ứng dụng đang hoạt động.
