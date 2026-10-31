import { useEffect, useState } from "react";

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

// API backend Ánh Nguyệt
const API_URL = "http://localhost:5000/api/products";

// Danh sách danh mục sản phẩm
const categories = [
  { name: "Bánh từ gạo", icon: iconBanh },
  { name: "Bột gạo", icon: iconBotGao },
  { name: "Đồ uống", icon: iconDoUong },
  { name: "Quà tặng", icon: iconHopQua },
  { name: "Đặc sản", icon: iconDacSan },
  { name: "Tất cả", icon: iconTatCa },
];

// Biểu tượng minh họa theo danh mục
function getProductSymbol(category) {
  if (category === "Bột gạo") return "▤";
  if (category === "Đồ uống") return "♧";

  if (
    category === "Quà tặng" ||
    category === "Đặc sản" ||
    category === "Đặc sản và quà tặng"
  ) {
    return "✳";
  }

  return "❋";
}

// Kiểm tra sản phẩm có thuộc danh mục đang chọn không
function matchesCategory(productCategory, activeCategory) {
  if (activeCategory === "Tất cả") {
    return true;
  }

  if (activeCategory === "Quà tặng") {
    return (
      productCategory === "Quà tặng" ||
      productCategory === "Đặc sản và quà tặng"
    );
  }

  if (activeCategory === "Đặc sản") {
    return (
      productCategory === "Đặc sản" ||
      productCategory === "Đặc sản và quà tặng"
    );
  }

  return productCategory === activeCategory;
}

// Định dạng giá tiền Việt Nam
const formatPrice = (price) =>
  `${Number(price || 0).toLocaleString("vi-VN")}đ`;

// Ngăn liên kết # làm trang tự cuộn
function preventPageScroll(event) {
  event.preventDefault();
}

function App() {
  // Dữ liệu sản phẩm lấy từ backend
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productError, setProductError] = useState("");

  // Trạng thái giao diện
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [activeCategory, setActiveCategory] = useState("Tất cả");
  const [menuOpen, setMenuOpen] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [notice, setNotice] = useState("");

