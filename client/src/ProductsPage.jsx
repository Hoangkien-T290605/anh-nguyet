
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import Footer from "./components/Footer";

import iconTrangTri from "./assets/icon-trang-tri.png";

import "./ProductsPage.css";

const API_URL = "http://localhost:5000/api/products";

const categoryGroups = [
  {
    name: "Bánh",
    children: ["Bánh tráng", "Bánh gạo", "Cơm cháy", "Cốm"],
  },
  {
    name: "Gạo, bột",
    children: ["Gạo", "Bột"],
  },
  {
    name: "Đồ uống",
    children: ["Sữa", "Trà", "Rượu"],
  },
  {
    name: "Mỹ phẩm",
    children: ["Chăm sóc da mặt", "Chăm sóc cơ thể"],
  },
  {
    name: "Sản phẩm khác",
    children: [],
  },
];

const priceRanges = [
  { label: "Dưới 50.000đ", value: "under-50000" },
  { label: "50.000đ – 99.000đ", value: "50000-99000" },
  { label: "100.000đ – 149.000đ", value: "100000-149000" },
  { label: "Từ 150.000đ", value: "150000-up" },
];

const formatPrice = (price) =>
  `${Number(price || 0).toLocaleString("vi-VN")}đ`;

function normalizeText(value = "") {
  return String(value)
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

function getProductSymbol(category) {
  if (category === "Gạo, bột") return "▤";
  if (category === "Đồ uống") return "♧";
  if (category === "Mỹ phẩm") return "✿";
  if (category === "Sản phẩm khác") return "✳";
  return "❋";
}

function getSubCategory(product) {
  const name = normalizeText(product.name);

  if (product.category === "Bánh") {
    if (name.includes("banh trang")) return "Bánh tráng";
    if (name.includes("banh gao")) return "Bánh gạo";
    if (name.includes("com chay")) return "Cơm cháy";
    if (name.includes("com") || name.includes("nep")) return "Cốm";
    return "Bánh";
  }

  if (product.category === "Gạo, bột") {
    if (name.startsWith("gao")) return "Gạo";
    if (name.startsWith("bot")) return "Bột";
    return "Gạo, bột";
  }

  if (product.category === "Đồ uống") {
    if (name.includes("sua")) return "Sữa";
    if (name.includes("tra")) return "Trà";
    if (name.includes("ruou")) return "Rượu";
    return "Đồ uống";
  }

  if (product.category === "Mỹ phẩm") {
    const bodyKeywords = [
      "sua tam",
      "xa phong",
      "duong the",
      "toan than",
      "da tay",
      "da dau",
      "dau xa",
    ];

    if (bodyKeywords.some((keyword) => name.includes(keyword))) {
      return "Chăm sóc cơ thể";
    }

    return "Chăm sóc da mặt";
  }

  return "Sản phẩm khác";
}

function matchesPriceRange(price, range) {
  const value = Number(price || 0);

  switch (range) {
    case "under-50000":
      return value < 50000;

    case "50000-99000":
      return value >= 50000 && value <= 99000;

    case "100000-149000":
      return value >= 100000 && value <= 149000;

    case "150000-up":
      return value >= 150000;

    default:
      return true;
  }
}

function ProductsPage({ search, setSearch, setCart }) {
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productError, setProductError] = useState("");

  const [sort, setSort] = useState("default");

  const [activeCategory, setActiveCategory] = useState("Tất cả");
  const [activeSubCategory, setActiveSubCategory] = useState("Tất cả");
  const [activePrice, setActivePrice] = useState("");

  const [expandedCategories, setExpandedCategories] = useState(
    categoryGroups.map((category) => category.name)
  );

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

  const filteredProducts = useMemo(() => {
    let result = products.filter(
      (product) => product.active !== false && product.active !== 0
    );

    if (activeCategory !== "Tất cả") {
      result = result.filter(
        (product) => product.category === activeCategory
      );
    }

    if (activeSubCategory !== "Tất cả") {
      result = result.filter(
        (product) => getSubCategory(product) === activeSubCategory
      );
    }

    if (search.trim()) {
      const searchText = normalizeText(search);

      result = result.filter((product) =>
        normalizeText(product.name).includes(searchText)
      );
    }

    if (activePrice) {
      result = result.filter((product) =>
        matchesPriceRange(product.price, activePrice)
      );
    }

    if (sort === "price-asc") {
      result.sort(
        (a, b) => Number(a.price || 0) - Number(b.price || 0)
      );
    } else if (sort === "price-desc") {
      result.sort(
        (a, b) => Number(b.price || 0) - Number(a.price || 0)
      );
    } else if (sort === "name-asc") {
      result.sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), "vi")
      );
    }

    return result;
  }, [
    products,
    activeCategory,
    activeSubCategory,
    activePrice,
    search,
    sort,
  ]);

  function selectCategory(category) {
    setActiveCategory(category);
    setActiveSubCategory("Tất cả");
  }

  function selectSubCategory(category, subCategory) {
    setActiveCategory(category);
    setActiveSubCategory(subCategory);
  }

  function toggleCategory(categoryName) {
    setExpandedCategories((current) =>
      current.includes(categoryName)
        ? current.filter((item) => item !== categoryName)
        : [...current, categoryName]
    );
  }

  function toggleFavorite(id) {
    setFavorites((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  function addToCart(product) {
    setCart((current) => {
      const productId = product._id ?? product.id;

      const existingProduct = current.find(
        (item) => (item._id ?? item.id) === productId
      );

      if (existingProduct) {
        return current.map((item) =>
          (item._id ?? item.id) === productId
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...current, { ...product, quantity: 1 }];
    });

    setNotice(`Đã thêm "${product.name}" vào giỏ hàng.`);

    window.setTimeout(() => setNotice(""), 2500);
  }

  function resetFilters() {
    setActiveCategory("Tất cả");
    setActiveSubCategory("Tất cả");
    setActivePrice("");
    setSearch("");
    setSort("default");
  }

  function openProductDetail(productId) {
    navigate(`/san-pham/${productId}`);
  }

  return (
    <div className="products-page">
      <main className="products-main">
        <div className="products-breadcrumb">
          <Link to="/">TRANG CHỦ</Link>
          <span>/</span>
          <span>SẢN PHẨM</span>
        </div>

        <section className="products-title-section">
          <div className="products-title-decoration">
            <img src={iconTrangTri} alt="" />
          </div>

          <div>
            <p className="products-eyebrow">
              ÁNH NGUYỆT COLLECTION
            </p>

            <h1>DANH MỤC SẢN PHẨM ÁNH NGUYỆT</h1>

            <p className="products-subtitle">
              Khám phá những sản phẩm tinh túy từ hạt gạo Việt Nam.
            </p>
          </div>
        </section>

        <section className="products-layout">
          <aside className="products-sidebar">
            <div className="sidebar-heading">
              <span className="sidebar-heading-icon">☷</span>
              <h2>DANH MỤC</h2>
            </div>

            <button
              type="button"
              className={`sidebar-all ${
                activeCategory === "Tất cả" ? "selected" : ""
              }`}
              onClick={() => selectCategory("Tất cả")}
            >
              <span>Tất cả sản phẩm</span>
              <span className="sidebar-arrow">›</span>
            </button>

            <div className="sidebar-category-list">
              {categoryGroups.map((category) => {
                const isExpanded = expandedCategories.includes(
                  category.name
                );

                return (
                  <div
                    className="sidebar-category"
                    key={category.name}
                  >
                    <div className="sidebar-category-heading">
                      <button
                        type="button"
                        className={`sidebar-category-name ${
                          activeCategory === category.name &&
                          activeSubCategory === "Tất cả"
                            ? "selected"
                            : ""
                        }`}
                        onClick={() => selectCategory(category.name)}
                      >
                        {category.name}
                      </button>

                      {category.children.length > 0 && (
                        <button
                          type="button"
                          className={`sidebar-expand ${
                            isExpanded ? "expanded" : ""
                          }`}
                          onClick={() => toggleCategory(category.name)}
                          aria-label={
                            isExpanded
                              ? "Thu gọn danh mục"
                              : "Mở danh mục"
                          }
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? "−" : "+"}
                        </button>
                      )}
                    </div>

                    {isExpanded &&
                      category.children.length > 0 && (
                        <div className="sidebar-subcategories">
                          {category.children.map((subCategory) => (
                            <button
                              type="button"
                              key={subCategory}
                              className={`sidebar-subcategory ${
                                activeCategory === category.name &&
                                activeSubCategory === subCategory
                                  ? "selected"
                                  : ""
                              }`}
                              onClick={() =>
                                selectSubCategory(
                                  category.name,
                                  subCategory
                                )
                              }
                            >
                              <span className="subcategory-dot" />
                              {subCategory}
                            </button>
                          ))}
                        </div>
                      )}
                  </div>
                );
              })}
            </div>

            <div className="sidebar-divider" />

            <div className="sidebar-price">
              <div className="sidebar-heading">
                <span className="sidebar-heading-icon">₫</span>
                <h2>LỌC THEO GIÁ</h2>
              </div>

              <div className="price-options">
                {priceRanges.map((range) => (
                  <label className="price-option" key={range.value}>
                    <input
                      type="radio"
                      name="price-range"
                      checked={activePrice === range.value}
                      onChange={() => setActivePrice(range.value)}
                    />

                    <span className="custom-radio" />
                    <span>{range.label}</span>
                  </label>
                ))}
              </div>

              {activePrice && (
                <button
                  className="clear-price"
                  type="button"
                  onClick={() => setActivePrice("")}
                >
                  Xóa lọc giá
                </button>
              )}
            </div>

            <button
              className="reset-filter"
              type="button"
              onClick={resetFilters}
            >
              <span>↺</span> Xóa tất cả bộ lọc
            </button>
          </aside>

          <div className="products-content">
            <div className="products-content-heading">
              <div>
                <h2>Sản phẩm</h2>

                <p>
                  Có <strong>{filteredProducts.length}</strong> sản phẩm
                </p>
              </div>

              <label className="products-search">
                <span aria-hidden="true">⌕</span>

                <input
                  type="search"
                  placeholder="Tìm sản phẩm..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Tìm sản phẩm"
                />
              </label>

              <label className="products-sort">
                <span className="sort-label">Sắp xếp:</span>

                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                  aria-label="Sắp xếp sản phẩm"
                >
                  <option value="default">Sắp xếp mặc định</option>
                  <option value="price-asc">
                    Giá: thấp đến cao
                  </option>
                  <option value="price-desc">
                    Giá: cao đến thấp
                  </option>
                  <option value="name-asc">Tên: A đến Z</option>
                </select>
              </label>
            </div>

            {loadingProducts && (
              <p className="empty-message">
                Đang tải sản phẩm...
              </p>
            )}

            {productError && (
              <p className="empty-message" role="alert">
                {productError}
              </p>
            )}

            {!loadingProducts && !productError && (
              <>
                <div className="product-grid">
                  {filteredProducts.map((product, index) => {
                    const productId = product._id ?? product.id;
                    const isFavorite = favorites.includes(productId);

                    return (
                      <article
                        className="product-card"
                        key={productId}
                        onClick={() => openProductDetail(productId)}
                        onKeyDown={(event) => {
                          if (
                            event.key === "Enter" ||
                            event.key === " "
                          ) {
                            event.preventDefault();
                            openProductDetail(productId);
                          }
                        }}
                        role="link"
                        tabIndex={0}
                        aria-label={`Xem chi tiết ${product.name}`}
                      >
                        <div
                          className={`product-image product-image-${index % 5}`}
                        >
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

                          <span className="product-brand">
                            ÁNH NGUYỆT
                          </span>

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
                              isFavorite
                                ? "Bỏ yêu thích"
                                : "Thêm vào yêu thích"
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

                {filteredProducts.length === 0 && (
                  <div className="products-empty">
                    <span>⌕</span>

                    <h3>Không tìm thấy sản phẩm</h3>

                    <p>
                      Bạn hãy thử thay đổi từ khóa hoặc bộ lọc sản phẩm.
                    </p>

                    <button type="button" onClick={resetFilters}>
                      Xóa bộ lọc
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
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

export default ProductsPage;
