import { apiRequest } from "../services/api.js";
import { addToCart } from "../services/cart.js";
import { bindImageFallback, escapeHTML, productCard } from "../components/product-card.js";

const decorationUrl = "./assets/icon-trang-tri.png";

function normalizeText(value = "") {
  return String(value).toLocaleLowerCase("vi").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").trim();
}

function getSubCategory(product) {
  const name = normalizeText(product.name);
  if (product.category === "Bánh") {
    if (name.includes("banh trang")) return "Bánh tráng";
    if (name.includes("banh gao")) return "Bánh gạo";
    if (name.includes("com chay")) return "Cơm cháy";
    if (name.includes("com") || name.includes("nep")) return "Cốm";
    return "Bánh";
  }
  if (product.category === "Gạo, bột") return name.startsWith("gao") ? "Gạo" : name.startsWith("bot") ? "Bột" : "Gạo, bột";
  if (product.category === "Đồ uống") return name.includes("sua") ? "Sữa" : name.includes("tra") ? "Trà" : name.includes("ruou") ? "Rượu" : "Đồ uống";
  if (product.category === "Mỹ phẩm") return ["sua tam", "xa phong", "duong the", "toan than", "da tay", "da dau", "dau xa"].some((keyword) => name.includes(keyword)) ? "Chăm sóc cơ thể" : "Chăm sóc da mặt";
  return "Sản phẩm khác";
}

function matchesPriceRange(price, range) {
  const value = Number(price || 0);
  if (range === "under-50000") return value < 50000;
  if (range === "50000-99000") return value >= 50000 && value <= 99000;
  if (range === "100000-149000") return value >= 100000 && value <= 149000;
  if (range === "150000-up") return value >= 150000;
  return true;
}

