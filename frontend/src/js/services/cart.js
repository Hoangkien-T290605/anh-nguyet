// Quản lý giỏ hàng khách và giỏ hàng tài khoản, kèm đồng bộ với Backend.
import { apiRequest } from "./api.js";

const GUEST_CART_KEY = "anh-nguyet-cart";
const AUTH_KEY = "anh-nguyet-auth";
const CART_EVENT = "anh-nguyet-cart-cap-nhat";
const CART_SYNC_ERROR_EVENT = "anh-nguyet-cart-dong-bo-loi";

// Đọc phiên hợp lệ để xác định phạm vi lưu giỏ hàng.
function readAuthSession() {
  try {
    const auth = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    return auth?.token && auth?.user?.id ? auth : null;
  } catch {
    return null;
  }
}

// Tách dữ liệu giỏ hàng theo khách vãng lai hoặc mã tài khoản.
function getCartScope(auth) {
  return auth ? `user:${String(auth.user.id)}` : "guest";
}

// Tạo khóa lưu cục bộ riêng cho từng phạm vi giỏ hàng.
function getCartStorageKey(scope) {
  return scope === "guest" ? GUEST_CART_KEY : `anh-nguyet-cart:${scope}`;
}

// Đọc dữ liệu giỏ hàng cục bộ và kiểm tra kiểu dữ liệu trước khi dùng.
function readStoredCart(scope) {
  try {
    const value = JSON.parse(
      localStorage.getItem(getCartStorageKey(scope)) || "[]",
    );
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

let activeAuth = readAuthSession();
let activeScope = getCartScope(activeAuth);
let cart = readStoredCart(activeScope);
let mutationVersion = 0;
let activeLoad = null;
let remoteWriteQueue = Promise.resolve();

// Cộng số lượng của mọi dòng hàng trong giỏ.
function countCartItems(items) {
  return items.reduce(
    (sum, item) => sum + Math.max(0, Number(item.quantity) || 0),
    0,
  );
}

// Thông báo cho đầu trang và các thành phần đang hiển thị giỏ hàng.
function dispatchCartUpdate() {
  window.dispatchEvent(
    new CustomEvent(CART_EVENT, {
      detail: { count: countCartItems(cart), scope: activeScope },
    }),
  );
}

// Phát lỗi đồng bộ để trang hiện thông báo mà không làm mất giỏ cục bộ.
function dispatchCartSyncError(error) {
  window.dispatchEvent(
    new CustomEvent(CART_SYNC_ERROR_EVENT, {
      detail: { message: error?.message || "Không thể đồng bộ giỏ hàng." },
    }),
  );
}

// Lưu bản giỏ hàng theo phạm vi hiện hành.
function storeLocalCart(scope, items) {
  localStorage.setItem(getCartStorageKey(scope), JSON.stringify(items));
}

// Gửi các thay đổi giỏ hàng đã đăng nhập đến API tài khoản.
function syncAccountCart(scope, auth, items, version) {
  const requestItems = items.map((item) => ({
    product_id: Number(item._id ?? item.id),
    quantity: Number(item.quantity),
  }));
  const pendingLoad = activeLoad?.scope === scope ? activeLoad.promise : null;

  remoteWriteQueue = remoteWriteQueue
    .catch(() => {})
    .then(async () => {
      if (pendingLoad) await pendingLoad.catch(() => {});
      const result = await apiRequest("/cart", {
        method: "PUT",
        headers: { Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ items: requestItems }),
      });
      if (
        scope === activeScope &&
        version === mutationVersion &&
        Array.isArray(result.data)
      ) {
        cart = result.data;
        storeLocalCart(scope, cart);
        dispatchCartUpdate();
      }
    })
    .catch(dispatchCartSyncError);
}

// Chuyển giữa giỏ khách và giỏ tài khoản khi phiên đăng nhập thay đổi.
function switchCartScope(auth) {
  const nextScope = getCartScope(auth);
  activeAuth = auth;
  if (nextScope === activeScope) return false;

  activeScope = nextScope;
  cart = readStoredCart(activeScope);
  mutationVersion++;
  activeLoad = null;
  dispatchCartUpdate();
  return true;
}

// Trả về bản sao giỏ hàng hiện tại để giao diện không sửa trực tiếp trạng thái.
export function readCart() {
  return cart.map((item) => ({ ...item }));
}

// Tính tổng số lượng sản phẩm để hiển thị trên đầu trang.
export function getCartCount() {
  return countCartItems(cart);
}

// Lưu các dòng hàng cục bộ rồi phát sự kiện cập nhật giao diện.
export function writeCart(items) {
  cart = Array.isArray(items) ? items.map((item) => ({ ...item })) : [];
  mutationVersion++;
  storeLocalCart(activeScope, cart);
  dispatchCartUpdate();

  if (activeAuth) {
    syncAccountCart(activeScope, activeAuth, cart, mutationVersion);
  }
}

// Xóa giỏ hàng sau khi Backend xác nhận đơn hàng đã được tạo.
export function clearCartAfterOrder(auth) {
  const scope = auth?.user?.id ? `user:${String(auth.user.id)}` : "guest";
  storeLocalCart(scope, []);
  if (scope !== activeScope) return;
  cart = [];
  mutationVersion++;
  dispatchCartUpdate();
}

// Nạp giỏ hàng tài khoản và giữ giỏ khách tách biệt khi chưa đăng nhập.
export async function loadCart() {
  const auth = readAuthSession();
  switchCartScope(auth);
  if (!auth) return readCart();
  if (activeLoad?.scope === activeScope)
    return activeLoad.promise.then(readCart);

  const scope = activeScope;
  const loadVersion = mutationVersion;
  const promise = apiRequest("/cart", {
    headers: { Authorization: `Bearer ${auth.token}` },
  })
    .then((result) => {
      if (
        scope !== activeScope ||
        loadVersion !== mutationVersion ||
        !Array.isArray(result.data)
      )
        return;
      cart = result.data;
      storeLocalCart(scope, cart);
      dispatchCartUpdate();
    })
    .catch((error) => {
      if (scope === activeScope) dispatchCartSyncError(error);
    })
    .finally(() => {
      if (activeLoad?.promise === promise) activeLoad = null;
      if (
        scope === activeScope &&
        loadVersion !== mutationVersion &&
        activeAuth
      ) {
        syncAccountCart(scope, activeAuth, cart, mutationVersion);
      }
    });

  activeLoad = { scope, promise };
  return promise.then(readCart);
}

// Thêm sản phẩm hoặc cập nhật số lượng trong giỏ hiện tại.
export function addToCart(product, amount = 1) {
  const id = String(product._id ?? product.id ?? "");
  if (!id) throw new Error("Sản phẩm không có mã hợp lệ.");
  const addAmount = Math.max(1, Math.floor(Number(amount) || 1));
  const existing = cart.find((item) => String(item._id ?? item.id) === id);
  const nextQuantity = Number(existing?.quantity || 0) + addAmount;
  const stock = Number(product.stock);
  if (Number.isFinite(stock) && stock >= 0 && nextQuantity > stock) {
    throw new Error("Số lượng trong giỏ vượt quá tồn kho hiện tại.");
  }

  const next = existing
    ? cart.map((item) =>
        String(item._id ?? item.id) === id
          ? { ...product, quantity: nextQuantity }
          : item,
      )
    : [...cart, { ...product, quantity: addAmount }];

  writeCart(next);
}

// Nạp lại giỏ phù hợp sau sự kiện đăng nhập hoặc đăng xuất.
function syncAfterSessionChange() {
  const auth = readAuthSession();
  if (switchCartScope(auth) && auth) void loadCart();
}

window.addEventListener("anh-nguyet-xac-thuc-cap-nhat", syncAfterSessionChange);
window.addEventListener("storage", (event) => {
  if (event.key === AUTH_KEY) {
    syncAfterSessionChange();
    return;
  }
  if (event.key === getCartStorageKey(activeScope)) {
    cart = readStoredCart(activeScope);
    mutationVersion++;
    dispatchCartUpdate();
  }
});

if (activeAuth) void loadCart();
