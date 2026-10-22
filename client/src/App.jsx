
import { useState } from "react";

// Import hình ảnh và biểu tượng dùng trong giao diện
import logo from "./assets/logo-anh-nguyet.png";
import headerPanel from "./assets/header-panel.png";
import iconTrangTri from "./assets/icon-trang-tri.png";
import iconBanh from "./assets/icon-banh.png";
import iconBotGao from "./assets/icon-bot-gao.png";
import iconDacSan from "./assets/icon-dac-san.png";
import iconDoUong from "./assets/icon-do-uong.png";
import iconHopQua from "./assets/icon-hop-qua.png";
import iconTatCa from "./assets/icon-tat-ca.png";
import iconPhone from "./assets/icon-phone.png";
import iconTaiKhoan from "./assets/icon-tai-khoan.png";

import "./App.css";

// Danh sách danh mục sản phẩm hiển thị trên trang chủ
const categories = [
  { name: "Bánh từ gạo", icon: iconBanh },
  { name: "Bột gạo", icon: iconBotGao },
  { name: "Đồ uống", icon: iconDoUong },
  { name: "Quà tặng", icon: iconHopQua },
  { name: "Đặc sản", icon: iconDacSan },
  { name: "Tất cả", icon: iconTatCa },
];

// Danh sách sản phẩm mẫu của cửa hàng Ánh Nguyệt
const products = [
  {
    id: 1,
    name: "Bánh tráng gạo",
    detail: "300 g",
    price: 30000,
    category: "Bánh từ gạo",
    reviews: 128,
    symbol: "❋",
  },
  {
    id: 2,
    name: "Bánh gạo lứt",
    detail: "200 g",
    price: 55000,
    category: "Bánh từ gạo",
    reviews: 96,
    symbol: "✳",
  },
  {
    id: 3,
    name: "Bánh quy gạo",
    detail: "250 g",
    price: 45000,
    category: "Bánh từ gạo",
    reviews: 73,
    symbol: "❋",
  },
  {
    id: 4,
    name: "Bột gạo nguyên chất",
    detail: "500 g",
    price: 40000,
    category: "Bột gạo",
    reviews: 110,
    symbol: "▤",
  },
  {
    id: 5,
    name: "Set quà tặng Ánh Nguyệt",
    detail: "Hộp 5 sản phẩm",
    price: 285000,
    category: "Quà tặng",
    reviews: 42,
    symbol: "♧",
  },
];

// Định dạng giá tiền theo quy ước Việt Nam
const formatPrice = (price) =>
  `${price.toLocaleString("vi-VN")}đ`;

