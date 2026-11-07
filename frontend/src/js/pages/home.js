// Trang chủ tải danh mục và sản phẩm nổi bật từ Backend.
import { apiRequest, getProductImageUrl } from "../services/api.js";
import { addToCart } from "../services/cart.js";

const heroImageUrl = "./assets/header-panel.png";
const decorationUrl = "./assets/icon-decoration.png";
const breadIconUrl = "./assets/icon-banh.png";
const riceFlourIconUrl = "./assets/icon-rice-flour.png";
const drinksIconUrl = "./assets/icon-drinks.png";
const cosmeticsIconUrl = "./assets/icon-cosmetics.png";
const giftsIconUrl = "./assets/icon-gifts.png";
const allIconUrl = "./assets/icon-all.png";

const categories = [
  { name: "Bánh", icon: breadIconUrl },
  { name: "Gạo, bột", icon: riceFlourIconUrl },
  { name: "Đồ uống", icon: drinksIconUrl },
  { name: "Mỹ phẩm", icon: cosmeticsIconUrl },
  { name: "Sản phẩm khác", icon: giftsIconUrl },
  { name: "Tất cả", icon: allIconUrl },
];

let allProducts = [];
let selectedCategory = "Tất cả";
let searchTerm = "";
let toastTimer;
const favoriteIds = new Set();

// Mã hóa dữ liệu hiển thị để giữ an toàn cấu trúc HTML.
function escapeHTML(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

// Hiển thị giá theo định dạng tiền tệ Việt Nam.
function formatPrice(value) {
  return `${Number(value || 0).toLocaleString("vi-VN")}đ`;
}

// Chọn biểu tượng theo nhóm sản phẩm.
function categorySymbol(category) {
  if (category === "Gạo, bột") return "▤";
  if (category === "Đồ uống") return "♧";
  if (category === "Mỹ phẩm") return "✿";
  if (category === "Sản phẩm khác") return "✳";
  return "❋";
}

// Hiển thị thông báo ngắn sau thao tác của khách hàng.
function showToast(message) {
  const toast = document.getElementById("page-toast-notification");
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 2500);
}

// Dựng các thẻ danh mục từ danh sách cấu hình giao diện.
function renderCategories() {
  const grid = document.getElementById("category-grid");
  grid.innerHTML = categories
    .map(
      (category) => `
    <button class="category-card ${selectedCategory === category.name ? "selected" : ""}" type="button" data-category="${escapeHTML(category.name)}" aria-pressed="${selectedCategory === category.name}">
      <img class="category-icon" src="${category.icon}" alt="" />
      <span class="category-name">${escapeHTML(category.name)}</span>
    </button>`,
    )
    .join("");
}

// Tạo thẻ sản phẩm trang chủ theo cấu trúc dùng chung.
function createProductCard(product, index) {
  const id = String(product._id ?? product.id ?? "");
  const image = getProductImageUrl(product.image);
  const available = Number(product.stock) > 0;
  return `
    <article class="product-card" tabindex="0" role="link" data-product="${escapeHTML(id)}" aria-label="Xem chi tiết ${escapeHTML(product.name)}">
      <div class="product-image-wrapper product-image-wrapper-${index % 5}">
        ${image ? `<img class="product-image" src="${escapeHTML(image)}" alt="${escapeHTML(product.name)}" loading="lazy" data-product-image />` : ""}
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

// Dựng danh sách sản phẩm sau khi dữ liệu tải về.
function renderProducts() {
  const grid = document.getElementById("product-grid");
  const status = document.getElementById("product-status");
  const query = searchTerm.trim().toLocaleLowerCase("vi");
  const visible = allProducts.filter((product) => {
    const name = String(product.name || "").toLocaleLowerCase("vi");
    return (
      (selectedCategory === "Tất cả" || product.category === selectedCategory) &&
      name.includes(query) &&
      product.active !== false &&
      product.active !== 0
    );
  });

  if (!visible.length) {
    grid.hidden = true;
    status.hidden = false;
    status.textContent = allProducts.length
      ? "Không tìm thấy sản phẩm phù hợp."
      : "Chưa có sản phẩm để hiển thị.";
    return;
  }

  status.hidden = true;
  grid.hidden = false;
  grid.innerHTML = visible.map(createProductCard).join("");

  grid.querySelectorAll("[data-product-image]").forEach((image) => {
    image.addEventListener(
      "error",
      () => {
        image.hidden = true;
        const placeholder = image.parentElement.querySelector(
          ".product-placeholder",
        );
        if (placeholder) placeholder.hidden = false;
      },
      { once: true },
    );
  });
}

// Gắn thao tác mở chi tiết, yêu thích và thêm vào giỏ hàng.
function bindProductActions() {
  const grid = document.getElementById("product-grid");
  grid.addEventListener("click", (event) => {
    const addButton = event.target.closest("[data-add-cart]");
    if (addButton) {
      event.stopPropagation();
      const product = allProducts.find(
        (item) => String(item._id ?? item.id) === addButton.dataset.addCart,
      );
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
    if (card)
      window.location.href = `product-detail.html?id=${encodeURIComponent(card.dataset.product)}`;
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

// Tải dữ liệu trang chủ và khởi tạo các khu vực tương tác.
export async function mountHome() {
  document.querySelector("[data-hero]").src = heroImageUrl;
  document.querySelectorAll("[data-decoration]").forEach((image) => {
    image.src = decorationUrl;
  });
  renderCategories();
  bindProductActions();

  document
    .getElementById("category-grid")
    .addEventListener("click", (event) => {
      const button = event.target.closest("[data-category]");
      if (!button) return;
      selectedCategory = button.dataset.category;
      renderCategories();
      renderProducts();
      document
        .getElementById("product")
        ?.scrollIntoView({ behavior: "smooth" });
    });

  document
    .querySelector("[data-search]")
    ?.addEventListener("input", (event) => {
      searchTerm = event.target.value;
      renderProducts();
    });

  try {
    const result = await apiRequest("/products", {
      signal: AbortSignal.timeout(12000),
    });
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
