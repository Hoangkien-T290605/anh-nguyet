import { apiRequest } from "../services/api.js";
import { escapeHTML } from "../components/product-card.js";

const AUTH_KEY = "anh-nguyet-auth";
const PAGE_SIZE = 20;
const STATUS_LABELS = { active: "Đang hoạt động", inactive: "Đã tạm ngừng", scheduled: "Sắp diễn ra", expired: "Đã hết hạn", exhausted: "Hết lượt" };

function readSession() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); } catch { return null; }
}

function formatPrice(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(amount) : "—";
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function toDateInput(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export async function mountAdminVouchers() {
  const session = readSession();
  if (!session?.token) { window.location.replace("admin-login.html?returnTo=admin-vouchers.html"); return; }

  const rows = document.querySelector("[data-voucher-rows]");
  const tableWrap = document.querySelector("[data-voucher-table-wrap]");
  const message = document.querySelector("[data-voucher-message]");
  const pagination = document.querySelector("[data-voucher-pagination]");
  const search = document.querySelector("[data-voucher-search]");
  const status = document.querySelector("[data-voucher-status]");
  const type = document.querySelector("[data-voucher-type]");
  const dateFrom = document.querySelector("[data-voucher-date-from]");
  const dateTo = document.querySelector("[data-voucher-date-to]");
  const dialog = document.querySelector("[data-voucher-dialog]");
  const form = document.querySelector("[data-voucher-form]");
  const formMessage = document.querySelector("[data-voucher-form-message]");
  const saveButton = document.querySelector("[data-voucher-save]");
  const sessionHeaders = { Authorization: `Bearer ${session.token}` };
  let page = 1;
  let totalPages = 1;
  let vouchers = [];
  let debounce;
  let saving = false;
  let loading = false;

  function setMessage(text, error = false) {
    message.textContent = text;
    message.classList.toggle("is-error", error);
    message.setAttribute("role", error ? "alert" : "status");
  }

  function render() {
    tableWrap.hidden = !vouchers.length;
    if (!vouchers.length) {
      rows.innerHTML = "";
      pagination.hidden = true;
      if (!loading) setMessage("Không có mã giảm giá phù hợp.");
      return;
    }
    setMessage(`Đang hiển thị ${vouchers.length} mã · Trang ${page}/${totalPages}.`);
    rows.innerHTML = vouchers.map((voucher) => {
      const offer = voucher.discount_type === "percentage" ? `${Number(voucher.discount_value)}%${voucher.maximum_discount == null ? "" : ` · tối đa ${formatPrice(voucher.maximum_discount)}`}` : formatPrice(voucher.discount_value);
      const isActive = Boolean(voucher.is_active);
      return `<tr>
        <td><strong class="admin-voucher-code">${escapeHTML(voucher.code)}</strong><span class="admin-voucher-subtitle">${escapeHTML(voucher.campaign_name)}</span></td>
        <td>${escapeHTML(offer)}</td>
        <td>Tối thiểu ${escapeHTML(formatPrice(voucher.minimum_subtotal))}</td>
        <td>${escapeHTML(formatDate(voucher.starts_at))}<span class="admin-voucher-subtitle">đến ${escapeHTML(formatDate(voucher.ends_at))}</span></td>
        <td>${Number(voucher.redeemed_count) || 0} đã dùng · ${Number(voucher.reserved_count) || 0} đang giữ / ${Number(voucher.quantity_limit) || 0} · còn ${Math.max(0, (Number(voucher.quantity_limit) || 0) - (Number(voucher.used_count) || 0))}</td>
        <td>${voucher.per_customer_limit == null ? "Không giới hạn" : Number(voucher.per_customer_limit)}</td>
        <td><span class="admin-voucher-status is-${escapeHTML(voucher.status)}">${escapeHTML(STATUS_LABELS[voucher.status] || "Không xác định")}</span></td>
        <td><div class="admin-voucher-row-actions"><button class="admin-customer-view" type="button" data-voucher-details="${escapeHTML(voucher.id)}">Chi tiết</button><button class="admin-customer-view" type="button" data-voucher-edit="${escapeHTML(voucher.id)}">Sửa</button><button class="admin-review-action" type="button" data-voucher-toggle="${escapeHTML(voucher.id)}" data-active="${isActive}" ${loading ? "disabled" : ""}>${isActive ? "Tạm ngừng" : "Kích hoạt"}</button><button class="admin-review-action" type="button" data-voucher-delete="${escapeHTML(voucher.id)}" data-voucher-code="${escapeHTML(voucher.code)}" ${loading ? "disabled" : ""}>Xóa</button></div></td>
      </tr>`;
    }).join("");
    pagination.hidden = totalPages <= 1;
    pagination.innerHTML = totalPages <= 1 ? "" : `<button type="button" data-voucher-page="-1" ${page <= 1 ? "disabled" : ""}>Trang trước</button><span>Trang ${page} / ${totalPages}</span><button type="button" data-voucher-page="1" ${page >= totalPages ? "disabled" : ""}>Trang sau</button>`;
  }

  async function load() {
    if (loading) return;
    loading = true;
    setMessage("Đang tải mã giảm giá...");
    const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), q: search.value.trim(), status: status.value, type: type.value, date_from: dateFrom.value, date_to: dateTo.value });
    try {
      const result = await apiRequest(`/admin/vouchers?${query}`, { headers: sessionHeaders });
      if (!Array.isArray(result.data) || !result.pagination) throw new Error("Backend trả về danh sách voucher không hợp lệ.");
      vouchers = result.data;
      totalPages = Math.max(1, Number(result.pagination.total_pages) || 1);
      page = Math.min(page, totalPages);
      if (page !== Number(result.pagination.page)) { loading = false; await load(); return; }
      tableWrap.hidden = false;
    } catch (error) {
      if (error.status === 401) { window.location.replace("admin-login.html?session=expired&returnTo=admin-vouchers.html"); return; }
      vouchers = [];
      totalPages = 1;
      rows.innerHTML = "";
      tableWrap.hidden = true;
      pagination.hidden = true;
      setMessage(error.message || "Không thể tải mã giảm giá.", true);
      loading = false;
      return;
    }
    loading = false;
    render();
  }

  function openForm(voucher = null) {
    form.reset();
    form.elements.id.value = voucher?.id || "";
    form.elements.code.value = voucher?.code || "";
    form.elements.campaign_name.value = voucher?.campaign_name || "";
    form.elements.description.value = voucher?.description || "";
    form.elements.discount_type.value = voucher?.discount_type || "percentage";
    form.elements.discount_value.value = voucher?.discount_value ?? "";
    form.elements.minimum_subtotal.value = voucher?.minimum_subtotal ?? 0;
    form.elements.maximum_discount.value = voucher?.maximum_discount ?? "";
    form.elements.quantity_limit.value = voucher?.quantity_limit ?? "";
    form.elements.per_customer_limit.value = voucher?.per_customer_limit ?? "";
    form.elements.starts_at.value = voucher ? toDateInput(voucher.starts_at) : "";
    form.elements.ends_at.value = voucher ? toDateInput(voucher.ends_at) : "";
    form.elements.is_active.checked = voucher ? Boolean(voucher.is_active) : true;
    document.querySelector("[data-voucher-dialog-title]").textContent = voucher ? "Chỉnh sửa mã giảm giá" : "Tạo mã giảm giá";
    formMessage.hidden = true;
    formMessage.textContent = "";
    updateTypeFields();
    dialog.showModal();
  }

  function updateTypeFields() {
    const percentage = form.elements.discount_type.value === "percentage";
    form.elements.discount_value.max = percentage ? "100" : "9999999999.99";
    form.querySelector("[data-voucher-cap-field]").hidden = !percentage;
    form.elements.maximum_discount.disabled = !percentage;
    if (!percentage) form.elements.maximum_discount.value = "";
  }

  document.querySelectorAll("[data-voucher-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  document.querySelector("[data-voucher-add]").addEventListener("click", () => openForm());
  form.elements.discount_type.addEventListener("change", updateTypeFields);
  search.addEventListener("input", () => { clearTimeout(debounce); debounce = setTimeout(() => { page = 1; void load(); }, 250); });
  status.addEventListener("change", () => { page = 1; void load(); });
  type.addEventListener("change", () => { page = 1; void load(); });
  for (const input of [dateFrom, dateTo]) input.addEventListener("change", () => {
    if (dateFrom.value && dateTo.value && dateFrom.value > dateTo.value) {
      setMessage("Ngày bắt đầu không thể sau ngày kết thúc.", true);
      return;
    }
    page = 1;
    void load();
  });
  pagination.addEventListener("click", (event) => { const button = event.target.closest("[data-voucher-page]"); if (!button || button.disabled) return; page += Number(button.dataset.voucherPage); void load(); });
  rows.addEventListener("click", async (event) => {
    const remove = event.target.closest("[data-voucher-delete]");
    if (remove) {
      if (loading) return;
      const voucherCode = remove.dataset.voucherCode || "mã này";
      if (!window.confirm(`Xóa voucher ${voucherCode}? Chỉ voucher chưa có lịch sử sử dụng mới được xóa; voucher có lịch sử sẽ được giữ lại.`)) return;
      loading = true; render();
      try {
        const result = await apiRequest(`/admin/vouchers/${encodeURIComponent(remove.dataset.voucherDelete)}`, { method: "DELETE", headers: sessionHeaders });
        if (!result.success) throw new Error("Backend chưa xác nhận xóa voucher.");
        loading = false;
        setMessage(result.message || "Đã xóa voucher.");
        await load();
      } catch (error) {
        loading = false;
        if (error.status === 401) { window.location.replace("admin-login.html?session=expired&returnTo=admin-vouchers.html"); return; }
        setMessage(error.message || "Không thể xóa voucher.", true); render();
      }
      return;
    }
    const details = event.target.closest("[data-voucher-details]");
    if (details) {
      const detailDialog = document.querySelector("[data-voucher-details-dialog]");
      const detailMessage = document.querySelector("[data-voucher-details-message]");
      const detailContent = document.querySelector("[data-voucher-details-content]");
      detailContent.replaceChildren(); detailMessage.textContent = "Đang tải chi tiết voucher..."; detailDialog.showModal();
      try {
        const result = await apiRequest(`/admin/vouchers/${encodeURIComponent(details.dataset.voucherDetails)}`, { headers: sessionHeaders });
        const voucher = result.data?.voucher;
        const redemptions = Array.isArray(result.data?.redemptions) ? result.data.redemptions : [];
        const usageSummary = result.data?.usage_summary || {};
        if (!voucher) throw new Error("Backend không trả thông tin voucher hợp lệ.");
        detailMessage.textContent = `${STATUS_LABELS[voucher.status] || "Không xác định"} · ${Number(usageSummary.redeemed_count || 0)} đã dùng · ${Number(usageSummary.reserved_count || 0)} đang giữ · ${Number(usageSummary.released_count || 0)} đã hoàn lượt · giới hạn ${Number(voucher.quantity_limit)}.`;
        detailContent.innerHTML = `<dl class="admin-voucher-detail-grid"><dt>Mã</dt><dd>${escapeHTML(voucher.code)}</dd><dt>Chương trình</dt><dd>${escapeHTML(voucher.campaign_name)}</dd><dt>Mô tả</dt><dd>${escapeHTML(voucher.description || "—")}</dd><dt>Giá trị đơn tối thiểu</dt><dd>${escapeHTML(formatPrice(voucher.minimum_subtotal))}</dd><dt>Giới hạn mỗi khách</dt><dd>${voucher.per_customer_limit == null ? "Không giới hạn" : Number(voucher.per_customer_limit)}</dd><dt>Thời gian</dt><dd>${escapeHTML(formatDate(voucher.starts_at))} – ${escapeHTML(formatDate(voucher.ends_at))}</dd></dl><h3>Đơn hàng sử dụng gần đây (tối đa 100)</h3>${redemptions.length ? `<div class="admin-products-table-wrap"><table class="admin-products-table"><thead><tr><th>Đơn hàng</th><th>Khách hàng</th><th>Trạng thái</th><th>Lượt voucher</th><th>Tổng đơn</th><th>Giảm giá</th><th>Thời gian</th></tr></thead><tbody>${redemptions.map((item) => `<tr><td>#${escapeHTML(item.order_id)}</td><td>${escapeHTML(item.customer_name || (item.customer_id == null ? "Khách vãng lai" : `Tài khoản #${item.customer_id}`))}</td><td>${escapeHTML(item.order_status || "—")}</td><td>${item.usage_status === "reserved" ? "Đang giữ" : item.usage_status === "released" ? "Đã hoàn lượt" : "Đã dùng"}</td><td>${escapeHTML(formatPrice(item.total_amount))}</td><td>${escapeHTML(formatPrice(item.discount_amount))}</td><td>${escapeHTML(formatDate(item.created_at))}</td></tr>`).join("")}</tbody></table></div>` : "<p>Chưa có lượt sử dụng.</p>"}`;
      } catch (error) { detailMessage.textContent = error.message || "Không thể tải chi tiết voucher."; }
      return;
    }
    const edit = event.target.closest("[data-voucher-edit]");
    if (edit) { const voucher = vouchers.find((item) => String(item.id) === edit.dataset.voucherEdit); if (voucher) openForm(voucher); return; }
    const toggle = event.target.closest("[data-voucher-toggle]");
    if (!toggle || loading) return;
    const nextActive = toggle.dataset.active !== "true";
    if (!window.confirm(`${nextActive ? "Kích hoạt" : "Tạm ngừng"} mã ${toggle.dataset.voucherToggle}? Lịch sử sử dụng sẽ được giữ nguyên.`)) return;
    loading = true; render();
    try {
      const result = await apiRequest(`/admin/vouchers/${encodeURIComponent(toggle.dataset.voucherToggle)}/active`, { method: "PATCH", headers: sessionHeaders, body: JSON.stringify({ is_active: nextActive }) });
      if (!result.success) throw new Error("Backend chưa xác nhận cập nhật trạng thái.");
      loading = false;
      setMessage(result.message || "Đã cập nhật trạng thái.");
      await load();
    } catch (error) {
      loading = false;
      if (error.status === 401) { window.location.replace("admin-login.html?session=expired&returnTo=admin-vouchers.html"); return; }
      setMessage(error.message || "Không thể cập nhật trạng thái.", true); render();
    }
  });

  document.querySelector("[data-voucher-details-close]").addEventListener("click", () => document.querySelector("[data-voucher-details-dialog]").close());

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form));
    const startsAt = new Date(form.elements.starts_at.value);
    const endsAt = new Date(form.elements.ends_at.value);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      formMessage.textContent = "Thời gian kết thúc phải sau thời gian bắt đầu."; formMessage.hidden = false; return;
    }
    data.code = data.code.trim().toUpperCase();
    data.discount_value = Number(data.discount_value);
    data.minimum_subtotal = Number(data.minimum_subtotal);
    data.maximum_discount = data.maximum_discount === "" ? null : Number(data.maximum_discount);
    data.quantity_limit = Number(data.quantity_limit);
    data.per_customer_limit = data.per_customer_limit === "" ? null : Number(data.per_customer_limit);
    data.starts_at = startsAt.toISOString();
    data.ends_at = endsAt.toISOString();
    data.is_active = form.elements.is_active.checked;
    saving = true; saveButton.disabled = true; saveButton.textContent = "ĐANG LƯU..."; formMessage.hidden = true;
    try {
      const id = data.id; delete data.id;
      const result = await apiRequest(id ? `/admin/vouchers/${encodeURIComponent(id)}` : "/admin/vouchers", { method: id ? "PUT" : "POST", headers: sessionHeaders, body: JSON.stringify(data) });
      if (!result.success) throw new Error("Backend chưa xác nhận lưu voucher.");
      dialog.close(); page = 1; setMessage(result.message || "Đã lưu mã giảm giá."); await load();
    } catch (error) {
      if (error.status === 401) { window.location.replace("admin-login.html?session=expired&returnTo=admin-vouchers.html"); return; }
      formMessage.textContent = error.message || "Không thể lưu mã giảm giá."; formMessage.hidden = false;
    } finally { saving = false; saveButton.disabled = false; saveButton.textContent = "Lưu mã giảm giá"; }
  });

  await load();
}
