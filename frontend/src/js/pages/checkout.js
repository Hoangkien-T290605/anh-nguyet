// Trang thanh toán chuẩn bị dữ liệu giao hàng và gửi yêu cầu tạo đơn.
import { escapeHTML, formatPrice } from "../components/product-card.js";
import { API_BASE_URL, apiRequest, getProductImageUrl } from "../services/api.js";
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
    shipping_region_code: payload.shipping_region_code ?? null,
    voucher_code: payload.voucher_code ?? null,
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

// Hiển thị ngày hết hạn do Backend trả về, nếu Voucher có thời hạn.
function formatVoucherExpiration(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

// Lấy địa chỉ giao hàng bằng JWT của tài khoản.
function loadAddressesForSession(auth) {
  return fetch(`${API_BASE_URL}/auth/addresses`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    signal: AbortSignal.timeout(12000),
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
  let shippingRegionCode = "";
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
  let voucherCode = "";
  let voucherResult = null;
  let voucherCartSignature = "";
  let voucherMessage = "";
  let voucherError = false;
  let isValidatingVoucher = false;
  let availableVouchers = [];
  let availableVoucherMessage = "";
  let voucherListExpanded = false;
  let voucherValidationId = 0;
  let pendingVoucherRevalidation = "";

  let subtotal = 0;
  let quantityCount = 0;

  function currentCartSignature() {
    return JSON.stringify(cart.map((item) => ({ product_id: Number(item._id ?? item.id), quantity: Number(item.quantity) })).sort((a, b) => a.product_id - b.product_id));
  }

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
    if (voucherResult && voucherCartSignature !== currentCartSignature()) {
      voucherResult = null;
      voucherMessage = "Giỏ hàng đã thay đổi; vui lòng kiểm tra lại mã giảm giá.";
      voucherError = true;
    }
  }

  updateCartTotal();

  // Hiển thị khu vực và mức phí Backend đã kích hoạt.
  function hienThiChonVungVanChuyen() {
    const regions = Array.isArray(checkoutConfig?.shipping_regions) ? checkoutConfig.shipping_regions : [];
    if (!checkoutConfig?.shipping_regions_available) {
      return `<p class="checkout-shipping-note" role="status">Phí giao hàng theo khu vực chưa được cấu hình trong cơ sở dữ liệu.</p>`;
    }
    if (!regions.length) {
      return `<p class="checkout-shipping-note" role="status">Chưa có khu vực giao hàng nào được kích hoạt. Cửa hàng cần cấu hình giá trước khi nhận đơn.</p>`;
    }
    return `<label class="checkout-guest-field">Khu vực giao hàng<select name="shipping-region" required><option value="">Chọn khu vực giao hàng</option>${regions.map((region) => `<option value="${escapeHTML(region.region_code)}" ${shippingRegionCode === region.region_code ? "selected" : ""}>${escapeHTML(region.region_name)} · ${formatPrice(region.fee)}</option>`).join("")}</select></label>`;
  }

  // Dựng lựa chọn địa chỉ hoặc biểu mẫu thông tin khách vãng lai.
  function hienThiKhuVucDiaChi() {
    if (addressState === "guest") {
      return `<div class="checkout-guest-all-field">
        <p class="checkout-guest-note">Bạn có thể đặt hàng không cần tài khoản. Nhập thông tin nhận hàng để cửa hàng liên hệ xác nhận.</p>
        ${addressError ? `<p class="checkout-top-row-alert checkout-alert-error" role="alert">${escapeHTML(addressError)}</p>` : ""}
        <label class="checkout-guest-field">Họ và tên người nhận<input name="guest-nguoi-nhan-ten" autocomplete="name" maxlength="100" value="${escapeHTML(guestRecipientName)}" required /></label>
        <label class="checkout-guest-field">Số điện thoại<input name="guest-nguoi-nhan-dien-thoai" type="tel" autocomplete="tel" maxlength="20" value="${escapeHTML(guestRecipientPhone)}" required /></label>
        <label class="checkout-guest-field">Địa chỉ nhận hàng<textarea name="guest-giao-hang-dia-chi" autocomplete="street-address" rows="3" maxlength="2000" required>${escapeHTML(guestShippingAddress)}</textarea></label>
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
          <div class="checkout-success-item"><span>Giao hàng · ${escapeHTML(createdOrder.shipping_region_name || "Khu vực đã chọn")}</span><strong>${formatPrice(createdOrder.shipping_fee)}</strong></div>
          ${Number(createdOrder.discount_amount) > 0 ? `<div class="checkout-success-item"><span>Mã ${escapeHTML(createdOrder.voucher_code || "voucher")} · giảm giá</span><strong>−${formatPrice(createdOrder.discount_amount)}</strong></div>` : ""}
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

    const activeShippingRegions = Array.isArray(checkoutConfig?.shipping_regions) ? checkoutConfig.shipping_regions : [];
    const selectedShippingRegion = activeShippingRegions.find((region) => region.region_code === shippingRegionCode);
    const shippingFeeValue = selectedShippingRegion?.fee;
    const shippingFee = Number(shippingFeeValue);
    const shippingFeeReady = checkoutConfig?.shipping_regions_available === true &&
      shippingFeeValue != null && Number.isFinite(shippingFee) && shippingFee >= 0;
    const shippingFeeLabel = checkoutConfigError
      ? "Không tải được"
      : shippingFeeReady
        ? formatPrice(shippingFee)
        : "Chưa cấu hình";
    const shippingFeeNote = checkoutConfigError
      ? "Không thể xác định phí vận chuyển. Vui lòng thử tải lại trang trước khi đặt hàng."
      : shippingFeeReady
        ? "Backend sẽ xác nhận lại phí vận chuyển và tổng tiền khi tạo đơn."
        : "Cửa hàng chưa cấu hình phí vận chuyển chính thức nên chưa thể xác nhận đơn hàng.";
    const activeVoucherResult = voucherResult && voucherCartSignature === currentCartSignature() ? voucherResult : null;
    const discountAmount = Number(activeVoucherResult?.discount_amount) || 0;
    const displaySubtotal = Number.isFinite(Number(activeVoucherResult?.subtotal))
      ? Number(activeVoucherResult.subtotal)
      : subtotal;
    const expectedTotal = displaySubtotal + (shippingFeeReady ? shippingFee : 0) - discountAmount;
    const voucherInfoMarkup = activeVoucherResult
      ? `<p class="checkout-voucher-message is-success" role="status"><strong>${escapeHTML(activeVoucherResult.campaign_name || activeVoucherResult.code)}</strong>${activeVoucherResult.description ? ` · ${escapeHTML(activeVoucherResult.description)}` : ""}</p>`
      : "";
    const cartEligibleVouchers = availableVouchers.filter((voucher) => {
      const minimumSubtotal = Number(voucher.minimum_subtotal);
      return Number.isFinite(minimumSubtotal) && subtotal >= minimumSubtotal;
    });
    const availableVoucherMarkup = cartEligibleVouchers.length
      ? `<div class="checkout-voucher-available"><button class="checkout-voucher-list-toggle" type="button" data-voucher-list-toggle aria-controls="checkout-voucher-list" aria-expanded="${voucherListExpanded}"><span>Mã đang khả dụng <small>${cartEligibleVouchers.length} mã</small></span><span class="checkout-voucher-chevron" aria-hidden="true"></span></button><div class="checkout-voucher-list" id="checkout-voucher-list" aria-label="Danh sách mã giảm giá" tabindex="0" ${voucherListExpanded ? "" : "hidden"}>${cartEligibleVouchers.map((voucher) => `<article><div><strong>${escapeHTML(voucher.code)}</strong><span>${escapeHTML(voucher.campaign_name || "")}</span><small>${voucher.discount_type === "percentage" ? `${Number(voucher.discount_value)}%${voucher.maximum_discount == null ? "" : ` · tối đa ${formatPrice(voucher.maximum_discount)}`}` : formatPrice(voucher.discount_value)} · đơn tối thiểu ${formatPrice(voucher.minimum_subtotal)}</small>${voucher.ends_at ? `<small>Hạn sử dụng: ${escapeHTML(formatVoucherExpiration(voucher.ends_at))}</small>` : ""}</div><button type="button" data-voucher-choose="${escapeHTML(voucher.code)}" ${isValidatingVoucher || isSubmitting ? "disabled" : ""}>Dùng mã</button></article>`).join("")}</div></div>`
      : availableVouchers.length
        ? `<p class="checkout-voucher-message" role="status">Giỏ hàng chưa đạt điều kiện đơn tối thiểu của các mã hiện có.</p>`
        : availableVoucherMessage ? `<p class="checkout-voucher-message" role="status">${escapeHTML(availableVoucherMessage)}</p>` : "";

    const voucherControlMarkup = `<div class="checkout-voucher-control"><label for="checkout-voucher-code">Mã giảm giá</label><div><input id="checkout-voucher-code" name="voucher-code" maxlength="40" autocomplete="off" value="${escapeHTML(voucherCode)}" placeholder="Nhập mã voucher" ${isValidatingVoucher || isSubmitting ? "disabled" : ""} /><button class="checkout-voucher-button" type="button" data-voucher-validate ${isValidatingVoucher || isSubmitting ? "disabled" : ""}>${isValidatingVoucher ? "ĐANG KIỂM TRA..." : "ÁP DỤNG"}</button>${activeVoucherResult ? `<button class="checkout-voucher-button checkout-voucher-remove" type="button" data-voucher-remove ${isValidatingVoucher || isSubmitting ? "disabled" : ""}>GỠ MÃ</button>` : ""}</div>${voucherMessage ? `<p class="checkout-voucher-message ${voucherError ? "is-error" : "is-success"}" role="${voucherError ? "alert" : "status"}">${escapeHTML(voucherMessage)}</p>` : ""}${voucherInfoMarkup}${activeVoucherResult ? `<div class="checkout-summary-item checkout-voucher-discount"><span>Giảm giá · ${escapeHTML(activeVoucherResult.code)}</span><strong>−${formatPrice(discountAmount)}</strong></div>` : ""}${checkoutConfig?.voucher_available === true ? availableVoucherMarkup : `<p class="checkout-shipping-note">Danh sách Voucher sẽ hiển thị khi Backend đã kích hoạt dữ liệu Voucher. Mã nhập vào vẫn được gửi đến Backend để xác minh.</p>`}</div>`;

    root.innerHTML = `${validationError || requestError ? `<div class="checkout-top-row-alert checkout-alert-error" role="alert"><p>${escapeHTML(validationError || requestError)}</p></div>` : ""}<div class="checkout-layout"><div class="checkout-detail">
      <section class="checkout-frame"><div class="checkout-frame-heading"><span class="checkout-buoc">01</span><div><h2>Thông tin nhận hàng</h2><p>${auth ? "Chọn địa chỉ đã lưu hoặc đăng nhập để tiếp tục." : "Nhập thông tin để đặt hàng không cần tài khoản."}</p></div></div>${hienThiKhuVucDiaChi()}${hienThiChonVungVanChuyen()}</section>
      <section class="checkout-frame"><div class="checkout-frame-heading"><span class="checkout-buoc">02</span><div><h2>Phương thức thanh toán</h2><p>Thanh toán trực tiếp khi nhận hàng.</p></div></div><label class="checkout-payment-option"><input type="radio" name="payment-method" value="cod" checked /><span><strong>Thanh toán khi nhận hàng (COD)</strong><small>Bạn thanh toán cho đơn vị giao hàng khi nhận sản phẩm.</small></span></label>${checkoutConfigError ? `<p class="checkout-top-row-alert checkout-alert-error" role="alert">${escapeHTML(checkoutConfigError)}</p>` : ""}</section>
      <section class="checkout-frame"><div class="checkout-frame-heading"><span class="checkout-buoc">03</span><div><h2>Kiểm tra đơn hàng</h2><p>${quantityCount} sản phẩm trong giỏ hàng.</p></div></div><div class="checkout-product-list">${hienThiMatHang()}</div></section>
    </div><aside class="checkout-summary"><h2>TỔNG KẾT ĐƠN HÀNG</h2><div class="checkout-summary-item"><span>Sản phẩm (${quantityCount})</span><strong>${formatPrice(displaySubtotal)}</strong></div><div class="checkout-summary-item"><span>Phí vận chuyển</span><strong>${shippingFeeLabel}</strong></div>${voucherControlMarkup}<div class="summary-divider"></div><div class="summary-tong"><span>${shippingFeeReady ? "Tổng thanh toán dự kiến" : "Tạm tính (chưa gồm giao hàng)"}</span><strong>${formatPrice(expectedTotal)}</strong></div><p class="checkout-shipping-note">${escapeHTML(shippingFeeNote)}</p><button class="checkout-button checkout-button-confirm" type="button" data-set-order ${isSubmitting || !shippingFeeReady ? "disabled" : ""}>${isSubmitting ? "ĐANG GỬI ĐƠN..." : "XÁC NHẬN ĐẶT HÀNG"}</button><p class="checkout-note">Backend kiểm tra tồn kho, giá và mã giảm giá từ cơ sở dữ liệu khi bạn xác nhận.</p><a class="checkout-link-back" href="cart.html">← Quay lại giỏ hàng</a></aside></div>`;

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
        addressError =
          error.name === "TimeoutError"
            ? "Máy chủ không phản hồi khi tải địa chỉ nhận hàng. Vui lòng thử lại."
            : error.message || "Không thể tải địa chỉ nhận hàng.";
      }
    }
    hienThiTrangThanhToan();
  }

  async function validateVoucherCode(code, { quiet = false } = {}) {
    if (isValidatingVoucher || isSubmitting) return false;
    const normalizedCode = String(code || "").trim();
    if (!normalizedCode) {
      voucherMessage = "Vui lòng nhập mã giảm giá.";
      voucherError = true;
      hienThiTrangThanhToan();
      return false;
    }
    const requestId = ++voucherValidationId;
    const requestSignature = currentCartSignature();
    voucherResult = null;
    voucherCartSignature = "";
    isValidatingVoucher = true;
    voucherMessage = quiet ? "Đang kiểm tra lại mã với giỏ hàng mới..." : "Đang kiểm tra điều kiện mã giảm giá...";
    voucherError = false;
    voucherCode = normalizedCode;
    hienThiTrangThanhToan();
    try {
      const items = cart.map((item) => ({ product_id: Number(item._id ?? item.id), quantity: Number(item.quantity) }));
      const authAtRequest = readAuthSession();
      const headers = authAtRequest?.token ? { Authorization: `Bearer ${authAtRequest.token}` } : {};
      const result = await apiRequest("/vouchers/validate", {
        method: "POST",
        headers,
        body: JSON.stringify({ code: normalizedCode, items }),
      });
      if (requestId !== voucherValidationId) return false;
      if (requestSignature !== currentCartSignature()) {
        voucherResult = null;
        voucherCartSignature = "";
        voucherMessage = "Giỏ hàng đã thay đổi trong lúc kiểm tra; vui lòng áp dụng lại mã.";
        voucherError = true;
        return false;
      }
      if (!result.success || !result.data) throw new Error("Backend không xác nhận mã giảm giá.");
      voucherResult = result.data;
      voucherCartSignature = requestSignature;
      voucherCode = result.data.code;
      voucherMessage = `Đã áp dụng ${result.data.campaign_name || result.data.code}, giảm ${formatPrice(result.data.discount_amount)}.`;
      voucherError = false;
      return true;
    } catch (error) {
      if (requestId === voucherValidationId) {
        voucherResult = null;
        voucherCartSignature = "";
        voucherMessage = error.message || "Không thể xác minh mã giảm giá.";
        voucherError = true;
      }
      return false;
    } finally {
      if (requestId === voucherValidationId) {
        isValidatingVoucher = false;
        hienThiTrangThanhToan();
        if (pendingVoucherRevalidation) {
          const pendingCode = pendingVoucherRevalidation;
          pendingVoucherRevalidation = "";
          void validateVoucherCode(pendingCode, { quiet: true });
        }
      }
    }
  }

  window.addEventListener("anh-nguyet-cart-cap-nhat", () => {
    const previousSignature = currentCartSignature();
    const revalidateCode = (voucherResult || isValidatingVoucher) && voucherCode ? voucherCode : "";
    cart = readCart();
    const changed = previousSignature !== currentCartSignature();
    updateCartTotal();
    if (!cart.length || createdOrder) {
      voucherValidationId += 1;
      pendingVoucherRevalidation = "";
      isValidatingVoucher = false;
      hienThiTrangThanhToan();
      return;
    }
    hienThiTrangThanhToan();
    if (changed && revalidateCode) {
      if (isValidatingVoucher) pendingVoucherRevalidation = revalidateCode;
      else void validateVoucherCode(revalidateCode, { quiet: true });
    }
  });

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
    if (event.target.name === "voucher-code") {
      voucherCode = event.target.value;
      voucherResult = null;
      voucherMessage = "";
    }
    if (event.target.name?.startsWith("guest-")) addressError = "";
  });
  root.addEventListener("click", async (event) => {
    const voucherListToggle = event.target.closest("[data-voucher-list-toggle]");
    if (voucherListToggle) {
      voucherListExpanded = !voucherListExpanded;
      voucherListToggle.setAttribute("aria-expanded", String(voucherListExpanded));
      const voucherList = root.querySelector("#checkout-voucher-list");
      if (voucherList) voucherList.hidden = !voucherListExpanded;
      return;
    }
    if (event.target.closest("[data-voucher-remove]")) {
      if (isValidatingVoucher || isSubmitting) return;
      voucherCode = "";
      voucherResult = null;
      voucherCartSignature = "";
      voucherMessage = "Đã gỡ mã giảm giá.";
      voucherError = false;
      hienThiTrangThanhToan();
      return;
    }
    if (event.target.matches('[name="shipping-region"]')) {
      shippingRegionCode = event.target.value;
      validationError = "";
      hienThiTrangThanhToan();
    }
    if (event.target.closest("[data-retry-address-detail]")) {
      await taiDanhSachDiaChi();
      return;
    }
    if (event.target.closest("[data-voucher-validate]")) {
      const input = root.querySelector('[name="voucher-code"]');
      voucherCode = input?.value.trim() || "";
      await validateVoucherCode(voucherCode);
      return;
    }
    const chooseVoucher = event.target.closest("[data-voucher-choose]");
    if (chooseVoucher) {
      voucherCode = chooseVoucher.dataset.voucherChoose || "";
      await validateVoucherCode(voucherCode);
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
      if (!Array.isArray(checkoutConfig?.shipping_regions) || !checkoutConfig.shipping_regions.some((region) => region.region_code === shippingRegionCode)) {
        validationError = "Vui lòng chọn khu vực giao hàng có phí đã được cấu hình.";
        hienThiTrangThanhToan();
        return;
      }
      if (voucherCode && (!voucherResult || voucherCartSignature !== currentCartSignature())) {
        validationError = "Vui lòng kiểm tra lại mã giảm giá trước khi đặt hàng.";
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
        ? { address_id: Number(selectedId), shipping_region_code: shippingRegionCode, payment_method: paymentMethod, items, ...(voucherResult ? { voucher_code: voucherResult.code } : {}) }
        : {
            payment_method: paymentMethod,
            shipping_region_code: shippingRegionCode,
            guest: {
              recipient_name: guestRecipientName.trim(),
              recipient_phone: guestRecipientPhone.trim(),
              shipping_address: guestShippingAddress.trim(),
            },
            items,
            ...(voucherResult ? { voucher_code: voucherResult.code } : {}),
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
          signal: AbortSignal.timeout(30000),
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
          error.name === "TimeoutError"
            ? "Máy chủ phản hồi quá thời gian. Giỏ hàng vẫn được giữ; bạn có thể thử lại an toàn."
            : error instanceof TypeError
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
    const result = await apiRequest("/checkout/config", {
      signal: AbortSignal.timeout(12000),
    });
    if (result?.success !== true) throw new Error("Backend chưa xác nhận cấu hình thanh toán.");
    checkoutConfig = result.data ?? result;
    if (!Array.isArray(checkoutConfig?.payment_methods) || !checkoutConfig.payment_methods.includes("cod")) {
      throw new Error("Backend chưa bật phương thức COD.");
    }
    if (!Array.isArray(checkoutConfig.shipping_regions)) throw new Error("Máy chủ trả về danh sách khu vực giao hàng không hợp lệ.");
    if (checkoutConfig.shipping_regions.some((region) => !region || typeof region.region_code !== "string" || typeof region.region_name !== "string" || !Number.isFinite(Number(region.fee)) || Number(region.fee) < 0)) throw new Error("Máy chủ trả về mức phí khu vực không hợp lệ.");
  } catch (error) {
    checkoutConfig = null;
    checkoutConfigError =
      error.name === "TimeoutError"
        ? "Máy chủ không phản hồi khi tải cấu hình thanh toán."
        : error instanceof TypeError
          ? "Không thể kết nối máy chủ để tải cấu hình thanh toán."
          : error.message || "Không thể tải cấu hình thanh toán.";
  }
  if (checkoutConfig?.voucher_available === true && cart.length) {
    try {
      const currentAuth = readAuthSession();
      const headers = currentAuth?.token ? { Authorization: `Bearer ${currentAuth.token}` } : {};
      const result = await apiRequest("/vouchers/available", {
        headers,
        signal: AbortSignal.timeout(12000),
      });
      availableVouchers = Array.isArray(result.data) ? result.data : [];
      availableVoucherMessage = availableVouchers.length ? "" : "Hiện không có mã giảm giá khả dụng cho tài khoản và giỏ hàng này.";
    } catch (error) {
      availableVouchers = [];
      availableVoucherMessage = error.message || "Không thể tải danh sách mã giảm giá; bạn vẫn có thể nhập mã để kiểm tra.";
    }
  }
  hienThiTrangThanhToan();
  if (cart.length) await taiDanhSachDiaChi();
}
