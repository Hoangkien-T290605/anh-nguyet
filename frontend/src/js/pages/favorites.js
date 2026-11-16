// Trang yêu thích đọc và cập nhật danh sách bền vững qua Backend.
import { bindImageFallback, createProductCard } from "../components/product-card.js";
import { addToCart } from "../services/cart.js";
import {
  loadFavoriteProducts,
  readFavoriteSession,
  requireFavoriteLogin,
  saveFavoriteState,
} from "../services/favorites.js";

function normalizeFavoriteProducts(items) {
  const seen = new Set();
  let skipped = 0;
  const products = items.filter((product) => {
    if (!product || typeof product !== "object") {
      skipped += 1;
      return false;
    }
    const id = String(product.id ?? product._id ?? "").trim();
    const price = Number(product.price);
    const stock = Number(product.stock);
    if (
      !id ||
      seen.has(id) ||
      typeof product.name !== "string" ||
      !product.name.trim() ||
      product.price == null ||
      !Number.isFinite(price) ||
      price < 0 ||
      product.stock == null ||
      !Number.isFinite(stock) ||
      stock < 0 ||
      product.active === false ||
      product.active === 0
    ) {
      skipped += 1;
      return false;
    }
    seen.add(id);
    return true;
  });
  return { products, skipped };
}

function clearExpiredSession() {
  localStorage.removeItem("anh-nguyet-auth");
  window.dispatchEvent(
    new CustomEvent("anh-nguyet-xac-thuc-cap-nhat", {
      detail: { user: null },
    }),
  );
  requireFavoriteLogin();
}

export async function mountFavorites() {
  const status = document.getElementById("favorites-status");
  const grid = document.getElementById("favorites-grid");
  const session = readFavoriteSession();
  if (!session) {
    status.innerHTML = 'Vui lòng <a href="login.html?returnTo=favorites.html">đăng nhập</a> để xem danh sách yêu thích.';
    return;
  }

  let products = [];
  let notice = "";
  const favorites = new Set();
  const pendingRemovals = new Set();
  const toast = document.getElementById("page-toast-notification");

  const draw = () => {
    status.hidden = products.length > 0 && !notice;
    status.setAttribute("role", notice ? "alert" : "status");
    status.textContent =
      notice ||
      (products.length ? "" : "Bạn chưa có sản phẩm yêu thích.");
    grid.hidden = products.length === 0;
    grid.innerHTML = products
      .map((product, index) =>
        createProductCard(product, index, favorites),
      )
      .join("");
    bindImageFallback(grid);
  };

  const showToast = (message) => {
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    window.setTimeout(() => {
      toast.hidden = true;
    }, 2200);
  };

  try {
    const normalized = normalizeFavoriteProducts(
      await loadFavoriteProducts(session),
    );
    products = normalized.products;
    products.forEach((product) =>
      favorites.add(String(product.id ?? product._id)),
    );
    if (normalized.skipped) {
      notice = `Đã bỏ qua ${normalized.skipped} mục trùng lặp hoặc thiếu dữ liệu hợp lệ.`;
    }
    draw();
  } catch (error) {
    if (error.status === 401) {
      clearExpiredSession();
      return;
    }
    status.setAttribute("role", "alert");
    status.textContent =
      error.name === "TimeoutError"
        ? "Máy chủ không phản hồi khi tải danh sách yêu thích. Vui lòng thử lại."
        : `Không thể tải danh sách yêu thích: ${error.message}`;
    grid.hidden = true;
    return;
  }

  grid.addEventListener("click", async (event) => {
    const addButton = event.target.closest("[data-add-cart]");
    if (addButton) {
      event.stopPropagation();
      const product = products.find(
        (item) => String(item.id ?? item._id) === addButton.dataset.addCart,
      );
      if (!product) return;
      try {
        addToCart(product);
        showToast(`Đã thêm “${product.name}” vào giỏ hàng.`);
      } catch (error) {
        showToast(error.message || "Không thể thêm sản phẩm vào giỏ hàng.");
      }
      return;
    }

    const favorite = event.target.closest("[data-favorite]");
    if (favorite) {
      event.stopPropagation();
      const id = favorite.dataset.favorite;
      if (pendingRemovals.has(id)) return;
      const currentSession = readFavoriteSession();
      if (!currentSession) {
        clearExpiredSession();
        return;
      }
      if (String(currentSession.user.id) !== String(session.user.id)) {
        window.location.reload();
        return;
      }

      pendingRemovals.add(id);
      favorite.disabled = true;
      try {
        await saveFavoriteState(id, false, currentSession);
        products = products.filter(
          (product) => String(product.id ?? product._id) !== id,
        );
        favorites.delete(id);
        notice = "";
        draw();
      } catch (error) {
        if (error.status === 401) {
          clearExpiredSession();
          return;
        }
        notice =
          error.name === "TimeoutError"
            ? "Chưa nhận được xác nhận từ máy chủ. Hãy tải lại danh sách để kiểm tra trạng thái."
            : error.message || "Không thể cập nhật danh sách yêu thích.";
        status.hidden = false;
        status.setAttribute("role", "alert");
        status.textContent = notice;
        favorite.disabled = false;
      } finally {
        pendingRemovals.delete(id);
      }
      return;
    }

    const card = event.target.closest("[data-product]");
    if (card) {
      window.location.assign(
        `product-detail.html?id=${encodeURIComponent(card.dataset.product)}`,
      );
    }
  });

  grid.addEventListener("keydown", (event) => {
    if (
      event.target.closest("button") ||
      (event.key !== "Enter" && event.key !== " ")
    ) {
      return;
    }
    const card = event.target.closest("[data-product]");
    if (!card) return;
    event.preventDefault();
    window.location.assign(
      `product-detail.html?id=${encodeURIComponent(card.dataset.product)}`,
    );
  });
}
