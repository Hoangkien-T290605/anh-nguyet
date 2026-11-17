// Trang chi tiết tải sản phẩm, đánh giá và thao tác giỏ hàng.
import { apiRequest, getApiAssetUrl, getProductImageUrl } from "../services/api.js";
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

function readAccountSession() {
  try {
    const session = JSON.parse(localStorage.getItem("anh-nguyet-auth") || "null");
    return session?.token && session?.user?.id ? session : null;
  } catch {
    return null;
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
  const rawUrl = value.url || value.src || value.path || value.location;
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return null;
  let url;
  try {
    const source = rawUrl.trim();
    const parsedUrl = source.startsWith("/uploads/")
      ? new URL(getApiAssetUrl(source))
      : new URL(source, window.location.href);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")
      return null;
    url = parsedUrl.href;
  } catch {
    return null;
  }
  const kind = `${value.type || ""} ${value.mimeType || ""} ${value.mime_type || ""}`;
  return {
    url,
    type: /video|\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(`${kind} ${url}`)
      ? "video"
      : "image",
  };
}

// Chuẩn hóa ảnh chính và gallery từ các dạng URL hiện Backend có thể trả về.
function getProductImages(product) {
  let additional = product.images;
  if (typeof additional === "string") {
    try {
      additional = JSON.parse(additional);
    } catch {
      additional = [];
    }
  }
  const galleryItems = Array.isArray(additional) ? additional : [];
  // Ảnh bìa từ products.image luôn đứng đầu; ảnh phụ giữ thứ tự trong gallery.
  const candidates = [product.image, ...galleryItems];
  const urls = candidates
    .map((item) => {
      const value = typeof item === "string"
        ? item
        : item?.image_url || item?.url || item?.src || item?.path || item?.location;
      if (typeof value !== "string" || !value.trim()) return "";
      const source = value.trim();
      if (source.startsWith("/uploads/")) return getApiAssetUrl(source);
      if (
        /^https?:\/\//i.test(source) ||
        source.startsWith("/") ||
        source.startsWith("./") ||
        source.startsWith("images/") ||
        source.startsWith("assets/")
      ) {
        return source;
      }
      return getProductImageUrl(source);
    })
    .filter(Boolean);
  return [...new Set(urls)];
}

// Thay ảnh lỗi bằng placeholder cùng kích thước, không để icon ảnh lỗi xuất hiện.
function bindDetailImageFallback(root) {
  root.querySelectorAll("[data-detail-image]").forEach((image) => {
    image.addEventListener("error", () => {
      const thumbnail = image.closest(".detail-image-retry-small");
      const fallback = document.createElement("div");
      fallback.className = thumbnail
        ? "detail-image-retry-small-placeholder-empty"
        : "detail-image-placeholder-empty";
      fallback.setAttribute("aria-label", "Không có ảnh sản phẩm");
      fallback.innerHTML = thumbnail
        ? "<span>✿</span>"
        : "<span>✿</span><p>ÁNH NGUYỆT</p>";
      image.replaceWith(fallback);
    }, { once: true });
  });
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
  window.addEventListener("anh-nguyet-cart-dong-bo-loi", (event) => {
    showToast(`Giỏ hàng đã lưu trên thiết bị nhưng chưa đồng bộ tài khoản: ${event.detail?.message || "Vui lòng thử lại."}`);
  });

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
    const session = readAccountSession();
    const loadProductReviews = async () => {
      const path = `/products/${encodeURIComponent(id)}/reviews`;
      if (!session) return apiRequest(path, { signal: AbortSignal.timeout(12000) }).catch(() => null);
      try {
        return await apiRequest(path, {
          signal: AbortSignal.timeout(12000),
          headers: { Authorization: `Bearer ${session.token}` },
        });
      } catch (error) {
        if (error.status !== 401) return null;
        return apiRequest(path, { signal: AbortSignal.timeout(12000) }).catch(() => null);
      }
    };
    const loadOwnReview = async () => {
      if (!session) return null;
      try {
        return await apiRequest(
          `/products/${encodeURIComponent(id)}/reviews/mine`,
          { headers: { Authorization: `Bearer ${session.token}` } },
        );
      } catch {
        return null;
      }
    };
    const [productResponse, reviewResponse, ownReviewResponse] = await Promise.all([
      apiRequest("/products", { signal: AbortSignal.timeout(12000) }),
      loadProductReviews(),
      loadOwnReview(),
    ]);
    if (!Array.isArray(productResponse.data)) {
      throw new Error("Dữ liệu sản phẩm từ máy chủ không hợp lệ.");
    }
    const products = productResponse.data.filter(
      (item) => item.active !== false && item.active !== 0,
    );
    const product = products.find((item) => String(item.id ?? item._id) === id);
    if (!product) throw new ProductNotFoundError();

    const stockValue = Number(product.stock);
    const hasStockValue = product.stock !== null && product.stock !== undefined && product.stock !== "";
    const hasValidStock = hasStockValue && Number.isSafeInteger(stockValue) && stockValue >= 0;
    const stock = hasValidStock ? stockValue : 0;
    const price = Number(product.price);
    if (product.price === null || product.price === undefined || product.price === "" || !Number.isFinite(price) || price < 0) {
      throw new Error("Dữ liệu giá sản phẩm không hợp lệ.");
    }
    let images = getProductImages(product);
    try {
      const gallery = await apiRequest(`/products/${encodeURIComponent(id)}/images`, {
        signal: AbortSignal.timeout(12000),
      });
      if (Array.isArray(gallery.data) && gallery.data.length) {
        images = getProductImages({ image: product.image, images: gallery.data });
      }
    } catch {
      // API cũ hoặc migration chưa chạy: ảnh bìa từ products.image vẫn hoạt động.
    }
    let selectedImageIndex = 0;
    const reviews = Array.isArray(reviewResponse?.data)
      ? reviewResponse.data
      : [];
    let reviewEligibility = null;
    let reviewEligibilityError = "";
    if (session) {
      try {
        const eligibility = await apiRequest(
          `/products/${encodeURIComponent(id)}/reviews/eligibility`,
          { headers: { Authorization: `Bearer ${session.token}` } },
        );
        reviewEligibility = eligibility.data;
      } catch (error) {
        reviewEligibilityError = error.message || "Không thể kiểm tra điều kiện đánh giá.";
      }
    }
    const summary = reviewResponse?.summary || {};
    const rating = Number(summary.averageRating) || 0;
    const reviewCount = Number(summary.totalReviews) || 0;
    const productDetails = product.product_details && typeof product.product_details === "object"
      ? product.product_details
      : {};
    const detailSpecifications = productDetails.specifications && typeof productDetails.specifications === "object"
      ? Object.entries(productDetails.specifications).map(([name, value]) => `${name}: ${value}`).join(" · ")
      : "";
    const fields = [
      ["Thành phần", productDetails.ingredients],
      ["Nơi sản xuất", productDetails.manufacturer],
      ["Thương hiệu", productDetails.brand],
      ["Khối lượng", productDetails.weight],
      ["Dung tích", productDetails.volume],
      ["Thông số bổ sung", detailSpecifications],
      ["Xuất xứ", productDetails.origin],
      ["Hạn sử dụng", productDetails.expiry],
      ["Bảo quản", productDetails.storage],
      ["Hướng dẫn sử dụng", productDetails.usage],
      ["Quy cách đóng gói", productDetails.packaging],
      ["Thông tin bổ sung", productDetails.additional_info],
    ].filter(([, value]) => typeof value === "string" && value.trim());
    const detailedDescription = typeof product.description === "string"
      ? product.description.trim()
      : "";
    const related = products
      .filter(
        (item) =>
          String(item.id ?? item._id) !== String(product.id ?? product._id) &&
          item.category === product.category,
      )
      .slice(0, 4);

    const ownReview = ownReviewResponse?.data || reviews.find((review) => review.is_mine);
    const ownReviewHiddenNotice = ownReview && ownReview.is_visible === false
      ? `<p class="detail-review-access">Đánh giá này đang bị Admin ẩn. Chỉ bạn có thể xem và quản lý nội dung tại đây.</p>`
      : "";
    const reviewFormHtml = !session
      ? `<p class="detail-review-access">Bạn cần <a href="login.html?returnTo=${encodeURIComponent(`product-detail.html?id=${id}`)}">đăng nhập</a> để gửi đánh giá.</p>`
      : ownReview
        ? `<form class="detail-review-form" data-review-form data-review-id="${escapeHTML(ownReview.id)}"><h3>Chỉnh sửa đánh giá của bạn</h3>${ownReviewHiddenNotice}<div class="detail-own-review-content"><strong>Đánh giá hiện tại: ${Number(ownReview.rating)} / 5 sao</strong><p>${escapeHTML(ownReview.comment || "(Không có nhận xét)")}</p></div><label>Điểm đánh giá<select name="rating" required>${[5, 4, 3, 2, 1].map((star) => `<option value="${star}" ${Number(ownReview.rating) === star ? "selected" : ""}>${star} sao</option>`).join("")}</select></label><label>Nhận xét<textarea name="comment" rows="4" maxlength="3000" placeholder="Chia sẻ trải nghiệm của bạn">${escapeHTML(ownReview.comment || "")}</textarea></label><label>Thêm ảnh (tối đa 5 ảnh tổng cộng, mỗi ảnh 5 MB)<input type="file" name="images" accept="image/jpeg,image/png,image/webp,image/gif" multiple data-review-images data-review-existing="${Array.isArray(ownReview.media) ? ownReview.media.length : 0}"></label><div class="review-image-preview" data-review-preview></div><p data-review-form-status role="status" aria-live="polite" hidden></p><div class="review-form-actions"><button class="account-primary-button" type="submit">Lưu chỉnh sửa</button><button class="account-delete-button" type="button" data-review-delete="${escapeHTML(ownReview.id)}">Xóa đánh giá</button></div></form>`
        : reviewEligibility?.can_review
          ? `<form class="detail-review-form" data-review-form><h3>Viết đánh giá của bạn</h3><label>Điểm đánh giá<select name="rating" required><option value="">Chọn số sao</option><option value="5">5 sao</option><option value="4">4 sao</option><option value="3">3 sao</option><option value="2">2 sao</option><option value="1">1 sao</option></select></label><label>Nhận xét<textarea name="comment" rows="4" maxlength="3000" placeholder="Chia sẻ trải nghiệm của bạn"></textarea></label><label>Ảnh đánh giá (tối đa 5 ảnh, mỗi ảnh 5 MB)<input type="file" name="images" accept="image/jpeg,image/png,image/webp,image/gif" multiple data-review-images></label><div class="review-image-preview" data-review-preview></div><p data-review-form-status role="status" aria-live="polite" hidden></p><button class="account-primary-button" type="submit">Gửi đánh giá</button></form>`
          : `<p class="detail-review-access">${reviewEligibility?.has_reviewed ? "Bạn đã gửi đánh giá sản phẩm này." : reviewEligibility?.has_completed_purchase ? "Bạn đã đủ điều kiện đánh giá sản phẩm này." : reviewEligibilityError ? `Chưa thể kiểm tra quyền đánh giá: ${escapeHTML(reviewEligibilityError)}` : "Chỉ khách đã mua và có đơn hoàn thành mới được đánh giá sản phẩm này."}</p>`;

    document.title = `${product.name} | Ánh Nguyệt`;
    status.hidden = true;
    root.hidden = false;
    root.innerHTML = `
      <section class="product-detail-content">
        <div class="detail-retry-vien-image">
          <div class="detail-image-hop" id="detail-image-hop">${images.length ? `<img src="${escapeHTML(images[0])}" alt="${escapeHTML(product.name)}" id="detail-image" data-detail-image>` : '<div class="detail-image-placeholder-empty" aria-label="Không có ảnh sản phẩm"><span>✿</span><p>ÁNH NGUYỆT</p></div>'}</div>
          ${images.length ? `<div class="detail-image-retry-small-list" aria-label="Ảnh sản phẩm">${images.map((image, index) => `<button type="button" class="detail-image-retry-small ${index === 0 ? "is-active" : ""}" data-image-index="${index}" aria-label="Xem hình ảnh ${index + 1}" aria-pressed="${index === 0}"><img src="${escapeHTML(image)}" alt="${escapeHTML(product.name)} ${index + 1}" data-detail-image></button>`).join("")}</div>` : ""}
        </div>
        <div class="detail-info">
          <p class="detail-eyebrow">ÁNH NGUYỆT COLLECTION</p><span class="detail-category">${escapeHTML(product.category || "Chưa phân loại")}</span><h1>${escapeHTML(product.name)}</h1>${productDetails.short_description ? `<p class="detail-short-description">${escapeHTML(productDetails.short_description)}</p>` : ""}
          <div class="detail-rating-summary">${reviewCount ? `<strong>${rating.toFixed(1)} / 5</strong>${renderStars(rating)}<span>${reviewCount} đánh giá</span>` : '<span class="product-rating-empty">Chưa có đánh giá</span>'}</div>
          <p class="detail-code">Mã sản phẩm: #${escapeHTML(product.id ?? product._id)}</p><strong class="detail-price">${formatPrice(product.price)}</strong>
          <div class="detail-stock"><span>Tình trạng:</span>${!hasValidStock ? '<strong class="out-stock">Chưa xác định được tồn kho</strong>' : stock > 0 ? `<strong class="in-stock">Còn hàng (${stock} sản phẩm)</strong>` : '<strong class="out-stock">Tạm hết hàng</strong>'}</div>
          <div class="detail-quantity"><span>Số lượng:</span><div class="quantity-control-control"><button type="button" data-quantity="minus" aria-label="Giảm số lượng" disabled>−</button><input id="detail-quantity" type="number" min="1" max="${Math.max(1, stock)}" value="1" aria-label="Số lượng sản phẩm" ${!hasValidStock || stock <= 0 ? "disabled" : ""}><button type="button" data-quantity="plus" aria-label="Tăng số lượng" ${!hasValidStock || stock <= 1 ? "disabled" : ""}>+</button></div></div>
          <div class="detail-tong"><span>Tạm tính:</span><strong id="detail-tong">${formatPrice(price)}</strong></div>
          <div class="detail-purchase-actions"><button type="button" class="detail-add-button" data-detail-add ${!hasValidStock || stock <= 0 ? "disabled" : ""}>🛒 Thêm vào giỏ hàng</button><button type="button" class="detail-buy-button" data-detail-buy ${!hasValidStock || stock <= 0 ? "disabled" : ""}>Mua ngay</button></div>
        </div>
      </section>
      ${fields.length ? `<section class="detail-section"><h2>THÔNG TIN CHI TIẾT</h2><div class="detail-notice-number-list">${fields.map(([label, value]) => `<div class="detail-notice-number-row"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value.trim())}</strong></div>`).join("")}</div></section>` : ""}
      ${detailedDescription ? `<section class="detail-section"><h2>MÔ TẢ CHI TIẾT SẢN PHẨM</h2><div class="detail-full-full-description"><p>${escapeHTML(detailedDescription)}</p></div></section>` : ""}
      <section class="detail-section" id="rating"><h2>ĐÁNH GIÁ KHÁCH HÀNG</h2>${reviewCount ? `<div class="detail-rating-summary"><div class="detail-rating-score"><strong>${rating.toFixed(1)}</strong><span>/ 5</span></div><div class="detail-rating-score-info">${renderStars(rating, "large")}<p>${reviewCount} đánh giá</p></div></div>` : '<p class="product-rating-empty">Chưa có đánh giá</p>'}
        <div class="detail-rating-all-filter" aria-label="Lọc đánh giá">${[{ value: "all", label: "Tất cả", count: reviewCount }, ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} sao`, count: Number(summary.ratingCounts?.[n]) || 0 })), { value: "media", label: "Có ảnh/video", count: Number(summary.mediaCount) || 0 }].map((filter, index) => `<button type="button" class="detail-rating-filter ${index === 0 ? "is-active" : ""}" data-rating-filter="${filter.value}" aria-pressed="${index === 0}">${filter.label}<span>(${filter.count})</span></button>`).join("")}</div>
        ${reviewFormHtml}
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
      <section class="detail-section"><h2>SẢN PHẨM LIÊN QUAN</h2>${related.length ? `<div class="product-grid">${related.map((item, index) => createProductCard(item, index)).join("")}</div>` : '<p class="detail-empty">Chưa có sản phẩm liên quan.</p>'}</section>`;

    const quantityInput = root.querySelector("#detail-quantity");
    // Giới hạn số lượng theo tồn kho rồi cập nhật thành tiền.
    const capNhatSoLuong = (value) => {
      const quantity = hasValidStock && stock > 0
        ? Math.min(stock, Math.max(1, Math.floor(Number(value) || 1)))
        : 1;
      quantityInput.value = String(quantity);
      root.querySelector("#detail-tong").textContent = formatPrice(
        price * quantity,
      );
      root.querySelector('[data-quantity="minus"]').disabled =
        Number(quantityInput.value) <= 1 || stock <= 0;
      root.querySelector('[data-quantity="plus"]').disabled =
        Number(quantityInput.value) >= stock || stock <= 0;
    };
    quantityInput.addEventListener("input", () =>
      capNhatSoLuong(quantityInput.value),
    );
    root.addEventListener("change", (event) => {
      if (!event.target.matches("[data-review-images]")) return;
      const files = Array.from(event.target.files || []);
      const status = event.target.form.querySelector("[data-review-form-status]");
      const invalid = files.find((file) => !/^image\/(jpeg|png|webp|gif)$/.test(file.type) || file.size > 5 * 1024 * 1024);
      const existingCount = Number(event.target.dataset.reviewExisting) || 0;
      if (files.length + existingCount > 5 || invalid) {
        event.target.value = "";
        status.hidden = false;
        status.textContent = files.length + existingCount > 5 ? "Mỗi đánh giá tối đa 5 ảnh." : "Ảnh phải là JPG, PNG, WEBP hoặc GIF và không quá 5 MB.";
        event.target.form.querySelector("[data-review-preview]").replaceChildren();
        return;
      }
      status.hidden = true;
      const preview = event.target.form.querySelector("[data-review-preview]");
      preview.replaceChildren(...files.map((file) => {
        const image = document.createElement("img");
        image.alt = `Ảnh xem trước ${file.name}`;
        image.src = URL.createObjectURL(file);
        image.onload = () => URL.revokeObjectURL(image.src);
        return image;
      }));
    });
    root.addEventListener("click", async (event) => {
      const thumbnail = event.target.closest("[data-image-index]");
      if (thumbnail) {
        showProductImage(Number(thumbnail.dataset.imageIndex));
        openProductZoom(selectedImageIndex);
        return;
      }
      if (event.target.closest("#detail-image")) {
        openProductZoom(selectedImageIndex);
        return;
      }
      const deleteReview = event.target.closest("[data-review-delete]");
      if (deleteReview) {
        if (!session || !window.confirm("Bạn có chắc muốn xóa đánh giá này?")) return;
        deleteReview.disabled = true;
        try {
          await apiRequest(`/products/${encodeURIComponent(id)}/reviews/${encodeURIComponent(deleteReview.dataset.reviewDelete)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${session.token}` },
          });
          window.location.reload();
        } catch (error) {
          showToast(error.message || "Không thể xóa đánh giá.");
          deleteReview.disabled = false;
        }
        return;
      }
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
          .reduce((sum, item) => {
            const itemQuantity = Number(item.quantity);
            return sum + (Number.isSafeInteger(itemQuantity) && itemQuantity > 0 ? itemQuantity : 0);
          }, 0);
        try {
          if (!hasValidStock || stock < 1)
            throw new Error("Tồn kho sản phẩm chưa có hoặc không hợp lệ.");
          if (!Number.isSafeInteger(quantity) || quantity < 1)
            throw new Error("Số lượng sản phẩm không hợp lệ.");
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
    root.addEventListener("submit", async (event) => {
      if (!event.target.matches("[data-review-form]")) return;
      event.preventDefault();
      const form = event.target;
      const submit = form.querySelector('button[type="submit"]');
      const status = form.querySelector("[data-review-form-status]");
      if (submit.disabled) return;
      const values = new FormData(form);
      const files = values.getAll("images").filter((file) => file instanceof File && file.size > 0);
      const existingCount = Number(form.querySelector("[data-review-images]")?.dataset.reviewExisting) || 0;
      if (files.length + existingCount > 5 || files.some((file) => file.size > 5 * 1024 * 1024 || !/^image\/(jpeg|png|webp|gif)$/.test(file.type))) {
        status.hidden = false;
        status.textContent = "Chọn tối đa 5 ảnh JPG, PNG, WEBP hoặc GIF, mỗi ảnh không quá 5 MB.";
        return;
      }
      submit.disabled = true;
      status.hidden = false;
      status.textContent = form.dataset.reviewId ? "Đang lưu chỉnh sửa..." : "Đang gửi đánh giá...";
      try {
        const reviewId = form.dataset.reviewId;
        await apiRequest(`/products/${encodeURIComponent(id)}/reviews${reviewId ? `/${encodeURIComponent(reviewId)}` : ""}`, {
          method: reviewId ? "PUT" : "POST",
          headers: { Authorization: `Bearer ${session.token}` },
          body: values,
        });
        status.textContent = "Đã gửi đánh giá. Đang cập nhật danh sách...";
        window.location.reload();
      } catch (error) {
        status.textContent = error.message || "Không thể gửi đánh giá.";
        submit.disabled = false;
      }
    });
    const zoomDialog = document.createElement("dialog");
    zoomDialog.className = "product-image-zoom-dialog";
    zoomDialog.setAttribute("aria-label", "Ảnh sản phẩm phóng to");
    zoomDialog.innerHTML = `
      <button type="button" class="product-image-zoom-close" data-close-product-zoom aria-label="Đóng ảnh phóng to">×</button>
      <button type="button" class="product-image-zoom-nav product-image-zoom-previous" data-zoom-previous aria-label="Ảnh trước" ${images.length < 2 ? "hidden" : ""}>‹</button>
      <figure class="product-image-zoom-figure"><img data-zoom-image alt="Ảnh sản phẩm phóng to"><figcaption data-zoom-counter></figcaption></figure>
      <button type="button" class="product-image-zoom-nav product-image-zoom-next" data-zoom-next aria-label="Ảnh tiếp theo" ${images.length < 2 ? "hidden" : ""}>›</button>`;
    document.body.append(zoomDialog);
    const showProductImage = (requestedIndex) => {
      if (!images.length) return;
      const index = ((Math.trunc(requestedIndex) % images.length) + images.length) % images.length;
      selectedImageIndex = index;
      const mainImage = root.querySelector("#detail-image");
      if (mainImage) {
        mainImage.src = images[index];
        mainImage.alt = product.name;
      }
      root.querySelectorAll("[data-image-index]").forEach((button) => {
        const selected = Number(button.dataset.imageIndex) === index;
        button.classList.toggle("is-active", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
      if (zoomDialog.open) {
        zoomDialog.querySelector("[data-zoom-image]").src = images[index];
        zoomDialog.querySelector("[data-zoom-image]").alt = `${product.name} — ảnh ${index + 1}`;
        zoomDialog.querySelector("[data-zoom-counter]").textContent = `${index + 1} / ${images.length}`;
      }
    };
    const openProductZoom = (index) => {
      if (!images.length) return;
      showProductImage(index);
      const zoomImage = zoomDialog.querySelector("[data-zoom-image]");
      zoomImage.src = images[selectedImageIndex];
      zoomImage.alt = `${product.name} — ảnh ${selectedImageIndex + 1}`;
      zoomDialog.querySelector("[data-zoom-counter]").textContent = `${selectedImageIndex + 1} / ${images.length}`;
      if (!zoomDialog.open) zoomDialog.showModal();
    };
    root.addEventListener("mouseover", (event) => {
      const thumbnail = event.target.closest("[data-image-index]");
      if (!thumbnail || !root.contains(thumbnail)) return;
      if (event.relatedTarget && thumbnail.contains(event.relatedTarget)) return;
      showProductImage(Number(thumbnail.dataset.imageIndex));
    });
    root.addEventListener("focusin", (event) => {
      const thumbnail = event.target.closest("[data-image-index]");
      if (thumbnail) showProductImage(Number(thumbnail.dataset.imageIndex));
    });
    zoomDialog.addEventListener("click", (event) => {
      if (event.target === zoomDialog || event.target.closest("[data-close-product-zoom]")) {
        zoomDialog.close();
        return;
      }
      if (event.target.closest("[data-zoom-previous]")) showProductImage(selectedImageIndex - 1);
      if (event.target.closest("[data-zoom-next]")) showProductImage(selectedImageIndex + 1);
    });
    document.addEventListener("keydown", (event) => {
      if (!zoomDialog.open || images.length < 2) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showProductImage(selectedImageIndex - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        showProductImage(selectedImageIndex + 1);
      }
    });
    bindImageFallback(root);
    bindDetailImageFallback(root);
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
