// Trang danh sách tải sản phẩm thật và hỗ trợ tìm kiếm, lọc, sắp xếp.
import { apiRequest } from "../services/api.js";
import { addToCart } from "../services/cart.js";
import {
  bindImageFallback,
  escapeHTML,
  createProductCard,
} from "../components/product-card.js";

const decorationUrl = "./assets/icon-decoration.png";

// Chuẩn hóa chữ viết nhưng vẫn giữ dấu để phân biệt các từ tiếng Việt.
function normalizeSearchText(value = "") {
  return String(value)
    .toLocaleLowerCase("vi")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ");
}

// Tạo dạng không dấu dùng riêng cho từng từ khóa người dùng gõ không dấu.
function foldSearchText(value = "") {
  return normalizeSearchText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function hasVietnameseDiacritics(value = "") {
  return /[\u0300-\u036f]/.test(normalizeSearchText(value).normalize("NFD"));
}

// Xác định nhóm con dựa trên danh mục và tên sản phẩm.
function getSubcategory(product) {
  const name = normalizeSearchText(product.name);
  const foldedName = foldSearchText(name);
  if (product.category === "Bánh") {
    if (foldedName.includes("banh trang")) return "Bánh tráng";
    if (foldedName.includes("banh gao")) return "Bánh gạo";
    if (foldedName.includes("com chay")) return "Cơm cháy";
    if (name.includes("cốm") || foldedName.includes("com nep")) return "Cốm";
    return "Bánh";
  }
  if (product.category === "Gạo, bột")
    return foldedName.startsWith("gao")
      ? "Gạo"
      : foldedName.startsWith("bot")
        ? "Bột"
        : "Gạo, bột";
  if (product.category === "Đồ uống")
    return foldedName.includes("sua")
      ? "Sữa"
      : foldedName.includes("tra")
        ? "Trà"
        : foldedName.includes("ruou")
          ? "Rượu"
          : "Đồ uống";
  if (product.category === "Mỹ phẩm")
    return [
      "sua tam",
      "xa phong",
      "duong the",
      "toan than",
      "da tay",
      "da dau",
      "dau xa",
      ].some((keyword) => foldedName.includes(keyword))
      ? "Chăm sóc cơ thể"
      : "Chăm sóc da mặt";
  return "Sản phẩm khác";
}

// Kiểm tra giá có nằm trong khoảng lọc do người dùng chọn không.
function matchesPriceRange(price, range) {
  const value = Number(price || 0);
  if (range === "under-50000") return value < 50000;
  if (range === "50000-99000") return value >= 50000 && value <= 99000;
  if (range === "100000-149000") return value >= 100000 && value <= 149000;
  if (range === "150000-up") return value >= 150000;
  return true;
}

// Áp dụng đồng thời từ khóa, danh mục, giá và cách sắp xếp hiện hành.
function filterProducts(products, state) {
  const queryWords = normalizeSearchText(state.query).split(" ").filter(Boolean);
  const visible = products.filter((item) => {
    const haystack = normalizeSearchText(
      [item.name, item.category, item.description].filter(Boolean).join(" "),
    );
    const foldedHaystack = foldSearchText(haystack);
    return (
      (state.category === "Tất cả" ||
        String(item.category || "") === state.category) &&
      (state.subcategory === "Tất cả" ||
        getSubcategory(item) === state.subcategory) &&
      (!state.price || matchesPriceRange(item.price, state.price)) &&
      queryWords.every((word) =>
        hasVietnameseDiacritics(word)
          ? haystack.includes(word)
          : foldedHaystack.includes(foldSearchText(word)),
      )
    );
  });
  if (state.sort === "gia-asc")
    visible.sort((a, b) => Number(a.price) - Number(b.price));
  if (state.sort === "gia-desc")
    visible.sort((a, b) => Number(b.price) - Number(a.price));
  if (state.sort === "name-asc")
    visible.sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), "vi"),
    );
  return visible;
}

