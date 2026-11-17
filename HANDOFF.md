# Hướng dẫn bàn giao Ánh Nguyệt trên Windows

## Thành phần máy nhận cần có

- Windows 10/11.
- Node.js LTS (Node 20 trở lên) và npm trong `PATH`.
- MySQL Server 8.4 và database cục bộ `anh_nguyet` đã được chuẩn bị.
- VS Code.
- Cài và bật Live Server chính thức của Ritwick Dey.
- Khi mở workspace lần đầu, chấp thuận Workspace Trust và Automatic Tasks nếu VS Code hỏi.

## Cấu hình cục bộ

1. Sao chép `server/.env.example` thành `server/.env`.
2. Điền thông tin kết nối MySQL và JWT secret mới cho máy nhận. Nếu dùng OTP email, điền cấu hình Gmail App Password.
3. Chuẩn bị schema và dữ liệu database qua quy trình chuyển giao được chủ sở hữu phê duyệt. **Gói mã nguồn không chứa backup database hoặc dữ liệu khách hàng.** Không tự chạy migration trong lần khởi chạy.
4. Đưa ảnh sản phẩm cũ cần thiết vào `frontend/images/products/` với tên khớp `products.image`. Ảnh upload mới được lưu ở `server/uploads/products/`; thư mục `server/uploads/` cần được sao lưu và bàn giao cùng database.
5. Mở thư mục gốc bằng VS Code. Workspace task tự chạy Backend trong Terminal; chờ dòng `BACKEND_READY database=anh_nguyet port=5000 products=...`.
6. Mở `frontend/index.html` làm editor đang active rồi bấm **Go Live** gốc của Live Server.

## Khởi chạy Backend và Live Server

- Task workspace chạy `npm.cmd run dev` trong `server` với `DB_NAME=anh_nguyet`, `PORT=5000`; các biến kết nối khác vẫn lấy từ `.env` hiện có.
- Backend chỉ in thông báo sẵn sàng khi `/api/health` xác nhận đúng database và `/api/products` trả JSON danh sách sản phẩm.
- Task giới hạn một phiên. Nếu cổng 5000 do tiến trình bên ngoài sử dụng, Backend báo lỗi và không dừng tiến trình đó.
- Live Server gốc dùng root `/frontend`, cổng 5500; nó chỉ phục vụ Frontend.
- Mở workspace không chạy migration hoặc truy vấn ghi dữ liệu.

## URL mặc định

- Website khách hàng: `http://127.0.0.1:5500/index.html`
- Đăng nhập Admin: `http://127.0.0.1:5500/admin-login.html`

Go Live gốc mở file đang active; mở `frontend/index.html` trước để vào trang cửa hàng. Nếu Live Server chọn cổng khác 5500, dùng cổng nó thông báo.

## Dữ liệu không đưa vào gói mã nguồn

Không phân phối `server/.env`, SQL dump/backup, `server/uploads/` (avatar/ảnh sản phẩm/ảnh đánh giá), log hoặc dữ liệu cá nhân qua kho mã nguồn công khai. Các bản SQL hiện có cần được rà soát và chủ sở hữu phê duyệt riêng trước khi bàn giao; một số bản không phản ánh schema hiện tại. Tệp `.env.example` chỉ chứa giá trị mẫu, không phải cấu hình kết nối dùng được.

Ảnh đại diện, sản phẩm và đánh giá mới được lưu dưới `server/uploads/{avatars,products,reviews}/` và phục vụ qua `/uploads/...`. URL ảnh cũ bên ngoài và ảnh sản phẩm cũ vẫn được giữ nguyên; cần lập bảng đối chiếu, sao lưu file và kiểm tra tham chiếu trước khi chuyển ảnh cũ vào kho nội bộ.

## Snapshot bàn giao cục bộ N48

Các bản backup cũ được lưu trong `database/backups/archive/`, bao gồm dump `anh_nguyet_20261110T1838_N48.sql`, archive ảnh `anh_nguyet_uploads_20261110T1838_N48.zip` và manifest cùng tên. Dump được kiểm tra có DDL và INSERT; archive có 2 avatar, chưa có ảnh upload sản phẩm hoặc ảnh đánh giá. Các tệp này chứa dữ liệu riêng tư; chỉ chuyển qua kênh bảo mật, không commit/push hoặc đưa lên kho công khai. Việc phục hồi phải nhắm vào database cô lập mới đã được xác nhận; Go Live không tự phục hồi.