export async function mountProducts() {
  const grid = document.getElementById("product-grid");
  const status = document.getElementById("product-status");
  const empty = document.getElementById("products-empty");
  const categoriesNode = document.getElementById("product-categories");
  const search = document.getElementById("products-search");
  const headerSearch = document.querySelector("[data-search]");
  const sort = document.getElementById("products-sort");
  const url = new URL(window.location.href);
  const state = { products: [], category: "Tất cả", subcategory: "Tất cả", price: "", query: url.searchParams.get("q") || "", sort: "default" };
  const favorites = new Set();
  document.querySelector(".products-title-decoration img").src = decorationUrl;
  search.value = state.query;
  headerSearch.value = state.query;

  function render() {
    const query = normalizeText(state.query);
    const visible = state.products.filter((item) => {
      const haystack = normalizeText(item.name || "");
      return (state.category === "Tất cả" || String(item.category || "") === state.category)
        && (state.subcategory === "Tất cả" || getSubCategory(item) === state.subcategory)
        && (!state.price || matchesPriceRange(item.price, state.price))
        && haystack.includes(query);
    });
    if (state.sort === "price-asc") visible.sort((a, b) => Number(a.price) - Number(b.price));
    if (state.sort === "price-desc") visible.sort((a, b) => Number(b.price) - Number(a.price));
    if (state.sort === "name-asc") visible.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi"));
    document.getElementById("product-count").textContent = String(visible.length);
    empty.hidden = visible.length > 0;
    grid.hidden = visible.length === 0;
    grid.innerHTML = visible.map((item, index) => productCard(item, index, favorites)).join("");
    bindImageFallback(grid);
    categoriesNode.querySelectorAll(".sidebar-category-name").forEach((button) => {
      button.classList.toggle("selected", button.dataset.category === state.category && state.subcategory === "Tất cả");
    });
    categoriesNode.querySelectorAll(".sidebar-subcategory").forEach((button) => button.classList.toggle("selected", button.dataset.subcategory === state.subcategory && state.subcategory !== "Tất cả"));
    document.querySelector(".sidebar-all")?.classList.toggle("selected", state.category === "Tất cả");
    document.querySelectorAll("[data-price-range]").forEach((input) => { input.checked = input.dataset.priceRange === state.price; });
    const clearPrice = document.getElementById("clear-price");
    if (clearPrice) clearPrice.hidden = !state.price;
  }

  document.querySelector(".products-sidebar").addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.category = button.dataset.category;
    state.subcategory = "Tất cả";
    render();
  });
  categoriesNode.addEventListener("click", (event) => {
    const subcategory = event.target.closest("[data-subcategory]");
    if (!subcategory) return;
    state.category = subcategory.closest(".sidebar-category").querySelector(".sidebar-category-name").dataset.category;
    state.subcategory = subcategory.dataset.subcategory;
    render();
  });
  categoriesNode.addEventListener("click", (event) => {
    const expand = event.target.closest(".sidebar-expand");
    if (!expand) return;
    const group = expand.closest(".sidebar-category");
    const children = group.querySelector(".sidebar-subcategories");
    const open = children.hidden;
    children.hidden = !open;
    expand.textContent = open ? "−" : "+";
    expand.classList.toggle("expanded", open);
    expand.setAttribute("aria-expanded", String(open));
    expand.setAttribute("aria-label", open ? "Thu gọn danh mục" : "Mở danh mục");
  });
  search.addEventListener("input", () => { state.query = search.value; headerSearch.value = state.query; render(); });
  headerSearch.addEventListener("input", () => { state.query = headerSearch.value; search.value = state.query; render(); });
  sort.addEventListener("change", () => { state.sort = sort.value; render(); });
  document.querySelectorAll("[data-price-range]").forEach((input) => input.addEventListener("change", () => { state.price = input.dataset.priceRange; render(); }));
  headerSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); state.query = headerSearch.value; search.value = state.query; render(); }
  });
  const resetFilters = () => {
    state.category = "Tất cả";
    state.subcategory = "Tất cả";
    state.price = "";
    state.query = "";
    state.sort = "default";
    search.value = "";
    headerSearch.value = "";
    sort.value = "default";
    categoriesNode.querySelectorAll(".sidebar-subcategories").forEach((group) => { group.hidden = false; });
    categoriesNode.querySelectorAll(".sidebar-expand").forEach((button) => { button.textContent = "−"; button.classList.add("expanded"); button.setAttribute("aria-expanded", "true"); });
    render();
  };
  document.getElementById("reset-products-filter").addEventListener("click", resetFilters);
  document.getElementById("reset-empty-filter").addEventListener("click", resetFilters);
  grid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-add-cart]");
    if (button) {
      event.stopPropagation();
      const product = state.products.find((item) => String(item._id ?? item.id) === button.dataset.addCart);
      if (!product) return;
      try {
        addToCart(product);
        const toast = document.getElementById("site-toast");
        toast.textContent = `Đã thêm "${product.name}" vào giỏ hàng.`;
        toast.hidden = false;
        setTimeout(() => { toast.hidden = true; }, 2200);
      } catch (error) {
        const toast = document.getElementById("site-toast");
        toast.textContent = error.message;
        toast.hidden = false;
      }
      return;
    }
    const favorite = event.target.closest("[data-favorite]");
    if (favorite) {
      event.stopPropagation();
      const id = favorite.dataset.favorite;
      favorites.has(id) ? favorites.delete(id) : favorites.add(id);
      render();
      return;
    }
    const card = event.target.closest("[data-product]");
    if (card) window.location.href = `product-detail.html?id=${encodeURIComponent(card.dataset.product)}`;
  });
  grid.addEventListener("keydown", (event) => {
    if (event.target.closest("button") || (event.key !== "Enter" && event.key !== " ")) return;
    const card = event.target.closest("[data-product]");
    if (!card) return;
    event.preventDefault();
    window.location.href = `product-detail.html?id=${encodeURIComponent(card.dataset.product)}`;
  });

  try {
    const result = await apiRequest("/products", { signal: AbortSignal.timeout(12000) });
    state.products = (Array.isArray(result.data) ? result.data : []).filter((item) => item.active !== false && item.active !== 0);
    status.hidden = true;
    render();
  } catch (error) {
    status.setAttribute("role", "alert");
    status.hidden = false;
    status.textContent = "Không thể tải sản phẩm. Vui lòng kiểm tra backend và kết nối mạng.";
    empty.hidden = false;
    empty.textContent = "Không thể tải danh sách sản phẩm.";
  }
}
