import { apiRequest, getAvatarUrl } from "../services/api.js";
import { escapeHTML } from "../components/product-card.js";

const AUTH_KEY = "anh-nguyet-auth";
const PAGE_LIMIT = 20;
const employeePortal = window.location.pathname.split("/").pop().startsWith("employee-");
function redirectToPortalLogin(expired = false) { const file = window.location.pathname.split("/").pop(); window.location.replace((employeePortal ? "employee-login" : "admin-login") + ".html?" + (expired ? "session=expired&" : "") + "returnTo=" + encodeURIComponent(file)); }

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
  } catch {
    return null;
  }
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(date);
}

function getInitials(name) {
  return String(name || "KH")
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0] || "")
    .join("")
    .toLocaleUpperCase("vi");
}

export async function mountAdminCustomers() {
  const search = document.querySelector("[data-customer-search]");
  const message = document.querySelector("[data-customer-message]");
  const tableWrap = document.querySelector("[data-customer-table-wrap]");
  const rows = document.querySelector("[data-customer-rows]");
  const pagination = document.querySelector("[data-customer-pagination]");
  const dialog = document.querySelector("[data-customer-dialog]");
  const detailContent = document.querySelector("[data-customer-detail-content]");
  const session = readSession();

  if (!session?.token) {
    redirectToPortalLogin();
    return;
  }

  let currentPage = 1;
  let totalCount = 0;
  let customers = [];
  let loading = false;
  let loadError = "";
  let searchTimer;
  let listRequestId = 0;
  let listController;
  let detailRequestId = 0;
  const pendingDetails = new Set();

  function showMessage(text, isError = false) {
    message.textContent = text;
    message.hidden = !text;
    message.setAttribute("role", isError ? "alert" : "status");
    message.classList.toggle("is-error", isError);
  }

  function renderPagination() {
    const pageCount = Math.ceil(totalCount / PAGE_LIMIT);
    pagination.hidden = loading || pageCount <= 1;
    if (pagination.hidden) {
      pagination.innerHTML = "";
      return;
    }
    pagination.innerHTML = `<button type="button" data-customer-page="-1" ${currentPage <= 1 ? "disabled" : ""}>Trang trước</button><span>Trang ${currentPage} / ${pageCount} · ${totalCount} khách hàng</span><button type="button" data-customer-page="1" ${currentPage >= pageCount ? "disabled" : ""}>Trang sau</button>`;
  }

  function bindAvatarFallbacks() {
    rows.querySelectorAll("[data-customer-avatar]").forEach((image) => {
      image.addEventListener("error", () => {
        image.hidden = true;
        image.parentElement.querySelector("[data-customer-initials]").hidden = false;
      }, { once: true });
    });
  }

  function renderList() {
    tableWrap.hidden = loading || Boolean(loadError) || customers.length === 0;
    if (loadError) {
      rows.innerHTML = "";
    } else {
      rows.innerHTML = customers.map((customer) => {
        const id = String(customer.id);
        const avatar = getAvatarUrl(customer.avatar_url);
        const initials = getInitials(customer.full_name);
        return `<tr>
          <td><div class="admin-customer-identity"><span class="admin-customer-avatar"><span data-customer-initials ${avatar ? "hidden" : ""}>${escapeHTML(initials)}</span>${avatar ? `<img src="${escapeHTML(avatar)}" alt="" loading="lazy" data-customer-avatar />` : ""}</span><strong>${escapeHTML(customer.full_name || "Chưa có họ tên")}</strong></div></td>
          <td>${escapeHTML(customer.email || "—")}</td>
          <td>${escapeHTML(customer.phone || "—")}</td>
          <td>${escapeHTML(formatDate(customer.created_at))}</td>
          <td><button type="button" class="admin-customer-view" data-view-customer="${escapeHTML(id)}" ${pendingDetails.has(id) ? "disabled" : ""}>${pendingDetails.has(id) ? "Đang tải..." : "Xem chi tiết"}</button></td>
        </tr>`;
      }).join("");
    }
    bindAvatarFallbacks();
    renderPagination();
  }

  async function loadCustomers() {
    const requestId = ++listRequestId;
    listController?.abort();
    listController = new AbortController();
    loading = true;
    loadError = "";
    showMessage("Đang tải danh sách khách hàng...");
    renderList();

    const query = new URLSearchParams({ page: String(currentPage), limit: String(PAGE_LIMIT) });
    const searchValue = search.value.trim();
    if (searchValue) query.set("q", searchValue);

    try {
      const result = await apiRequest(`/admin/customers?${query}`, {
        headers: { Authorization: `Bearer ${session.token}` },
        signal: listController.signal,
      });
      if (requestId !== listRequestId) return;
      if (!Array.isArray(result.data) || !Number.isFinite(Number(result.count))) {
        throw new Error("Máy chủ trả về danh sách khách hàng không hợp lệ.");
      }
      customers = result.data;
      totalCount = Number(result.count);
      if (Number(result.page) !== currentPage) currentPage = Number(result.page) || 1;
      showMessage(totalCount
        ? `Hiển thị ${customers.length} khách hàng trong tổng số ${totalCount}.`
        : searchValue ? "Không tìm thấy khách hàng phù hợp." : "Chưa có khách hàng.");
    } catch (error) {
      if (requestId !== listRequestId || error.name === "AbortError") return;
      if (error.status === 401) {
        redirectToPortalLogin(true);
        return;
      }
      loadError = error.message || "Không thể tải danh sách khách hàng.";
      customers = [];
      totalCount = 0;
      showMessage(loadError, true);
    } finally {
      if (requestId === listRequestId) {
        loading = false;
        renderList();
      }
    }
  }

  function renderCustomerDetail(customer) {
    const avatar = getAvatarUrl(customer.avatar_url);
    const initials = getInitials(customer.full_name);
    const addresses = Array.isArray(customer.addresses) ? customer.addresses : [];
    const orders = Array.isArray(customer.orders) ? customer.orders : [];
    const orderSummary = customer.order_summary || {};
    detailContent.innerHTML = `<section class="admin-customer-profile">
      <span class="admin-customer-avatar admin-customer-avatar-large"><span data-detail-initials ${avatar ? "hidden" : ""}>${escapeHTML(initials)}</span>${avatar ? `<img src="${escapeHTML(avatar)}" alt="Ảnh đại diện ${escapeHTML(customer.full_name || "khách hàng")}" data-detail-avatar />` : ""}</span>
      <dl class="admin-customer-fields">
        <div><dt>Họ và tên</dt><dd>${escapeHTML(customer.full_name || "—")}</dd></div>
        <div><dt>Email</dt><dd>${escapeHTML(customer.email || "—")}</dd></div>
        <div><dt>Số điện thoại</dt><dd>${escapeHTML(customer.phone || "—")}</dd></div>
        <div><dt>Vai trò</dt><dd>${customer.role === "customer" ? "Khách hàng" : escapeHTML(customer.role || "—")}</dd></div>
        <div><dt>Ngày đăng ký</dt><dd>${escapeHTML(formatDate(customer.created_at))}</dd></div>
      </dl>
    </section>
    <section class="admin-customer-addresses"><h3>Địa chỉ giao hàng</h3>${addresses.length ? `<div class="admin-customer-address-list">${addresses.map((address) => `<article class="admin-customer-address"><div><strong>${escapeHTML(address.recipient_name || "Người nhận")}</strong>${address.is_default ? '<span class="admin-customer-default">Mặc định</span>' : ""}</div><p>${escapeHTML(address.phone || "—")}</p><p>${escapeHTML(address.address || "—")}</p></article>`).join("")}</div>` : '<p class="admin-customer-no-address">Khách hàng chưa lưu địa chỉ giao hàng.</p>'}</section>
    <section class="admin-customer-addresses"><h3>Lịch sử mua hàng</h3><p>${Number(orderSummary.order_count || 0)} đơn · ${Number(orderSummary.completed_order_count || 0)} đơn hoàn thành · Tổng giá trị hoàn thành ${new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number(orderSummary.completed_order_value) || 0)}</p>${orders.length ? `<div class="admin-products-table-wrap"><table class="admin-products-table"><thead><tr><th>Mã đơn</th><th>Ngày</th><th>Trạng thái</th><th>Tổng tiền</th></tr></thead><tbody>${orders.map((order) => `<tr><td><a href="admin-orders.html">#${escapeHTML(order.id)}</a></td><td>${escapeHTML(formatDate(order.created_at))}</td><td>${escapeHTML(order.status || "—")}</td><td>${new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number(order.total_amount) || 0)}</td></tr>`).join("")}</tbody></table></div>` : "<p>Khách hàng chưa có đơn hàng.</p>"}</section>`;

    detailContent.querySelector("[data-detail-avatar]")?.addEventListener("error", (event) => {
      event.currentTarget.hidden = true;
      detailContent.querySelector("[data-detail-initials]").hidden = false;
    }, { once: true });
  }

  async function openCustomerDetail(id) {
    if (pendingDetails.has(id)) return;
    const requestId = ++detailRequestId;
    pendingDetails.add(id);
    renderList();
    detailContent.innerHTML = '<p role="status">Đang tải hồ sơ và địa chỉ...</p>';
    if (!dialog.open) dialog.showModal();

    try {
      const result = await apiRequest(`/admin/customers/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (requestId !== detailRequestId) return;
      if (!result.data || String(result.data.id) !== id) {
        throw new Error("Máy chủ trả về chi tiết khách hàng không hợp lệ.");
      }
      renderCustomerDetail(result.data);
    } catch (error) {
      if (requestId !== detailRequestId) return;
      if (error.status === 401) {
        redirectToPortalLogin(true);
        return;
      }
      detailContent.innerHTML = `<div class="admin-customer-detail-error" role="alert"><p>${escapeHTML(error.message || "Không thể tải chi tiết khách hàng.")}</p><button type="button" data-retry-customer="${escapeHTML(id)}">Thử lại</button></div>`;
    } finally {
      pendingDetails.delete(id);
      renderList();
    }
  }

  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentPage = 1;
      void loadCustomers();
    }, 300);
  });
  pagination.addEventListener("click", (event) => {
    const button = event.target.closest("[data-customer-page]");
    if (!button || button.disabled) return;
    currentPage += Number(button.dataset.customerPage);
    void loadCustomers();
  });
  rows.addEventListener("click", (event) => {
    const button = event.target.closest("[data-view-customer]");
    if (button) void openCustomerDetail(button.dataset.viewCustomer);
  });
  detailContent.addEventListener("click", (event) => {
    const button = event.target.closest("[data-retry-customer]");
    if (button) void openCustomerDetail(button.dataset.retryCustomer);
  });
  document.querySelectorAll("[data-customer-close]").forEach((button) => {
    button.addEventListener("click", () => dialog.close());
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  await loadCustomers();
}
