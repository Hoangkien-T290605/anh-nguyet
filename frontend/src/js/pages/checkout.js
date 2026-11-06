import { escapeHTML, formatPrice } from "../components/product-card.js";
import { API_BASE_URL, getProductImageUrl } from "../services/api.js";
import { readCart, writeCart } from "../services/cart.js";

const AUTH_KEY = "anh-nguyet-auth";

function readAuth() {
  try {
    const auth = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    return auth?.token && auth?.user ? auth : null;
  } catch {
    return null;
  }
}

function readAddressesAuth(auth) {
  return fetch(`${API_BASE_URL}/auth/addresses`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  }).then(async (response) => {
    let result;
    try { result = await response.json(); }
    catch { throw new Error("Máy chủ trả về dữ liệu địa chỉ không hợp lệ."); }
    if (response.status === 401) {
      localStorage.removeItem(AUTH_KEY);
      window.dispatchEvent(new CustomEvent("anh-nguyet-auth-updated", { detail: { user: null } }));
    }
    if (!response.ok || result?.success === false) {
      const error = new Error(result?.message || `Không thể tải địa chỉ (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return Array.isArray(result.data) ? result.data : [];
  });
}

export async function mountCheckout() {
  const root = document.getElementById("checkout-root");
  let cart = readCart();
  let auth = readAuth();
  let addresses = [];
  let selectedId = "";
  let addressState = auth ? "loading" : "login";
  let addressError = "";
  let validationError = "";
  let createdOrder = null;
  let requestError = "";
  let isSubmitting = false;

  const subtotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
  const quantityCount = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  function renderAddressSection() {
    if (addressState === "login") {
      return `<div class="checkout-inline-message checkout-message-info"><strong>Đăng nhập để chọn địa chỉ nhận hàng</strong><p>${escapeHTML(addressError || "Địa chỉ được tải từ tài khoản của bạn. Giỏ hàng vẫn được lưu trên thiết bị.")}</p><a class="checkout-text-link" href="login.html">Đăng nhập tài khoản</a></div>`;
    }
    if (addressState === "loading") return `<div class="checkout-address-loading"><span class="account-loading-spinner"></span><span>Đang tải sổ địa chỉ...</span></div>`;
    if (addressState === "error") {
      return `<div class="checkout-inline-message checkout-message-error"><p>${escapeHTML(addressError)}</p><button type="button" class="checkout-retry" data-retry-address>Thử tải lại</button></div>`;
    }
    if (!addresses.length) {
      return `<div class="checkout-address-empty"><span class="checkout-empty-symbol">⌖</span><div><strong>Bạn chưa có địa chỉ nhận hàng</strong><p>Thêm địa chỉ trong tài khoản, sau đó quay lại bước thanh toán.</p><a class="checkout-text-link" href="account.html">Đến trang Tài khoản để thêm địa chỉ</a></div></div>`;
    }
    return `<div class="checkout-address-list">${addresses.map((address) => {
      const id = String(address.id);
      const isSelected = id === selectedId;
      return `<label class="checkout-address-card ${isSelected ? "is-selected" : ""}"><input type="radio" name="shipping-address" value="${escapeHTML(id)}" ${isSelected ? "checked" : ""} /><span class="checkout-radio-mark" aria-hidden="true"></span><span class="checkout-address-copy"><span class="checkout-recipient-line"><strong>${escapeHTML(address.recipient_name || "")}</strong><span>${escapeHTML(address.phone || "")}</span>${address.is_default ? '<em>Địa chỉ mặc định</em>' : ""}</span><span class="checkout-full-address">${escapeHTML(address.address || "")}</span></span></label>`;
    }).join("")}</div>`;
  }

  function renderItems() {
    return cart.map((item) => {
      const id = String(item._id ?? item.id ?? "");
      const image = getProductImageUrl(item.image);
      const name = escapeHTML(item.name || "Sản phẩm");
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const itemTotal = Number(item.price || 0) * quantity;
      return `<article class="checkout-product-row"><div class="checkout-product-image">${image ? `<img src="${escapeHTML(image)}" alt="${name}" loading="lazy" data-checkout-image />` : ""}<span ${image ? "hidden" : ""}>❋</span></div><div class="checkout-product-info"><span>${escapeHTML(item.category || "Sản phẩm")}</span><strong>${name}</strong><small>${formatPrice(item.price)} × ${quantity}</small></div><strong class="checkout-product-total">${formatPrice(itemTotal)}</strong><span class="checkout-product-id" hidden>${escapeHTML(id)}</span></article>`;
    }).join("");
  }

  function render() {
    if (createdOrder) {
      root.innerHTML = `<section class="checkout-empty checkout-order-success"><span>✓</span><h2>Đặt hàng thành công</h2><p>Mã đơn hàng: <strong>${escapeHTML(createdOrder.id)}</strong></p><p>Đơn hàng đang ở trạng thái chờ xác nhận. Bạn có thể theo dõi đơn sau khi tính năng theo dõi được kết nối.</p><a class="cart-continue-button" href="products.html">TIẾP TỤC MUA SẮM</a><a class="checkout-back-link" href="index.html">Về trang chủ</a></section>`;
      return;
    }
    if (!cart.length) {
      root.innerHTML = `<section class="checkout-empty"><span>🛒</span><h2>Giỏ hàng đang trống</h2><p>Thêm sản phẩm vào giỏ trước khi tiếp tục thanh toán.</p><a class="cart-continue-button" href="products.html">KHÁM PHÁ SẢN PHẨM</a><a class="checkout-back-link" href="cart.html">Quay lại giỏ hàng</a></section>`;
      return;
    }

    root.innerHTML = `${validationError || requestError ? `<div class="checkout-inline-message checkout-message-error" role="alert"><p>${escapeHTML(validationError || requestError)}</p></div>` : ""}<div class="checkout-layout"><div class="checkout-details">
      <section class="checkout-panel"><div class="checkout-panel-heading"><span class="checkout-step">01</span><div><h2>Thông tin nhận hàng</h2><p>Chọn địa chỉ đã lưu trong tài khoản của bạn.</p></div></div>${renderAddressSection()}</section>
      <section class="checkout-panel"><div class="checkout-panel-heading"><span class="checkout-step">02</span><div><h2>Phương thức thanh toán</h2><p>Thông tin thanh toán hiện có của website.</p></div></div><div class="checkout-inline-message checkout-message-info"><strong>Chưa có phương thức thanh toán được cấu hình</strong><p>Website chưa kết nối cổng thanh toán hoặc xác nhận thanh toán khi nhận hàng. Phương thức thanh toán chưa được chọn.</p></div></section>
      <section class="checkout-panel"><div class="checkout-panel-heading"><span class="checkout-step">03</span><div><h2>Kiểm tra đơn hàng</h2><p>${quantityCount} sản phẩm trong giỏ hàng.</p></div></div><div class="checkout-product-list">${renderItems()}</div></section>
    </div><aside class="checkout-summary"><h2>TỔNG KẾT ĐƠN HÀNG</h2><div class="checkout-summary-items"><span>Sản phẩm (${quantityCount})</span><strong>${formatPrice(subtotal)}</strong></div><div class="checkout-summary-items"><span>Phí vận chuyển</span><strong>Chưa xác định</strong></div><div class="summary-divider"></div><div class="summary-total"><span>Tạm tính (chưa gồm giao hàng)</span><strong>${formatPrice(subtotal)}</strong></div><p class="checkout-shipping-note">Tổng trên chưa bao gồm phí vận chuyển. Website hiện chưa có quy tắc tính phí giao hàng.</p><button class="checkout-button checkout-confirm-button" type="button" data-place-order ${isSubmitting ? "disabled" : ""}>${isSubmitting ? "ĐANG GỬI ĐƠN..." : "XÁC NHẬN ĐẶT HÀNG"}</button><p class="checkout-note">Backend sẽ kiểm tra tồn kho và tính giá từ cơ sở dữ liệu khi bạn xác nhận.</p><a class="checkout-back-link" href="cart.html">← Quay lại giỏ hàng</a></aside></div>`;

    root.querySelectorAll("[data-checkout-image]").forEach((image) => image.addEventListener("error", () => {
      image.hidden = true;
      image.parentElement.querySelector("span").hidden = false;
    }, { once: true }));
  }

  async function loadAddresses() {
    if (!auth) { addressState = "login"; render(); return; }
    addressState = "loading"; addressError = ""; render();
    try {
      addresses = await readAddressesAuth(auth);
      const defaultAddress = addresses.find((address) => address.is_default) || addresses[0];
      if (!addresses.some((address) => String(address.id) === selectedId)) selectedId = defaultAddress ? String(defaultAddress.id) : "";
      addressState = "ready";
    } catch (error) {
      if (error.status === 401) {
        auth = null;
        addressState = "login";
        addressError = "Phiên đăng nhập hết hạn. Hãy đăng nhập lại để tải địa chỉ.";
      } else {
        addressState = "error";
        addressError = error.message || "Không thể tải địa chỉ nhận hàng.";
      }
    }
    render();
  }

  root.addEventListener("change", (event) => {
    if (event.target.matches('[name="shipping-address"]')) {
      selectedId = event.target.value;
      validationError = "";
      requestError = "";
      isSubmitting = false;
      render();
    }
  });
  root.addEventListener("click", async (event) => {
    if (event.target.closest("[data-retry-address]")) { await loadAddresses(); return; }
    if (event.target.closest("[data-place-order]")) {
      if (isSubmitting) return;
      const currentCart = readCart();
      if (!currentCart.length) {
        cart = [];
        render();
        return;
      }
      if (!auth?.token) {
        validationError = "Bạn cần đăng nhập để đặt hàng. Giỏ hàng của bạn vẫn được giữ nguyên.";
        render();
        return;
      }
      if (!selectedId || !addresses.some((address) => String(address.id) === selectedId)) {
        validationError = addressState === "ready"
          ? "Vui lòng chọn địa chỉ nhận hàng trước khi tiếp tục."
          : "Cần đăng nhập và tải địa chỉ nhận hàng trước khi tiếp tục.";
        render();
        return;
      }
      validationError = "";
      requestError = "";

      const items = [];
      for (const [index, item] of currentCart.entries()) {
        const productId = Number(item._id ?? item.id);
        const quantity = Number(item.quantity);
        if (!Number.isSafeInteger(productId) || productId < 1 || !Number.isSafeInteger(quantity) || quantity < 1) {
          validationError = `Thông tin sản phẩm thứ ${index + 1} trong giỏ hàng không hợp lệ.`;
          render();
          return;
        }
        items.push({ product_id: productId, quantity });
      }

      isSubmitting = true;
      render();
      try {
        const response = await fetch(`${API_BASE_URL}/orders`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${auth.token}`,
          },
          body: JSON.stringify({ address_id: Number(selectedId), items }),
        });

        let result;
        try { result = await response.json(); }
        catch { throw new Error("Máy chủ trả về phản hồi đặt hàng không hợp lệ."); }

        if (response.status === 401) {
          localStorage.removeItem(AUTH_KEY);
          window.dispatchEvent(new CustomEvent("anh-nguyet-auth-updated", { detail: { user: null } }));
          auth = null;
          addressState = "login";
          addressError = "Phiên đăng nhập hết hạn. Hãy đăng nhập lại để đặt hàng.";
        }
        if (!response.ok || result?.success !== true) {
          throw new Error(result?.message || `Không thể tạo đơn hàng (${response.status}).`);
        }
        if (result.data?.id === undefined || result.data?.id === null || String(result.data.id).trim() === "") {
          throw new Error("Máy chủ chưa trả mã đơn hàng; giỏ hàng vẫn được giữ nguyên.");
        }

        createdOrder = result.data;
        cart = [];
        writeCart([]);
      } catch (error) {
        requestError = error instanceof TypeError
          ? "Không thể kết nối máy chủ. Giỏ hàng của bạn vẫn được giữ nguyên."
          : error.message || "Đặt hàng thất bại. Giỏ hàng của bạn vẫn được giữ nguyên.";
      } finally {
        isSubmitting = false;
        render();
      }
    }
  });

  render();
  if (cart.length) await loadAddresses();
}
