// Trang chi tiết tải sản phẩm, đánh giá và thao tác giỏ hàng/yêu thích.
import { apiRequest, getProductImageUrl } from "../services/api.js";
import { addToCart, readCart } from "../services/cart.js";
import {
  bindImageFallback,
  escapeHTML,
  formatPrice,
  createProductCard,
} from "../components/product-card.js";

class ProductNotFoundError extends Error {
  constructor() {
    super("Không tìm thấy sản phẩm này.");
    this.name = "ProductNotFoundError";
  }
}

// Dựng biểu tượng sao theo điểm đánh giá.
const renderStars = (rating = 0, size = "normal") =>
  `<span class="rating-star rating-star-${size}" aria-label="${Number(rating).toFixed(1)} trên 5 sao">${Array.from(
    { length: 5 },
    (_, i) => {
      const fraction = Number(rating) - i;
      const cls =
        fraction >= 1
          ? "rating-star-full-full"
          : fraction > 0
            ? "rating-star-mot-nua"
            : "rating-star-empty";
      return `<span class="rating-star ${cls}">★</span>`;
    },
  ).join("")}</span>`;

// Chuẩn hóa ảnh hoặc video đính kèm đánh giá.
function getReviewMedia(item) {
  const value = typeof item === "string" ? { url: item } : item;
  if (!value || typeof value !== "object") return null;
  const url = value.url || value.src || value.path || value.location;
  if (!url) return null;
  const kind = `${value.type || ""} ${value.mimeType || ""} ${value.mime_type || ""}`;
  return {
    url,
    type: /video|\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(`${kind} ${url}`)
      ? "video"
      : "image",
  };
}

