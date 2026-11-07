// Trang thanh toán chuẩn bị dữ liệu giao hàng và gửi yêu cầu tạo đơn.
import { escapeHTML, formatPrice } from "../components/product-card.js";
import { API_BASE_URL, getProductImageUrl } from "../services/api.js";
import {
  clearCartAfterOrder,
  loadCart,
  readCart,
} from "../services/cart.js";

const AUTH_KEY = "anh-nguyet-auth";
const ORDER_ATTEMPT_KEY = "anh-nguyet-order-attempt";

// Tạo mã duy nhất để Backend nhận diện lần thử đặt hàng.
function createRequestId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    (character) => {
      const random = Math.floor(Math.random() * 16);
      return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
    },
  );
}

// Dùng lại khóa cho cùng một nội dung nhằm tránh tạo đơn trùng.
function getOrderAttemptKey(payload, auth) {
  const canonical = {
    account_id: auth?.user?.id ?? null,
    address_id: payload.address_id ?? null,
    guest: payload.guest ?? null,
    payment_method: payload.payment_method,
    items: payload.items
      .slice()
      .sort((left, right) => left.product_id - right.product_id),
  };
  const signature = JSON.stringify(canonical);
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(ORDER_ATTEMPT_KEY) || "null",
    );
    if (saved?.signature === signature && saved?.key) return saved.key;
    const key = createRequestId();
    sessionStorage.setItem(
      ORDER_ATTEMPT_KEY,
      JSON.stringify({ signature, key }),
    );
    return key;
  } catch {
    return createRequestId();
  }
}

// Xóa khóa thử sau khi kết quả yêu cầu đã được xử lý.
function removeOrderAttemptKey(key) {
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(ORDER_ATTEMPT_KEY) || "null",
    );
    if (saved?.key === key) sessionStorage.removeItem(ORDER_ATTEMPT_KEY);
  } catch {
    /* Storage can be unavailable in private browser contexts. */
  }
}

// Đọc phiên đăng nhập hiện tại nếu có.
function readAuthSession() {
  try {
    const auth = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    return auth?.token && auth?.user ? auth : null;
  } catch {
    return null;
  }
}

// Lấy địa chỉ giao hàng bằng JWT của tài khoản.
function loadAddressesForSession(auth) {
  return fetch(`${API_BASE_URL}/auth/addresses`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  }).then(async (response) => {
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error("Máy chủ trả về dữ liệu địa chỉ không hợp lệ.");
    }
    if (response.status === 401) {
      localStorage.removeItem(AUTH_KEY);
      window.dispatchEvent(
        new CustomEvent("anh-nguyet-xac-thuc-cap-nhat", { detail: { user: null } }),
      );
    }
    if (!response.ok || result?.success === false) {
      const error = new Error(
        result?.message || `Không thể tải địa chỉ (${response.status}).`,
      );
      error.status = response.status;
      throw error;
    }
    return Array.isArray(result.data) ? result.data : [];
  });
}

