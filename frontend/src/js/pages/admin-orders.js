// Trang quản trị đơn hàng dùng đúng các API Admin đang có.
import { apiRequest, getProductImageUrl } from "../services/api.js";
import { escapeHTML } from "../components/product-card.js";

const AUTH_KEY = "anh-nguyet-auth";
const PAGE_SIZE = 10;
const STATUSES = [
  ["pending_confirmation", "Chờ xác nhận"],
  ["confirmed", "Đã xác nhận"],
  ["preparing", "Đang chuẩn bị"],
  ["shipping", "Đang giao"],
  ["completed", "Hoàn thành"],
  ["cancelled", "Đã hủy"],
];
const STATUS_LABELS = new Map(STATUSES);

function readAuthSession() {
  try {
    const value = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    return value?.token && value?.user ? value : null;
  } catch {
    return null;
  }
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function formatCurrency(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0,
      }).format(amount)
    : "—";
}

function normalizeText(value) {
  return String(value ?? "")
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

function isGuestOrder(order) {
  return order.customer_type === "guest" || order.customer_id === null;
}

export async function mountAdminOrders() {
  const root = document.getElementById("admin-orders-goc");
  const searchInput = document.querySelector("[data-admin-order-search]");
  const statusFilter = document.querySelector("[data-admin-order-filter]");
  const feedback = document.querySelector("[data-admin-orders-feedback]");
  const pagination = document.querySelector("[data-admin-orders-pagination]");
  const auth = readAuthSession();

  if (!auth) {
    window.location.replace("admin-login.html?returnTo=admin-orders.html");
    return;
  }

  let orders = [];
  let loadError = "";
  let loading = true;
  let currentPage = 1;
  let updateMessage = "";
  let updateError = false;
  const pendingStatuses = new Map();
  const saving = new Set();
  const updateErrors = new Map();

  function showFeedback(text = "", isError = false) {
    feedback.textContent = text;
    feedback.hidden = !text;
    feedback.classList.toggle("is-error", isError);
    feedback.setAttribute("role", isError ? "alert" : "status");
  }

  function filteredOrders() {
    const query = normalizeText(searchInput.value);
    const selectedStatus = statusFilter.value;
    return orders.filter((order) => {
      const matchesStatus = selectedStatus === "all" || order.status === selectedStatus;
      const searchable = [
        order.id,
        order.recipient_name,
        order.recipient_phone,
        order.shipping_address,
        isGuestOrder(order) ? "khach vang lai" : `tai khoan ${order.customer_id}`,
        ...(Array.isArray(order.items) ? order.items.map((item) => item.product_name) : []),
      ].join(" ");
      return matchesStatus && (!query || normalizeText(searchable).includes(query));
    });
  }

  function renderItems(items) {
    if (!Array.isArray(items) || !items.length) {
      return '<p class="admin-order-empty-items">Đơn hàng không có chi tiết sản phẩm.</p>';
    }
    return `<div class="admin-order-items-table-wrap"><table class="admin-order-items-table">
      <thead><tr><th>Sản phẩm</th><th>Đơn giá</th><th>Số lượng</th><th>Thành tiền</th></tr></thead>
      <tbody>${items.map((item) => {
        const image = getProductImageUrl(item.product_image);
        return `<tr>
          <td><div class="admin-order-product"><span class="admin-order-product-image" data-order-image-fallback>${image ? `<img src="${escapeHTML(image)}" alt="" loading="lazy" data-order-product-image />` : "❋"}</span><span>${escapeHTML(item.product_name || "Sản phẩm đã lưu trong đơn")}</span></div></td>
          <td>${formatCurrency(item.unit_price)}</td>
          <td>${Number(item.quantity) || 0}</td>
          <td>${formatCurrency(item.line_total)}</td>
        </tr>`;
      }).join("")}</tbody>
    </table></div>`;
  }

  function renderPagination(total) {
    const pageCount = Math.ceil(total / PAGE_SIZE);
    pagination.hidden = pageCount <= 1;
    if (pageCount <= 1) {
      pagination.innerHTML = "";
      return;
    }
    pagination.innerHTML = `<button type="button" data-order-page="-1" ${currentPage <= 1 ? "disabled" : ""}>Trang trước</button><span>Trang ${currentPage} / ${pageCount} · ${total} đơn hàng</span><button type="button" data-order-page="1" ${currentPage >= pageCount ? "disabled" : ""}>Trang sau</button>`;
  }

  function bindOrderImageFallbacks() {
    root.querySelectorAll("[data-order-product-image]").forEach((image) => {
      image.addEventListener("error", () => {
        image.hidden = true;
        image.parentElement.textContent = "❋";
      }, { once: true });
    });
  }

  function renderOrders() {
    if (loading) {
      root.innerHTML = '<div class="account-order-unavailable" role="status"><div class="account-loading-spinner"></div><p>Đang tải đơn hàng...</p></div>';
      pagination.hidden = true;
      return;
    }
    if (loadError) {
      root.innerHTML = `<div class="account-order-unavailable" role="alert"><div class="account-empty-icon">!</div><h2>Không tải được đơn hàng</h2><p>${escapeHTML(loadError)}</p><button class="account-primary-button" type="button" data-admin-retry>Thử lại</button></div>`;
      pagination.hidden = true;
      return;
    }

    const filtered = filteredOrders();
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, pageCount);
    const visibleOrders = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    if (!orders.length) {
      root.innerHTML = '<div class="account-order-unavailable"><div class="account-empty-icon">▤</div><h2>Chưa có đơn hàng</h2></div>';
      showFeedback(updateMessage, updateError);
      pagination.hidden = true;
      return;
    }
    if (!visibleOrders.length) {
      root.innerHTML = '<div class="account-order-unavailable"><div class="account-empty-icon">⌕</div><h2>Không tìm thấy đơn hàng phù hợp</h2></div>';
      renderPagination(0);
      showFeedback(updateMessage, updateError);
      return;
    }

    root.innerHTML = `<div class="admin-orders-list">${visibleOrders.map((order) => {
      const id = String(order.id);
      const status = pendingStatuses.get(id) || order.status;
      const statusLabel = STATUS_LABELS.get(order.status) || "Trạng thái không xác định";
      const customer = isGuestOrder(order)
        ? "Khách vãng lai"
        : `Tài khoản #${escapeHTML(order.customer_id)}`;
      const shippingFee = order.shipping_fee === null || order.shipping_fee === undefined
        ? "Chưa cấu hình"
        : formatCurrency(order.shipping_fee);
      const statusOptions = STATUSES.map(([value, label]) => `<option value="${value}" ${status === value ? "selected" : ""}>${label}</option>`).join("");
      return `<article class="admin-orders-card">
        <div class="admin-orders-heading"><div><span class="account-order-label">MÃ ĐƠN</span><strong>#${escapeHTML(id)}</strong></div><span class="account-order-status">${customer}</span></div>
        <div class="admin-orders-grid">
          <div><span>Người nhận</span><strong>${escapeHTML(order.recipient_name || "—")}</strong></div>
          <div><span>Số điện thoại</span><strong>${escapeHTML(order.recipient_phone || "—")}</strong></div>
          <div><span>Ngày đặt</span><strong>${escapeHTML(formatDate(order.created_at))}</strong></div>
          <div><span>Trạng thái hiện tại</span><strong>${escapeHTML(statusLabel)}</strong></div>
          <div><span>Phương thức</span><strong>${escapeHTML(order.payment_method || "—")}</strong></div>
          <div><span>Thanh toán</span><strong>${escapeHTML(order.payment_status || "—")}</strong></div>
        </div>
        <p class="admin-orders-address-detail"><strong>Địa chỉ nhận:</strong> ${escapeHTML(order.shipping_address || "—")}</p>
        <div class="admin-order-totals"><span>Tạm tính <strong>${formatCurrency(order.subtotal)}</strong></span><span>Phí vận chuyển <strong>${shippingFee}</strong></span><span>Tổng đơn <strong>${formatCurrency(order.total_amount)}</strong></span></div>
        <details class="admin-order-details"><summary>Chi tiết ${Array.isArray(order.items) ? order.items.length : 0} sản phẩm</summary>${renderItems(order.items)}</details>
        ${updateErrors.has(id) ? `<p class="admin-order-update-error" role="alert">${escapeHTML(updateErrors.get(id))}</p>` : ""}
        <div class="admin-orders-actions"><label>Trạng thái mới<select data-order-status="${escapeHTML(id)}">${statusOptions}</select></label><button class="account-primary-button" type="button" data-save-order-status="${escapeHTML(id)}" ${saving.has(id) ? "disabled" : ""}>${saving.has(id) ? "Đang lưu..." : "Cập nhật trạng thái"}</button></div>
      </article>`;
    }).join("")}</div>`;
    bindOrderImageFallbacks();
    renderPagination(filtered.length);
    showFeedback(updateMessage, updateError);
  }

  async function loadOrders() {
    loading = true;
    loadError = "";
    renderOrders();
    try {
      const allOrders = [];
      let page = 1;
      let total = null;
      do {
        const result = await apiRequest(`/admin/orders?limit=50&page=${page}`, {
          headers: { Authorization: `Bearer ${auth.token}` },
        });
        const pageOrders = Array.isArray(result.data) ? result.data : [];
        if (!Array.isArray(result.data)) {
          throw new Error("Máy chủ trả về danh sách đơn hàng không hợp lệ.");
        }
        allOrders.push(...pageOrders);
        total = Number.isFinite(Number(result.count)) ? Number(result.count) : null;
        if (!pageOrders.length || total === null || allOrders.length >= total) break;
        page += 1;
      } while (page <= 1000);
      orders = allOrders;
      currentPage = 1;
    } catch (requestError) {
      if (requestError.status === 401) {
        window.location.replace("admin-login.html?session=expired&returnTo=admin-orders.html");
        return;
      }
      loadError = requestError.message || "Không thể tải danh sách đơn hàng.";
    } finally {
      loading = false;
      renderOrders();
    }
  }

  searchInput.addEventListener("input", () => {
    currentPage = 1;
    renderOrders();
  });
  statusFilter.addEventListener("change", () => {
    currentPage = 1;
    renderOrders();
  });
  root.addEventListener("change", (event) => {
    const select = event.target.closest("[data-order-status]");
    if (select) pendingStatuses.set(select.dataset.orderStatus, select.value);
  });
  pagination.addEventListener("click", (event) => {
    const button = event.target.closest("[data-order-page]");
    if (!button || button.disabled) return;
    currentPage += Number(button.dataset.orderPage);
    renderOrders();
  });
  root.addEventListener("click", async (event) => {
    if (event.target.closest("[data-admin-retry]")) {
      await loadOrders();
      return;
    }
    const button = event.target.closest("[data-save-order-status]");
    if (!button) return;
    const id = button.dataset.saveOrderStatus;
    if (saving.has(id)) return;
    const order = orders.find((item) => String(item.id) === id);
    const status = pendingStatuses.get(id);
    if (!order || !STATUS_LABELS.has(status) || status === order.status) {
      pendingStatuses.delete(id);
      updateErrors.delete(id);
      updateMessage = "Trạng thái đơn hàng không thay đổi.";
      updateError = false;
      renderOrders();
      return;
    }
    const nextLabel = STATUS_LABELS.get(status);
    if (!window.confirm(`Xác nhận chuyển đơn #${id} sang trạng thái “${nextLabel}”?`)) return;

    saving.add(id);
    updateErrors.delete(id);
    updateMessage = "";
    renderOrders();
    try {
      const result = await apiRequest(`/admin/orders/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ status }),
      });
      if (!result.data || String(result.data.id) !== id) {
        throw new Error("Máy chủ chưa xác nhận trạng thái đơn hàng.");
      }
      orders = orders.map((item) => String(item.id) === id ? result.data : item);
      pendingStatuses.delete(id);
      updateMessage = `Đã cập nhật trạng thái đơn #${id}.`;
      updateError = false;
    } catch (requestError) {
      if (requestError.status === 401) {
        window.location.replace("admin-login.html?session=expired&returnTo=admin-orders.html");
        return;
      }
      updateErrors.set(id, requestError.message || "Không thể cập nhật trạng thái đơn hàng.");
      updateMessage = "Không cập nhật được trạng thái đơn hàng.";
      updateError = true;
    } finally {
      saving.delete(id);
      renderOrders();
    }
  });

  await loadOrders();
}
