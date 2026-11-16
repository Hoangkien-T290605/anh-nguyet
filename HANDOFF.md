# Hướng dẫn bàn giao Ánh Nguyệt trên Windows

## Thành phần máy nhận cần có

- Windows 10/11.
- Node.js LTS (Node 20 trở lên) và npm trong `PATH`.
- MySQL Server 8.4 và database cục bộ `anh_nguyet` đã được chuẩn bị.
- VS Code.
- Cài tiện ích `tools/vscode-anhnguyet-launcher/anhnguyet-golive-1.2.2.vsix` bằng **Extensions: Install from VSIX...**, sau đó reload VS Code.
- Live Server là tùy chọn: nếu có, Go Live sẽ gọi Live Server; nếu không có, tiện ích dùng máy chủ Frontend tích hợp.

## Cấu hình cục bộ

1. Sao chép `server/.env.example` thành `server/.env`.
2. Điền thông tin kết nối MySQL và JWT secret mới cho máy nhận. Nếu dùng OTP email, điền cấu hình Gmail App Password.
3. Chuẩn bị schema và dữ liệu database qua quy trình chuyển giao được chủ sở hữu phê duyệt. **Gói mã nguồn không chứa backup database hoặc dữ liệu khách hàng.** Không tự chạy migration trong lần khởi chạy.
4. Đưa ảnh sản phẩm cũ cần thiết vào `frontend/images/products/` với tên khớp `products.image`. Ảnh upload mới được lưu ở `server/uploads/products/`; thư mục `server/uploads/` cần được sao lưu và bàn giao cùng database.
5. Mở đúng thư mục gốc dự án bằng VS Code, cài/enable extension nếu cần, rồi bấm **Go Live Ánh Nguyệt**. Extension mở trang cửa hàng khi cả hai dịch vụ sẵn sàng.

## Hành vi Go Live

- Xác nhận workspace chứa `server/package.json`, `frontend/index.html` và `index.html`; hỗ trợ đường dẫn workspace khác `C:\AnhNguyet`.
- Kiểm tra cổng 5000. Backend có sẵn chỉ được dùng nếu health báo database `anh_nguyet`, `/api/hello` và `/api/products` phản hồi đúng.
- Nếu thiếu dependency Backend, chạy `npm ci --no-audit --no-fund` khi chưa có `node_modules`, hoặc `npm install --no-audit --no-fund` nếu thư mục đang có nhưng thiếu gói; sau đó chạy `npm run dev` với `DB_NAME=anh_nguyet`, `PORT=5000`.
- Đợi health API trước khi mở Frontend. Go Live không cài Node/MySQL, không tạo database, không khôi phục dữ liệu và không chạy migration.
- Nếu cổng 5000 hoặc cổng Frontend đang bị dịch vụ không xác định sử dụng, tiện ích báo lỗi và không dừng tiến trình đó.
- Nút **Dừng dịch vụ Ánh Nguyệt** chỉ nhắm tới Frontend/Backend mà tiện ích đã khởi chạy; nếu hệ điều hành từ chối dừng cây tiến trình, extension báo cổng vẫn bận.

## URL mặc định

- Website khách hàng: `http://127.0.0.1:5500/frontend/index.html`
- Đăng nhập Admin: `http://127.0.0.1:5500/frontend/admin-login.html`

Nếu cổng Live Server được cấu hình khác 5500, sử dụng cổng mà tiện ích hiển thị.

## Dữ liệu không đưa vào gói mã nguồn

Không phân phối `server/.env`, SQL dump/backup, `server/uploads/` (avatar/ảnh sản phẩm/ảnh đánh giá), log hoặc dữ liệu cá nhân qua kho mã nguồn công khai. Các bản SQL hiện có cần được rà soát và chủ sở hữu phê duyệt riêng trước khi bàn giao; một số bản không phản ánh schema hiện tại. Tệp `.env.example` chỉ chứa giá trị mẫu, không phải cấu hình kết nối dùng được.

Ảnh đại diện, sản phẩm và đánh giá mới được lưu dưới `server/uploads/{avatars,products,reviews}/` và phục vụ qua `/uploads/...`. URL ảnh cũ bên ngoài và ảnh sản phẩm cũ vẫn được giữ nguyên; cần lập bảng đối chiếu, sao lưu file và kiểm tra tham chiếu trước khi chuyển ảnh cũ vào kho nội bộ.

## Snapshot bàn giao cục bộ N48

Đã tạo trong thư mục `backups/` bị Git ignore: `anh_nguyet_20261110T1838_N48.sql` và `anh_nguyet_uploads_20261110T1838_N48.zip`. Hash SHA-256 nằm trong `anh_nguyet_20261110T1838_N48_manifest.txt`. Dump được kiểm tra có DDL và INSERT; archive có 2 avatar, chưa có ảnh upload sản phẩm hoặc ảnh đánh giá. Các tệp này chứa dữ liệu riêng tư; chỉ chuyển qua kênh bảo mật, không commit/push hoặc đưa lên kho công khai. Việc phục hồi phải nhắm vào database cô lập mới đã được xác nhận; Go Live không tự phục hồi.