// Tải dữ liệu rồi kết nối các điều khiển tìm kiếm và bộ lọc.
export async function mountProducts() {
  const grid = document.getElementById("product-grid");
  const status = document.getElementById("product-status");
  const empty = document.getElementById("products-page-empty");
  const categoriesNode = document.getElementById("product-category");
  const search = document.getElementById("products-page-search-check");
  const clearSearch = document.getElementById("clear-products-page-search");
  const headerSearch = document.querySelector("[data-search]");
  const sort = document.getElementById("products-page-sort");
  const url = new URL(window.location.href);
  const state = {
    products: [],
    category: "Tất cả",
    subcategory: "Tất cả",
    price: "",
    query: url.searchParams.get("q") || "",
    sort: "default",
  };
  const favorites = new Set();
  document.querySelector(".products-page-heading-decoration img").src = decorationUrl;
  search.value = state.query;
  headerSearch.value = state.query;

  // Dựng danh sách sau khi áp dụng từ khóa, bộ lọc và thứ tự sắp xếp.
  function hienThiDanhSachSanPham() {
    const visible = filterProducts(state.products, state);
    document.getElementById("product-quantity").textContent = String(
      visible.length,
    );
    empty.hidden = visible.length > 0;
    grid.hidden = visible.length === 0;
    grid.innerHTML = visible
      .map((item, index) => createProductCard(item, index, favorites))
      .join("");
    bindImageFallback(grid);
    categoriesNode
      .querySelectorAll(".sidebar-category-name")
      .forEach((button) => {
        button.classList.toggle(
          "da-select",
          button.dataset.category === state.category &&
            state.subcategory === "Tất cả",
        );
      });
    categoriesNode
      .querySelectorAll(".sidebar-subcategory")
      .forEach((button) =>
        button.classList.toggle(
          "da-select",
          button.dataset.subcategory === state.subcategory &&
            state.subcategory !== "Tất cả",
        ),
      );
    document
      .querySelector(".sidebar-toggle-ca")
      ?.classList.toggle("da-select", state.category === "Tất cả");
    document.querySelectorAll("[data-price-item]").forEach((input) => {
      input.checked = input.dataset.priceItem === state.price;
    });
    const clearPrice = document.getElementById("delete-price");
    if (clearPrice) clearPrice.hidden = !state.price;
    if (clearSearch) clearSearch.hidden = !state.query;
  }

  document
    .querySelector(".products-page-sidebar")
    .addEventListener("click", (event) => {
      const button = event.target.closest("[data-category]");
      if (!button) return;
      state.category = button.dataset.category;
      state.subcategory = "Tất cả";
      hienThiDanhSachSanPham();
    });
  categoriesNode.addEventListener("click", (event) => {
    const subcategory = event.target.closest("[data-subcategory]");
    if (!subcategory) return;
    state.category = subcategory
      .closest(".sidebar-category")
      .querySelector(".sidebar-category-name").dataset.category;
    state.subcategory = subcategory.dataset.subcategory;
    hienThiDanhSachSanPham();
  });
  categoriesNode.addEventListener("click", (event) => {
    const expand = event.target.closest(".sidebar-open-rong");
    if (!expand) return;
    const group = expand.closest(".sidebar-category");
    const children = group.querySelector(".sidebar-subcategory");
    const open = children.hidden;
    children.hidden = !open;
    expand.textContent = open ? "−" : "+";
    expand.classList.toggle("da-open-rong", open);
    expand.setAttribute("aria-expanded", String(open));
    expand.setAttribute(
      "aria-label",
      open ? "Thu gọn danh mục" : "Mở danh mục",
    );
  });
  search.addEventListener("input", () => {
    state.query = search.value;
    headerSearch.value = state.query;
    hienThiDanhSachSanPham();
  });
  headerSearch.addEventListener("input", () => {
    state.query = headerSearch.value;
    search.value = state.query;
    hienThiDanhSachSanPham();
  });
  clearSearch?.addEventListener("click", () => {
    state.query = "";
    search.value = "";
    headerSearch.value = "";
    search.focus();
    hienThiDanhSachSanPham();
  });
  sort.addEventListener("change", () => {
    state.sort = sort.value;
    hienThiDanhSachSanPham();
  });
  document.querySelectorAll("[data-price-item]").forEach((input) =>
    input.addEventListener("change", () => {
      state.price = input.dataset.priceItem;
      hienThiDanhSachSanPham();
    }),
  );
  headerSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      state.query = headerSearch.value;
      search.value = state.query;
      hienThiDanhSachSanPham();
    }
  });
  // Xóa từ khóa và các điều kiện lọc do người dùng đang chọn.
  const datLaiBoLoc = () => {
    state.category = "Tất cả";
    state.subcategory = "Tất cả";
    state.price = "";
    state.query = "";
    state.sort = "default";
    search.value = "";
    headerSearch.value = "";
    sort.value = "default";
    categoriesNode
      .querySelectorAll(".sidebar-subcategory")
      .forEach((group) => {
        group.hidden = false;
      });
    categoriesNode.querySelectorAll(".sidebar-open-rong").forEach((button) => {
      button.textContent = "−";
      button.classList.add("da-open-rong");
      button.setAttribute("aria-expanded", "true");
    });
    hienThiDanhSachSanPham();
  };
  document
    .getElementById("reset-products-page-filter")
    .addEventListener("click", datLaiBoLoc);
  document
    .getElementById("reset-empty-filter")
    .addEventListener("click", datLaiBoLoc);
  grid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-add-cart]");
    if (button) {
      event.stopPropagation();
      const product = state.products.find(
        (item) => String(item._id ?? item.id) === button.dataset.addCart,
      );
      if (!product) return;
      try {
        addToCart(product);
        const toast = document.getElementById("page-toast-notification");
        toast.textContent = `Đã thêm "${product.name}" vào giỏ hàng.`;
        toast.hidden = false;
        setTimeout(() => {
          toast.hidden = true;
        }, 2200);
      } catch (error) {
        const toast = document.getElementById("page-toast-notification");
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
      hienThiDanhSachSanPham();
      return;
    }
    const card = event.target.closest("[data-product]");
    if (card)
      window.location.href = `product-detail.html?id=${encodeURIComponent(card.dataset.product)}`;
  });
  grid.addEventListener("keydown", (event) => {
    if (
      event.target.closest("button") ||
      (event.key !== "Enter" && event.key !== " ")
    )
      return;
    const card = event.target.closest("[data-product]");
    if (!card) return;
    event.preventDefault();
    window.location.href = `product-detail.html?id=${encodeURIComponent(card.dataset.product)}`;
  });

  try {
    const result = await apiRequest("/products", {
      signal: AbortSignal.timeout(12000),
    });
    state.products = (Array.isArray(result.data) ? result.data : []).filter(
      (item) => item.active !== false && item.active !== 0,
    );
    status.hidden = true;
    hienThiDanhSachSanPham();
  } catch (error) {
    status.setAttribute("role", "alert");
    status.hidden = false;
    status.textContent =
      "Không thể tải sản phẩm. Vui lòng kiểm tra backend và kết nối mạng.";
    empty.hidden = false;
    empty.textContent = "Không thể tải danh sách sản phẩm.";
  }
}
