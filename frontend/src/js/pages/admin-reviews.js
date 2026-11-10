// Trang kiểm duyệt dùng đúng response và các route Admin hiện có.
import { API_BASE_URL, apiRequest } from "../services/api.js";
import { escapeHTML } from "../components/product-card.js";

const AUTH_KEY = "anh-nguyet-auth";
const PAGE_SIZE = 10;

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
  } catch {
    return null;
  }
}

function normalizeText(value) {
  return String(value ?? "")
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function isVisible(review) {
  return review.is_visible !== false && review.is_visible !== 0;
}

function getMediaUrl(item) {
  const value = typeof item === "string" ? item : item?.url;
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const base = `${new URL(API_BASE_URL).origin}/`;
    const url = /^https?:\/\//i.test(value) ? new URL(value) : new URL(value, base);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function getReviewMedia(review) {
  if (!Array.isArray(review.media)) return [];
  return review.media.map((item) => ({ item, url: getMediaUrl(item) })).filter((media) => media.url);
}

export async function mountAdminReviews() {
  const root = document.getElementById("admin-reviews-root");
  const search = document.querySelector("[data-review-search]");
  const ratingFilter = document.querySelector("[data-review-rating]");
  const visibilityFilter = document.querySelector("[data-review-visibility-filter]");
  const feedback = document.querySelector("[data-review-feedback]");
  const pagination = document.querySelector("[data-review-pagination]");
  const dialog = document.querySelector("[data-review-dialog]");
  const detail = document.querySelector("[data-review-detail]");
  const session = readSession();

  if (!session?.token) {
    window.location.replace("admin-login.html?returnTo=admin-reviews.html");
    return;
  }

  let reviews = [];
  let loadedCount = 0;
  let currentPage = 1;
  let loading = false;
  let loadError = "";
  let notice = "";
  let noticeError = false;
  const pending = new Set();

  function showFeedback(text = notice, isError = noticeError) {
    const message = text || loadError || `Đang hiển thị ${filteredReviews().length} / ${loadedCount} đánh giá đã tải.`;
    feedback.textContent = message;
    feedback.hidden = false;
    const hasError = isError || (!text && Boolean(loadError));
    feedback.classList.toggle("is-error", hasError);
    feedback.setAttribute("role", hasError ? "alert" : "status");
  }

  function filteredReviews() {
    const query = normalizeText(search.value);
    const rating = ratingFilter.value;
    const visibility = visibilityFilter.value;
    return reviews.filter((review) => {
      const matchesQuery = !query || normalizeText([
        review.customer_name,
        review.product_name,
        review.product_id,
        review.comment,
      ].join(" ")).includes(query);
      const matchesRating = rating === "all" || Number(review.rating) === Number(rating);
      const visible = isVisible(review);
      const matchesVisibility = visibility === "all" || (visibility === "visible" ? visible : !visible);
      return matchesQuery && matchesRating && matchesVisibility;
    });
  }

  function renderPagination(total) {
    const pages = Math.ceil(total / PAGE_SIZE);
    pagination.hidden = loading || pages <= 1 || Boolean(loadError);
    if (pagination.hidden) {
      pagination.innerHTML = "";
      return;
    }
    pagination.innerHTML = `<button type="button" data-review-page="-1" ${currentPage <= 1 ? "disabled" : ""}>Trang trước</button><span>Trang ${currentPage} / ${pages} · ${total} đánh giá</span><button type="button" data-review-page="1" ${currentPage >= pages ? "disabled" : ""}>Trang sau</button>`;
  }

  function bindImageFallbacks(scope = root) {
    scope.querySelectorAll("[data-review-image]").forEach((image) => {
      image.addEventListener("error", () => {
        image.hidden = true;
        const fallback = image.parentElement.querySelector("[data-review-image-fallback]");
        if (fallback) fallback.hidden = false;
      }, { once: true });
    });
  }

  function renderImageStrip(review, detailed = false) {
    const media = getReviewMedia(review);
    if (!media.length) return '<p class="admin-review-no-images">Không có ảnh đính kèm.</p>';
    return `<div class="admin-review-images ${detailed ? "is-detailed" : ""}">${media.map(({ item, url }, index) => `<a class="admin-review-image" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" aria-label="Mở ảnh đánh giá ${index + 1}"><span data-review-image-fallback hidden>Không tải được ảnh</span><img src="${escapeHTML(url)}" alt="Ảnh đính kèm đánh giá ${index + 1}" loading="lazy" data-review-image />${item?.type ? `<small>${escapeHTML(item.type)}</small>` : ""}</a>`).join("")}</div>`;
  }

  function renderPaginationAndFeedback() {
    renderPagination(filteredReviews().length);
    showFeedback();
  }

  function renderReviews() {
    if (loading) {
      root.innerHTML = '<div class="checkout-loading"><span class="account-loading-spinner"></span><p>Đang tải đánh giá...</p></div>';
      renderPaginationAndFeedback();
      return;
    }
    if (loadError) {
      root.innerHTML = `<div class="account-order-unavailable" role="alert"><h2>Không thể tải đánh giá</h2><p>${escapeHTML(loadError)}</p><button class="admin-review-retry" type="button" data-review-retry>Thử lại</button></div>`;
      renderPaginationAndFeedback();
      return;
    }
    if (!reviews.length) {
      root.innerHTML = '<div class="account-order-detail-empty"><h2>Chưa có đánh giá</h2><p>API hiện chưa trả về đánh giá nào.</p></div>';
      renderPaginationAndFeedback();
      return;
    }

    const filtered = filteredReviews();
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, pages);
    const visibleReviews = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    if (!visibleReviews.length) {
      root.innerHTML = '<div class="account-order-detail-empty"><h2>Không tìm thấy đánh giá phù hợp</h2><p>Thử đổi từ khóa hoặc bộ lọc.</p></div>';
      renderPaginationAndFeedback();
      return;
    }

    root.innerHTML = `<div class="admin-review-list">${visibleReviews.map((review) => {
      const id = String(review.id);
      const visible = isVisible(review);
      return `<article class="admin-review-card">
        <div class="admin-review-heading"><div><strong>${escapeHTML(review.product_name || `Sản phẩm #${review.product_id}`)}</strong><span>Khách: ${escapeHTML(review.customer_name || "Khách hàng")}${review.customer_id == null ? "" : ` · Tài khoản #${escapeHTML(review.customer_id)}`}</span></div><span class="admin-review-status ${visible ? "is-visible" : "is-hidden"}">${visible ? "Đang hiển thị" : "Đã ẩn"}</span></div>
        <div class="admin-review-rating" aria-label="${Number(review.rating) || 0} trên 5 sao">${"★".repeat(Math.max(0, Math.min(5, Number(review.rating) || 0)))}<span>${Number(review.rating) || 0}/5</span></div>
        <p class="admin-review-comment">${escapeHTML(review.comment || "(Không có nhận xét)")}</p>
        ${renderImageStrip(review)}
        <p class="admin-review-created">${escapeHTML(formatDate(review.created_at))}</p>
        <div class="admin-review-actions"><button class="admin-customer-view" type="button" data-review-detail="${escapeHTML(id)}">Xem chi tiết</button><button class="admin-review-action" type="button" data-review-visibility="${visible ? "hide" : "show"}" data-review-id="${escapeHTML(id)}" ${pending.has(id) ? "disabled" : ""}>${pending.has(id) ? "Đang xử lý..." : visible ? "Ẩn đánh giá" : "Hiện đánh giá"}</button><button class="admin-review-action is-danger" type="button" data-review-delete="${escapeHTML(id)}" ${pending.has(id) ? "disabled" : ""}>Xóa đánh giá</button></div>
      </article>`;
    }).join("")}</div>`;
    bindImageFallbacks();
    renderPaginationAndFeedback();
  }

  async function loadReviews() {
    loading = true;
    loadError = "";
    notice = "";
    noticeError = false;
    renderReviews();
    try {
      const result = await apiRequest("/admin/reviews", {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!Array.isArray(result.data)) throw new Error("Máy chủ trả về danh sách đánh giá không hợp lệ.");
      reviews = result.data;
      loadedCount = Number.isFinite(Number(result.count)) ? Number(result.count) : reviews.length;
      currentPage = 1;
    } catch (error) {
      if (error.status === 401) {
        window.location.replace("admin-login.html?session=expired&returnTo=admin-reviews.html");
        return;
      }
      loadError = error.message || "Không thể tải đánh giá.";
      reviews = [];
      loadedCount = 0;
    } finally {
      loading = false;
      renderReviews();
    }
  }

  function renderDetail(review) {
    const visible = isVisible(review);
    detail.innerHTML = `<div class="admin-review-detail-meta">
      <div><span>Sản phẩm</span><strong>${escapeHTML(review.product_name || `Sản phẩm #${review.product_id}`)}</strong><small>Mã sản phẩm #${escapeHTML(review.product_id)}</small></div>
      <div><span>Khách hàng</span><strong>${escapeHTML(review.customer_name || "Khách hàng")}</strong><small>${review.customer_id == null ? "Không gắn tài khoản" : `Mã tài khoản #${escapeHTML(review.customer_id)}`}</small></div>
      <div><span>Đánh giá</span><strong class="admin-review-rating">${"★".repeat(Math.max(0, Math.min(5, Number(review.rating) || 0)))} <span>${Number(review.rating) || 0}/5 sao</span></strong></div>
      <div><span>Trạng thái</span><strong>${visible ? "Đang hiển thị" : "Đã ẩn"}</strong></div>
      <div><span>Thời gian gửi</span><strong>${escapeHTML(formatDate(review.created_at))}</strong></div>
    </div><section class="admin-review-detail-comment"><h3>Nội dung</h3><p>${escapeHTML(review.comment || "(Không có nhận xét)")}</p></section><section class="admin-review-detail-media"><h3>Ảnh đính kèm</h3>${renderImageStrip(review, true)}</section>`;
    bindImageFallbacks(detail);
  }

  async function actOnReview(id, action) {
    if (pending.has(id)) return;
    const review = reviews.find((item) => String(item.id) === id);
    if (!review) return;
    const nextVisible = action === "show";
    const prompt = action === "delete"
      ? `Xóa vĩnh viễn đánh giá #${id}? Ảnh đính kèm liên quan cũng có thể bị xóa.`
      : `${nextVisible ? "Hiển thị lại" : "Ẩn"} đánh giá #${id}?`;
    if (!window.confirm(prompt)) return;

    pending.add(id);
    notice = "";
    renderReviews();
    try {
      if (action === "delete") {
        await apiRequest(`/admin/reviews/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session.token}` },
        });
        reviews = reviews.filter((item) => String(item.id) !== id);
        loadedCount = Math.max(0, loadedCount - 1);
        if (dialog.open && detail.dataset.reviewId === id) dialog.close();
        notice = `Đã xóa đánh giá #${id}.`;
      } else {
        const result = await apiRequest(`/admin/reviews/${encodeURIComponent(id)}/visibility`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${session.token}` },
          body: JSON.stringify({ is_visible: nextVisible }),
        });
        if (!result.success) throw new Error("Máy chủ chưa xác nhận thay đổi trạng thái đánh giá.");
        reviews = reviews.map((item) => String(item.id) === id ? { ...item, is_visible: nextVisible } : item);
        if (dialog.open && detail.dataset.reviewId === id) {
          renderDetail(reviews.find((item) => String(item.id) === id));
        }
        notice = result.message || (nextVisible ? "Đã hiển thị đánh giá." : "Đã ẩn đánh giá.");
      }
      noticeError = false;
    } catch (error) {
      if (error.status === 401) {
        window.location.replace("admin-login.html?session=expired&returnTo=admin-reviews.html");
        return;
      }
      notice = error.message || "Không thể xử lý đánh giá.";
      noticeError = true;
    } finally {
      pending.delete(id);
      renderReviews();
    }
  }

  search.addEventListener("input", () => { currentPage = 1; notice = ""; renderReviews(); });
  ratingFilter.addEventListener("change", () => { currentPage = 1; notice = ""; renderReviews(); });
  visibilityFilter.addEventListener("change", () => { currentPage = 1; notice = ""; renderReviews(); });
  pagination.addEventListener("click", (event) => {
    const button = event.target.closest("[data-review-page]");
    if (!button || button.disabled) return;
    currentPage += Number(button.dataset.reviewPage);
    notice = "";
    renderReviews();
  });
  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-review-retry]")) {
      void loadReviews();
      return;
    }
    const visibilityButton = event.target.closest("[data-review-visibility]");
    if (visibilityButton) {
      void actOnReview(visibilityButton.dataset.reviewId, visibilityButton.dataset.reviewVisibility);
      return;
    }
    const deleteButton = event.target.closest("[data-review-delete]");
    if (deleteButton) {
      void actOnReview(deleteButton.dataset.reviewDelete, "delete");
      return;
    }
    const detailButton = event.target.closest("[data-review-detail]");
    if (detailButton) {
      const review = reviews.find((item) => String(item.id) === detailButton.dataset.reviewDetail);
      if (review) {
        detail.dataset.reviewId = String(review.id);
        renderDetail(review);
        dialog.showModal();
      }
    }
  });
  document.querySelectorAll("[data-review-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });

  await loadReviews();
}
