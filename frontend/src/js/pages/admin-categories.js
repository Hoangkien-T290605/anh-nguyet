import { apiRequest } from "../services/api.js";
import { escapeHTML } from "../components/product-card.js";

const AUTH_KEY = "anh-nguyet-auth";
function readToken() { try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null")?.token || ""; } catch { return ""; } }

export async function mountAdminCategories() {
  const token = readToken();
  const search = document.querySelector("[data-category-search]");
  const message = document.querySelector("[data-category-message]");
  const table = document.querySelector("[data-category-table-wrap]");
  const rows = document.querySelector("[data-category-rows]");
  const dialog = document.querySelector("[data-category-dialog]");
  const form = document.querySelector("[data-category-form]");
  const formMessage = document.querySelector("[data-category-form-message]");
  const headers = { Authorization: `Bearer ${token}` };
  let categories = [];
  let loading = false;
  let saving = false;
  let managementEnabled = false;
  let debounce;

  function show(text, error = false) { message.textContent = text; message.hidden = !text; message.classList.toggle("is-error", error); message.setAttribute("role", error ? "alert" : "status"); }
  function render() {
    table.hidden = categories.length === 0;
    rows.innerHTML = categories.map((item) => `<tr><td><strong class="admin-category-name">${escapeHTML(item.name)}</strong></td><td>${escapeHTML(item.description || "—")}</td><td>${Number(item.product_count || 0).toLocaleString("vi-VN")}</td><td>${Number(item.active_product_count || 0).toLocaleString("vi-VN")}</td><td><div class="admin-row-actions"><button type="button" class="admin-customer-view" data-category-edit="${escapeHTML(item.id)}" ${!managementEnabled ? "disabled" : ""}>Sửa</button><button type="button" class="admin-review-action" data-category-delete="${escapeHTML(item.id)}" ${!managementEnabled || Number(item.product_count) ? "disabled" : ""} title="Danh mục phải không còn sản phẩm trước khi xóa">Xóa</button></div></td></tr>`).join("");
  }
  async function load() {
    if (loading) return;
    loading = true; show("Đang tải danh mục...");
    try {
      const query = new URLSearchParams({ page: "1", limit: "100", q: search.value.trim() });
      const result = await apiRequest(`/admin/categories?${query}`, { headers });
      categories = Array.isArray(result.data) ? result.data : [];
      managementEnabled = result.management_enabled === true;
      document.querySelector("[data-category-add]").hidden = !managementEnabled;
      render();
      show(!managementEnabled ? "Danh sách được tổng hợp từ sản phẩm. Cần áp dụng migration danh mục trước khi thêm, sửa hoặc xóa." : categories.length ? `Đang hiển thị ${categories.length} / ${Number(result.pagination?.total || categories.length)} danh mục.` : "Không có danh mục phù hợp.");
    } catch (error) {
      categories = []; render(); show(error.message || "Không thể tải danh mục.", true);
      if (error.status === 401) window.location.replace("admin-login.html?session=expired&returnTo=admin-categories.html");
    } finally { loading = false; }
  }
  function openForm(category = null) {
    form.reset(); form.elements.id.value = category?.id || ""; form.elements.name.value = category?.name || ""; form.elements.description.value = category?.description || "";
    document.querySelector("[data-category-dialog-title]").textContent = category ? "Chỉnh sửa danh mục" : "Thêm danh mục";
    formMessage.hidden = true; formMessage.textContent = ""; dialog.showModal();
  }
  document.querySelector("[data-category-add]").addEventListener("click", () => openForm());
  document.querySelectorAll("[data-category-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  search.addEventListener("input", () => { clearTimeout(debounce); debounce = setTimeout(() => void load(), 250); });
  rows.addEventListener("click", async (event) => {
    const edit = event.target.closest("[data-category-edit]");
    if (edit) { const item = categories.find((category) => String(category.id) === edit.dataset.categoryEdit); if (item) openForm(item); return; }
    const remove = event.target.closest("[data-category-delete]");
    if (!remove || loading) return;
    const item = categories.find((category) => String(category.id) === remove.dataset.categoryDelete);
    if (!item || !window.confirm(`Xóa danh mục “${item.name}”? Backend sẽ từ chối nếu còn sản phẩm thuộc danh mục này.`)) return;
    loading = true;
    try { const result = await apiRequest(`/admin/categories/${encodeURIComponent(item.id)}`, { method: "DELETE", headers }); loading = false; show(result.message || "Đã xóa danh mục."); await load(); }
    catch (error) { show(error.message || "Không thể xóa danh mục.", true); }
    finally { loading = false; }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); if (saving || !form.reportValidity()) return;
    const id = form.elements.id.value;
    const body = { name: form.elements.name.value.trim(), description: form.elements.description.value.trim() };
    saving = true; form.querySelector("[data-category-save]").disabled = true;
    try { const result = await apiRequest(id ? `/admin/categories/${encodeURIComponent(id)}` : "/admin/categories", { method: id ? "PUT" : "POST", headers, body: JSON.stringify(body) }); dialog.close(); show(result.message || "Đã lưu danh mục."); await load(); }
    catch (error) { formMessage.textContent = error.message || "Không thể lưu danh mục."; formMessage.hidden = false; }
    finally { saving = false; form.querySelector("[data-category-save]").disabled = false; }
  });
  await load();
}
