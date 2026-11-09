export function mountAdminDashboard() {
  const content = document.getElementById("admin-content");
  content.innerHTML = `
    <section class="admin-page-heading">
      <span>TỔNG QUAN</span>
      <h1>Chào mừng đến khu vực quản trị</h1>
      <p>Các mục đang hoạt động dẫn đến công cụ hiện có. Những chức năng còn lại được ghi rõ trạng thái.</p>
    </section>
    <section class="admin-dashboard-grid" aria-label="Các khu vực quản trị">
      <a class="admin-module-card" href="admin-products.html"><span aria-hidden="true">▧</span><h2>Quản lý sản phẩm</h2><p>Tìm kiếm, lọc và cập nhật thông tin các sản phẩm từ API.</p><small class="admin-module-state">Đã có trang quản lý</small></a>
      <a class="admin-module-card" href="admin-orders.html"><span aria-hidden="true">▤</span><h2>Quản lý đơn hàng</h2><p>Xem và cập nhật trạng thái đơn hàng bằng công cụ hiện có.</p><small class="admin-module-state">Đã có trang quản lý</small></a>
      <a class="admin-module-card" href="admin-reviews.html"><span aria-hidden="true">★</span><h2>Quản lý đánh giá</h2><p>Xem, ẩn hoặc xóa đánh giá qua API quản trị hiện có.</p><small class="admin-module-state">Đã có trang quản lý</small></a>
      <a class="admin-module-card" href="admin-categories.html"><span aria-hidden="true">▦</span><h2>Quản lý danh mục</h2><p>Xem danh mục được tổng hợp từ dữ liệu sản phẩm.</p><small class="admin-module-state">Đang xem dữ liệu · chưa có API chỉnh sửa</small></a>
      <article class="admin-module-card"><span aria-hidden="true">♙</span><h2>Quản lý khách hàng</h2><p>Chức năng này chưa được triển khai.</p><small class="admin-module-state">Chưa triển khai</small></article>
      <article class="admin-module-card"><span aria-hidden="true">♧</span><h2>Tài khoản quản trị</h2><p>Chức năng này chưa được triển khai.</p><small class="admin-module-state">Chưa triển khai</small></article>
    </section>`;
}
