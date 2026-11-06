import { apiRequest, getProductImageUrl } from "../services/api.js";
import { addToCart } from "../services/cart.js";

const heroUrl = "./assets/header-panel.png";
const decorationUrl = "./assets/icon-trang-tri.png";
const iconBanh = "./assets/icon-banh.png";
const iconBotGao = "./assets/icon-bot-gao.png";
const iconDoUong = "./assets/icon-do-uong.png";
const iconMyPham = "./assets/icon-my-pham.png";
const iconHopQua = "./assets/icon-hop-qua.png";
const iconTatCa = "./assets/icon-tat-ca.png";

const categories = [
  { name: "Bánh", icon: iconBanh },
  { name: "Gạo, bột", icon: iconBotGao },
  { name: "Đồ uống", icon: iconDoUong },
  { name: "Mỹ phẩm", icon: iconMyPham },
  { name: "Sản phẩm khác", icon: iconHopQua },
  { name: "Tất cả", icon: iconTatCa },
];

let allProducts = [];
let activeCategory = "Tất cả";
let activeSearch = "";
let toastTimer;
const favoriteIds = new Set();

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function formatPrice(value) {
  return `${Number(value || 0).toLocaleString("vi-VN")}đ`;
}

function categorySymbol(category) {
  if (category === "Gạo, bột") return "▤";
  if (category === "Đồ uống") return "♧";
  if (category === "Mỹ phẩm") return "✿";
  if (category === "Sản phẩm khác") return "✳";
  return "❋";
}

function showToast(message) {
  const toast = document.getElementById("site-toast");
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 2500);
}

function renderCategories() {
  const grid = document.getElementById("category-grid");
  grid.innerHTML = categories.map((category) => `
    <button class="category-card ${activeCategory === category.name ? "selected" : ""}" type="button" data-category="${escapeHTML(category.name)}" aria-pressed="${activeCategory === category.name}">
      <img class="category-icon" src="${category.icon}" alt="" />
      <span class="category-name">${escapeHTML(category.name)}</span>
    </button>`).join("");
}

function productCard(product, index) {
  const id = String(product._id ?? product.id ?? "");
  const image = getProductImageUrl(product.image);
  const available = Number(product.stock) > 0;
  return `
    <article class="product-card" tabindex="0" role="link" data-product="${escapeHTML(id)}" aria-label="Xem chi tiết ${escapeHTML(product.name)}">
      <div class="product-image product-image-${index % 5}">
        ${image ? `<img class="product-photo" src="${escapeHTML(image)}" alt="${escapeHTML(product.name)}" loading="lazy" data-product-image />` : ""}
        <span class="product-placeholder" aria-hidden="true" ${image ? "hidden" : ""}>${categorySymbol(product.category)}</span>
        <span class="product-brand">ÁNH NGUYỆT</span>
        <button class="favorite-button ${favoriteIds.has(id) ? "is-favorite" : ""}" type="button" data-favorite="${escapeHTML(id)}" aria-label="${favoriteIds.has(id) ? "Bỏ yêu thích" : "Thêm vào yêu thích"}" aria-pressed="${favoriteIds.has(id)}">${favoriteIds.has(id) ? "♥" : "♡"}</button>
      </div>
      <div class="product-info">
        <h3>${escapeHTML(product.name)}</h3>
        <p class="product-detail">${escapeHTML(product.description || product.category || "")}</p>
        <strong class="product-price">${formatPrice(product.price)}</strong>
        <div class="product-rating"><span>${escapeHTML(product.category || "")}</span></div>
        <button class="add-button" type="button" data-add-cart="${escapeHTML(id)}" ${available ? "" : "disabled"}><span aria-hidden="true">🛒</span>${available ? "Thêm vào giỏ hàng" : "Tạm hết hàng"}</button>
      </div>
    </article>`;
}