// Đọc mã sản phẩm trên URL rồi tải và dựng nội dung chi tiết.
export async function mountProductDetail() {
  const status = document.getElementById("product-detail-status");
  const root = document.getElementById("product-detail");
  const id = new URLSearchParams(window.location.search).get("id");
  let toastTimer;
  // Hiển thị thông báo tạm cho các thao tác trong trang chi tiết.
  const showToast = (message) => {
    const node = document.getElementById("page-toast-notification");
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      node.hidden = true;
    }, 2500);
  };

  if (!id) {
    const errorBox = document.createElement("div");
    errorBox.className = "detail-alert detail-error";
    errorBox.setAttribute("role", "alert");
    errorBox.innerHTML =
      '<h2>Không tìm thấy sản phẩm</h2><p>Liên kết sản phẩm chưa có mã hợp lệ.</p><a class="detail-back-button" href="products.html">Quay lại danh sách sản phẩm</a>';
    status.replaceWith(errorBox);
    return;
  }

  try {
    const [productResponse, reviewResponse] = await Promise.all([
      apiRequest("/products", { signal: AbortSignal.timeout(12000) }),
      apiRequest(`/products/${encodeURIComponent(id)}/reviews`, {
        signal: AbortSignal.timeout(12000),
      }).catch(() => null),
    ]);
    if (!Array.isArray(productResponse.data)) {
      throw new Error("Dữ liệu sản phẩm từ máy chủ không hợp lệ.");
    }
    const products = productResponse.data.filter(
      (item) => item.active !== false && item.active !== 0,
    );
    const product = products.find((item) => String(item.id ?? item._id) === id);
    if (!product) throw new ProductNotFoundError();

    const stock = Math.max(0, Number(product.stock) || 0);
    const images = [
      product.image,
      ...(Array.isArray(product.images) ? product.images : []),
    ]
      .filter(Boolean)
      .map(getProductImageUrl);
    const reviews = Array.isArray(reviewResponse?.data)
      ? reviewResponse.data
      : [];
    const favoriteProducts = new Set();
    const summary = reviewResponse?.summary || {};
    const rating = Number(summary.averageRating) || 0;
    const reviewCount = Number(summary.totalReviews) || 0;
    const fields = [
      ["Danh mục", product.category],
      ["Thành phần", product.ingredients],
      ["Thông số sản phẩm", product.specifications],
      ["Chất liệu", product.material],
      ["Xuất xứ", product.origin],
      ["Hạn sử dụng", product.expiryDate],
    ];
    const related = products
      .filter(
        (item) =>
          String(item.id ?? item._id) !== String(product.id ?? product._id) &&
          item.category === product.category,
      )
      .slice(0, 4);

    document.title = `${product.name} | Ánh Nguyệt`;
    status.hidden = true;
    root.hidden = false;
    root.innerHTML = `
      <section class="product-detail-content">
        <div class="detail-retry-vien-image">
          <div class="detail-image-hop" id="detail-image-hop">${images[0] ? `<img src="${escapeHTML(images[0])}" alt="${escapeHTML(product.name)}" id="detail-image">` : '<div class="detail-image-placeholder-empty"><span>✿</span><p>ÁNH NGUYỆT</p></div>'}</div>
          <div class="detail-image-retry-small-list">${Array.from({ length: 5 }, (_, index) => `<button type="button" class="detail-image-retry-small ${index === 0 ? "is-active" : ""}" data-image-index="${index}" aria-label="Xem hình ảnh ${index + 1}">${images[index] ? `<img src="${escapeHTML(images[index])}" alt="${escapeHTML(product.name)} ${index + 1}">` : '<div class="detail-image-retry-small-placeholder-empty"><span>✿</span></div>'}</button>`).join("")}</div>
        </div>
        <div class="detail-info">
          <p class="detail-eyebrow">ÁNH NGUYỆT COLLECTION</p><span class="detail-category">${escapeHTML(product.category || "Chưa phân loại")}</span><h1>${escapeHTML(product.name)}</h1>
          <div class="detail-rating-summary"><strong>${rating.toFixed(1)} / 5</strong>${renderStars(rating)}<span>${reviewCount} đánh giá</span></div>
          <p class="detail-code">Mã sản phẩm: #${escapeHTML(product.id ?? product._id)}</p><strong class="detail-price">${formatPrice(product.price)}</strong>
          <div class="detail-stock"><span>Tình trạng:</span>${stock > 0 ? `<strong class="in-stock">Còn hàng (${stock} sản phẩm)</strong>` : '<strong class="out-stock">Tạm hết hàng</strong>'}</div>
          <div class="detail-quantity"><span>Số lượng:</span><div class="quantity-control-control"><button type="button" data-quantity="minus" aria-label="Giảm số lượng" disabled>−</button><input id="detail-quantity" type="number" min="1" max="${stock}" value="1" aria-label="Số lượng sản phẩm" ${stock <= 0 ? "disabled" : ""}><button type="button" data-quantity="plus" aria-label="Tăng số lượng" ${stock <= 1 ? "disabled" : ""}>+</button></div></div>
          <div class="detail-tong"><span>Tạm tính:</span><strong id="detail-tong">${formatPrice(product.price)}</strong></div>
          <div class="detail-purchase-actions"><button type="button" class="detail-add-button" data-detail-add ${stock <= 0 ? "disabled" : ""}>🛒 Thêm vào giỏ hàng</button><button type="button" class="detail-buy-button" data-detail-buy ${stock <= 0 ? "disabled" : ""}>Mua ngay</button></div>
        </div>
      </section>
      <section class="detail-section"><h2>THÔNG TIN CHI TIẾT</h2><div class="detail-notice-number-list">${fields.map(([label, value]) => `<div class="detail-notice-number-row"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value || "Chưa cập nhật")}</strong></div>`).join("")}</div></section>
      <section class="detail-section"><h2>MÔ TẢ SẢN PHẨM</h2><div class="detail-full-full-description"><p>${escapeHTML(product.description || "Thông tin mô tả sản phẩm đang được cập nhật.")}</p></div></section>
      <section class="detail-section" id="rating"><h2>ĐÁNH GIÁ KHÁCH HÀNG</h2><div class="detail-rating-summary"><div class="detail-rating-score"><strong>${rating.toFixed(1)}</strong><span>/ 5</span></div><div class="detail-rating-score-info">${renderStars(rating, "large")}<p>${reviewCount} đánh giá</p></div></div>
        <div class="detail-rating-all-filter" aria-label="Lọc đánh giá">${[{ value: "all", label: "Tất cả", count: reviewCount }, ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} sao`, count: Number(summary.ratingCounts?.[n]) || 0 })), { value: "media", label: "Có ảnh/video", count: Number(summary.mediaCount) || 0 }].map((filter, index) => `<button type="button" class="detail-rating-filter ${index === 0 ? "is-active" : ""}" data-rating-filter="${filter.value}" aria-pressed="${index === 0}">${filter.label}<span>(${filter.count})</span></button>`).join("")}</div>
        <div class="detail-rating-list">${reviews
          .map((review) => {
            const media = Array.isArray(review.media)
              ? review.media.map(getReviewMedia).filter(Boolean)
              : [];
            return `<article class="detail-rating-item" data-rating="${Number(review.rating) || 0}" data-rating-image="${media.length > 0}"><div class="detail-rating-heading"><strong>${escapeHTML(review.customer_name || review.customerName || review.name || "Khách hàng")}</strong>${review.created_at ? `<time>${new Date(review.created_at).toLocaleDateString("vi-VN")}</time>` : ""}</div>${renderStars(Number(review.rating) || 0)}${review.comment ? `<p class="detail-rating-comment">${escapeHTML(review.comment)}</p>` : ""}${media.length ? `<div class="review-media">${media.map((item, mediaIndex) => `<div class="review-media-item">${item.type === "video" ? `<video src="${escapeHTML(item.url)}" controls preload="metadata"></video>` : `<a href="${escapeHTML(item.url)}" target="_blank" rel="noreferrer" aria-label="Xem ảnh đánh giá"><img src="${escapeHTML(item.url)}" alt="Ảnh đánh giá ${mediaIndex + 1}" loading="lazy"></a>`}</div>`).join("")}</div>` : ""}</article>`;
          })
          .join("")}</div>
        ${reviews.length ? "" : `<p class="detail-empty">${reviewResponse ? "Sản phẩm chưa có đánh giá của khách hàng." : "Không thể tải đánh giá sản phẩm."}</p>`}
      </section>
      <section class="detail-section"><h2>SẢN PHẨM LIÊN QUAN</h2>${related.length ? `<div class="product-grid">${related.map((item, index) => createProductCard(item, index, favoriteProducts)).join("")}</div>` : '<p class="detail-empty">Chưa có sản phẩm liên quan.</p>'}</section>`;

    const quantityInput = root.querySelector("#detail-quantity");
    // Giới hạn số lượng theo tồn kho rồi cập nhật thành tiền.
    const capNhatSoLuong = (value) => {
      quantityInput.value = String(
        Math.min(stock, Math.max(1, Number(value) || 1)),
      );
      root.querySelector("#detail-tong").textContent = formatPrice(
        Number(product.price) * Number(quantityInput.value),
      );
      root.querySelector('[data-quantity="minus"]').disabled =
        Number(quantityInput.value) <= 1 || stock <= 0;
      root.querySelector('[data-quantity="plus"]').disabled =
        Number(quantityInput.value) >= stock || stock <= 0;
    };
    quantityInput.addEventListener("input", () =>
      capNhatSoLuong(quantityInput.value),
    );
    root.addEventListener("click", (event) => {
      const reviewFilter = event.target.closest("[data-rating-filter]");
      if (reviewFilter) {
        const filter = reviewFilter.dataset.ratingFilter;
        root.querySelectorAll("[data-rating-filter]").forEach((button) => {
          const dangHoatDong = button === reviewFilter;
          button.classList.toggle("is-active", dangHoatDong);
          button.setAttribute("aria-pressed", String(dangHoatDong));
        });
        root.querySelectorAll("[data-rating]").forEach((item) => {
          item.hidden =
            filter === "media"
              ? item.dataset.ratingImage !== "true"
              : filter !== "all" && item.dataset.rating !== filter;
        });
      }
      const quantityButton = event.target.closest("[data-quantity]");
      if (quantityButton)
        capNhatSoLuong(
          Number(quantityInput.value) +
            (quantityButton.dataset.quantity === "plus" ? 1 : -1),
        );
      const thumbnail = event.target.closest("[data-image-index]");
      if (thumbnail) {
        const src = images[Number(thumbnail.dataset.imageIndex)];
        if (src)
          root.querySelector("#detail-image-hop").innerHTML =
            `<img src="${escapeHTML(src)}" alt="${escapeHTML(product.name)}" id="detail-image">`;
        root
          .querySelectorAll(".detail-image-retry-small")
          .forEach((item) =>
            item.classList.toggle("is-active", item === thumbnail),
          );
      }
      const addButton = event.target.closest(
        "[data-detail-add], [data-detail-buy]",
      );
      if (addButton) {
        const quantity = Number(quantityInput.value) || 1;
        const existingQuantity = readCart()
          .filter(
            (item) =>
              String(item._id ?? item.id) === String(product._id ?? product.id),
          )
          .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
        try {
          if (existingQuantity + quantity > stock)
            throw new Error("Số lượng mua vượt quá số lượng tồn kho.");
          addToCart(product, quantity);
          if (addButton.matches("[data-detail-buy]")) {
            window.location.href = "cart.html";
            return;
          }
          showToast("Đã thêm sản phẩm vào giỏ hàng.");
        } catch (error) {
          showToast(error.message);
        }
        return;
      }
      const favorite = event.target.closest("[data-favorite]");
      if (favorite) {
        const favoriteId = favorite.dataset.favorite;
        favoriteProducts.has(favoriteId)
          ? favoriteProducts.delete(favoriteId)
          : favoriteProducts.add(favoriteId);
        const daChon = favoriteProducts.has(favoriteId);
        favorite.classList.toggle("is-favorite", daChon);
        favorite.setAttribute(
          "aria-label",
          daChon ? "Bỏ yêu thích" : "Thêm vào yêu thích",
        );
        favorite.textContent = daChon ? "♥" : "♡";
        return;
      }
      const relatedAdd = event.target.closest("[data-add-cart]");
      if (relatedAdd) {
        const relatedProduct = related.find(
          (item) => String(item._id ?? item.id) === relatedAdd.dataset.addCart,
        );
        if (!relatedProduct) return;
        try {
          addToCart(relatedProduct);
          showToast(`Đã thêm "${relatedProduct.name}" vào giỏ hàng.`);
        } catch (error) {
          showToast(error.message);
        }
        return;
      }
      const card = event.target.closest("[data-product]");
      if (card)
        window.location.href = `product-detail.html?id=${encodeURIComponent(card.dataset.product)}`;
    });
    bindImageFallback(root);
  } catch (error) {
    const errorBox = document.createElement("div");
    errorBox.className = "detail-alert detail-error";
    errorBox.setAttribute("role", "alert");
    const notFound = error instanceof ProductNotFoundError;
    const title = notFound
      ? "Không tìm thấy sản phẩm"
      : "Không thể tải sản phẩm";
    errorBox.innerHTML = `<h2>${title}</h2><p>${escapeHTML(error.message || "Đã xảy ra lỗi khi hiển thị sản phẩm.")}</p><a class="detail-back-button" href="products.html">Quay lại danh sách sản phẩm</a>`;
    status.replaceWith(errorBox);
  }
}
