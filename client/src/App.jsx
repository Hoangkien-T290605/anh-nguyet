
import { useEffect, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";

import ProductsPage from "./ProductsPage";
import ProductDetailPage from "./ProductDetailPage";
import CartPage from "./CartPage";
import Header from "./components/Header";
import Footer from "./components/Footer";

import headerPanel from "./assets/header-panel.png";
import iconTrangTri from "./assets/icon-trang-tri.png";
import iconBanh from "./assets/icon-banh.png";
import iconBotGao from "./assets/icon-bot-gao.png";
import iconMyPham from "./assets/icon-my-pham.png";
import iconDoUong from "./assets/icon-do-uong.png";
import iconHopQua from "./assets/icon-hop-qua.png";
import iconTatCa from "./assets/icon-tat-ca.png";

import "./App.css";

const API_URL = "http://localhost:5000/api/products";

const categories = [
  { name: "Bánh", icon: iconBanh },
  { name: "Gạo, bột", icon: iconBotGao },
  { name: "Đồ uống", icon: iconDoUong },
  { name: "Mỹ phẩm", icon: iconMyPham },
  { name: "Sản phẩm khác", icon: iconHopQua },
  { name: "Tất cả", icon: iconTatCa },
];

function getProductSymbol(category) {
  if (category === "Gạo, bột") return "▤";
  if (category === "Đồ uống") return "♧";
  if (category === "Mỹ phẩm") return "✿";
  if (category === "Sản phẩm khác") return "✳";
  return "❋";
}

function matchesCategory(productCategory, activeCategory) {
  if (activeCategory === "Tất cả") return true;
  return productCategory === activeCategory;
}

const formatPrice = (price) =>
  `${Number(price || 0).toLocaleString("vi-VN")}đ`;

function HomePage({ search, setSearch, setCart }) {
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productError, setProductError] = useState("");

  const [activeCategory, setActiveCategory] = useState("Tất cả");
  const [favorites, setFavorites] = useState([]);
  const [notice, setNotice] = useState("");

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
        if (error.name === "AbortError") return;

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

  const filteredProducts = products.filter((product) => {
    const productName = (product.name || "").toLocaleLowerCase("vi");
    const searchText = search.toLocaleLowerCase("vi");

    return (
      productName.includes(searchText) &&
      matchesCategory(product.category, activeCategory) &&
      product.active !== false &&
      product.active !== 0
    );
  });

  function addToCart(product) {
    setCart((current) => {
      const productId = String(product._id ?? product.id);

      const existingProduct = current.find(
        (item) => String(item._id ?? item.id) === productId
      );

      if (existingProduct) {
        return current.map((item) =>
          String(item._id ?? item.id) === productId
            ? { ...item, quantity: Number(item.quantity || 0) + 1 }
            : item
        );
      }

      return [...current, { ...product, quantity: 1 }];
    });

    setNotice(`Đã thêm "${product.name}" vào giỏ hàng.`);
    window.setTimeout(() => setNotice(""), 2500);
  }

  function toggleFavorite(id) {
    setFavorites((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  function openProductDetail(product) {
    const productId = product._id ?? product.id;

    if (!productId) return;

    navigate(`/san-pham/${productId}`);
  }

  return (
    <div className="home-page">
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
              <img className="heading-decoration" src={iconTrangTri} alt="" />
              <div>
                <h2>Danh mục sản phẩm</h2>
                <p>Khám phá các dòng sản phẩm đa dạng của Ánh Nguyệt</p>
              </div>
            </div>

            <button
              className="text-link"
              type="button"
              onClick={() => navigate("/san-pham")}
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
                onClick={() => {
                  setActiveCategory(category.name);
                  document.getElementById("san-pham")?.scrollIntoView({
                    behavior: "smooth",
                  });
                }}
                aria-pressed={activeCategory === category.name}
              >
                <img className="category-icon" src={category.icon} alt="" />
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

        <section className="content-section products-section" id="san-pham">
          <div className="section-heading">
            <div className="heading-title">
              <img className="heading-decoration" src={iconTrangTri} alt="" />
              <div>
                <h2>Sản phẩm nổi bật</h2>
                <p>Những sản phẩm được yêu thích nhất hiện nay</p>
              </div>
            </div>

            <button
              className="text-link"
              type="button"
              onClick={() => {
                setActiveCategory("Tất cả");
                setSearch("");
                navigate("/san-pham");
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
              display: loadingProducts || productError ? "none" : undefined,
            }}
          >
            {filteredProducts.map((product, index) => {
              const productId = product._id ?? product.id;
              const isFavorite = favorites.includes(productId);

              return (
                <article
                  className="product-card"
                  key={productId}
                  onClick={() => openProductDetail(product)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openProductDetail(product);
                    }
                  }}
                  tabIndex={0}
                  role="link"
                  aria-label={`Xem chi tiết ${product.name}`}
                  style={{ cursor: "pointer" }}
                >
                  <div className={`product-image product-image-${index % 5}`}>
                    <img
                      className="product-photo"
                      src={
                        product.image
                          ? `/images/products/${product.image}`
                          : undefined
                      }
                      alt={product.name}
                      loading="lazy"
                      style={{
                        display: product.image ? "block" : "none",
                      }}
                      onError={(event) => {
                        event.currentTarget.style.display = "none";

                        const placeholder =
                          event.currentTarget.parentElement.querySelector(
                            ".product-placeholder"
                          );

                        if (placeholder) {
                          placeholder.style.display = "flex";
                        }
                      }}
                    />

                    <span
                      className="product-placeholder"
                      aria-hidden="true"
                      style={{
                        display: product.image ? "none" : "flex",
                      }}
                    >
                      {getProductSymbol(product.category)}
                    </span>

                    <span className="product-brand">ÁNH NGUYỆT</span>

                    <button
                      className={`favorite-button ${
                        isFavorite ? "is-favorite" : ""
                      }`}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleFavorite(productId);
                      }}
                      aria-label={
                        isFavorite ? "Bỏ yêu thích" : "Thêm vào yêu thích"
                      }
                    >
                      {isFavorite ? "♥" : "♡"}
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
                      onClick={(event) => {
                        event.stopPropagation();
                        addToCart(product);
                      }}
                      disabled={Number(product.stock) <= 0}
                    >
                      <span aria-hidden="true">🛒</span>
                      {Number(product.stock) <= 0
                        ? "Tạm hết hàng"
                        : "Thêm vào giỏ hàng"}
                    </button>
                  </div>
                </article>
              );
            })}
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

      <Footer />
    </div>
  );
}

