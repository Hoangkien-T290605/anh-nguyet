// Trang tra cứu đơn khách bằng mã đơn hàng và số điện thoại người nhận.
import { API_BASE_URL, getProductImageUrl } from "../services/api.js";
import { escapeHTML, formatPrice } from "../components/product-card.js";

const STATUS_LABELS = {
  pending_confirmation: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  preparing: "Đang chuẩn bị",
  shipping: "Đang giao",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
};

// Định dạng ngày đặt hàng cho phần kết quả tra cứu.
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

// Khởi tạo biểu mẫu tra cứu và hiển thị thông tin đơn hàng phù hợp.
export function mountOrderLookup() {
  const root = document.getElementById("order-lookup-goc");
  const queryId =
    new URLSearchParams(window.location.search).get("orderId") || "";
  let order = null;
  let error = "";
  let submitting = false;
  let orderId = queryId;
  let phone = "";

  // Hiển thị biểu mẫu hoặc kết quả tra cứu theo trạng thái hiện tại.
  // Vẽ biểu mẫu hoặc thông tin đơn hàng theo trạng thái tra cứu.
  // Dựng kết quả hoặc thông báo lỗi theo lần tra cứu hiện tại.
  function renderLookupResult() {
    const result = order
      ? `<section class="order-lookup-result">
          <div class="account-order-card-heading"><div><span class="account-order-label">MÃ ĐƠN HÀNG</span><strong>#${escapeHTML(order.id)}</strong></div><span class="account-order-status account-order-status-${Object.hasOwn(STATUS_LABELS, order.status) ? order.status : "unknown"}">${escapeHTML(STATUS_LABELS[order.status] || "Đang cập nhật")}</span></div>
          <div class="order-lookup-sub"><span>Ngày đặt</span><strong>${escapeHTML(formatDate(order.created_at))}</strong></div>
          <h2>Sản phẩm</h2>
          ${
            (Array.isArray(order.items) ? order.items : [])
              .map((item) => {
                const image = getProductImageUrl(item.product_image);
                return `<div class="account-order-product"><div class="account-order-product-image">${image ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(item.product_name || "Sản phẩm")}" />` : "❋"}</div><div class="account-order-product-content"><strong>${escapeHTML(item.product_name || "Sản phẩm")}</strong><span>${Number(item.quantity) || 0} × ${formatPrice(item.unit_price)}</span></div><strong class="account-order-product-tong">${formatPrice(item.line_total)}</strong></div>`;
              })
              .join("") ||
            '<p class="account-order-detail-empty">Không có thông tin sản phẩm.</p>'
          }
          <div class="order-lookup-sub"><span>Tổng thanh toán</span><strong>${formatPrice(order.total_amount)}</strong></div>
          <div class="checkout-success-frame"><h2>Thông tin nhận hàng</h2><strong>${escapeHTML(order.recipient_name || "")}</strong><span>${escapeHTML(order.recipient_phone || "")}</span><p>${escapeHTML(order.shipping_address || "")}</p></div>
          <button class="account-sub-button" type="button" data-new-lookup>Tra cứu đơn khác</button>
        </section>`
      : `<form class="order-lookup-form" data-order-lookup-form>
          <label class="checkout-guest-field">Mã đơn hàng<input name="order_id" inputmode="numeric" autocomplete="off" maxlength="20" value="${escapeHTML(orderId)}" required /></label>
          <label class="checkout-guest-field">Số điện thoại đã dùng khi đặt hàng<input name="phone" type="tel" autocomplete="tel" maxlength="20" value="${escapeHTML(phone)}" required /></label>
          ${error ? `<p class="checkout-top-row-alert checkout-alert-error" role="alert">${escapeHTML(error)}</p>` : ""}
          <button class="checkout-button" type="submit" ${submitting ? "disabled" : ""}>${submitting ? "ĐANG TRA CỨU..." : "TRA CỨU ĐƠN HÀNG"}</button>
          <p class="checkout-note">Cần cả mã đơn hàng và số điện thoại nhận hàng để xem thông tin.</p>
        </form>`;
    root.innerHTML = result;
  }

  root.addEventListener("input", (event) => {
    if (event.target.name === "order_id") orderId = event.target.value;
    if (event.target.name === "phone") phone = event.target.value;
  });

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-new-lookup]")) {
      order = null;
      orderId = "";
      phone = "";
      error = "";
      renderLookupResult();
    }
  });

  root.addEventListener("submit", async (event) => {
    if (!event.target.matches("[data-order-lookup-form]") || submitting) return;
    event.preventDefault();
    const form = new FormData(event.target);
    orderId = String(form.get("order_id") || "").trim();
    phone = String(form.get("phone") || "").trim();
    if (!/^\d{1,20}$/.test(orderId) || !phone) {
      error = "Vui lòng nhập mã đơn và số điện thoại hợp lệ.";
      renderLookupResult();
      return;
    }

    submitting = true;
    error = "";
    renderLookupResult();
    try {
      const response = await fetch(`${API_BASE_URL}/orders/lookup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, phone }),
      });
      const result = await response.json();
      if (!response.ok || result?.success !== true || !result.data) {
        throw new Error(result?.message || "Không tìm thấy đơn hàng phù hợp.");
      }
      order = result.data;
      history.replaceState(
        null,
        "",
        `order-lookup.html?orderId=${encodeURIComponent(order.id)}`,
      );
    } catch (requestError) {
      error = requestError.message || "Không thể tra cứu đơn hàng.";
    } finally {
      submitting = false;
      renderLookupResult();
    }
  });

  renderLookupResult();
}
