
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import Footer from "./components/Footer";

import "./ProductDetailPage.css";
import "./ProductsPage.css";

const API_URL = "http://localhost:5000/api/products";

const formatPrice = (price) =>
  `${Number(price || 0).toLocaleString("vi-VN")}đ`;

function getProductSymbol(category) {
  if (category === "Gạo, bột") return "▤";
  if (category === "Đồ uống") return "♧";
  if (category === "Mỹ phẩm") return "✿";
  if (category === "Sản phẩm khác") return "✳";
  return "❋";
}

// Chuẩn hóa đường dẫn media từ dữ liệu đánh giá
function getReviewMediaInfo(item) {
  if (typeof item === "string") {
    return {
      url: item,
      type: /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(item)
        ? "video"
        : "image",
    };
  }

  if (!item || typeof item !== "object") {
    return null;
  }

  const url = item.url || item.src || item.path || item.location;

  if (!url) return null;

  const typeText = `${item.type || ""} ${item.mimeType || ""} ${item.mime_type || ""}`;
  const isVideo =
    /video/i.test(typeText) ||
    /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url);

  return {
    url,
    type: isVideo ? "video" : "image",
  };
}

// Hiển thị 5 sao, hỗ trợ nửa sao
function RatingStars({ rating = 0, size = "normal" }) {
  const safeRating = Math.min(5, Math.max(0, Number(rating) || 0));

  return (
    <span
      className={`rating-stars rating-stars-${size}`}
      aria-label={`${safeRating} trên 5 sao`}
    >
      {Array.from({ length: 5 }, (_, index) => {
        const difference = safeRating - index;

        let starClass = "rating-star-empty";

        if (difference >= 1) {
          starClass = "rating-star-full";
        } else if (difference > 0) {
          starClass = "rating-star-half";
        }

        return (
          <span className={`rating-star ${starClass}`} key={index}>
            ★
          </span>
        );
      })}
    </span>
  );
}