function App() {
  const [search, setSearch] = useState("");

  const [cart, setCart] = useState(() => {
    try {
      const savedCart = localStorage.getItem("anh-nguyet-cart");
      const parsedCart = savedCart ? JSON.parse(savedCart) : [];

      return Array.isArray(parsedCart) ? parsedCart : [];
    } catch (error) {
      console.error("Không thể đọc giỏ hàng:", error);
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("anh-nguyet-cart", JSON.stringify(cart));
    } catch (error) {
      console.error("Không thể lưu giỏ hàng:", error);
    }
  }, [cart]);

  const cartCount = cart.reduce(
    (total, item) => total + Number(item.quantity || 0),
    0
  );

  return (
    <div className="site-shell">
      <Header
        cartCount={cartCount}
        search={search}
        onSearchChange={setSearch}
      />

      <Routes>
        <Route
          path="/"
          element={
            <HomePage
              search={search}
              setSearch={setSearch}
              setCart={setCart}
            />
          }
        />

        <Route
          path="/san-pham"
          element={
            <ProductsPage
              search={search}
              setSearch={setSearch}
              setCart={setCart}
            />
          }
        />

        <Route
          path="/san-pham/:id"
          element={<ProductDetailPage cart={cart} setCart={setCart} />}
        />

        <Route
          path="/gio-hang"
          element={<CartPage cart={cart} setCart={setCart} />}
        />
      </Routes>
    </div>
  );
}

export default App;
