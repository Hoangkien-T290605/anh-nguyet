# Cơ sở dữ liệu Ánh Nguyệt

Schema này được đối chiếu với MySQL 8.4.13 sau các migration `001` và `002`.
Mã hóa là `utf8mb4` với collation `utf8mb4_0900_ai_ci`. Các file schema chỉ
chứa DDL, không chứa tài khoản, địa chỉ, sản phẩm hay dữ liệu cá nhân thật.

## Bảng

| Bảng | Mục đích |
| --- | --- |
| `users` | Tài khoản và vai trò `customer`/`admin`. |
| `products` | Danh mục hàng, giá hiện tại, trạng thái kinh doanh và tồn kho. |
| `user_addresses` | Địa chỉ nhận hàng gắn với tài khoản. |
| `product_reviews` | Đánh giá sản phẩm. |
| `user_cart_items` | Giỏ hàng tài khoản; khóa chính ghép người dùng và sản phẩm, chỉ lưu số lượng. |
| `orders` | Thông tin người nhận, tổng tiền, trạng thái đơn, COD, idempotency. `customer_id` NULL dành cho khách. |
| `order_items` | Ảnh chụp tên, giá và số lượng tại thời điểm đặt hàng. |
| `shipping_configuration` | Một dòng cấu hình phí vận chuyển tập trung; `flat_fee` NULL khi chưa có chính sách chính thức. |
| `schema_migrations` | Phiên bản, checksum và thời điểm migration đã áp dụng. |

Quan hệ: địa chỉ thuộc người dùng; đơn hàng có thể thuộc tài khoản và địa chỉ; chi tiết đơn hàng thuộc đơn và tham chiếu sản phẩm; giỏ hàng tham chiếu người dùng và sản phẩm; đánh giá tham chiếu sản phẩm. Xóa tài khoản xóa địa chỉ/giỏ hàng theo khóa ngoại; đơn hàng không cho xóa người dùng; xóa sản phẩm bị chặn khi còn trong giỏ và được giữ lại trong chi tiết đơn bằng `product_id` NULL.

## Luồng giỏ hàng và đơn hàng

Giỏ tài khoản lưu `(user_id, product_id, quantity)` duy nhất. Backend luôn đọc giá từ `products`, kiểm tra trạng thái và tồn kho, và không nhận giá từ giỏ làm giá chính thức. Khi đặt hàng, Backend khóa cấu hình vận chuyển và các sản phẩm trong transaction, tính lại tiền, ghi đơn cùng chi tiết, cập nhật tồn kho và xóa giỏ tài khoản. `idempotency_key` có chỉ mục UNIQUE để request gửi lại không tạo đơn thứ hai; fingerprint phát hiện cùng khóa nhưng nội dung khác.

COD là phương thức hiện được hỗ trợ duy nhất. Đơn COD mới bắt đầu với `payment_status='unpaid'`; các đơn cũ được giữ `pending` để không suy diễn trạng thái lịch sử. Backend không cho tạo đơn khi phí vận chuyển chưa được cấu hình. Người quản trị phải điền mức phí đã được cửa hàng quyết định vào dòng `id=1` của `shipping_configuration`; không tự đặt mức mặc định.

## File SQL

- `01_create_database.sql`: tạo database nếu chưa tồn tại, không xóa database cũ.
- `02_create_tables.sql`: DDL đầy đủ các bảng. Khóa ngoại, chỉ mục và CHECK được đặt cạnh bảng sở hữu trong `CREATE TABLE` để giữ thứ tự và ràng buộc nhất quán.
- `schema_full.sql`: file độc lập để tạo database và toàn bộ schema từ đầu.
- `10_verification.sql`: xem bảng, số lượng bản ghi tổng quát, cột, quan hệ, chỉ mục và cấu hình phí.
- `migrations/001_cart_orders_integrity.sql`: thêm vai trò, hỗ trợ đơn khách, idempotency và bảng giỏ hàng.
- `migrations/002_cod_shipping_configuration.sql`: thêm trạng thái COD và bảng cấu hình phí tập trung.

Dự án hiện không dùng dữ liệu nền riêng, view, procedure hoặc trigger; vì vậy không có các file SQL rỗng cho những mục đó. Không có dữ liệu mẫu trong bundle để tránh vô tình đưa dữ liệu thật vào môi trường khác.

## Tạo schema mới

Trong MySQL Workbench, mở `schema_full.sql` và chạy trên máy chủ MySQL phù hợp. Hoặc dùng CLI:

```sh
mysql -u <user> -p < database/schema_full.sql
```

`CREATE DATABASE IF NOT EXISTS` không xóa schema đang có. Để tái tạo thử nghiệm, đổi tên database trong bản sao của file trước khi chạy. Không dùng file này như migration trên database đang vận hành.

Chạy kiểm tra sau khi tạo:

```sh
mysql -u <user> -p anh_nguyet < database/10_verification.sql
```

## Migration

Trước migration, tạo và kiểm tra backup đầy đủ. Từ thư mục gốc dự án, chạy:

```sh
node server/scripts/apply-database-migrations.js --backup=database/backups/<ten-backup.sql>
```

Runner đọc `server/.env` hiện có mà không sửa file, chỉ cho phép `DB_NAME=anh_nguyet`, ghi checksum vào `schema_migrations`, bỏ qua phiên bản đã áp dụng và dừng nếu nội dung migration cũ bị đổi. Không chạy migration trên database chính nếu chưa xác minh backup.

## Dữ liệu thử nghiệm và dữ liệu thật

Các bản dump riêng tư nằm trong `database/backups/` và không thuộc bộ schema để chia sẻ. Không nhập dữ liệu mẫu/thật vào database vận hành để thử. Kiểm thử tích hợp nên tạo database tạm riêng và chỉ dùng tài khoản/sản phẩm tổng hợp.