function ProductDetailPage({ cart = [], setCart }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  const [notice, setNotice] = useState("");
  const [favorites, setFavorites] = useState([]);

  const [reviewSummary, setReviewSummary] = useState({
    averageRating: 0,
    totalReviews: 0,
    ratingCounts: {
      5: 0,
      4: 0,
      3: 0,
      2: 0,
      1: 0,
    },
    mediaCount: 0,
  });

  const [reviews, setReviews] = useState([]);
  const [reviewLoading, setReviewLoading] = useState(true);
  const [reviewError, setReviewError] = useState("");
  const [reviewFilter, setReviewFilter] = useState("all");

  // Khi chuyển sang sản phẩm khác, tự động cuộn lên đầu trang.
  useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, [id]);

  // Lấy thông tin sản phẩm
  useEffect(() => {
    const controller = new AbortController();

    async function fetchProduct() {
      try {
        setLoading(true);
        setError("");
        setProduct(null);
        setSelectedImage(0);
        setQuantity(1);

        const response = await fetch(API_URL, {
          signal: controller.signal,
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(
            result.message || "Không thể tải thông tin sản phẩm."
          );
        }

        const activeProducts = result.data.filter(
          (item) => item.active !== false && item.active !== 0
        );

        setProducts(activeProducts);

        const foundProduct = activeProducts.find(
          (item) => String(item.id ?? item._id) === String(id)
        );

        if (!foundProduct) {
          throw new Error("Không tìm thấy sản phẩm này.");
        }

        setProduct(foundProduct);
      } catch (err) {
        if (err.name === "AbortError") return;

        console.error("Lỗi tải chi tiết sản phẩm:", err);
        setError(err.message || "Đã xảy ra lỗi khi tải sản phẩm.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchProduct();

    return () => controller.abort();
  }, [id]);

  // Lấy đánh giá và thống kê từ API MySQL
  useEffect(() => {
    const controller = new AbortController();

    async function fetchReviews() {
      try {
        setReviewLoading(true);
        setReviewError("");
        setReviews([]);
        setReviewFilter("all");

        setReviewSummary({
          averageRating: 0,
          totalReviews: 0,
          ratingCounts: {
            5: 0,
            4: 0,
            3: 0,
            2: 0,
            1: 0,
          },
          mediaCount: 0,
        });

        const response = await fetch(`${API_URL}/${id}/reviews`, {
          signal: controller.signal,
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(
            result.message || "Không thể tải đánh giá sản phẩm."
          );
        }

        const summary = result.summary || {};

        setReviewSummary({
          averageRating: Number(summary.averageRating) || 0,
          totalReviews: Number(summary.totalReviews) || 0,
          ratingCounts: {
            5: Number(summary.ratingCounts?.[5]) || 0,
            4: Number(summary.ratingCounts?.[4]) || 0,
            3: Number(summary.ratingCounts?.[3]) || 0,
            2: Number(summary.ratingCounts?.[2]) || 0,
            1: Number(summary.ratingCounts?.[1]) || 0,
          },
          mediaCount: Number(summary.mediaCount) || 0,
        });

        setReviews(Array.isArray(result.data) ? result.data : []);
      } catch (err) {
        if (err.name === "AbortError") return;

        console.error("Lỗi tải đánh giá sản phẩm:", err);
        setReviewError(
          err.message || "Đã xảy ra lỗi khi tải đánh giá."
        );
      } finally {
        if (!controller.signal.aborted) {
          setReviewLoading(false);
        }
      }
    }

    fetchReviews();

    return () => controller.abort();
  }, [id]);

  const stock = Number(product?.stock || 0);

  const productImages = product
    ? [
        product.image
          ? `/images/products/${product.image}`
          : null,
        ...(Array.isArray(product.images) ? product.images : []),
      ].filter(Boolean)
    : [];

  const selectedImageUrl = productImages[selectedImage] || null;

  function changeQuantity(value) {
    setQuantity(Math.min(stock, Math.max(1, Number(value) || 1)));
  }

  function addToCart(redirectToCart = false) {
    if (!product || !setCart) return;

    if (stock <= 0) {
      setNotice("Sản phẩm hiện đã hết hàng.");
      return;
    }

    const productId = String(product.id ?? product._id);

    const existingProduct = cart.find(
      (item) => String(item.id ?? item._id) === productId
    );

    const currentQuantity = Number(existingProduct?.quantity || 0);

    if (currentQuantity + quantity > stock) {
      setNotice("Số lượng mua vượt quá số lượng tồn kho.");
      return;
    }

    setCart((current) => {
      const existing = current.find(
        (item) => String(item.id ?? item._id) === productId
      );

      if (existing) {
        return current.map((item) =>
          String(item.id ?? item._id) === productId
            ? {
                ...item,
                quantity: Number(item.quantity || 0) + quantity,
              }
            : item
        );
      }

      return [...current, { ...product, quantity }];
    });

    if (redirectToCart) {
      navigate("/gio-hang");
      return;
    }

    setNotice("Đã thêm sản phẩm vào giỏ hàng.");
  }

  function toggleFavorite(productId) {
    setFavorites((current) =>
      current.includes(productId)
        ? current.filter((item) => item !== productId)
        : [...current, productId]
    );
  }

  function addRelatedProductToCart(relatedProduct) {
    if (!setCart) return;

    const relatedStock = Number(relatedProduct.stock || 0);

    if (relatedStock <= 0) {
      setNotice("Sản phẩm hiện đã hết hàng.");
      return;
    }

    const relatedId = String(
      relatedProduct.id ?? relatedProduct._id
    );

    const existingProduct = cart.find(
      (item) => String(item.id ?? item._id) === relatedId
    );

    const currentQuantity = Number(existingProduct?.quantity || 0);

    if (currentQuantity + 1 > relatedStock) {
      setNotice("Số lượng mua vượt quá số lượng tồn kho.");
      return;
    }

    setCart((current) => {
      const existing = current.find(
        (item) =>
          String(item.id ?? item._id) === relatedId
      );

      if (existing) {
        return current.map((item) =>
          String(item.id ?? item._id) === relatedId
            ? {
                ...item,
                quantity: Number(item.quantity || 0) + 1,
              }
            : item
        );
      }

      return [...current, { ...relatedProduct, quantity: 1 }];
    });

    setNotice(`Đã thêm "${relatedProduct.name}" vào giỏ hàng.`);
  }

  function openProductDetail(productId) {
    navigate(`/san-pham/${productId}`);
  }

  const relatedProducts = products
    .filter(
      (item) =>
        String(item.id ?? item._id) !==
          String(product?.id ?? product?._id) &&
        item.category === product?.category
    )
    .slice(0, 4);

  const detailFields = [
    ["Danh mục", product?.category],
    ["Thành phần", product?.ingredients],
    ["Thông số sản phẩm", product?.specifications],
    ["Chất liệu", product?.material],
    ["Xuất xứ", product?.origin],
    ["Hạn sử dụng", product?.expiryDate],
  ];

  // Lọc đánh giá theo lựa chọn
  const filteredReviews = reviews.filter((review) => {
    if (reviewFilter === "media") {
      return (
        Array.isArray(review.media) &&
        review.media.length > 0
      );
    }

    if (reviewFilter === "all") {
      return true;
    }

    return Number(review.rating) === Number(reviewFilter);
  });

  const reviewFilters = [
    {
      value: "all",
      label: "Tất cả",
      count: reviewSummary.totalReviews,
    },
    {
      value: "5",
      label: "5 sao",
      count: reviewSummary.ratingCounts[5],
    },
    {
      value: "4",
      label: "4 sao",
      count: reviewSummary.ratingCounts[4],
    },
    {
      value: "3",
      label: "3 sao",
      count: reviewSummary.ratingCounts[3],
    },
    {
      value: "2",
      label: "2 sao",
      count: reviewSummary.ratingCounts[2],
    },
    {
      value: "1",
      label: "1 sao",
      count: reviewSummary.ratingCounts[1],
    },
    {
      value: "media",
      label: "Có ảnh/video",
      count: reviewSummary.mediaCount,
    },
  ];

  return (
    <div className="product-detail-page">
      <main className="product-detail-main">
        <div className="detail-breadcrumb">
          <Link to="/">TRANG CHỦ</Link>
          <span>/</span>
          <Link to="/san-pham">SẢN PHẨM</Link>
          <span>/</span>
          <span>CHI TIẾT</span>
        </div>

        {loading && (
          <p className="detail-message">
            Đang tải thông tin sản phẩm...
          </p>
        )}

        {!loading && error && (
          <div className="detail-message detail-error" role="alert">
            <h2>Không tìm thấy sản phẩm</h2>
            <p>{error}</p>
            <Link to="/san-pham" className="detail-back-button">
              Quay lại danh sách sản phẩm
            </Link>
          </div>
        )}

        {!loading && !error && product && (
          <>
            {/* THÔNG TIN SẢN PHẨM */}
            <section className="product-detail-content">
              <div className="detail-gallery">
                <div className="detail-image-box">
                  {selectedImageUrl ? (
                    <img
                      src={selectedImageUrl}
                      alt={product.name}
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="detail-image-placeholder">
                      <span>✿</span>
                      <p>ÁNH NGUYỆT</p>
                    </div>
                  )}
                </div>

                <div className="detail-thumbnail-list">
                  {Array.from({ length: 5 }).map((_, index) => {
                    const imageUrl = productImages[index] || null;

                    return (
                      <button
                        type="button"
                        key={index}
                        className={`detail-thumbnail ${
                          selectedImage === index ? "active" : ""
                        }`}
                        onClick={() => setSelectedImage(index)}
                        aria-label={`Xem hình ảnh ${index + 1}`}
                      >
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={`${product.name} ${index + 1}`}
                          />
                        ) : (
                          <div className="detail-thumbnail-placeholder">
                            <span>✿</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="detail-information">
                <p className="detail-eyebrow">
                  ÁNH NGUYỆT COLLECTION
                </p>

                <span className="detail-category">
                  {product.category || "Chưa phân loại"}
                </span>

                <h1>{product.name}</h1>

                <div className="detail-rating-summary">
                  <strong>
                    {reviewSummary.averageRating.toFixed(1)} / 5
                  </strong>

                  <RatingStars
                    rating={reviewSummary.averageRating}
                    size="normal"
                  />

                  <span>
                    {reviewSummary.totalReviews} đánh giá
                  </span>
                </div>

                <p className="detail-id">
                  Mã sản phẩm: #{product.id ?? product._id}
                </p>

                <strong className="detail-price">
                  {formatPrice(product.price)}
                </strong>

                <div className="detail-stock">
                  <span>Tình trạng:</span>
                  {stock > 0 ? (
                    <strong className="in-stock">
                      Còn hàng ({stock} sản phẩm)
                    </strong>
                  ) : (
                    <strong className="out-stock">
                      Tạm hết hàng
                    </strong>
                  )}
                </div>

                <div className="detail-quantity">
                  <span>Số lượng:</span>

                  <div className="quantity-control">
                    <button
                      type="button"
                      onClick={() => changeQuantity(quantity - 1)}
                      disabled={quantity <= 1 || stock <= 0}
                      aria-label="Giảm số lượng"
                    >
                      −
                    </button>

                    <input
                      type="number"
                      min="1"
                      max={stock}
                      value={quantity}
                      disabled={stock <= 0}
                      onChange={(event) =>
                        changeQuantity(event.target.value)
                      }
                      aria-label="Số lượng sản phẩm"
                    />

                    <button
                      type="button"
                      onClick={() => changeQuantity(quantity + 1)}
                      disabled={quantity >= stock || stock <= 0}
                      aria-label="Tăng số lượng"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="detail-total">
                  <span>Tạm tính:</span>
                  <strong>
                    {formatPrice(Number(product.price) * quantity)}
                  </strong>
                </div>

                <div className="detail-purchase-actions">
                  <button
                    type="button"
                    className="detail-add-button"
                    onClick={() => addToCart(false)}
                    disabled={stock <= 0}
                  >
                    🛒 Thêm vào giỏ hàng
                  </button>

                  <button
                    type="button"
                    className="detail-buy-button"
                    onClick={() => addToCart(true)}
                    disabled={stock <= 0}
                  >
                    Mua ngay
                  </button>
                </div>
              </div>
            </section>

            {/* THÔNG TIN CHI TIẾT */}
            <section className="detail-section">
              <h2>THÔNG TIN CHI TIẾT</h2>

              <div className="detail-specification-list">
                {detailFields.map(([label, value]) => (
                  <div className="detail-specification-row" key={label}>
                    <span>{label}</span>
                    <strong>{value || "Chưa cập nhật"}</strong>
                  </div>
                ))}
              </div>
            </section>

            {/* MÔ TẢ SẢN PHẨM */}
            <section className="detail-section">
              <h2>MÔ TẢ SẢN PHẨM</h2>

              <div className="detail-full-description">
                {product.description ? (
                  <p>{product.description}</p>
                ) : (
                  <p>Thông tin mô tả sản phẩm đang được cập nhật.</p>
                )}
              </div>
            </section>

            {/* ĐÁNH GIÁ KHÁCH HÀNG */}
            <section className="detail-section" id="danh-gia">
              <h2>ĐÁNH GIÁ KHÁCH HÀNG</h2>

              {reviewLoading ? (
                <p className="detail-empty">
                  Đang tải đánh giá khách hàng...
                </p>
              ) : reviewError ? (
                <p className="detail-empty" role="alert">
                  {reviewError}
                </p>
              ) : (
                <>
                  <div className="detail-review-summary">
                    <div className="detail-review-score">
                      <strong>
                        {reviewSummary.averageRating.toFixed(1)}
                      </strong>
                      <span>/ 5</span>
                    </div>

                    <div className="detail-review-score-info">
                      <RatingStars
                        rating={reviewSummary.averageRating}
                        size="large"
                      />
                      <p>
                        {reviewSummary.totalReviews} đánh giá
                      </p>
                    </div>
                  </div>

                  <div
                    className="detail-review-filters"
                    aria-label="Lọc đánh giá"
                  >
                    {reviewFilters.map((filter) => (
                      <button
                        type="button"
                        key={filter.value}
                        className={`detail-review-filter ${
                          reviewFilter === filter.value ? "active" : ""
                        }`}
                        onClick={() => setReviewFilter(filter.value)}
                        aria-pressed={reviewFilter === filter.value}
                      >
                        {filter.label}
                        <span>({filter.count})</span>
                      </button>
                    ))}
                  </div>

                  {filteredReviews.length > 0 ? (
                    <div className="detail-review-list">
                      {filteredReviews.map((review, index) => {
                        const mediaItems = Array.isArray(review.media)
                          ? review.media
                              .map(getReviewMediaInfo)
                              .filter(Boolean)
                          : [];

                        return (
                          <article
                            className="detail-review-item"
                            key={review.id ?? index}
                          >
                            <div className="detail-review-heading">
                              <strong>
                                {review.customer_name ||
                                  review.customerName ||
                                  review.name ||
                                  "Khách hàng"}
                              </strong>

                              {review.created_at && (
                                <time>
                                  {new Date(
                                    review.created_at
                                  ).toLocaleDateString("vi-VN")}
                                </time>
                              )}
                            </div>

                            <RatingStars
                              rating={review.rating}
                              size="normal"
                            />

                            {review.comment && (
                              <p className="detail-review-comment">
                                {review.comment}
                              </p>
                            )}

                            {mediaItems.length > 0 && (
                              <div className="detail-review-media">
                                {mediaItems.map((media, mediaIndex) => (
                                  <div
                                    className="detail-review-media-item"
                                    key={`${review.id ?? index}-${mediaIndex}`}
                                  >
                                    {media.type === "video" ? (
                                      <video
                                        src={media.url}
                                        controls
                                        preload="metadata"
                                      >
                                        Trình duyệt không hỗ trợ video.
                                      </video>
                                    ) : (
                                      <a
                                        href={media.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        aria-label="Xem ảnh đánh giá"
                                      >
                                        <img
                                          src={media.url}
                                          alt={`Ảnh đánh giá ${mediaIndex + 1}`}
                                          loading="lazy"
                                        />
                                      </a>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="detail-empty">
                      {reviewSummary.totalReviews === 0
                        ? "Sản phẩm chưa có đánh giá của khách hàng."
                        : "Không có đánh giá phù hợp với bộ lọc."}
                    </p>
                  )}
                </>
              )}
            </section>

            {/* SẢN PHẨM LIÊN QUAN */}
            <section className="detail-section">
              <h2>SẢN PHẨM LIÊN QUAN</h2>

              {relatedProducts.length > 0 ? (
                <div className="product-grid">
                  {relatedProducts.map((relatedProduct, index) => {
                    const productId =
                      relatedProduct._id ?? relatedProduct.id;

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
                        aria-label={`Xem chi tiết ${relatedProduct.name}`}
                      >
                        <div
                          className={`product-image product-image-${index % 5}`}
                        >
                          <img
                            className="product-photo"
                            src={
                              relatedProduct.image
                                ? `/images/products/${relatedProduct.image}`
                                : undefined
                            }
                            alt={relatedProduct.name}
                            loading="lazy"
                            style={{
                              display: relatedProduct.image
                                ? "block"
                                : "none",
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
                              display: relatedProduct.image
                                ? "none"
                                : "flex",
                            }}
                          >
                            {getProductSymbol(relatedProduct.category)}
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
                          <h3>{relatedProduct.name}</h3>

                          <p className="product-detail">
                            {relatedProduct.description ||
                              relatedProduct.category}
                          </p>

                          <strong className="product-price">
                            {formatPrice(relatedProduct.price)}
                          </strong>

                          <div className="product-rating">
                            <span>{relatedProduct.category}</span>
                          </div>

                          <button
                            className="add-button"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              addRelatedProductToCart(relatedProduct);
                            }}
                            disabled={
                              Number(relatedProduct.stock) <= 0
                            }
                          >
                            <span aria-hidden="true">🛒</span>

                            {Number(relatedProduct.stock) <= 0
                              ? "Tạm hết hàng"
                              : "Thêm vào giỏ hàng"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="detail-empty">
                  Chưa có sản phẩm liên quan.
                </p>
              )}
            </section>
          </>
        )}
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

export default ProductDetailPage;
