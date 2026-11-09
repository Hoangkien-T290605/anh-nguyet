import { apiRequest } from "../services/api.js";
import { escapeHTML } from "../components/product-card.js";

const AUTH_KEY = "anh-nguyet-auth";

function normalizeText(value = "") {
  return String(value)
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
  } catch {
    return null;
  }
}

export async function mountAdminCategories() {
  const search = document.querySelector("[data-category-search]");
  const message = document.querySelector("[data-category-message]");
  const tableWrap = document.querySelector("[data-category-table-wrap]");
  const rows = document.querySelector("[data-category-rows]");
  const session = readSession();

  if (!session?.token) {
    window.location.replace("admin-login.html?returnTo=admin-categories.html");
    return;
  }

  let categories = [];
  let loading = true;
  let loadError = "";

  function showMessage(text, isError = false) {
    message.textContent = text;
    message.hidden = !text;
    message.setAttribute("role", isError ? "alert" : "status");
    message.classList.toggle("is-error", isError);
  }

  function render() {
    const query = normalizeText(search.value);
    const visible = categories.filter((category) => normalizeText(category.name).includes(query));
    tableWrap.hidden = loading || visible.length === 0;

    rows.innerHTML = visible.map((category) => `
      <tr>
        <td><strong class="admin-category-name">${escapeHTML(category.name)}</strong></td>
        <td>${category.productCount}</td>
        <td>${category.activeCount}</td>
      </tr>`).join("");

    if (loading) return;
    if (loadError) {
      showMessage(loadError, true);
    } else if (!categories.length) {
      showMessage("Chưa có danh mục nào trong dữ liệu sản phẩm.");
    } else if (!visible.length) {
      showMessage("Không tìm thấy danh mục phù hợp.");
    } else {
      showMessage(`Đang hiển thị ${visible.length} / ${categories.length} danh mục.`);
    }
  }

  search.addEventListener("input", render);

  try {
    const result = await apiRequest("/products", {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    if (!Array.isArray(result.data)) {
      throw new Error("Máy chủ trả về danh sách sản phẩm không hợp lệ.");
    }

    const grouped = new Map();
    for (const product of result.data) {
      if (!product || typeof product !== "object") continue;
      const name = typeof product.category === "string" ? product.category.trim() : "";
      if (!name) continue;
      const group = grouped.get(name) || { name, productCount: 0, activeCount: 0 };
      group.productCount += 1;
      if (product.active !== false && product.active !== 0) group.activeCount += 1;
      grouped.set(name, group);
    }

    categories = [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, "vi"));
  } catch (error) {
    loadError = error.message || "Không thể tải danh mục từ máy chủ.";
  } finally {
    loading = false;
    render();
  }
}