// Lấy danh sách sản phẩm từ MySQL thông qua backend
  useEffect(() => {
    const controller = new AbortController();

    async function fetchProducts() {
      try {
        setLoadingProducts(true);
        setProductError("");

        const response = await fetch(API_URL, {
          signal: controller.signal,
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(
            result.message || "Không thể lấy danh sách sản phẩm."
          );
        }

        setProducts(Array.isArray(result.data) ? result.data : []);
      } catch (error) {
        if (error.name === "AbortError") {
          return;
        }

        console.error("Lỗi lấy sản phẩm:", error);

        setProductError(
          "Không thể tải sản phẩm. Vui lòng kiểm tra backend và kết nối mạng."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoadingProducts(false);
        }
      }
    }

    fetchProducts();

    return () => controller.abort();
  }, []);

  // Tổng số lượng sản phẩm trong giỏ hàng
  const cartCount = cart.reduce(
    (total, item) => total + item.quantity,
    0
  );

  // Lọc sản phẩm theo tên và danh mục
  const filteredProducts = products.filter((product) => {
    const productName = (product.name || "").toLocaleLowerCase("vi");
    const searchText = search.toLocaleLowerCase("vi");

    const matchesSearch = productName.includes(searchText);

    const matchesSelectedCategory = matchesCategory(
      product.category,
      activeCategory
    );

    return (
      matchesSearch &&
      matchesSelectedCategory &&
      product.active !== false
    );
  });

  // Thêm sản phẩm vào giỏ hàng
  // Nếu sản phẩm đã tồn tại thì tăng số lượng lên 1
  function addToCart(product) {
    setCart((current) => {
      const existingProduct = current.find(
        (item) => item._id === product._id
      );

      if (existingProduct) {
        return current.map((item) =>
          item._id === product._id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...current, { ...product, quantity: 1 }];
    });

    setNotice(`Đã thêm "${product.name}" vào giỏ hàng.`);

    window.setTimeout(() => {
      setNotice("");
    }, 2500);
  }

  // Thêm hoặc bỏ yêu thích
  function toggleFavorite(id) {
    setFavorites((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <a
          className="brand"
          href="#"
          aria-label="Ánh Nguyệt - Trang chủ"
          onClick={(event) => {
            preventPageScroll(event);
            closeMenu();
          }}
        >
          <img src={logo} alt="Logo Ánh Nguyệt" />
        </a>

        <button
          className="menu-toggle"
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Mở hoặc đóng menu"
          aria-expanded={menuOpen}
        >
          ☰
        </button>

        <nav className={`main-nav ${menuOpen ? "is-open" : ""}`}>
          <a
            className="nav-link active"
            href="#"
            onClick={(event) => {
              preventPageScroll(event);
              closeMenu();
            }}
          >
            Trang chủ
          </a>

          <a
            className="nav-link"
            href="#san-pham"
            onClick={(event) => {
              event.preventDefault();
              document
                .getElementById("san-pham")
                ?.scrollIntoView({ behavior: "smooth" });
              closeMenu();
            }}
          >
            Sản phẩm
          </a>

          <a
            className="nav-link"
            href="#"
            onClick={(event) => {
              preventPageScroll(event);
              closeMenu();
            }}
          >
            Giới thiệu
          </a>

          <a
            className="nav-link"
            href="#"
            onClick={(event) => {
              preventPageScroll(event);
              closeMenu();
            }}
          >
            Tin tức
          </a>

          <a
            className="nav-link"
            href="#footer"
            onClick={(event) => {
              event.preventDefault();
              document
                .getElementById("footer")
                ?.scrollIntoView({ behavior: "smooth" });
              closeMenu();
            }}
          >
            Liên hệ
          </a>
        </nav>

        <label className="search-box">
          <span aria-hidden="true">⌕</span>

          <input
            type="search"
            placeholder="Tìm kiếm sản phẩm..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Tìm kiếm sản phẩm"
          />
        </label>

        <a
          className="header-action account-link"
          href="#"
          onClick={preventPageScroll}
        >
          <img src={iconTaiKhoan} alt="" />
          <span>Tài khoản</span>
        </a>

        <a
          className="header-action cart-link"
          href="#"
          onClick={preventPageScroll}
        >
          <span className="cart-icon" aria-hidden="true">
            🛒
          </span>

          <span>Giỏ hàng</span>
          <b>{cartCount}</b>
        </a>
      </header>

      <main id="trang-chu">
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

            <button
              className="text-link"
              type="button"
              onClick={() => setActiveCategory("Tất cả")}
            >
              Xem tất cả danh mục <span>→</span>
            </button>
          </div>

          <div className="category-grid">
            {categories.map((category) => (
              <button
                className={`category-card ${
                  activeCategory === category.name ? "selected" : ""
                }`}
                key={category.name}
                type="button"
                onClick={() => setActiveCategory(category.name)}
                aria-pressed={activeCategory === category.name}
              >
                <img
                  className="category-icon"
                  src={category.icon}
                  alt=""
                />

                <span
                  className="category-name"
                  style={{ whiteSpace: "nowrap" }}
                >
                  {category.name}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section
          className="content-section products-section"
          id="san-pham"
        >
          <div className="section-heading">
            <div className="heading-title">
              <img
                className="heading-decoration"
                src={iconTrangTri}
                alt=""
              />

              <div>
                <h2>Sản phẩm nổi bật</h2>
                <p>
                  Những sản phẩm được yêu thích nhất hiện nay
                </p>
              </div>
            </div>

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

          {loadingProducts && (
            <p className="empty-message">Đang tải sản phẩm...</p>
          )}

          {productError && (
            <p className="empty-message" role="alert">
              {productError}
            </p>
          )}

          <div
            className="product-grid"
            style={{
              display:
                loadingProducts || productError ? "none" : undefined,
            }}
          >
            {filteredProducts.map((product, index) => (
              <article className="product-card" key={product._id}>
                <div
                  className={`product-image product-image-${index % 5}`}
                >
                  {product.image ? (
                    <img
                      className="product-photo"
                      src={product.image}
                      alt={product.name}
                      loading="lazy"
                    />
                  ) : (
                    <span
                      className="product-placeholder"
                      aria-hidden="true"
                    >
                      {getProductSymbol(product.category)}
                    </span>
                  )}

                  <span className="product-brand">ÁNH NGUYỆT</span>

                  <button
                    className={`favorite-button ${
                      favorites.includes(product._id)
                        ? "is-favorite"
                        : ""
                    }`}
                    type="button"
                    onClick={() => toggleFavorite(product._id)}
                    aria-label={
                      favorites.includes(product._id)
                        ? "Bỏ yêu thích"
                        : "Thêm vào yêu thích"
                    }
                  >
                    {favorites.includes(product._id) ? "♥" : "♡"}
                  </button>
                </div>

                <div className="product-info">
                  <h3>{product.name}</h3>

                  <p className="product-detail">
                    {product.description || product.category}
                  </p>

                  <strong className="product-price">
                    {formatPrice(product.price)}
                  </strong>

                  <div className="product-rating">
                    <span>{product.category}</span>
                  </div>

                  <button
                    className="add-button"
                    type="button"
                    onClick={() => addToCart(product)}
                    disabled={product.stock <= 0}
                  >
                    <span aria-hidden="true">🛒</span>
                    {product.stock <= 0
                      ? "Tạm hết hàng"
                      : "Thêm vào giỏ hàng"}
                  </button>
                </div>
              </article>
            ))}
          </div>

          {!loadingProducts &&
            !productError &&
            filteredProducts.length === 0 && (
              <p className="empty-message">
                Không tìm thấy sản phẩm phù hợp.
              </p>
            )}
        </section>
      </main>

      {notice && (
        <div className="toast-message" role="status">
          {notice}
        </div>
      )}

      <footer className="site-footer" id="footer">
        <div className="footer-brand">
          <a
            className="footer-logo"
            href="#"
            aria-label="Về đầu trang"
            onClick={preventPageScroll}
          >
            <img src={logo} alt="Logo Ánh Nguyệt" />
          </a>

          <p>Tinh hoa từ đất - Sáng bừng vị ngon</p>

          <small>
            © 2026 Ánh Nguyệt. Mọi quyền được bảo lưu.
          </small>
        </div>

        <div className="footer-column">
          <h3>Thông tin</h3>

          <a href="#" onClick={preventPageScroll}>
            Giới thiệu
          </a>

          <a
            href="#san-pham"
            onClick={(event) => {
              event.preventDefault();
              document
                .getElementById("san-pham")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Sản phẩm
          </a>

          <a href="#" onClick={preventPageScroll}>
            Tin tức
          </a>

          <a href="#footer">Liên hệ</a>
        </div>

        <div className="footer-column">
          <h3>Hỗ trợ khách hàng</h3>

          <a href="#" onClick={preventPageScroll}>
            Chính sách vận chuyển
          </a>

          <a href="#" onClick={preventPageScroll}>
            Chính sách đổi trả
          </a>

          <a href="#" onClick={preventPageScroll}>
            Phương thức thanh toán
          </a>

          <a href="#" onClick={preventPageScroll}>
            Điều khoản sử dụng
          </a>
        </div>

        <div className="footer-column contact-column">
          <h3>Liên hệ</h3>

          <p className="contact-item">
            <img src={iconPhone} alt="" />
            <a href="tel:0387536592">0387536592</a>
          </p>

          <a
            className="contact-item"
            href="mailto:anhnguyet.moonlightrice@gmail.com"
          >
            <span className="contact-symbol" aria-hidden="true">
              ✉
            </span>

            <span>anhnguyet.moonlightrice@gmail.com</span>
          </a>

          <p className="contact-item">
            <span className="contact-symbol" aria-hidden="true">
              ⌖
            </span>

            <span>
              149D, Nguyễn Văn Trường, Ninh Kiều, Cần Thơ
            </span>
          </p>

          <div className="social-links" aria-label="Mạng xã hội">
            <a
              href="#"
              onClick={preventPageScroll}
              aria-label="Facebook"
            >
              f
            </a>

            <a
              href="#"
              onClick={preventPageScroll}
              aria-label="Instagram"
            >
              ◎
            </a>

            <a
              href="#"
              onClick={preventPageScroll}
              aria-label="TikTok"
            >
              ♪
            </a>
          </div>
        </div>

        <div className="footer-column footer-newsletter">
          <h3>Đăng ký nhận tin</h3>

          <p>
            Nhận thông tin sản phẩm mới và ưu đãi đặc biệt.
          </p>

          <form
            className="newsletter-form"
            onSubmit={(event) => {
              event.preventDefault();

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

            <button type="submit" aria-label="Đăng ký">
              ➤
            </button>
          </form>
        </div>
      </footer>
    </div>
  );
}

export default App;