// Khởi tạo trang, kiểm tra giỏ hàng/địa chỉ và xử lý xác nhận đặt hàng.
export async function mountCheckout() {
  const root = document.getElementById("checkout-goc");
  await loadCart();
  let cart = readCart();
  let auth = readAuthSession();
  let addresses = [];
  let selectedId = "";
  let addressState = auth ? "loading" : "guest";
  let addressError = "";
  let validationError = "";
  let createdOrder = null;
  let requestError = "";
  let isSubmitting = false;
  let guestRecipientName = "";
  let guestRecipientPhone = "";
  let guestShippingAddress = "";
  let createdAsGuest = false;
  let checkoutConfig = null;
  let checkoutConfigError = "";
  let paymentMethod = "cod";

  let subtotal = 0;
  let quantityCount = 0;

  // Tính lại tạm tính và tổng số lượng từ dữ liệu giỏ hàng hiện hành.
  // Tính tạm tính và tổng số lượng từ các dòng giỏ hàng hiện tại.
  function updateCartTotal() {
    subtotal = cart.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0,
    );
    quantityCount = cart.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0,
    );
  }

  updateCartTotal();

  // Dựng lựa chọn địa chỉ hoặc biểu mẫu thông tin khách vãng lai.
  function hienThiKhuVucDiaChi() {
    if (addressState === "guest") {
      return `<div class="checkout-guest-all-field">
        <p class="checkout-guest-note">Bạn có thể đặt hàng không cần tài khoản. Nhập thông tin nhận hàng để cửa hàng liên hệ xác nhận.</p>
        ${addressError ? `<p class="checkout-top-row-alert checkout-alert-error" role="alert">${escapeHTML(addressError)}</p>` : ""}
        <label class="checkout-guest-field">Họ và tên người nhận<input name="guest-nguoi-nhan-ten" autocomplete="name" maxlength="100" value="${escapeHTML(guestRecipientName)}" required /></label>
        <label class="checkout-guest-field">Số điện thoại<input name="guest-nguoi-nhan-dien-thoai" type="tel" autocomplete="tel" maxlength="20" value="${escapeHTML(guestRecipientPhone)}" required /></label>
        <label class="checkout-guest-field">Địa chỉ nhận hàng<textarea name="guest-giao-hang-dia-chi" autocomplete="street-dia-chi" rows="3" maxlength="2000" required>${escapeHTML(guestShippingAddress)}</textarea></label>
        <a class="checkout-text-link" href="login.html?returnTo=checkout.html">Đăng nhập để dùng địa chỉ đã lưu</a>
      </div>`;
    }
    if (addressState === "loading")
      return `<div class="checkout-address-detail-loading"><span class="account-loading-spinner"></span><span>Đang tải sổ địa chỉ...</span></div>`;
    if (addressState === "error") {
      return `<div class="checkout-top-row-alert checkout-alert-error"><p>${escapeHTML(addressError)}</p><button type="button" class="checkout-retry" data-retry-address-detail>Thử tải lại</button></div>`;
    }
    if (!addresses.length) {
      return `<div class="checkout-address-detail-empty"><span class="checkout-empty-icon">⌖</span><div><strong>Bạn chưa có địa chỉ nhận hàng</strong><p>Thêm địa chỉ trong tài khoản, sau đó quay lại bước thanh toán.</p><a class="checkout-text-link" href="account.html">Đến trang Tài khoản để thêm địa chỉ</a></div></div>`;
    }
    return `<div class="checkout-address-detail-list">${addresses
      .map((address) => {
        const id = String(address.id);
        const isSelected = id === selectedId;
        return `<label class="checkout-address-detail-card ${isSelected ? "is-da-chon" : ""}"><input type="radio" name="shipping-dia-chi" value="${escapeHTML(id)}" ${isSelected ? "checked" : ""} /><span class="checkout-button-select-header" aria-hidden="true"></span><span class="checkout-address-detail-content"><span class="checkout-recipient-row"><strong>${escapeHTML(address.recipient_name || "")}</strong><span>${escapeHTML(address.phone || "")}</span>${address.is_default ? "<em>Địa chỉ mặc định</em>" : ""}</span><span class="checkout-full-full-address-detail">${escapeHTML(address.address || "")}</span></span></label>`;
      })
      .join("")}</div>`;
  }

  // Hiển thị sản phẩm, số lượng và tổng tiền dự kiến.
  function hienThiMatHang() {
    return cart
      .map((item) => {
        const id = String(item._id ?? item.id ?? "");
        const image = getProductImageUrl(item.image);
        const name = escapeHTML(item.name || "Sản phẩm");
        const quantity = Math.max(1, Number(item.quantity) || 1);
        const itemTotal = Number(item.price || 0) * quantity;
        return `<article class="checkout-product-row"><div class="checkout-product-image">${image ? `<img src="${escapeHTML(image)}" alt="${name}" loading="lazy" data-checkout-image />` : ""}<span ${image ? "hidden" : ""}>❋</span></div><div class="checkout-product-info"><span>${escapeHTML(item.category || "Sản phẩm")}</span><strong>${name}</strong><small>${formatPrice(item.price)} × ${quantity}</small></div><strong class="checkout-product-tong">${formatPrice(itemTotal)}</strong><span class="checkout-product-code" hidden>${escapeHTML(id)}</span></article>`;
      })
      .join("");
  }

  // Cập nhật toàn bộ nội dung trang theo trạng thái thanh toán.
  function hienThiTrangThanhToan() {
    if (createdOrder) {
      const orderItems = Array.isArray(createdOrder.items)
        ? createdOrder.items
        : [];
      const trackingUrl = createdAsGuest
        ? `order-lookup.html?orderId=${encodeURIComponent(createdOrder.id)}`
        : "account.html?tab=orders";
      root.innerHTML = `<section class="checkout-order-success">
        <div class="checkout-success-icon" aria-hidden="true">✓</div>
        <span class="account-eyebrow">ÁNH NGUYỆT COLLECTION</span>
        <h1>Đặt hàng thành công</h1>
        <p class="checkout-success-order-id">Mã đơn hàng <strong>#${escapeHTML(createdOrder.id)}</strong></p>
        <p>Đơn hàng đang chờ cửa hàng xác nhận.</p>
        <div class="checkout-success-frame">
          <h2>Thông tin nhận hàng</h2>
          <strong>${escapeHTML(createdOrder.recipient_name || "")}</strong>
          <span>${escapeHTML(createdOrder.recipient_phone || "")}</span>
          <p>${escapeHTML(createdOrder.shipping_address || "")}</p>
        </div>
        <div class="checkout-success-frame">
          <h2>Sản phẩm đã đặt</h2>
          ${orderItems.map((item) => `<div class="checkout-success-item"><span>${escapeHTML(item.product_name || "Sản phẩm")} × ${Number(item.quantity) || 0}</span><strong>${formatPrice(item.line_total)}</strong></div>`).join("")}
          <div class="checkout-success-tong"><span>Tổng thanh toán</span><strong>${formatPrice(createdOrder.total_amount)}</strong></div>
        </div>
        <a class="checkout-button checkout-success-tracking" href="${trackingUrl}">${createdAsGuest ? "TRA CỨU ĐƠN HÀNG" : "XEM ĐƠN HÀNG CỦA TÔI"}</a>
        <a class="checkout-link-back" href="products.html">Tiếp tục mua sắm</a>
      </section>`;
      return;
    }
    if (!cart.length) {
      root.innerHTML = `<section class="checkout-empty"><span>🛒</span><h2>Giỏ hàng đang trống</h2><p>Thêm sản phẩm vào giỏ trước khi tiếp tục thanh toán.</p><a class="cart-continue-button" href="products.html">KHÁM PHÁ SẢN PHẨM</a><a class="checkout-link-back" href="cart.html">Quay lại giỏ hàng</a></section>`;
      return;
    }

    root.innerHTML = `${validationError || requestError ? `<div class="checkout-top-row-alert checkout-alert-error" role="alert"><p>${escapeHTML(validationError || requestError)}</p></div>` : ""}<div class="checkout-layout"><div class="checkout-detail">
      <section class="checkout-frame"><div class="checkout-frame-heading"><span class="checkout-buoc">01</span><div><h2>Thông tin nhận hàng</h2><p>${auth ? "Chọn địa chỉ đã lưu hoặc đăng nhập để tiếp tục." : "Nhập thông tin để đặt hàng không cần tài khoản."}</p></div></div>${hienThiKhuVucDiaChi()}</section>
      <section class="checkout-frame"><div class="checkout-frame-heading"><span class="checkout-buoc">02</span><div><h2>Phương thức thanh toán</h2><p>Thanh toán trực tiếp khi nhận hàng.</p></div></div><label class="checkout-payment-option"><input type="radio" name="payment-method" value="cod" checked /><span><strong>Thanh toán khi nhận hàng (COD)</strong><small>Bạn thanh toán cho đơn vị giao hàng khi nhận sản phẩm.</small></span></label>${checkoutConfigError ? `<p class="checkout-top-row-alert checkout-alert-error" role="alert">${escapeHTML(checkoutConfigError)}</p>` : ""}</section>
      <section class="checkout-frame"><div class="checkout-frame-heading"><span class="checkout-buoc">03</span><div><h2>Kiểm tra đơn hàng</h2><p>${quantityCount} sản phẩm trong giỏ hàng.</p></div></div><div class="checkout-product-list">${hienThiMatHang()}</div></section>
    </div><aside class="checkout-summary"><h2>TỔNG KẾT ĐƠN HÀNG</h2><div class="checkout-summary-item"><span>Sản phẩm (${quantityCount})</span><strong>${formatPrice(subtotal)}</strong></div><div class="checkout-summary-item"><span>Phí vận chuyển</span><strong>${checkoutConfig?.shipping_fee == null ? "Chưa cấu hình" : formatPrice(checkoutConfig.shipping_fee)}</strong></div><div class="summary-divider"></div><div class="summary-tong"><span>${checkoutConfig?.shipping_fee == null ? "Tạm tính (chưa gồm giao hàng)" : "Tổng thanh toán dự kiến"}</span><strong>${formatPrice(subtotal + (Number(checkoutConfig?.shipping_fee) || 0))}</strong></div><p class="checkout-shipping-note">${checkoutConfig?.shipping_fee == null ? "Chưa thể xác nhận đơn hàng vì cửa hàng chưa cấu hình phí vận chuyển chính thức." : "Backend sẽ xác nhận lại phí vận chuyển và tổng tiền khi tạo đơn."}</p><button class="checkout-button checkout-button-confirm" type="button" data-set-order ${isSubmitting ? "disabled" : ""}>${isSubmitting ? "ĐANG GỬI ĐƠN..." : "XÁC NHẬN ĐẶT HÀNG"}</button><p class="checkout-note">Backend kiểm tra tồn kho và tính giá từ cơ sở dữ liệu khi bạn xác nhận.</p><a class="checkout-link-back" href="cart.html">← Quay lại giỏ hàng</a></aside></div>`;

    root.querySelectorAll("[data-checkout-image]").forEach((image) =>
      image.addEventListener(
        "error",
        () => {
          image.hidden = true;
          image.parentElement.querySelector("span").hidden = false;
        },
        { once: true },
      ),
    );
  }

  // Tải các địa chỉ đã lưu của tài khoản đăng nhập.
  async function taiDanhSachDiaChi() {
    if (!auth) {
      addressState = "guest";
      hienThiTrangThanhToan();
      return;
    }
    addressState = "loading";
    addressError = "";
    hienThiTrangThanhToan();
    try {
      addresses = await loadAddressesForSession(auth);
      const defaultAddress =
        addresses.find((address) => address.is_default) || addresses[0];
      if (!addresses.some((address) => String(address.id) === selectedId))
        selectedId = defaultAddress ? String(defaultAddress.id) : "";
      addressState = "ready";
    } catch (error) {
      if (error.status === 401) {
        auth = null;
        addressState = "guest";
        addressError =
          "Phiên tài khoản đã hết hạn. Bạn có thể đăng nhập lại hoặc tiếp tục đặt hàng với thông tin nhận hàng mới.";
        cart = readCart();
        updateCartTotal();
        selectedId = "";
      } else {
        addressState = "error";
        addressError = error.message || "Không thể tải địa chỉ nhận hàng.";
      }
    }
    hienThiTrangThanhToan();
  }

  root.addEventListener("change", (event) => {
    if (event.target.matches('[name="payment-method"]')) {
      paymentMethod = event.target.value;
      return;
    }
    if (event.target.matches('[name="shipping-dia-chi"]')) {
      selectedId = event.target.value;
      validationError = "";
      requestError = "";
      isSubmitting = false;
      hienThiTrangThanhToan();
    }
  });
  root.addEventListener("input", (event) => {
    if (event.target.name === "guest-nguoi-nhan-ten")
      guestRecipientName = event.target.value;
    if (event.target.name === "guest-nguoi-nhan-dien-thoai")
      guestRecipientPhone = event.target.value;
    if (event.target.name === "guest-giao-hang-dia-chi")
      guestShippingAddress = event.target.value;
    if (event.target.name?.startsWith("guest-")) addressError = "";
  });
  root.addEventListener("click", async (event) => {
    if (event.target.closest("[data-retry-address-detail]")) {
      await taiDanhSachDiaChi();
      return;
    }
    if (event.target.closest("[data-set-order]")) {
      if (isSubmitting) return;
      const currentAuth = readAuthSession();
      if ((auth?.user?.id ?? null) !== (currentAuth?.user?.id ?? null)) {
        auth = currentAuth;
        await loadCart();
        cart = readCart();
        updateCartTotal();
        selectedId = "";
        if (auth) await taiDanhSachDiaChi();
        else {
          addressState = "guest";
          addresses = [];
        }
        hienThiTrangThanhToan();
        return;
      }
      const currentCart = readCart();
      cart = currentCart;
      updateCartTotal();
      if (!currentCart.length) {
        cart = [];
        hienThiTrangThanhToan();
        return;
      }
      if (
        auth &&
        (!selectedId ||
          !addresses.some((address) => String(address.id) === selectedId))
      ) {
        validationError =
          addressState === "ready"
            ? "Vui lòng chọn địa chỉ nhận hàng trước khi tiếp tục."
            : "Vui lòng tải địa chỉ nhận hàng hoặc đăng nhập lại.";
        hienThiTrangThanhToan();
        return;
      }
      if (!auth) {
        const phone = guestRecipientPhone.trim();
        if (
          !guestRecipientName.trim() ||
          guestRecipientName.trim().length > 100
        ) {
          validationError = "Vui lòng nhập họ tên người nhận hợp lệ.";
          hienThiTrangThanhToan();
          return;
        }
        if (!/^[+\d][+\d\s().-]{5,19}$/.test(phone)) {
          validationError = "Vui lòng nhập số điện thoại hợp lệ.";
          hienThiTrangThanhToan();
          return;
        }
        if (
          !guestShippingAddress.trim() ||
          guestShippingAddress.trim().length > 2000
        ) {
          validationError = "Vui lòng nhập địa chỉ nhận hàng hợp lệ.";
          hienThiTrangThanhToan();
          return;
        }
      }
      validationError = "";
      requestError = "";

      const items = [];
      for (const [index, item] of currentCart.entries()) {
        const productId = Number(item._id ?? item.id);
        const quantity = Number(item.quantity);
        if (
          !Number.isSafeInteger(productId) ||
          productId < 1 ||
          !Number.isSafeInteger(quantity) ||
          quantity < 1
        ) {
          validationError = `Thông tin sản phẩm thứ ${index + 1} trong giỏ hàng không hợp lệ.`;
          hienThiTrangThanhToan();
          return;
        }
        items.push({ product_id: productId, quantity });
      }

      isSubmitting = true;
      hienThiTrangThanhToan();
      const authForOrder = auth;
      const orderPayload = authForOrder
        ? { address_id: Number(selectedId), payment_method: paymentMethod, items }
        : {
            payment_method: paymentMethod,
            guest: {
              recipient_name: guestRecipientName.trim(),
              recipient_phone: guestRecipientPhone.trim(),
              shipping_address: guestShippingAddress.trim(),
            },
            items,
          };
      const idempotencyKey = getOrderAttemptKey(orderPayload, authForOrder);
      try {
        const headers = {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        };
        if (authForOrder?.token)
          headers.Authorization = `Bearer ${authForOrder.token}`;
        const response = await fetch(`${API_BASE_URL}/orders`, {
          method: "POST",
          headers,
          body: JSON.stringify(orderPayload),
        });

        let result;
        try {
          result = await response.json();
        } catch {
          throw new Error("Máy chủ trả về phản hồi đặt hàng không hợp lệ.");
        }

        if (response.status === 401) {
          localStorage.removeItem(AUTH_KEY);
          window.dispatchEvent(
            new CustomEvent("anh-nguyet-xac-thuc-cap-nhat", {
              detail: { user: null },
            }),
          );
          auth = null;
          addressState = "guest";
          addressError =
            "Phiên đăng nhập đã hết hạn. Giỏ hàng tài khoản được giữ riêng; hãy tải lại trang để tiếp tục với giỏ hàng khách.";
          cart = readCart();
          updateCartTotal();
        }
        if (!response.ok || result?.success !== true) {
          throw new Error(
            result?.message || `Không thể tạo đơn hàng (${response.status}).`,
          );
        }
        if (
          result.data?.id === undefined ||
          result.data?.id === null ||
          String(result.data.id).trim() === ""
        ) {
          throw new Error(
            "Máy chủ chưa trả mã đơn hàng; giỏ hàng vẫn được giữ nguyên.",
          );
        }

        createdOrder = result.data;
        createdAsGuest = result.data.customer_type === "guest" || !authForOrder;
        removeOrderAttemptKey(idempotencyKey);
        clearCartAfterOrder(authForOrder);
        cart = [];
        updateCartTotal();
      } catch (error) {
        requestError =
          error instanceof TypeError
            ? "Không thể kết nối máy chủ. Giỏ hàng của bạn vẫn được giữ nguyên."
            : error.message ||
              "Đặt hàng thất bại. Giỏ hàng của bạn vẫn được giữ nguyên.";
      } finally {
        isSubmitting = false;
        hienThiTrangThanhToan();
      }
    }
  });

  try {
    const response = await fetch(`${API_BASE_URL}/checkout/config`);
    const result = await response.json();
    if (!response.ok || result?.success !== true) {
      throw new Error(result?.message || `Không thể tải cấu hình thanh toán (${response.status}).`);
    }
    checkoutConfig = result.data ?? result;
    if (!Array.isArray(checkoutConfig?.payment_methods) || !checkoutConfig.payment_methods.includes("cod")) {
      throw new Error("Backend chưa bật phương thức COD.");
    }
  } catch (error) {
    checkoutConfigError = error instanceof TypeError
      ? "Không thể kết nối máy chủ để tải cấu hình thanh toán."
      : error.message || "Không thể tải cấu hình thanh toán.";
  }
  hienThiTrangThanhToan();
  if (cart.length) await taiDanhSachDiaChi();
}
