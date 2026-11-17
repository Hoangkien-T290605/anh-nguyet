import { API_BASE_URL, apiRequest, getProductImageUrl } from "../services/api.js";
import { escapeHTML, formatPrice } from "../components/product-card.js";

const AUTH_KEY = "anh-nguyet-auth";
const PAGE_SIZE = 12;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

function uploadProductGallery(productId, files, token, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${API_BASE_URL}/products/${encodeURIComponent(productId)}/images`);
    request.timeout = 60000;
    request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("load", () => {
      let result;
      try {
        result = JSON.parse(request.responseText);
      } catch {
        reject(new Error("Backend trả về dữ liệu tải ảnh không hợp lệ."));
        return;
      }
      if (request.status < 200 || request.status >= 300 || result?.success !== true) {
        const error = new Error(result?.message || `Không thể tải ảnh (${request.status}).`);
        error.status = request.status;
        reject(error);
        return;
      }
      if (!Array.isArray(result.data)) {
        reject(new Error("Backend xác nhận tải ảnh nhưng dữ liệu gallery không hợp lệ."));
        return;
      }
      resolve(result);
    });
    request.addEventListener("error", () => reject(new Error("Không thể kết nối máy chủ để tải ảnh.")));
    request.addEventListener("timeout", () => reject(new Error("Tải ảnh quá thời gian chờ.")));
    request.addEventListener("abort", () => reject(new Error("Đã hủy tải ảnh.")));
    const body = new FormData();
    files.forEach((file) => body.append("images", file));
    request.send(body);
  });
}

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

function parseProductDetails(productDetails) {
  if (typeof productDetails === "string") {
    try { productDetails = JSON.parse(productDetails); } catch { return {}; }
  }
  return productDetails && typeof productDetails === "object" && !Array.isArray(productDetails)
    ? productDetails
    : {};
}

function collectProductDetails(form) {
  const details = {};
  form.querySelectorAll("[data-product-detail-key]").forEach((input) => {
    const value = input.value.trim();
    if (value) details[input.dataset.productDetailKey] = value;
  });
  const specificationText = form.querySelector("[data-product-detail-specifications]").value;
  if (specificationText.trim()) {
    const specifications = {};
    for (const [index, line] of specificationText.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      const separator = line.indexOf(":");
      if (separator < 1 || !line.slice(separator + 1).trim()) {
        return { details: null, error: `Thông số ở dòng ${index + 1} cần có dạng “Tên: Giá trị”.` };
      }
      const name = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      if (name.length > 80 || value.length > 500 || Object.hasOwn(specifications, name)) {
        return { details: null, error: `Tên thông số tối đa 80 ký tự, giá trị tối đa 500 ký tự và không được trùng.` };
      }
      specifications[name] = value;
    }
    if (Object.keys(specifications).length > 30) {
      return { details: null, error: "Tối đa 30 thông số bổ sung." };
    }
    details.specifications = specifications;
  }
  return { details, error: "" };
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
  const galleryFileInput = document.querySelector("[data-product-gallery-files]");
  const galleryPreview = document.querySelector("[data-product-gallery-preview]");
  const galleryEmpty = document.querySelector("[data-product-gallery-empty]");
  const galleryList = document.querySelector("[data-product-gallery-list]");
  const galleryNote = document.querySelector("[data-product-gallery-note]");
  const coverImage = document.querySelector("[data-product-cover-image]");
  const coverEmpty = document.querySelector("[data-product-cover-empty]");
  const coverFileInput = document.querySelector("[data-product-cover-file]");
  const coverCancelButton = document.querySelector("[data-product-cover-cancel]");
  const coverCaption = document.querySelector("[data-product-cover-caption]");
  const session = readSession();
  if (!session?.token) {
    window.location.replace("admin-login.html?returnTo=admin-products.html");
    return;
  }

  let products = [];
  let managedCategories = [];
  let currentPage = 1;
  let loading = false;
  let saving = false;
  const pendingAvailability = new Set();
  const pendingDeletion = new Set();
  let previewObjectUrls = [];
  let coverPreviewObjectUrl = "";
  let originalCoverPath = "";
  let currentGallery = [];
  let galleryBusy = false;

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
    const categories = [...new Set([...products.map((product) => product.category), ...managedCategories].filter(Boolean))]
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
      const deleting = pendingDeletion.has(id);
      return `<tr>
        <td><div class="admin-product-table-image"><span data-admin-product-image-empty ${image ? "hidden" : ""}>❋</span>${image ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(product.name || "Sản phẩm")}" loading="lazy" data-admin-product-image />` : ""}</div></td>
        <td class="admin-product-id">#${escapeHTML(id)}</td>
        <td><strong class="admin-product-name">${escapeHTML(product.name || "(Chưa có tên)")}</strong><small class="admin-product-description">${escapeHTML(product.description || "")}</small></td>
        <td>${escapeHTML(product.category || "—")}</td>
        <td class="admin-product-price">${formatPrice(product.price)}</td>
        <td>${Number.isFinite(Number(product.stock)) ? Number(product.stock) : "—"}</td>
        <td><span class="admin-product-status ${active ? "is-active" : "is-inactive"}">${active ? "Đang kinh doanh" : "Ngừng kinh doanh"}</span>${product.featured ? '<small class="admin-product-featured">Nổi bật</small>' : ""}</td>
        <td><div class="admin-product-actions"><button type="button" data-edit-product="${escapeHTML(id)}" ${busy || deleting ? "disabled" : ""}>Sửa</button><button type="button" class="${active ? "is-danger" : ""}" data-toggle-product="${escapeHTML(id)}" ${busy || deleting ? "disabled" : ""}>${busy ? "Đang lưu..." : active ? "Ngừng kinh doanh" : "Kích hoạt"}</button><button type="button" class="is-danger" data-delete-product="${escapeHTML(id)}" ${busy || deleting ? "disabled" : ""}>${deleting ? "Đang xóa..." : "Xóa"}</button></div></td>
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
      try {
        const categoryResult = await apiRequest("/admin/categories?page=1&limit=100", {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        managedCategories = Array.isArray(categoryResult.data)
          ? categoryResult.data.map((category) => category.name).filter(Boolean)
          : [];
      } catch (categoryError) {
        managedCategories = [];
        if (categoryError.status === 401) {
          window.location.replace("admin-login.html?session=expired&returnTo=admin-products.html");
          return;
        }
      }
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

  function clearGalleryPreviews() {
    previewObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    previewObjectUrls = [];
    galleryPreview.replaceChildren();
    galleryEmpty.hidden = false;
  }

  function releaseCoverPreview() {
    if (coverPreviewObjectUrl) URL.revokeObjectURL(coverPreviewObjectUrl);
    coverPreviewObjectUrl = "";
  }

  function renderCoverPreview() {
    releaseCoverPreview();
    const selectedFile = coverFileInput.files?.[0];
    let coverUrl = getProductImageUrl(form.elements.image.value.trim());
    if (selectedFile) {
      coverPreviewObjectUrl = URL.createObjectURL(selectedFile);
      coverUrl = coverPreviewObjectUrl;
    }
    coverImage.hidden = !coverUrl;
    coverEmpty.hidden = Boolean(coverUrl);
    coverImage.alt = selectedFile ? `Xem trước ảnh bìa ${selectedFile.name}` : "Ảnh bìa sản phẩm";
    if (coverUrl) coverImage.src = coverUrl;
    coverImage.onerror = () => {
      coverImage.hidden = true;
      coverEmpty.hidden = false;
      coverEmpty.textContent = coverUrl ? "Không tải được ảnh xem trước" : "Chưa có ảnh bìa";
    };
    coverImage.onload = () => {
      coverImage.hidden = false;
      coverEmpty.hidden = true;
      coverEmpty.textContent = "Chưa có ảnh bìa";
    };
    coverCaption.textContent = selectedFile
      ? `Ảnh mới đã chọn: ${selectedFile.name}. Ảnh sẽ được tải lên khi lưu sản phẩm.`
      : "Ảnh chính hiện tại · ảnh tham khảo được lưu riêng và không ghi đè ảnh chính.";
  }

  function renderGallery() {
    galleryNote.classList.remove("is-error");
    const coverUrl = getProductImageUrl(form.elements.image.value);
    renderCoverPreview();
    galleryList.innerHTML = currentGallery.length
      ? currentGallery.map((image, index) => {
        const url = getProductImageUrl(image.image_url || image.url);
        const id = image.id == null ? "" : String(image.id);
        const isCoverCopy = url === coverUrl;
        const label = isCoverCopy ? "Ảnh bìa hiện tại (bản ghi cũ)" : index === 0 ? "Ảnh tham khảo đầu danh sách" : `Ảnh tham khảo ${index + 1}`;
        return `<article class="admin-product-gallery-item" data-gallery-item="${escapeHTML(id)}"><img src="${escapeHTML(url)}" alt="Ảnh tham khảo sản phẩm ${index + 1}" loading="lazy"><div><strong>${label}</strong><div class="admin-product-gallery-actions">${id ? `<button type="button" data-gallery-primary="${escapeHTML(id)}" ${galleryBusy || index === 0 ? "disabled" : ""}>Đưa lên đầu</button><button type="button" data-gallery-up="${escapeHTML(id)}" ${galleryBusy || index === 0 ? "disabled" : ""}>Lên</button><button type="button" data-gallery-down="${escapeHTML(id)}" ${galleryBusy || index === currentGallery.length - 1 ? "disabled" : ""}>Xuống</button><button class="is-danger" type="button" data-gallery-delete="${escapeHTML(id)}" ${galleryBusy ? "disabled" : ""}>Gỡ khỏi danh sách</button>` : "Ảnh hiện tại"}</div></div></article>`;
      }).join("")
      : '<span>Chưa có ảnh trong thư viện.</span>';
    galleryList.querySelectorAll("img").forEach((image) => image.addEventListener("error", () => {
      const placeholder = document.createElement("span");
      placeholder.className = "admin-product-gallery-image-error";
      placeholder.textContent = "Không tải được ảnh";
      image.replaceWith(placeholder);
    }, { once: true }));
    galleryNote.textContent = "Ảnh bìa được giữ riêng trong thông tin sản phẩm. Danh sách này chỉ lưu ảnh tham khảo; thay đổi thứ tự không đổi ảnh bìa.";
  }

  function syncCoverFromProduct() {
    const productId = form.elements.id.value;
    if (productId) {
      const product = products.find((item) => getProductId(item) === productId);
      if (product) form.elements.image.value = product.image || "";
    }
    renderGallery();
  }

  async function loadGallery(productId) {
    currentGallery = [];
    if (!productId) { renderGallery(); return; }
    try {
      const result = await apiRequest(`/products/${encodeURIComponent(productId)}/images`);
      currentGallery = Array.isArray(result.data) ? result.data : [];
      renderGallery();
    } catch (error) {
      galleryNote.textContent = error.message || "Không thể tải thư viện ảnh.";
      galleryNote.classList.add("is-error");
    }
  }

  async function openForm(product = null) {
    clearGalleryPreviews();
    releaseCoverPreview();
    coverFileInput.value = "";
    form.reset();
    galleryNote.classList.remove("is-error");
    formMessage.hidden = true;
    form.elements.id.value = product ? getProductId(product) : "";
    form.elements.name.value = product?.name || "";
    form.elements.category.value = product?.category || "";
    form.elements.price.value = product?.price ?? "";
    form.elements.stock.value = product?.stock ?? 0;
    form.elements.description.value = product?.description || "";
    form.elements.image.value = product?.image || "";
    originalCoverPath = product?.image || "";
    const details = parseProductDetails(product?.product_details);
    form.querySelectorAll("[data-product-detail-key]").forEach((input) => {
      input.value = typeof details[input.dataset.productDetailKey] === "string"
        ? details[input.dataset.productDetailKey]
        : "";
    });
    form.querySelector("[data-product-detail-specifications]").value = Object.entries(details.specifications || {})
      .map(([name, value]) => `${name}: ${value}`)
      .join("\n");
    form.elements.active.checked = product ? product.active !== false && product.active !== 0 : true;
    form.elements.featured.checked = product ? product.featured === true || product.featured === 1 : false;
    document.querySelector("[data-product-dialog-title]").textContent = product
      ? `Chỉnh sửa sản phẩm #${getProductId(product)}`
      : "Thêm sản phẩm";
    saveButton.textContent = product ? "Lưu thay đổi" : "Thêm sản phẩm";
    await loadGallery(product ? getProductId(product) : "");
    dialog.showModal();
    form.elements.name.focus();
  }

  async function saveProduct(event) {
    event.preventDefault();
    if (saving || !form.reportValidity()) return;
    const id = form.elements.id.value;
    const price = Number(form.elements.price.value);
    if (!Number.isFinite(price) || price < 0) {
      formMessage.textContent = "Giá phải là số không âm.";
      formMessage.hidden = false;
      return;
    }
    const selectedImages = Array.from(galleryFileInput.files || []);
    if (selectedImages.some((file) => {
      const extension = file.name.split(".").pop()?.toLowerCase() || "";
      return !ALLOWED_IMAGE_TYPES.has(file.type) || !ALLOWED_IMAGE_EXTENSIONS.has(extension) || file.size <= 0 || file.size > MAX_IMAGE_SIZE;
    })) {
      formMessage.textContent = "Mỗi ảnh phải là JPG, PNG, WEBP hoặc GIF và không vượt quá 5 MB.";
      formMessage.hidden = false;
      return;
    }
    const detailResult = collectProductDetails(form);
    if (detailResult.error) {
      formMessage.textContent = detailResult.error;
      formMessage.hidden = false;
      return;
    }
    const payload = {
      name: form.elements.name.value.trim(),
      description: form.elements.description.value,
      category: form.elements.category.value.trim(),
      price,
      image: form.elements.image.value.trim(),
      active: form.elements.active.checked,
      featured: form.elements.featured.checked,
    };
    const currentProduct = id ? products.find((product) => getProductId(product) === id) : null;
    if (Object.keys(detailResult.details).length || currentProduct?.product_details) {
      payload.product_details = detailResult.details;
    }
    if (!payload.name || !payload.category) {
      formMessage.textContent = "Vui lòng nhập tên sản phẩm và danh mục.";
      formMessage.hidden = false;
      return;
    }

    saving = true;
    saveButton.disabled = true;
    saveButton.textContent = "Đang lưu...";
    form.setAttribute("aria-busy", "true");
    let savedSuccessfully = false;
    try {
      let body = JSON.stringify(payload);
      const coverFile = coverFileInput.files?.[0];
      if (coverFile) {
        const extension = coverFile.name.split(".").pop()?.toLowerCase() || "";
        if (!ALLOWED_IMAGE_TYPES.has(coverFile.type) || !ALLOWED_IMAGE_EXTENSIONS.has(extension) || coverFile.size <= 0 || coverFile.size > MAX_IMAGE_SIZE) {
          throw new Error("Ảnh bìa phải là JPG, JPEG, PNG, WEBP hoặc GIF và không vượt quá 5 MB.");
        }
        const formData = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
          const fieldValue = key === "image" ? "" : key === "product_details" ? JSON.stringify(value) : String(value);
          formData.append(key, fieldValue);
        });
        formData.append("coverImage", coverFile);
        body = formData;
      }
      const result = await apiRequest(id ? `/products/${encodeURIComponent(id)}` : "/products", {
        method: id ? "PUT" : "POST",
        headers: { Authorization: `Bearer ${session.token}` },
        body,
      });
      if (!result.data) throw new Error("Máy chủ chưa xác nhận sản phẩm đã được lưu.");
      savedSuccessfully = true;
      const savedId = getProductId(result.data);
      form.elements.id.value = savedId;
      if (id) {
        products = products.map((product) => getProductId(product) === id ? result.data : product);
      } else {
        products = [result.data, ...products];
      }
      if (selectedImages.length) {
        galleryNote.textContent = `Đang tải ${selectedImages.length} ảnh lên máy chủ: 0%`;
        galleryNote.classList.remove("is-error");
        await uploadProductGallery(savedId, selectedImages, session.token, (percent) => {
          galleryNote.textContent = `Đang tải ${selectedImages.length} ảnh lên máy chủ: ${percent}%`;
        });
        await loadGallery(savedId);
        syncCoverFromProduct();
        galleryFileInput.value = "";
        clearGalleryPreviews();
      }
      coverFileInput.value = "";
      originalCoverPath = result.data.image || "";
      releaseCoverPreview();
      renderCategories();
      currentPage = 1;
      clearGalleryPreviews();
      dialog.close();
      render();
      showMessage(result.message || (id ? "Đã cập nhật sản phẩm." : "Đã thêm sản phẩm."));
    } catch (error) {
      if (error.status === 401) {
        window.location.replace("admin-login.html?session=expired&returnTo=admin-products.html");
        return;
      }
      formMessage.textContent = `${error.message || "Không thể lưu sản phẩm."}${savedSuccessfully ? " Sản phẩm đã được lưu; hãy thử tải ảnh lại khi chỉnh sửa." : ""}`;
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
    if (!product || pendingAvailability.has(id) || pendingDeletion.has(id)) return;
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

  async function deleteProduct(button) {
    const id = button.dataset.deleteProduct;
    const product = products.find((item) => getProductId(item) === id);
    if (!product || pendingDeletion.has(id) || pendingAvailability.has(id)) return;
    if (!window.confirm(`Xác nhận xóa sản phẩm “${product.name}” (mã #${id})? Nếu dữ liệu liên quan đang tham chiếu sản phẩm, Backend sẽ từ chối thao tác.`)) return;

    pendingDeletion.add(id);
    render();
    let feedback = "";
    let feedbackIsError = false;
    try {
      const result = await apiRequest(`/products/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (result.success !== true) throw new Error("Máy chủ chưa xác nhận đã xóa sản phẩm.");
      products = products.filter((item) => getProductId(item) !== id);
      renderCategories();
      const pageCount = Math.max(1, Math.ceil(getFilteredProducts().length / PAGE_SIZE));
      currentPage = Math.min(currentPage, pageCount);
      feedback = result.message || "Đã xóa sản phẩm.";
    } catch (error) {
      if (error.status === 404) {
        products = products.filter((item) => getProductId(item) !== id);
        renderCategories();
        currentPage = Math.min(currentPage, Math.max(1, Math.ceil(getFilteredProducts().length / PAGE_SIZE)));
      }
      feedback = error.message || "Không thể xóa sản phẩm.";
      feedbackIsError = true;
    } finally {
      pendingDeletion.delete(id);
      render();
      if (feedback) showMessage(feedback, feedbackIsError);
    }
  }

  document.querySelector("[data-product-add]").addEventListener("click", () => openForm());
  form.elements.image.addEventListener("input", () => {
    coverFileInput.value = "";
    renderCoverPreview();
  });
  coverFileInput.addEventListener("change", () => {
    const file = coverFileInput.files?.[0];
    if (file) {
      const extension = file.name.split(".").pop()?.toLowerCase() || "";
      if (!ALLOWED_IMAGE_TYPES.has(file.type) || !ALLOWED_IMAGE_EXTENSIONS.has(extension) || file.size <= 0 || file.size > MAX_IMAGE_SIZE) {
        coverFileInput.value = "";
        formMessage.textContent = "Ảnh bìa phải là JPG, JPEG, PNG, WEBP hoặc GIF và không vượt quá 5 MB.";
        formMessage.hidden = false;
        renderCoverPreview();
        return;
      }
    }
    formMessage.hidden = true;
    renderCoverPreview();
  });
  coverCancelButton.addEventListener("click", () => {
    releaseCoverPreview();
    coverFileInput.value = "";
    form.elements.image.value = originalCoverPath;
    renderCoverPreview();
  });
  galleryFileInput.addEventListener("change", () => {
    clearGalleryPreviews();
    const files = Array.from(galleryFileInput.files || []);
    if (!files.length) return;
    if (files.length > 10 || files.some((file) => {
      const extension = file.name.split(".").pop()?.toLowerCase() || "";
      return !ALLOWED_IMAGE_TYPES.has(file.type) || !ALLOWED_IMAGE_EXTENSIONS.has(extension) || file.size <= 0 || file.size > MAX_IMAGE_SIZE;
    })) {
      galleryFileInput.value = "";
      formMessage.textContent = "Chọn tối đa 10 ảnh JPG, PNG, WEBP hoặc GIF, mỗi ảnh không quá 5 MB.";
      formMessage.hidden = false;
      return;
    }
    formMessage.hidden = true;
    galleryEmpty.hidden = true;
    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      previewObjectUrls.push(url);
      const item = document.createElement("figure");
      const image = document.createElement("img");
      const caption = document.createElement("figcaption");
      image.src = url;
      image.alt = `Xem trước ${file.name}`;
      caption.textContent = file.name;
      item.append(image, caption);
      galleryPreview.append(item);
    });
  });
  document.querySelectorAll("[data-product-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  form.addEventListener("submit", saveProduct);
  dialog.addEventListener("close", () => {
    clearGalleryPreviews();
    releaseCoverPreview();
  });
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
    const deleteButton = event.target.closest("[data-delete-product]");
    if (deleteButton) void deleteProduct(deleteButton);
  });

  galleryList.addEventListener("click", async (event) => {
    if (galleryBusy) return;
    const remove = event.target.closest("[data-gallery-delete]");
    const primary = event.target.closest("[data-gallery-primary]");
    const up = event.target.closest("[data-gallery-up]");
    const down = event.target.closest("[data-gallery-down]");
    if (remove) {
      const target = currentGallery.find((image) => String(image.id) === remove.dataset.galleryDelete);
      if (!target || !window.confirm("Xóa ảnh này khỏi thư viện sản phẩm?")) return;
      galleryBusy = true;
      renderGallery();
      let operationError = "";
      try {
        const result = await apiRequest(`/products/${encodeURIComponent(form.elements.id.value)}/images/${encodeURIComponent(target.id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${session.token}` } });
        currentGallery = result.data || [];
        renderGallery();
        syncCoverFromProduct();
      } catch (error) { operationError = error.message || "Không thể xóa ảnh."; }
      finally {
        galleryBusy = false;
        renderGallery();
        if (operationError) { galleryNote.textContent = operationError; galleryNote.classList.add("is-error"); }
      }
      return;
    }
    const control = primary || up || down;
    if (!control) return;
    const index = currentGallery.findIndex((image) => String(image.id) === control.dataset.galleryPrimary || String(image.id) === control.dataset.galleryUp || String(image.id) === control.dataset.galleryDown);
    if (index < 0) return;
    const targetIndex = primary ? 0 : up ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentGallery.length) return;
    const reordered = [...currentGallery];
    const [item] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, item);
    galleryBusy = true;
    renderGallery();
    let operationError = "";
    try {
      const result = await apiRequest(`/products/${encodeURIComponent(form.elements.id.value)}/images/order`, { method: "PUT", headers: { Authorization: `Bearer ${session.token}` }, body: JSON.stringify({ image_ids: reordered.map((image) => Number(image.id)) }) });
      currentGallery = result.data || [];
      renderGallery();
      syncCoverFromProduct();
    } catch (error) { operationError = error.message || "Không thể sắp xếp ảnh."; }
    finally {
      galleryBusy = false;
      renderGallery();
      if (operationError) { galleryNote.textContent = operationError; galleryNote.classList.add("is-error"); }
    }
  });

  await loadProducts();
}
