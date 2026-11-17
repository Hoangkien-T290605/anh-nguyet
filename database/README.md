# Cơ sở dữ liệu Ánh Nguyệt

Schema này được đối chiếu với MySQL 8.4.13 sau các migration `001` và `002`.
Mã hóa là `utf8mb4` với collation `utf8mb4_0900_ai_ci`. Các file schema chỉ
chứa DDL, không chứa tài khoản, địa chỉ, sản phẩm hay dữ liệu cá nhân thật.

## Bảng

| Bảng | Mục đích |
| --- | --- |
| `users` | Tài khoản có vai trò `customer`, `employee` hoặc `admin`; `014` bổ sung trạng thái hoạt động và cờ buộc đổi mật khẩu. |
| `products` | Danh mục hàng, giá hiện tại, trạng thái kinh doanh và tồn kho. |
| `user_addresses` | Địa chỉ nhận hàng gắn với tài khoản. |
| `product_reviews` | Đánh giá sản phẩm. |
| `user_cart_items` | Giỏ hàng tài khoản; khóa chính ghép người dùng và sản phẩm, chỉ lưu số lượng. |
| `orders` | Thông tin người nhận, tổng tiền, trạng thái đơn, COD, idempotency. `customer_id` NULL dành cho khách. |
| `order_items` | Ảnh chụp tên, giá và số lượng tại thời điểm đặt hàng. |
| `shipping_configuration` | Một dòng cấu hình phí vận chuyển tập trung; `flat_fee` NULL khi chưa có chính sách chính thức. |
| `schema_migrations` | Phiên bản, checksum và thời điểm migration đã áp dụng. |
| `categories`, `inventory_movements` | Được tạo bởi migration `005`; chỉ xuất hiện sau khi migration được áp dụng. |
| `vouchers`, `voucher_redemptions` | Được tạo/bổ sung bởi migrations `004`, `006`, `007`. |
| `product_images` | Gallery ảnh nội bộ từ migration `008`; `products.image` vẫn là ảnh bìa tương thích. |
| `shipping_regions` | Các khu vực vận chuyển được tạo và khởi tạo bởi migration thay thế `012`; đơn hàng lưu snapshot khu vực. |
| `products.product_details` | Cột JSON nullable do migration `010` tạo; không tự điền dữ liệu. |
| `employee_invitations`, `employee_role_history` | Lời mời Employee và lịch sử cấp/thu hồi quyền do migration `014` tạo. |

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
- `migrations/003_account_favorites_reviews.sql`: tạo bảng yêu thích và bổ sung đánh giá theo tài khoản. Không đưa migration này vào luồng tự động khi dự án đã loại chức năng yêu thích; cần quyết định riêng cách tách phần đánh giá trước khi áp dụng.
- `migrations/004_vouchers.sql`, `006_voucher_redemption_lifecycle.sql`, `007_voucher_metadata_limits.sql`: schema và vòng đời Voucher.
- `migrations/011_official_vouchers.sql`: khởi tạo ba mã Voucher đã xác nhận sau các migration schema; ngày bắt đầu là thời điểm migration thực thi, thời hạn một năm.
- `migrations/005_admin_categories_inventory.sql`: danh mục quản trị và lịch sử biến động tồn kho.
- `migrations/008_product_image_gallery.sql`: gallery ảnh sản phẩm nội bộ, giữ `products.image` làm ảnh chính tương thích.
- `migrations/009_shipping_regions.sql`: checksum hiện tại không khớp checksum đã ghim trong runner; runner không cho thực thi file này. Không chỉnh sửa nội dung hoặc checksum để vượt guard.
- `migrations/012_shipping_regions_replacement.sql`: bản migration mới thay thế chức năng 009, tạo bảng khu vực, snapshot mã/tên khu vực trên đơn hàng và khởi tạo ba khu vực đã xác nhận. Chỉ được áp dụng qua runner đã ghim checksum 012 sau khi guard production đạt; hiện chưa chạy.
- `migrations/010_product_details_json.sql`: thêm cột JSON nullable để lưu thông tin chi tiết sản phẩm có cấu trúc; không tự điền dữ liệu.
- `migrations/014_employee_roles_and_accounts.sql`: bổ sung vai trò Employee, trạng thái tài khoản, cờ buộc đổi mật khẩu, lời mời và lịch sử phân quyền. Đã áp dụng trên database chính qua runner sau khi xác minh backup và restore.

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

Các migration được áp dụng riêng lẻ qua runner production có xác minh danh tính MySQL, ledger/checksum và bằng chứng backup/restore có chữ ký. Không chạy trực tiếp file SQL hoặc runner thử nghiệm trên database chính. Runner chỉ cho phép migration đã có trong allowlist/checksum; nó yêu cầu ledger `001` và `002` hợp lệ, còn `003` chỉ được đối chiếu nếu ledger đã ghi nhận. Không áp dụng `003` tự động vì migration này cũng tạo `user_favorites`, trong khi chức năng yêu thích đã bị loại bỏ. Trước khi bật chức năng đánh giá theo tài khoản, cần tách và phê duyệt schema đánh giá riêng.

Ledger database chính hiện ghi nhận `001`–`008` và `010`–`014`; `009_shipping_regions.sql` không được áp dụng vì checksum không khớp migration đã ghim trong runner. Chức năng khu vực vận chuyển được triển khai bằng migration thay thế `012_shipping_regions_replacement.sql`. Các migration sau chỉ được chạy qua production runner với server identity, checksum, baseline và bằng chứng backup/restore hợp lệ; không chạy trực tiếp file SQL hoặc bỏ qua các chốt này. Kiểm tra ledger và schema thực tế trước mọi triển khai.

## Dữ liệu thử nghiệm và dữ liệu thật

Các bản dump riêng tư nằm trong `database/backups/` và không thuộc bộ schema để chia sẻ. Thư mục này bị Git ignore toàn bộ. Bản chuẩn đang dùng là `database.sql`, bản trước là `database-prev.sql`; lịch sử chưa được xác minh để xóa được giữ trong `database/backups/archive/`. Không nhập dữ liệu mẫu/thật vào database vận hành để thử. Không tự tạo schema thử nghiệm trong quy trình vận hành chính.
