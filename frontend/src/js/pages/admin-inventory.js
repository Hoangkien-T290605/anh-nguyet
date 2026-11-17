import { apiRequest } from "../services/api.js";
import { escapeHTML } from "../components/product-card.js";

const AUTH_KEY = "anh-nguyet-auth";
const PAGE_SIZE = 20;
const MOVEMENT_LABELS = { inbound: "Nhập kho", outbound: "Xuất kho", sale: "Bán theo đơn" };
const employeePortal = window.location.pathname.split("/").pop().startsWith("employee-");
function redirectToPortalLogin() { const file = window.location.pathname.split("/").pop(); window.location.replace((employeePortal ? "employee-login" : "admin-login") + ".html?session=expired&returnTo=" + encodeURIComponent(file)); }

function readToken() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null")?.token || ""; } catch { return ""; }
}

export async function mountAdminInventory() {
  const token = readToken();
  const message = document.querySelector("[data-inventory-message]");
  const rows = document.querySelector("[data-inventory-rows]");
  const table = document.querySelector("[data-inventory-table-wrap]");
  const pagination = document.querySelector("[data-inventory-pagination]");
  const search = document.querySelector("[data-inventory-search]");
  const category = document.querySelector("[data-inventory-category]");
  const status = document.querySelector("[data-inventory-status]");
  const dialog = document.querySelector("[data-inventory-dialog]");
  const form = document.querySelector("[data-inventory-form]");
  const formMessage = document.querySelector("[data-inventory-form-message]");
  const historyDialog = document.querySelector("[data-inventory-history]");
  const headers = { Authorization: `Bearer ${token}` };
  let page = 1;
  let totalPages = 1;
  let products = [];
  let selectedProduct = null;
  let canAdjust = false;
  let loading = false;
  let debounce;

  function showMessage(text, error = false) {
    message.textContent = text;
    message.classList.toggle("is-error", error);
    message.setAttribute("role", error ? "alert" : "status");
  }

  async function load() {
    if (loading) return;
    loading = true;
    showMessage("Đang tải tồn kho...");
    const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), q: search.value.trim(), category: category.value, status: status.value });
    try {
      const result = await apiRequest(`/admin/inventory?${query}`, { headers });
      products = Array.isArray(result.data) ? result.data : [];
      canAdjust = result.can_adjust === true;
      totalPages = Math.max(1, Number(result.pagination?.total_pages) || 1);
      if (Array.isArray(result.categories)) {
        const selected = category.value;
        category.innerHTML = `<option value="">Tất cả danh mục</option>${result.categories.map((item) => `<option value="${escapeHTML(item)}">${escapeHTML(item)}</option>`).join("")}`;
        category.value = result.categories.includes(selected) ? selected : "";
      }
      table.hidden = products.length === 0;
      rows.innerHTML = products.map((product) => {
        const stock = Number(product.stock) || 0;
        const badge = stock === 0 ? "Hết hàng" : stock <= 5 ? "Sắp hết" : "Còn hàng";
        return `<tr><td>#${escapeHTML(product.id)}</td><td><strong>${escapeHTML(product.name)}</strong></td><td>${escapeHTML(product.category || "—")}</td><td><strong>${stock.toLocaleString("vi-VN")}</strong></td><td>${badge}</td><td><div class="admin-row-actions"><button type="button" class="admin-customer-view" data-stock-adjust="${escapeHTML(product.id)}" ${!canAdjust ? "disabled title='Cần áp dụng migration tồn kho'" : ""}>Nhập / xuất</button><button type="button" class="admin-review-action" data-stock-history="${escapeHTML(product.id)}" ${!canAdjust ? "disabled title='Cần áp dụng migration tồn kho'" : ""}>Lịch sử</button></div></td></tr>`;
      }).join("");
      pagination.hidden = totalPages <= 1;
      pagination.innerHTML = totalPages <= 1 ? "" : `<button type="button" data-inventory-page="-1" ${page <= 1 ? "disabled" : ""}>Trang trước</button><span>Trang ${page} / ${totalPages}</span><button type="button" data-inventory-page="1" ${page >= totalPages ? "disabled" : ""}>Trang sau</button>`;
      showMessage(`${products.length ? `Có ${Number(result.pagination.total).toLocaleString("vi-VN")} sản phẩm · Trang ${page}/${totalPages}.` : "Không có sản phẩm phù hợp."}${canAdjust ? "" : " Lịch sử/điều chỉnh kho cần migration riêng."}`);
    } catch (error) {
      products = [];
      table.hidden = true;
      pagination.hidden = true;
      showMessage(error.message || "Không thể tải tồn kho.", true);
      if (error.status === 401) redirectToPortalLogin();
    } finally { loading = false; }
  }

  search.addEventListener("input", () => { clearTimeout(debounce); debounce = setTimeout(() => { page = 1; void load(); }, 250); });
  category.addEventListener("change", () => { page = 1; void load(); });
  status.addEventListener("change", () => { page = 1; void load(); });
  pagination.addEventListener("click", (event) => { const button = event.target.closest("[data-inventory-page]"); if (!button || button.disabled) return; page += Number(button.dataset.inventoryPage); void load(); });
  rows.addEventListener("click", async (event) => {
    const adjust = event.target.closest("[data-stock-adjust]");
    if (adjust) {
      selectedProduct = products.find((item) => String(item.id) === adjust.dataset.stockAdjust);
      if (!selectedProduct) return;
      document.querySelector("[data-inventory-product]").textContent = `${selectedProduct.name} · tồn hiện tại ${Number(selectedProduct.stock).toLocaleString("vi-VN")}`;
      form.reset(); formMessage.hidden = true; dialog.showModal(); return;
    }
    const historyButton = event.target.closest("[data-stock-history]");
    if (!historyButton) return;
    const historyMessage = document.querySelector("[data-inventory-history-message]");
    const historyContent = document.querySelector("[data-inventory-history-content]");
    historyMessage.textContent = "Đang tải lịch sử..."; historyContent.replaceChildren(); historyDialog.showModal();
    try {
      const result = await apiRequest(`/admin/inventory/${encodeURIComponent(historyButton.dataset.stockHistory)}/movements`, { headers });
      const movements = Array.isArray(result.data) ? result.data : [];
      historyMessage.textContent = movements.length ? `${movements.length} biến động gần nhất.` : "Chưa có lịch sử biến động.";
      historyContent.innerHTML = movements.length ? `<div class="admin-products-table-wrap"><table class="admin-products-table"><thead><tr><th>Thời gian</th><th>Loại</th><th>Số lượng</th><th>Tồn trước</th><th>Tồn sau</th><th>Người thực hiện</th><th>Ghi chú</th></tr></thead><tbody>${movements.map((item) => `<tr><td>${escapeHTML(new Date(item.created_at).toLocaleString("vi-VN"))}</td><td>${escapeHTML(MOVEMENT_LABELS[item.movement_type] || "Khác")}</td><td>${Number(item.quantity).toLocaleString("vi-VN")}</td><td>${Number(item.stock_before).toLocaleString("vi-VN")}</td><td>${Number(item.stock_after).toLocaleString("vi-VN")}</td><td>${escapeHTML(item.admin_name || "Hệ thống")}</td><td>${escapeHTML(item.note || "")}</td></tr>`).join("")}</tbody></table></div>` : "";
    } catch (error) { historyMessage.textContent = error.message || "Không thể tải lịch sử tồn kho."; }
  });
  document.querySelectorAll("[data-inventory-close], [data-inventory-history-close]").forEach((button) => button.addEventListener("click", () => button.closest("dialog")?.close()));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (loading || !selectedProduct || !form.reportValidity()) return;
    if (!window.confirm(`Ghi nhận ${form.elements.movement_type.value === "inbound" ? "nhập" : "xuất"} ${form.elements.quantity.value} sản phẩm cho “${selectedProduct.name}”?`)) return;
    loading = true; form.querySelector("[data-inventory-save]").disabled = true;
    try {
      const result = await apiRequest(`/admin/inventory/${encodeURIComponent(selectedProduct.id)}/movements`, { method: "POST", headers, body: JSON.stringify({ movement_type: form.elements.movement_type.value, quantity: Number(form.elements.quantity.value), note: form.elements.note.value.trim() }) });
      dialog.close(); loading = false; showMessage(result.message || "Đã cập nhật tồn kho."); await load();
    } catch (error) { formMessage.textContent = error.message || "Không thể cập nhật tồn kho."; formMessage.hidden = false; }
    finally { loading = false; form.querySelector("[data-inventory-save]").disabled = false; }
  });
  await load();
}