function renderProducts() {
  const grid = document.getElementById("product-grid");
  const status = document.getElementById("product-status");
  const query = activeSearch.trim().toLocaleLowerCase("vi");
  const visible = allProducts.filter((product) => {
    const name = String(product.name || "").toLocaleLowerCase("vi");
    return (activeCategory === "Tất cả" || product.category === activeCategory)
      && name.includes(query)
      && product.active !== false
      && product.active !== 0;
  });

  if (!visible.length) {
    grid.hidden = true;
    status.hidden = false;
    status.textContent = allProducts.length ? "Không tìm thấy sản phẩm phù hợp." : "Chưa có sản phẩm để hiển thị.";
    return;
  }

  status.hidden = true;
  grid.hidden = false;
  grid.innerHTML = visible.map(productCard).join("");

  grid.querySelectorAll("[data-product-image]").forEach((image) => {
    image.addEventListener("error", () => {
      image.hidden = true;
      const placeholder = image.parentElement.querySelector(".product-placeholder");
      if (placeholder) placeholder.hidden = false;
    }, { once: true });
  });
}

function bindProductActions() {
  const grid = document.getElementById("product-grid");
  grid.addEventListener("click", (event) => {
    const addButton = event.target.closest("[data-add-cart]");
    if (addButton) {
      event.stopPropagation();
      const product = allProducts.find((item) => String(item._id ?? item.id) === addButton.dataset.addCart);
      if (!product) return;
      try {
        addToCart(product);
        showToast(`Đã thêm “${product.name}” vào giỏ hàng.`);
      } catch (error) {
        showToast(error.message);
      }
      return;
    }

    const favorite = event.target.closest("[data-favorite]");
    if (favorite) {
      event.stopPropagation();
      const id = favorite.dataset.favorite;
      if (favoriteIds.has(id)) {
        favoriteIds.delete(id);
        favorite.classList.remove("is-favorite");
        favorite.setAttribute("aria-label", "Thêm vào yêu thích");
        favorite.setAttribute("aria-pressed", "false");
        favorite.textContent = "♡";
        showToast("Đã bỏ sản phẩm khỏi danh sách yêu thích.");
      } else {
        favoriteIds.add(id);
        favorite.classList.add("is-favorite");
        favorite.setAttribute("aria-label", "Bỏ yêu thích");
        favorite.setAttribute("aria-pressed", "true");
        favorite.textContent = "♥";
        showToast("Đã thêm sản phẩm vào danh sách yêu thích.");
      }
      return;
    }

    const card = event.target.closest("[data-product]");
    if (card) window.location.href = `product-detail.html?id=${encodeURIComponent(card.dataset.product)}`;
  });

  grid.addEventListener("keydown", (event) => {
    if (event.target.closest("button")) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest("[data-product]");
    if (!card) return;
    event.preventDefault();
    window.location.href = `product-detail.html?id=${encodeURIComponent(card.dataset.product)}`;
  });
}

export async function mountHome() {
  document.querySelector("[data-hero]").src = heroUrl;
  document.querySelectorAll("[data-decoration]").forEach((image) => { image.src = decorationUrl; });
  renderCategories();
  bindProductActions();

  document.getElementById("category-grid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    activeCategory = button.dataset.category;
    renderCategories();
    renderProducts();
    document.getElementById("san-pham")?.scrollIntoView({ behavior: "smooth" });
  });

  document.querySelector("[data-search]")?.addEventListener("input", (event) => {
    activeSearch = event.target.value;
    renderProducts();
  });

  try {
    const result = await apiRequest("/products", { signal: AbortSignal.timeout(12000) });
    allProducts = Array.isArray(result.data) ? result.data : [];
    renderProducts();
  } catch (error) {
    const status = document.getElementById("product-status");
    status.hidden = false;
    status.setAttribute("role", "alert");
    status.textContent = `${error.message} Vui lòng kiểm tra backend và kết nối mạng.`;
    document.getElementById("product-grid").hidden = true;
  }
}
