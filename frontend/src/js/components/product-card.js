// Thành phần dùng chung để dựng thẻ sản phẩm và xử lý ảnh dự phòng.
import { getProductImageUrl } from "../services/api.js";

// Mã hóa ký tự HTML để nội dung sản phẩm không chèn markup ngoài ý muốn.
export function escapeHTML(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}

// Hiển thị giá theo quy ước tiền tệ Việt Nam.
export function formatPrice(value) {
  return `${Number(value || 0).toLocaleString("vi-VN")}đ`;
}

// Dựng thẻ sản phẩm, gồm ảnh, trạng thái yêu thích và thao tác giỏ hàng.
export function createProductCard(product, index = 0, favoriteIds = new Set()) {
  const id = String(product._id ?? product.id ?? "");
  const image = getProductImageUrl(product.image);
  const categorySymbol =
    product.category === "Đồ uống"
      ? "♧"
      : product.category === "Mỹ phẩm"
        ? "✿"
        : "❋";
  const available = Number(product.stock) > 0;
  const favorite =
    favoriteIds instanceof Set
      ? favoriteIds.has(id)
      : Array.isArray(favoriteIds) && favoriteIds.includes(id);
  return `<article class="product-card" role="link" tabindex="0" data-product="${escapeHTML(id)}" aria-label="Xem chi tiết ${escapeHTML(product.name)}"><div class="product-image-wrapper product-image-wrapper-${index % 5}">${image ? `<img class="product-image" src="${escapeHTML(image)}" alt="${escapeHTML(product.name)}" loading="lazy" data-product-image>` : ""}<span class="product-placeholder" aria-hidden="true" ${image ? "hidden" : ""}>${categorySymbol}</span><span class="product-brand">ÁNH NGUYỆT</span><button class="favorite-button ${favorite ? "is-favorite" : ""}" type="button" data-favorite="${escapeHTML(id)}" aria-label="${favorite ? "Bỏ yêu thích" : "Thêm vào yêu thích"}">${favorite ? "♥" : "♡"}</button></div><div class="product-info"><h3>${escapeHTML(product.name || "Sản phẩm")}</h3><p class="product-detail">${escapeHTML(product.description || product.category || "")}</p><strong class="product-price">${formatPrice(product.price)}</strong><div class="product-rating"><span>${escapeHTML(product.category || "")}</span></div><button class="add-button" type="button" data-add-cart="${escapeHTML(id)}" ${available ? "" : "disabled"}><span aria-hidden="true">🛒</span>${available ? "Thêm vào giỏ hàng" : "Tạm hết hàng"}</button></div></article>`;
}

// Ẩn ảnh lỗi và hiện biểu tượng dự phòng tương ứng.
export function bindImageFallback(root) {
  root.querySelectorAll("[data-product-image]").forEach((image) =>
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
    ),
  );
}
