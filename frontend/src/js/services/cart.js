const CART_KEY = "anh-nguyet-cart";

export function readCart() {
  try {
    const stored = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

export function getCartCount() {
  return readCart().reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
}

export function writeCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("anh-nguyet-cart-updated", { detail: { count: getCartCount() } }));
}

export function addToCart(product, amount = 1) {
  const id = String(product._id ?? product.id ?? "");
  if (!id) throw new Error("Sản phẩm không có mã hợp lệ.");
  const addAmount = Math.max(1, Math.floor(Number(amount) || 1));

  const cart = readCart();
  const existing = cart.find((item) => String(item._id ?? item.id) === id);
  const nextQuantity = Number(existing?.quantity || 0) + addAmount;
  const stock = Number(product.stock);
  if (Number.isFinite(stock) && stock >= 0 && nextQuantity > stock) {
    throw new Error("Số lượng trong giỏ vượt quá tồn kho hiện tại.");
  }

  const next = existing
    ? cart.map((item) => String(item._id ?? item.id) === id
      ? { ...product, quantity: nextQuantity }
      : item)
    : [...cart, { ...product, quantity: addAmount }];

  writeCart(next);
}
