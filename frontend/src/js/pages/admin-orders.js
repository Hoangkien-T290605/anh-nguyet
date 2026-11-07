// Trang quản trị cho phép nhân viên có quyền Admin xem và cập nhật đơn hàng.
import { API_BASE_URL } from "../services/api.js";
import { escapeHTML } from "../components/product-card.js";

const AUTH_KEY = "anh-nguyet-auth";
const STATUSES = [
  ["pending_confirmation", "Chờ xác nhận"],
  ["confirmed", "Đã xác nhận"],
  ["preparing", "Đang chuẩn bị"],
  ["shipping", "Đang giao"],
  ["completed", "Hoàn thành"],
  ["cancelled", "Đã hủy"],
];

// Đọc phiên tài khoản và JWT để bảo vệ trang quản trị.
function readAuthSession() {
  try {
    const value = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    return value?.token && value?.user ? value : null;
  } catch {
    return null;
  }
}

// Định dạng thời gian đơn hàng theo thiết lập tiếng Việt.
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

// Hiển thị giá trị tiền tệ theo chuẩn Việt Nam.
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

// Kiểm tra quyền truy cập rồi tải danh sách và trạng thái đơn hàng.
export async function mountAdminOrders() {
  const root = document.getElementById("admin-orders-goc");
  const auth = readAuthSession();
  if (!auth) {
    window.location.replace("login.html?returnTo=admin-orders.html");
    return;
  }

  let orders = [];
  let error = "";
  let loading = true;
  const pendingStatuses = new Map();
  const saving = new Set();

  // Dựng danh sách đơn và trạng thái đang tải/lỗi.
  // Dựng bảng đơn hàng và các trạng thái tải/lỗi.
  function renderOrders() {
    if (loading) {
      root.innerHTML =
        '<div class="account-order-unavailable" role="status"><div class="account-loading-spinner"></div><p>Đang tải toàn bộ đơn hàng...</p></div>';
      return;
    }
    if (error) {
      root.innerHTML = `<div class="account-order-unavailable" role="alert"><div class="account-empty-icon">!</div><h2>Không tải được đơn hàng</h2><p>${escapeHTML(error)}</p><button class="account-primary-button" type="button" data-admin-retry>Thử lại</button></div>`;
      return;
    }
    if (!orders.length) {
      root.innerHTML =
        '<div class="account-order-unavailable"><div class="account-empty-icon">▤</div><h2>Chưa có đơn hàng</h2></div>';
      return;
    }

    root.innerHTML = `<div class="admin-orders-list">${orders
      .map((order) => {
        const id = String(order.id);
        const status = pendingStatuses.get(id) || order.status;
        // Tóm lược các mặt hàng để Admin xem nhanh trong danh sách đơn.
        const tomTatMatHang = (Array.isArray(order.items) ? order.items : [])
          .map(
            (item) =>
              `${escapeHTML(item.product_name)} × ${Number(item.quantity) || 0}`,
          )
          .join(" · ");
        return `<article class="admin-orders-card">
        <div class="admin-orders-heading"><div><span class="account-order-label">MÃ ĐƠN</span><strong>#${escapeHTML(id)}</strong></div><span class="account-order-status">${order.customer_type === "guest" ? "Khách vãng lai" : `Tài khoản #${escapeHTML(order.customer_id)}`}</span></div>
        <div class="admin-orders-grid"><div><span>Người nhận</span><strong>${escapeHTML(order.recipient_name || "")}</strong></div><div><span>Số điện thoại</span><strong>${escapeHTML(order.recipient_phone || "")}</strong></div><div><span>Ngày đặt</span><strong>${escapeHTML(formatDate(order.created_at))}</strong></div><div><span>Tổng tiền</span><strong>${formatCurrency(order.total_amount)}</strong></div></div>
        <p class="admin-orders-address-detail">${escapeHTML(order.shipping_address || "")}</p>
        <p class="admin-orders-item">${tomTatMatHang || "Không có sản phẩm trong dữ liệu đơn."}</p>
        <div class="admin-orders-actions"><label>Trạng thái<select data-order-status="${escapeHTML(id)}">${STATUSES.map(([value, label]) => `<option value="${value}" ${status === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><button class="account-primary-button" type="button" data-save-order-status="${escapeHTML(id)}" ${saving.has(id) ? "disabled" : ""}>${saving.has(id) ? "Đang lưu..." : "Cập nhật trạng thái"}</button></div>
      </article>`;
      })
      .join("")}</div>`;
  }

  // Gửi yêu cầu quản trị kèm JWT và chuyển lỗi API thành thông báo rõ ràng.
  async function adminRequest(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${auth.token}`,
        ...options.headers,
      },
    });
    const result = await response.json();
    if (response.status === 401) {
      localStorage.removeItem(AUTH_KEY);
      window.dispatchEvent(
        new CustomEvent("anh-nguyet-xac-thuc-cap-nhat", { detail: { user: null } }),
      );
      window.location.replace(
        "login.html?session=expired&returnTo=admin-orders.html",
      );
    }
    if (!response.ok || result?.success === false)
      throw new Error(
        result?.message || `Yêu cầu thất bại (${response.status}).`,
      );
    return result;
  }

  // Tải danh sách đơn hàng Admin được phép quản lý.
  async function loadOrders() {
    loading = true;
    error = "";
    renderOrders();
    try {
      const allOrders = [];
      let page = 1;
      let total = null;
      do {
        const result = await adminRequest(
          `/admin/orders?limit=50&page=${page}`,
        );
        const pageOrders = Array.isArray(result.data) ? result.data : [];
        allOrders.push(...pageOrders);
        total = Number.isFinite(Number(result.count))
          ? Number(result.count)
          : null;
        if (!pageOrders.length || total === null || allOrders.length >= total)
          break;
        page++;
      } while (page <= 1000);
      orders = allOrders;
    } catch (requestError) {
      error = requestError.message || "Không thể tải danh sách đơn hàng.";
    } finally {
      loading = false;
      renderOrders();
    }
  }

  root.addEventListener("change", (event) => {
    if (event.target.matches("[data-order-status]"))
      pendingStatuses.set(event.target.dataset.orderStatus, event.target.value);
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
    const status =
      pendingStatuses.get(id) ||
      orders.find((order) => String(order.id) === id)?.status;
    saving.add(id);
    renderOrders();
    try {
      const result = await adminRequest(
        `/admin/orders/${encodeURIComponent(id)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        },
      );
      orders = orders.map((order) =>
        String(order.id) === id ? result.data : order,
      );
      pendingStatuses.delete(id);
    } catch (requestError) {
      error = requestError.message || "Không thể cập nhật trạng thái đơn hàng.";
    } finally {
      saving.delete(id);
      renderOrders();
    }
  });

  await loadOrders();
}