function App() {
  // Lưu từ khóa tìm kiếm do khách hàng nhập
  const [search, setSearch] = useState("");

  // Lưu danh sách sản phẩm đã được thêm vào giỏ hàng
  const [cart, setCart] = useState([]);

  // Lưu danh mục sản phẩm đang được chọn
  const [activeCategory, setActiveCategory] = useState("Tất cả");

  // Quản lý trạng thái đóng hoặc mở menu trên thiết bị nhỏ
  const [menuOpen, setMenuOpen] = useState(false);

  // Lưu danh sách mã sản phẩm được khách hàng yêu thích
  const [favorites, setFavorites] = useState([]);

  // Lưu nội dung thông báo khi thêm sản phẩm vào giỏ
  const [notice, setNotice] = useState("");

  // Lọc sản phẩm theo từ khóa và danh mục đang chọn
  const filteredProducts = products.filter((product) => {
    const matchesSearch = product.name
      .toLocaleLowerCase("vi")
      .includes(search.toLocaleLowerCase("vi"));

    const matchesCategory =
      activeCategory === "Tất cả" ||
      product.category === activeCategory;

    return matchesSearch && matchesCategory;
  });

  // Thêm sản phẩm vào giỏ hàng và hiển thị thông báo
  function addToCart(product) {
    setCart((current) => [...current, product]);
    setNotice(`Đã thêm "${product.name}" vào giỏ hàng.`);

    // Tự động ẩn thông báo sau 2,5 giây
    window.setTimeout(() => setNotice(""), 2500);
  }

  // Thêm hoặc bỏ sản phẩm khỏi danh sách yêu thích
  function toggleFavorite(id) {
    setFavorites((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  // Đóng menu sau khi khách hàng chọn một liên kết
  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <div className="site-shell">
      {/* Phần đầu trang gồm logo, menu, tìm kiếm và giỏ hàng */}
      <header className="site-header">
        {/* Logo liên kết về trang chủ */}
        <a
          className="brand"
          href="#trang-chu"
          aria-label="Ánh Nguyệt - Trang chủ"
          onClick={closeMenu}
        >
          <img src={logo} alt="Logo Ánh Nguyệt" />
        </a>

        {/* Nút mở hoặc đóng menu trên màn hình nhỏ */}
        <button
          className="menu-toggle"
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Mở hoặc đóng menu"
          aria-expanded={menuOpen}
        >
          ☰
        </button>

        {/* Các liên kết điều hướng chính */}
        <nav className={`main-nav ${menuOpen ? "is-open" : ""}`}>
          <a
            className="nav-link active"
            href="#trang-chu"
            onClick={closeMenu}
          >
            Trang chủ
          </a>
          <a className="nav-link" href="#danh-muc" onClick={closeMenu}>
            Sản phẩm
          </a>
          <a className="nav-link" href="#footer" onClick={closeMenu}>
            Giới thiệu
          </a>
          <a className="nav-link" href="#footer" onClick={closeMenu}>
            Tin tức
          </a>
          <a className="nav-link" href="#footer" onClick={closeMenu}>
            Liên hệ
          </a>
        </nav>

        {/* Thanh tìm kiếm: không tự cuộn trang khi nhập chữ */}
        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            placeholder="Tìm kiếm sản phẩm..."
            value={search}
            // Chỉ cập nhật từ khóa, không gọi scrollIntoView tại đây
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Tìm kiếm sản phẩm"
          />
        </label>

        {/* Liên kết tài khoản khách hàng */}
        <a className="header-action account-link" href="#footer">
          <img src={iconTaiKhoan} alt="" />
          <span>Tài khoản</span>
        </a>

        {/* Hiển thị số lượng sản phẩm trong giỏ hàng */}
        <a className="header-action cart-link" href="#san-pham">
          <span className="cart-icon" aria-hidden="true">🛒</span>
          <span>Giỏ hàng</span>
          <b>{cart.length}</b>
        </a>
      </header>

      {/* Nội dung chính của trang chủ */}
      <main id="trang-chu">
        {/* Banner giới thiệu thương hiệu */}
        <section className="hero" aria-label="Banner Ánh Nguyệt">
          <img
            className="hero-image"
            src={headerPanel}
            alt="Tinh hoa từ đất, sáng bừng vị ngon"
          />
          <a className="hero-button" href="#danh-muc">
            KHÁM PHÁ NGAY
            <span aria-hidden="true">→</span>
          </a>
        </section>

        {/* Khu vực hiển thị các danh mục sản phẩm */}
        <section className="content-section" id="danh-muc">
          <div className="section-heading">
            <div className="heading-title">
              <img
                className="heading-decoration"
                src={iconTrangTri}
                alt=""
              />
              <div>
                <h2>Danh mục sản phẩm</h2>
                <p>
                  Khám phá các dòng sản phẩm đa dạng của Ánh Nguyệt
                </p>
              </div>
            </div>

            {/* Chọn tất cả danh mục và chuyển đến danh sách sản phẩm */}
            <button
              className="text-link"
              type="button"
              onClick={() => {
                setActiveCategory("Tất cả");
              }}
            >
              Xem tất cả danh mục <span>→</span>
            </button>
          </div>

          {/* Các thẻ danh mục có thể nhấn để lọc sản phẩm */}
          <div className="category-grid">
            {categories.map((category) => (
              <button
                className={`category-card ${
                  activeCategory === category.name ? "selected" : ""
                }`}
                key={category.name}
                type="button"
                onClick={() => {
                  setActiveCategory(category.name);
                }}
                aria-pressed={activeCategory === category.name}
              >
                <img
                  className="category-icon"
                  src={category.icon}
                  alt=""
                />
                <span className="category-name">{category.name}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Khu vực danh sách sản phẩm nổi bật */}
        <section className="content-section products-section" id="san-pham">
          <div className="section-heading">
            <div className="heading-title">
              <img
                className="heading-decoration"
                src={iconTrangTri}
                alt=""
              />
              <div>
                <h2>Sản phẩm nổi bật</h2>
                <p>Những sản phẩm được yêu thích nhất hiện nay</p>
              </div>
            </div>

            {/* Xóa bộ lọc để hiển thị lại toàn bộ sản phẩm */}
            <button
              className="text-link"
              type="button"
              onClick={() => {
                setActiveCategory("Tất cả");
                setSearch("");
              }}
            >
              Xem tất cả <span>→</span>
            </button>
          </div>

          {/* Hiển thị các sản phẩm sau khi áp dụng bộ lọc */}
          <div className="product-grid">
            {filteredProducts.map((product, index) => (
              <article className="product-card" key={product.id}>
                {/* Hình ảnh minh họa và nút yêu thích sản phẩm */}
                <div className={`product-image product-image-${index % 5}`}>
                  <span className="product-placeholder" aria-hidden="true">
                    {product.symbol}
                  </span>
                  <span className="product-brand">ÁNH NGUYỆT</span>

                  <button
                    className={`favorite-button ${
                      favorites.includes(product.id) ? "is-favorite" : ""
                    }`}
                    type="button"
                    onClick={() => toggleFavorite(product.id)}
                    aria-label={
                      favorites.includes(product.id)
                        ? "Bỏ yêu thích"
                        : "Thêm vào yêu thích"
                    }
                  >
                    {favorites.includes(product.id) ? "♥" : "♡"}
                  </button>
                </div>

                {/* Tên, quy cách, giá, đánh giá và nút thêm vào giỏ */}
                <div className="product-info">
                  <h3>{product.name}</h3>
                  <p className="product-detail">{product.detail}</p>
                  <strong className="product-price">
                    {formatPrice(product.price)}
                  </strong>

                  <div className="product-rating">
                    <span aria-label="5 sao">★★★★★</span>
                    <small>({product.reviews})</small>
                  </div>

                  <button
                    className="add-button"
                    type="button"
                    onClick={() => addToCart(product)}
                  >
                    <span aria-hidden="true">🛒</span>
                    Thêm vào giỏ hàng
                  </button>
                </div>
              </article>
            ))}
          </div>

          {/* Thông báo khi không có sản phẩm phù hợp với bộ lọc */}
          {filteredProducts.length === 0 && (
            <p className="empty-message">
              Không tìm thấy sản phẩm phù hợp.
            </p>
          )}
        </section>
      </main>

      {/* Thông báo ngắn khi khách hàng thêm sản phẩm vào giỏ */}
      {notice && (
        <div className="toast-message" role="status">
          {notice}
        </div>
      )}

      {/* Chân trang chứa thông tin cửa hàng và các liên kết hỗ trợ */}
      <footer className="site-footer" id="footer">
        {/* Logo, khẩu hiệu và thông tin bản quyền */}
        <div className="footer-brand">
          <a className="footer-logo" href="#trang-chu" aria-label="Về đầu trang">
            <img src={logo} alt="Logo Ánh Nguyệt" />
          </a>
          <p>Tinh hoa từ đất - Sáng bừng vị ngon</p>
          <small>© 2026 Ánh Nguyệt. All rights reserved.</small>
        </div>

        {/* Các liên kết thông tin cửa hàng */}
        <div className="footer-column">
          <h3>Thông tin</h3>
          <a href="#footer">Giới thiệu</a>
          <a href="#danh-muc">Sản phẩm</a>
          <a href="#footer">Tin tức</a>
          <a href="#footer">Liên hệ</a>
        </div>

        {/* Các liên kết chính sách dành cho khách hàng */}
        <div className="footer-column">
          <h3>Hỗ trợ khách hàng</h3>
          <a href="#footer">Chính sách vận chuyển</a>
          <a href="#footer">Chính sách đổi trả</a>
          <a href="#footer">Phương thức thanh toán</a>
          <a href="#footer">Điều khoản sử dụng</a>
        </div>

        {/* Thông tin liên hệ và liên kết mạng xã hội */}
        <div className="footer-column contact-column">
          <h3>Liên hệ</h3>
          <p className="contact-item">
            <img src={iconPhone} alt="" />
            <span>Thông tin điện thoại</span>
          </p>
          <a
            className="contact-item"
            href="mailto:anhnguyet.moonlightrice@gmail.com"
          >
            <span className="contact-symbol" aria-hidden="true">✉</span>
            <span>anhnguyet.moonlightrice@gmail.com</span>
          </a>
          <p className="contact-item">
            <span className="contact-symbol" aria-hidden="true">⌖</span>
            <span>Địa chỉ cửa hàng</span>
          </p>
          <div className="social-links" aria-label="Mạng xã hội">
            <a href="#footer" aria-label="Facebook">f</a>
            <a href="#footer" aria-label="Instagram">◎</a>
            <a href="#footer" aria-label="TikTok">♪</a>
          </div>
        </div>

        {/* Biểu mẫu đăng ký nhận tin qua email */}
        <div className="footer-column footer-newsletter">
          <h3>Đăng ký nhận tin</h3>
          <p>Nhận thông tin sản phẩm mới và ưu đãi đặc biệt.</p>
          <form
            className="newsletter-form"
            onSubmit={(event) => {
              // Ngăn biểu mẫu tải lại trang khi gửi
              event.preventDefault();

              // Thông báo chức năng đăng ký chưa được kết nối
              window.alert(
                "Chức năng đăng ký nhận tin sẽ được hoàn thiện sau."
              );
            }}
          >
            <input
              type="email"
              placeholder="Nhập email của bạn"
              aria-label="Email nhận tin"
              required
            />
            <button type="submit" aria-label="Đăng ký">➤</button>
          </form>
        </div>
      </footer>
    </div>
  );
}

export default App;
