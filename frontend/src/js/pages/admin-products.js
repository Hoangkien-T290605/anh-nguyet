import { apiRequest, getProductImageUrl } from "../services/api.js";
import { escapeHTML, formatPrice } from "../components/product-card.js";

const AUTH_KEY = "anh-nguyet-auth";
const PAGE_SIZE = 12;

function normalizeText(value = "") {
  return String(value)
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

function getProductId(product) {
  return String(product.id ?? product._id ?? "");
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
  } catch {
    return null;
  }
}

export async function mountAdminProducts() {
  const rowsNode = document.querySelector("[data-products-rows]");
  const tableWrap = document.querySelector("[data-products-table-wrap]");
  const message = document.querySelector("[data-products-message]");
  const categoryFilter = document.querySelector("[data-product-category]");
  const statusFilter = document.querySelector("[data-product-status]");
  const searchInput = document.querySelector("[data-product-search]");
  const pagination = document.querySelector("[data-products-pagination]");
  const dialog = document.querySelector("[data-product-dialog]");
  const form = document.querySelector("[data-product-form]");
  const formMessage = document.querySelector("[data-product-form-message]");
  const saveButton = document.querySelector("[data-product-save]");
  const previewImage = document.querySelector("[data-product-preview-image]");
  const previewEmpty = document.querySelector("[data-product-image-empty]");
  const session = readSession();
  if (!session?.token) {
    window.location.replace("admin-login.html?returnTo=admin-products.html");
    return;
  }

  let products = [];
  let currentPage = 1;
  let loading = false;
  let saving = false;
  const pendingAvailability = new Set();

  function showMessage(text, isError = false) {
    message.textContent = text;
    message.hidden = !text;
    message.setAttribute("role", isError ? "alert" : "status");
    message.classList.toggle("is-error", isError);
  }

  function getFilteredProducts() {
    const query = normalizeText(searchInput.value);
    const category = categoryFilter.value;
    const state = statusFilter.value;
    return products.filter((product) => {
      const productId = getProductId(product);
      const matchesQuery =
        !query ||
        normalizeText(product.name).includes(query) ||
        normalizeText(product.category).includes(query) ||
        normalizeText(productId).includes(query);
      const matchesCategory = !category || product.category === category;
      const matchesState =
        state === "all" ||
        (state === "active" && product.active !== false && product.active !== 0) ||
        (state === "inactive" && (product.active === false || product.active === 0));
      return matchesQuery && matchesCategory && matchesState;
    });
  }

  function renderCategories() {
    const selected = categoryFilter.value;
    const categories = [...new Set(products.map((product) => product.category).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "vi"));
    categoryFilter.innerHTML = `<option value="">Tất cả danh mục</option>${categories
      .map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`)
      .join("")}`;
    if (categories.includes(selected)) categoryFilter.value = selected;
    document.getElementById("admin-product-categories").innerHTML = categories
      .map((category) => `<option value="${escapeHTML(category)}"></option>`)
      .join("");
  }

  function bindImageFallbacks() {
    rowsNode.querySelectorAll("[data-admin-product-image]").forEach((image) => {
      image.addEventListener("error", () => {
        image.hidden = true;
        image.parentElement.querySelector("[data-admin-product-image-empty]").hidden = false;
      }, { once: true });
    });
  }

  function renderPagination(totalItems) {
    const pageCount = Math.ceil(totalItems / PAGE_SIZE);
    pagination.hidden = pageCount <= 1;
    if (pageCount <= 1) {
      pagination.innerHTML = "";
      return;
    }
    pagination.innerHTML = `
      <button type="button" data-page-step="-1" ${currentPage <= 1 ? "disabled" : ""}>Trang trước</button>
      <span>Trang ${currentPage} / ${pageCount} · ${totalItems} sản phẩm</span>
      <button type="button" data-page-step="1" ${currentPage >= pageCount ? "disabled" : ""}>Trang sau</button>`;
  }

  function render() {
    const filtered = getFilteredProducts();
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, pageCount);
    const firstIndex = (currentPage - 1) * PAGE_SIZE;
    const visible = filtered.slice(firstIndex, firstIndex + PAGE_SIZE);
    tableWrap.hidden = loading || visible.length === 0;
    if (!loading && products.length && visible.length === 0) {
      showMessage(filtered.length ? "Trang này không có sản phẩm." : "Không tìm thấy sản phẩm phù hợp.");
    } else if (!loading && !products.length) {
      showMessage("API chưa có sản phẩm để hiển thị.");
    } else if (!loading) {
      showMessage(`Đang hiển thị ${filtered.length} sản phẩm phù hợp.`);
    }

    rowsNode.innerHTML = visible.map((product) => {
      const id = getProductId(product);
      const image = getProductImageUrl(product.image);
      const active = product.active !== false && product.active !== 0;
      const busy = pendingAvailability.has(id);
      return `<tr>
        <td><div class="admin-product-table-image"><span data-admin-product-image-empty ${image ? "hidden" : ""}>❋</span>${image ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(product.name || "Sản phẩm")}" loading="lazy" data-admin-product-image />` : ""}</div></td>
        <td class="admin-product-id">#${escapeHTML(id)}</td>
        <td><strong class="admin-product-name">${escapeHTML(product.name || "(Chưa có tên)")}</strong><small class="admin-product-description">${escapeHTML(product.description || "")}</small></td>
        <td>${escapeHTML(product.category || "—")}</td>
        <td class="admin-product-price">${formatPrice(product.price)}</td>
        <td>${Number.isFinite(Number(product.stock)) ? Number(product.stock) : "—"}</td>
        <td><span class="admin-product-status ${active ? "is-active" : "is-inactive"}">${active ? "Đang kinh doanh" : "Ngừng kinh doanh"}</span>${product.featured ? '<small class="admin-product-featured">Nổi bật</small>' : ""}</td>
        <td><div class="admin-product-actions"><button type="button" data-edit-product="${escapeHTML(id)}">Sửa</button><button type="button" class="${active ? "is-danger" : ""}" data-toggle-product="${escapeHTML(id)}" ${busy ? "disabled" : ""}>${busy ? "Đang lưu..." : active ? "Ngừng kinh doanh" : "Kích hoạt"}</button></div></td>
      </tr>`;
    }).join("");
    bindImageFallbacks();
    renderPagination(filtered.length);
  }

  async function loadProducts() {
    loading = true;
    showMessage("Đang tải danh sách sản phẩm...");
    tableWrap.hidden = true;
    try {
      const result = await apiRequest("/products", {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!Array.isArray(result.data)) {
        throw new Error("Máy chủ trả về danh sách sản phẩm không hợp lệ.");
      }
      const seen = new Set();
      products = result.data.filter((product) => {
        if (!product || typeof product !== "object") return false;
        const id = getProductId(product);
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      renderCategories();
      loading = false;
      render();
    } catch (error) {
      loading = false;
      tableWrap.hidden = true;
      pagination.hidden = true;
      showMessage(error.message || "Không thể tải danh sách sản phẩm.", true);
    }
  }

  function updateImagePreview() {
    const value = String(form.elements.image.value || "").trim();
    const url = getProductImageUrl(value);
    previewImage.hidden = !url;
    previewEmpty.hidden = Boolean(url);
    previewEmpty.textContent = url ? "" : "Ảnh chưa được thiết lập";
    previewImage.removeAttribute("src");
    if (url) previewImage.src = url;
  }

  function openForm(product = null) {
    form.reset();
    formMessage.hidden = true;
    form.elements.id.value = product ? getProductId(product) : "";
    form.elements.name.value = product?.name || "";
    form.elements.category.value = product?.category || "";
    form.elements.price.value = product?.price ?? "";
    form.elements.stock.value = product?.stock ?? 0;
    form.elements.description.value = product?.description || "";
    form.elements.image.value = product?.image || "";
    form.elements.active.checked = product ? product.active !== false && product.active !== 0 : true;
    form.elements.featured.checked = product ? product.featured === true || product.featured === 1 : false;
    document.querySelector("[data-product-dialog-title]").textContent = product
      ? `Chỉnh sửa sản phẩm #${getProductId(product)}`
      : "Thêm sản phẩm";
    saveButton.textContent = product ? "Lưu thay đổi" : "Thêm sản phẩm";
    updateImagePreview();
    dialog.showModal();
    form.elements.name.focus();
  }

  async function saveProduct(event) {
    event.preventDefault();
    if (saving || !form.reportValidity()) return;
    const id = form.elements.id.value;
    const price = Number(form.elements.price.value);
    const stock = Number(form.elements.stock.value);
    if (!Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) {
      formMessage.textContent = "Giá phải là số không âm và tồn kho phải là số nguyên không âm.";
      formMessage.hidden = false;
      return;
    }
    const payload = {
      name: form.elements.name.value.trim(),
      description: form.elements.description.value,
      category: form.elements.category.value.trim(),
      price,
      stock,
      image: form.elements.image.value.trim(),
      active: form.elements.active.checked,
      featured: form.elements.featured.checked,
    };
    if (!payload.name || !payload.category) {
      formMessage.textContent = "Vui lòng nhập tên sản phẩm và danh mục.";
      formMessage.hidden = false;
      return;
    }

    saving = true;
    saveButton.disabled = true;
    saveButton.textContent = "Đang lưu...";
    form.setAttribute("aria-busy", "true");
    try {
      const result = await apiRequest(id ? `/products/${encodeURIComponent(id)}` : "/products", {
        method: id ? "PUT" : "POST",
        headers: { Authorization: `Bearer ${session.token}` },
        body: JSON.stringify(payload),
      });
      if (!result.data) throw new Error("Máy chủ chưa xác nhận sản phẩm đã được lưu.");
      if (id) {
        products = products.map((product) => getProductId(product) === id ? result.data : product);
      } else {
        products = [result.data, ...products];
      }
      renderCategories();
      currentPage = 1;
      dialog.close();
      render();
      showMessage(result.message || (id ? "Đã cập nhật sản phẩm." : "Đã thêm sản phẩm."));
    } catch (error) {
      formMessage.textContent = error.message || "Không thể lưu sản phẩm.";
      formMessage.hidden = false;
    } finally {
      saving = false;
      saveButton.disabled = false;
      saveButton.textContent = id ? "Lưu thay đổi" : "Thêm sản phẩm";
      form.removeAttribute("aria-busy");
    }
  }

  async function toggleAvailability(button) {
    const id = button.dataset.toggleProduct;
    const product = products.find((item) => getProductId(item) === id);
    if (!product || pendingAvailability.has(id)) return;
    const isActive = product.active !== false && product.active !== 0;
    const action = isActive ? "ngừng kinh doanh" : "kích hoạt lại";
    if (!window.confirm(`Bạn muốn ${action} sản phẩm “${product.name}”? Sản phẩm và dữ liệu liên quan sẽ được giữ nguyên.`)) return;
    pendingAvailability.add(id);
    button.disabled = true;
    button.textContent = "Đang lưu...";
    try {
      const result = await apiRequest(`/products/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ active: !isActive }),
      });
      if (!result.data) throw new Error("Máy chủ chưa xác nhận trạng thái sản phẩm.");
      products = products.map((item) => getProductId(item) === id ? result.data : item);
      render();
      showMessage(isActive ? "Đã ngừng kinh doanh sản phẩm." : "Đã kích hoạt sản phẩm.");
    } catch (error) {
      showMessage(error.message || "Không thể cập nhật trạng thái sản phẩm.", true);
      button.disabled = false;
    } finally {
      pendingAvailability.delete(id);
    }
  }

  document.querySelector("[data-product-add]").addEventListener("click", () => openForm());
  previewImage.addEventListener("error", () => {
    previewImage.hidden = true;
    previewEmpty.textContent = "Không tải được ảnh từ đường dẫn này.";
    previewEmpty.hidden = false;
  });
  document.querySelectorAll("[data-product-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  form.addEventListener("submit", saveProduct);
  form.elements.image.addEventListener("input", updateImagePreview);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  searchInput.addEventListener("input", () => { currentPage = 1; render(); });
  categoryFilter.addEventListener("change", () => { currentPage = 1; render(); });
  statusFilter.addEventListener("change", () => { currentPage = 1; render(); });
  pagination.addEventListener("click", (event) => {
    const button = event.target.closest("[data-page-step]");
    if (!button || button.disabled) return;
    currentPage += Number(button.dataset.pageStep);
    render();
  });
  rowsNode.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-product]");
    if (editButton) {
      const product = products.find((item) => getProductId(item) === editButton.dataset.editProduct);
      if (product) openForm(product);
      return;
    }
    const toggleButton = event.target.closest("[data-toggle-product]");
    if (toggleButton) void toggleAvailability(toggleButton);
  });

  await loadProducts();
}
