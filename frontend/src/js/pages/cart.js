import { apiRequest, getProductImageUrl } from "../services/api.js";
import { readCart, writeCart } from "../services/cart.js";
import { escapeHTML, formatPrice } from "../components/product-card.js";

export async function mountCart() {
  const status = document.getElementById("cart-status");
  const empty = document.getElementById("cart-empty");
  const content = document.getElementById("cart-content");
  const itemsNode = document.getElementById("cart-items");
  const checkoutButton = document.getElementById("checkout-button");
  let cart = readCart();
  let syncWarning = "";

  function render() {
    if (!cart.length) {
      content.hidden = true;
      empty.hidden = false;
      checkoutButton.disabled = true;
      status.hidden = !syncWarning;
      status.textContent = syncWarning;
      return;
    }
    empty.hidden = true;
    status.hidden = !syncWarning;
    status.textContent = syncWarning;
    content.hidden = false;
    checkoutButton.disabled = false;
    const subtotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
    document.getElementById("cart-item-count").textContent = `${cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0)} sản phẩm`;
    document.getElementById("cart-item-count-summary").textContent = String(cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0));
    document.getElementById("cart-subtotal").textContent = formatPrice(subtotal);
    document.getElementById("cart-total").textContent = formatPrice(subtotal);
    itemsNode.innerHTML = cart.map((item) => {
      const id = String(item._id ?? item.id);
      const image = getProductImageUrl(item.image);
      const max = Math.max(0, Number(item.stock) || 0);
      return `<article class="cart-item" data-cart-item="${escapeHTML(id)}"><a class="cart-item-image" href="product-detail.html?id=${encodeURIComponent(id)}">${image ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(item.name)}" loading="lazy" data-cart-image>` : ""}<span class="cart-item-placeholder" ${image ? "hidden" : ""}>❋</span></a><div class="cart-item-info"><span class="cart-item-category">${escapeHTML(item.category || "Sản phẩm")}</span><h3><a href="product-detail.html?id=${encodeURIComponent(id)}">${escapeHTML(item.name || "Sản phẩm")}</a></h3><strong>${formatPrice(item.price)}</strong><button class="cart-remove" type="button" data-remove="${escapeHTML(id)}">Xóa sản phẩm</button></div><div class="cart-item-quantity"><span>Số lượng</span><div class="quantity-control"><button type="button" data-decrease="${escapeHTML(id)}" aria-label="Giảm số lượng">−</button><strong>${Number(item.quantity) || 1}</strong><button type="button" data-increase="${escapeHTML(id)}" aria-label="Tăng số lượng" ${Number(item.quantity) >= max ? "disabled" : ""}>+</button></div></div><div class="cart-item-total"><span>Thành tiền</span><strong>${formatPrice(Number(item.price || 0) * Number(item.quantity || 0))}</strong></div></article>`;
    }).join("");
    itemsNode.querySelectorAll("[data-cart-image]").forEach((image) => image.addEventListener("error", () => {
      image.hidden = true;
      image.parentElement.querySelector(".cart-item-placeholder").hidden = false;
    }, { once: true }));
  }

  function save() { writeCart(cart); render(); }
  content.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove]");
    const increase = event.target.closest("[data-increase]");
    const decrease = event.target.closest("[data-decrease]");
    if (remove) cart = cart.filter((item) => String(item._id ?? item.id) !== remove.dataset.remove);
    if (increase) cart = cart.map((item) => {
      if (String(item._id ?? item.id) !== increase.dataset.increase) return item;
      const stock = Math.max(0, Number(item.stock) || 0);
      return { ...item, quantity: Math.min(stock, Number(item.quantity || 1) + 1) };
    });
    if (decrease) cart = cart.map((item) => String(item._id ?? item.id) === decrease.dataset.decrease ? { ...item, quantity: Math.max(1, Number(item.quantity || 1) - 1) } : item);
    if (remove || increase || decrease) save();
  });
  document.getElementById("clear-cart").addEventListener("click", () => { cart = []; save(); });
  checkoutButton.addEventListener("click", () => {
    if (!cart.length) return;
    window.location.assign("checkout.html");
  });
  window.addEventListener("storage", (event) => { if (event.key === "anh-nguyet-cart") { cart = readCart(); render(); } });

  if (cart.length) {
    try {
      const response = await apiRequest("/products", { signal: AbortSignal.timeout(12000) });
      const live = Array.isArray(response.data) ? response.data : [];
      cart = cart.flatMap((saved) => {
        const product = live.find((item) => String(item._id ?? item.id) === String(saved._id ?? saved.id));
        if (!product) return [{ ...saved, unavailable: true }];
        const stock = Math.max(0, Number(product.stock) || 0);
        return [{ ...product, quantity: Math.max(1, Math.min(Number(saved.quantity) || 1, stock || Number(saved.quantity) || 1)) }];
      });
      writeCart(cart);
    } catch (error) {
      syncWarning = `Không thể đồng bộ giá và tồn kho từ máy chủ (${error.message}). Đang hiển thị thông tin đã lưu trên thiết bị.`;
    }
  }
  render();
}
