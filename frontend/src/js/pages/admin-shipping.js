import { apiRequest } from "../services/api.js";
import { escapeHTML, formatPrice } from "../components/product-card.js";

const AUTH_KEY = "anh-nguyet-auth";

function readToken() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null")?.token || ""; }
  catch { return ""; }
}

export async function mountAdminShipping() {
  const message = document.querySelector("[data-shipping-message]");
  const rows = document.querySelector("[data-shipping-regions]");
  const form = document.querySelector("[data-shipping-create]");
  const headers = { Authorization: `Bearer ${readToken()}` };
  let saving = false;

  function show(text, error = false) {
    message.textContent = text;
    message.classList.toggle("is-error", error);
    message.setAttribute("role", error ? "alert" : "status");
  }

  function render(regions) {
    rows.innerHTML = regions.map((region) => `<article class="admin-shipping-region" data-shipping-id="${escapeHTML(region.id)}">
      <form data-shipping-update>
        <div class="admin-shipping-region-heading"><strong>${escapeHTML(region.region_name)}</strong><span class="admin-voucher-status is-${region.is_active ? "active" : "inactive"}">${region.is_active ? "Đang hoạt động" : "Chưa kích hoạt"}</span></div>
        <label>Mã khu vực<input name="region_code" value="${escapeHTML(region.region_code)}" maxlength="32" pattern="[A-Z0-9][A-Z0-9_-]{2,31}" required /></label>
        <label>Tên khu vực<input name="region_name" value="${escapeHTML(region.region_name)}" maxlength="100" required /></label>
        <label>Phí vận chuyển (đồng)<input name="fee" type="number" min="0" max="9999999999.99" step="0.01" value="${region.fee == null ? "" : escapeHTML(region.fee)}" placeholder="Chưa cấu hình" /></label>
        <label class="admin-shipping-active"><input name="is_active" type="checkbox" ${region.is_active ? "checked" : ""} /> Kích hoạt khu vực</label>
        <button class="admin-primary-button" type="submit" data-shipping-update-button ${saving ? "disabled" : ""}>Lưu khu vực</button>
      </form>
      <small>Mã: ${escapeHTML(region.region_code)} · Cập nhật: ${escapeHTML(region.updated_at || "—")}</small>
    </article>`).join("");
  }

  async function load() {
    show("Đang tải cấu hình khu vực...");
    try {
      const result = await apiRequest("/admin/shipping/regions", { headers });
      if (!Array.isArray(result.data)) throw new Error("Backend trả danh sách khu vực không hợp lệ.");
      form.hidden = false;
      render(result.data);
      show(result.data.length ? "Phí NULL chưa được cấu hình và không thể kích hoạt. Checkout chỉ nhận khu vực đã có giá." : "Chưa có khu vực vận chuyển.");
    } catch (error) {
      rows.replaceChildren();
      show(error.status === 503 ? "Cần áp dụng migration khu vực vận chuyển trước khi quản lý phí." : error.message || "Không thể tải khu vực vận chuyển.", true);
      if (error.status === 401) window.location.replace("admin-login.html?session=expired&returnTo=admin-shipping.html");
    }
  }

  async function send(method, url, payload) {
    if (saving) return;
    saving = true;
    form.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    rows.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    try {
      const result = await apiRequest(url, { method, headers, body: JSON.stringify(payload) });
      if (!result.success) throw new Error("Backend chưa xác nhận thay đổi.");
      show(result.message || "Đã lưu cấu hình khu vực.");
      form.reset();
      saving = false;
      await load();
    } catch (error) {
      show(error.message || "Không thể lưu cấu hình khu vực.", true);
      if (error.status === 401) window.location.replace("admin-login.html?session=expired&returnTo=admin-shipping.html");
    } finally { saving = false; }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving || !form.reportValidity()) return;
    const feeText = form.elements.fee.value.trim();
    const payload = {
      region_code: form.elements.region_code.value.trim(),
      region_name: form.elements.region_name.value.trim(),
      fee: feeText === "" ? null : Number(feeText),
      is_active: form.elements.is_active.checked,
    };
    if (payload.is_active && payload.fee === null) { show("Không thể kích hoạt khu vực khi chưa có phí.", true); return; }
    if (!window.confirm(`Tạo khu vực ${payload.region_name} với trạng thái ${payload.is_active ? "đang hoạt động" : "chưa kích hoạt"}?`)) return;
    await send("POST", "/admin/shipping/regions", payload);
  });

  rows.addEventListener("submit", async (event) => {
    const current = event.target.closest("[data-shipping-update]");
    if (!current) return;
    event.preventDefault();
    if (saving || !current.reportValidity()) return;
    const feeText = current.elements.fee.value.trim();
    const payload = {
      region_code: current.elements.region_code.value.trim(),
      region_name: current.elements.region_name.value.trim(),
      fee: feeText === "" ? null : Number(feeText),
      is_active: current.elements.is_active.checked,
    };
    if (payload.is_active && payload.fee === null) { show("Không thể kích hoạt khu vực khi chưa có giá chính thức.", true); return; }
    if (!window.confirm(`Lưu cấu hình khu vực ${payload.region_name}${payload.is_active ? " và bật áp dụng cho Checkout" : " và tạm ngừng áp dụng"}?`)) return;
    await send("PUT", `/admin/shipping/regions/${encodeURIComponent(current.closest("[data-shipping-id]").dataset.shippingId)}`, payload);
  });

  await load();
}
