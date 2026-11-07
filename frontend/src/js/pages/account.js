// Trang tài khoản gồm hồ sơ, địa chỉ và lịch sử đơn hàng của người dùng.
import {
  API_BASE_URL,
  getAvatarUrl,
  getProductImageUrl,
} from "../services/api.js";

const {
  divIcon,
  map: createMap,
  marker: createMarker,
  tileLayer,
} = globalThis.L || {};
const accountIconUrl = "./assets/icon-account.png";

const AUTH_KEY = "anh-nguyet-auth";
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const DEFAULT_CENTER = [16, 106];
const addressMarkerIcon = divIcon?.({
  className: "account-map-marker",
  html: '<span class="account-map-marker" aria-hidden="true"></span>',
  iconSize: [28, 36],
  iconAnchor: [14, 34],
});
const gpsMarkerIcon = divIcon?.({
  className: "account-gps-marker",
  html: '<span class="account-gps-marker-ring" aria-hidden="true"><span></span></span>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

// Mã hóa nội dung động trước khi dựng HTML.
function escapeHTML(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}

// Đọc phiên đăng nhập đã lưu trên trình duyệt.
function readAuthSession() {
  try {
    const auth = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    return auth?.token && auth?.user ? auth : null;
  } catch {
    return null;
  }
}

// Tạo chữ viết tắt để dùng khi tài khoản chưa có ảnh đại diện.
function getInitials(name = "") {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  return words.length > 1
    ? `${words.at(-1)[0]}${words[0][0]}`.toUpperCase()
    : (words[0] || "AN").slice(0, 2).toUpperCase();
}

const ORDER_STATUS_LABELS = {
  pending_confirmation: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  preparing: "Đang chuẩn bị",
  shipping: "Đang giao",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
};

// Định dạng tổng tiền đơn hàng theo tiền tệ Việt Nam.
function formatCurrency(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0,
      }).format(amount)
    : "—";
}

// Định dạng thời điểm tạo đơn theo ngôn ngữ Việt Nam.
function formatOrderDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

// Chuyển mã trạng thái Backend thành nhãn giao diện tiếng Việt.
function getOrderStatus(status) {
  return ORDER_STATUS_LABELS[status] || "Đang cập nhật";
}

// Gửi yêu cầu có JWT và giữ thông tin trạng thái lỗi cho trang tài khoản.
async function accountRequest(path, auth, options = {}) {
  const multipart = options.body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body && !multipart
        ? { "Content-Type": "application/json" }
        : {}),
      Authorization: `Bearer ${auth.token}`,
      ...options.headers,
    },
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("Máy chủ trả về dữ liệu không hợp lệ.");
  }
  if (response.status === 401) {
    const error = new Error(
      result?.message || "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.",
    );
    error.status = 401;
    throw error;
  }
  if (!response.ok || result?.success === false) {
    const error = new Error(
      result?.message || `Yêu cầu thất bại (${response.status}).`,
    );
    error.status = response.status;
    throw error;
  }
  return result;
}

// Nạp dữ liệu tài khoản và khởi tạo các tab hồ sơ, địa chỉ, đơn hàng.
export async function mountAccount() {
  const root = document.getElementById("account-goc");
  const requestedTab = new URLSearchParams(window.location.search).get("tab");
  const initialTab = ["profile", "addresses", "orders"].includes(requestedTab)
    ? requestedTab
    : "profile";
  const auth = readAuthSession();
  if (!auth) {
    const returnTo = `account.html?tab=${initialTab}`;
    window.location.replace(
      `login.html?returnTo=${encodeURIComponent(returnTo)}`,
    );
    return;
  }

  let user = auth.user;
  let addresses = [];
  let orders = [];
  let ordersLoaded = false;
  let ordersLoading = false;
  let ordersError = "";
  let selectedOrderId = null;
  let selectedOrder = null;
  let orderDetailLoading = false;
  let orderDetailError = "";
  let tab = initialTab;
  let addressFormOpen = false;
  let editingId = null;
  let addressDraft = null;
  let avatarFile = null;
  let avatarPreview = "";
  let map = null;
  let marker = null;
  let gpsMarker = null;
  let gpsPosition = null;
  let saving = false;
  let uploading = false;
  let locating = false;
  let busy = false;
  let message = "";
  let messageType = "success";

  // Hiển thị thông báo thao tác trên trang tài khoản.
  const hienThongBaoTaiKhoan = (text, type = "success") => {
    message = text;
    messageType = type;
    hienThiTrangTaiKhoan();
  };
  // Xóa phiên hết hạn và đưa người dùng về luồng đăng nhập.
  const xoaPhienHetHan = () => {
    localStorage.removeItem(AUTH_KEY);
    window.dispatchEvent(
      new CustomEvent("anh-nguyet-xac-thuc-cap-nhat", { detail: { user: null } }),
    );
    const returnTo = `account.html?tab=${tab}`;
    window.location.replace(
      `login.html?session=expired&returnTo=${encodeURIComponent(returnTo)}`,
    );
  };
  // Cập nhật hồ sơ cục bộ và đồng bộ lại thông tin trên đầu trang.
  const capNhatNguoiDung = (value) => {
    user = value;
    localStorage.setItem(AUTH_KEY, JSON.stringify({ ...auth, user }));
    window.dispatchEvent(
      new CustomEvent("anh-nguyet-xac-thuc-cap-nhat", { detail: { user } }),
    );
  };
  // Gửi yêu cầu tài khoản kèm token, đồng thời xử lý phiên hết hạn.
  const guiYeuCauTaiKhoanNoiBo = async (path, options) => {
    try {
      return await accountRequest(path, auth, options);
    } catch (error) {
      if (error.status === 401) xoaPhienHetHan();
      throw error;
    }
  };
  // Tải đơn hàng của tài khoản và ghi nhận trạng thái tải/lỗi cho giao diện.
  const loadOrders = async () => {
    if (ordersLoading) return;
    ordersLoading = true;
    ordersError = "";
    hienThiTrangTaiKhoan();
    try {
      const collected = [];
      let page = 1;
      let total = null;
      do {
        const result = await guiYeuCauTaiKhoanNoiBo(
          `/orders?limit=50&page=${page}`,
        );
        const pageOrders = Array.isArray(result.data) ? result.data : [];
        collected.push(...pageOrders);
        total = Number.isFinite(Number(result.count))
          ? Number(result.count)
          : null;
        if (!pageOrders.length || total === null || collected.length >= total)
          break;
        page++;
      } while (page <= 1000);
      orders = collected;
      ordersLoaded = true;
      if (
        selectedOrderId &&
        !orders.some((order) => String(order.id) === selectedOrderId)
      ) {
        selectedOrderId = null;
        selectedOrder = null;
      }
    } catch (error) {
      if (error.status !== 401)
        ordersError = error.message || "Không thể tải danh sách đơn hàng.";
    } finally {
      ordersLoading = false;
      hienThiTrangTaiKhoan();
    }
  };
  // Ghi tọa độ đã chọn và cập nhật ghim trên bản đồ Leaflet.
  const capNhatToaDo = (latitude, longitude, fromGPS = false) => {
    addressDraft.latitude = Number(latitude.toFixed(7));
    addressDraft.longitude = Number(longitude.toFixed(7));
    const coords = [addressDraft.latitude, addressDraft.longitude];
    if (map) {
      if (!marker)
        marker = createMarker(coords, {
          draggable: true,
          icon: addressMarkerIcon,
        }).addTo(map);
      else marker.setLatLng(coords);
      if (fromGPS) {
        gpsPosition = coords;
        if (gpsMarker) gpsMarker.setLatLng(coords);
        else
          gpsMarker = createMarker(coords, {
            icon: gpsMarkerIcon,
            interactive: false,
            keyboard: false,
            zIndexOffset: 1000,
          }).addTo(map);
      }
      map.flyTo(coords, Math.max(map.getZoom(), 15), { duration: 0.5 });
    }
    if (fromGPS) gpsPosition = coords;
    hienThiTrangTaiKhoan();
  };
  // Gắn sự kiện kéo ghim để khách chọn địa chỉ trên bản đồ.
  const bindMapMarkerDrag = () =>
    marker?.on("dragend", () => {
      const point = marker.getLatLng();
      addressDraft.latitude = Number(point.lat.toFixed(7));
      addressDraft.longitude = Number(point.lng.toFixed(7));
      hienThiTrangTaiKhoan();
    });
  // Hủy bản đồ và các đối tượng Leaflet trước khi dựng lại biểu mẫu.
  const huyBanDo = () => {
    if (map) {
      map.remove();
      map = null;
      marker = null;
      gpsMarker = null;
    }
  };
  // Tạo bản đồ, lớp tile và các marker chọn địa chỉ/GPS.
  const khoiTaoBanDo = () => {
    const element = root.querySelector("[data-address-detail-map]");
    if (!element) return;
    if (!createMap || !createMarker || !tileLayer || !divIcon) {
      const notice = root.querySelector("[data-map-error]");
      if (notice) {
        notice.textContent =
          "Bản đồ hiện không khả dụng. Bạn vẫn có thể nhập địa chỉ và tọa độ thủ công.";
        notice.hidden = false;
      }
      return;
    }
    const hasPoint =
      addressDraft?.latitude !== null &&
      addressDraft?.latitude !== undefined &&
      addressDraft?.longitude !== null &&
      addressDraft?.longitude !== undefined &&
      Number.isFinite(Number(addressDraft.latitude)) &&
      Number.isFinite(Number(addressDraft.longitude));
    const center = hasPoint
      ? [Number(addressDraft.latitude), Number(addressDraft.longitude)]
      : DEFAULT_CENTER;
    map = createMap(element, { scrollWheelZoom: true }).setView(
      center,
      hasPoint ? 15 : 5,
    );
    const tiles = tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
    }).addTo(map);
    tiles.on("tileerror", () => {
      const notice = root.querySelector("[data-map-error]");
      if (notice) notice.hidden = false;
    });
    tiles.on("tileload", () => {
      const notice = root.querySelector("[data-map-error]");
      if (notice) notice.hidden = true;
    });
    map.on("click", (event) =>
      capNhatToaDo(event.latlng.lat, event.latlng.lng),
    );
    if (hasPoint) {
      marker = createMarker(center, {
        draggable: true,
        icon: addressMarkerIcon,
      }).addTo(map);
      bindMapMarkerDrag();
    }
    if (gpsPosition) {
      gpsMarker = createMarker(gpsPosition, {
        icon: gpsMarkerIcon,
        interactive: false,
        keyboard: false,
        zIndexOffset: 1000,
      }).addTo(map);
    }
    requestAnimationFrame(() => map?.invalidateSize());
  };

  // Dựng biểu mẫu thêm hoặc sửa địa chỉ nhận hàng.
  function hienThiBieuMauDiaChi() {
    if (!addressFormOpen) return "";
    const d = addressDraft;
    const hasCoords =
      d.latitude !== null &&
      d.longitude !== null &&
      Number.isFinite(Number(d.latitude)) &&
      Number.isFinite(Number(d.longitude));
    return `<form class="account-address-detail-form" data-address-detail-form>
      <div class="account-form-heading"><div><span class="account-eyebrow">ĐỊA CHỈ GIAO HÀNG</span><h2>${editingId ? "Cập nhật địa chỉ" : "Thêm địa chỉ mới"}</h2></div><button class="account-row-form" type="button" data-cancel-address-detail aria-label="Đóng biểu mẫu">×</button></div>
      <div class="account-address-detail-form-grid">
        <div class="account-field"><label for="recipient-name">Họ và tên người nhận</label><input id="recipient-name" name="recipient_name" value="${escapeHTML(d.recipient_name)}" maxlength="100" required /></div>
        <div class="account-field"><label for="recipient-phone">Số điện thoại</label><input id="recipient-phone" name="phone" type="tel" value="${escapeHTML(d.phone)}" maxlength="20" required /></div>
        <div class="account-field account-address-detail-full-full"><label for="recipient-address-detail">Địa chỉ nhận hàng</label><textarea id="recipient-address-detail" name="address" rows="3" required placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành phố">${escapeHTML(d.address)}</textarea></div>
      </div>
      <section class="account-map-section"><div class="account-map-heading"><div><strong>Chọn vị trí trên bản đồ</strong><p>Nhấn vào bản đồ để đặt ghim hoặc kéo ghim đến vị trí chính xác.</p></div><div class="account-map-heading-actions"><button class="account-map-gps-button" type="button" data-format ${locating ? "disabled" : ""}>⌖ ${locating ? "Đang định vị..." : "Định vị vị trí hiện tại"}</button>${hasCoords ? '<button class="account-map-delete" type="button" data-delete-admin>Xóa vị trí</button>' : ""}</div></div>
        <div class="account-map-wrapper"><div class="account-address-detail-map" data-address-detail-map aria-label="Bản đồ chọn vị trí giao hàng"></div><div class="account-map-error" data-map-error hidden>Không tải được ảnh bản đồ. Hãy kiểm tra kết nối mạng rồi thử lại.</div></div>
        ${hasCoords ? `<div class="account-map-coordinates"><span class="account-map-status-dot"></span><div><strong>Đã chọn vị trí giao hàng</strong><p>Vĩ độ: ${Number(d.latitude).toFixed(7)} · Kinh độ: ${Number(d.longitude).toFixed(7)}</p></div></div>` : '<div class="account-map-suggestion"><span>⌖</span>Chưa chọn vị trí. Bạn có thể nhập địa chỉ thủ công nếu không cấp quyền định vị.</div>'}
        <div class="account-address-detail-coordinates-all-field"><label>Vĩ độ<input name="latitude" type="number" step="any" value="${hasCoords ? escapeHTML(d.latitude) : ""}" placeholder="Tùy chọn" /></label><label>Kinh độ<input name="longitude" type="number" step="any" value="${hasCoords ? escapeHTML(d.longitude) : ""}" placeholder="Tùy chọn" /></label></div>
      </section>
      <label class="account-default-o-select"><input type="checkhop" name="is_default" ${d.is_default ? "checked" : ""} /><span>Đặt làm địa chỉ mặc định</span></label>
      <div class="account-address-detail-form-actions"><button type="button" class="account-sub-button" data-cancel-address-detail>Hủy</button><button type="submit" class="account-primary-button" ${saving ? "disabled" : ""}>${saving ? "Đang lưu..." : "Lưu địa chỉ"}</button></div>
    </form>`;
  }

  // Hiển thị hồ sơ và trạng thái chỉnh sửa thông tin cá nhân.
  function hienThiHoSo() {
    const picture = avatarPreview || getAvatarUrl(user.avatar_url);
    const avatar = picture
      ? `<img src="${escapeHTML(picture)}" alt="Ảnh đại diện" />`
      : escapeHTML(getInitials(user.full_name));
    return `<div class="account-content-heading"><div><span class="account-eyebrow">THÔNG TIN CÁ NHÂN</span><h1>Hồ sơ của tôi</h1><p>Quản lý thông tin hồ sơ để tài khoản của bạn luôn được cập nhật.</p></div></div>
      <form class="account-form" data-profile-form><div class="account-form-all-field">
        <div class="account-field"><label for="account-full-full-name">Họ và tên</label><input id="account-full-full-name" name="full_name" value="${escapeHTML(user.full_name || "")}" maxlength="100" required /></div>
        <div class="account-field"><label for="account-email">Email</label><div class="account-o-input-wrapper"><input id="account-email" type="email" value="${escapeHTML(user.email || "")}" readonly /><span class="account-o-input-khoa">Đã xác thực</span></div><span class="account-field-note">Email được sử dụng để đăng nhập và hiện chưa thể thay đổi.</span></div>
        <div class="account-field"><label for="account-phone">Số điện thoại</label><input id="account-phone" name="phone" type="tel" value="${escapeHTML(user.phone || "")}" maxlength="20" /></div>
        <div class="account-field account-field-address-detail"><label for="account-address-detail">Địa chỉ</label><textarea id="account-address-detail" name="address" rows="4">${escapeHTML(user.address || "")}</textarea></div>
        <div class="account-form-actions"><button class="account-primary-button" type="submit" data-save-profile ${saving ? "disabled" : ""}>${saving ? "Đang lưu..." : "Lưu thay đổi"}</button></div>
      </div><div class="account-avatar-frame"><div class="account-avatar-view-preview">${avatar}</div><strong>${escapeHTML(user.full_name || "Thành viên Ánh Nguyệt")}</strong><span>Thành viên Ánh Nguyệt</span><p>Chọn ảnh JPG, PNG, WEBP hoặc GIF, tối đa 5MB.</p><input type="file" data-avatar-file accept="image/jpeg,image/png,image/webp,image/gif" hidden /><button type="button" class="account-primary-button" data-select-avatar ${uploading ? "disabled" : ""}>Chọn ảnh đại diện</button><div class="account-avatar-actions" ${avatarFile ? "" : "hidden"}><button type="button" class="account-primary-button" data-account-avatar ${uploading ? "disabled" : ""}>${uploading ? "Đang tải lên..." : "Lưu ảnh"}</button><button type="button" class="account-sub-button" data-cancel-avatar>Hủy</button></div></div></form>`;
  }

  // Hiển thị địa chỉ đã lưu và thao tác chọn địa chỉ mặc định.
  function hienThiDanhSachDiaChi() {
    const cards = addresses
      .map(
        (address) =>
          `<article class="account-address-detail-card"><div class="account-address-detail-card-primary"><div class="account-address-detail-recipient"><strong>${escapeHTML(address.recipient_name)}</strong><span class="account-address-detail-divider">|</span><span>${escapeHTML(address.phone)}</span>${address.is_default ? '<span class="account-default-label">Mặc định</span>' : ""}</div><p>${escapeHTML(address.address)}</p>${address.latitude != null && address.longitude != null ? `<span class="account-address-detail-map-saved">⌖ Đã lưu vị trí · ${Number(address.latitude).toFixed(5)}, ${Number(address.longitude).toFixed(5)}</span>` : ""}</div><div class="account-address-detail-card-actions"><div class="account-address-detail-edit-delete"><button type="button" data-edit-address-detail="${escapeHTML(address.id)}">Sửa</button><button type="button" class="account-delete-button" data-delete-address-detail="${escapeHTML(address.id)}">Xóa</button></div>${address.is_default ? "" : `<button type="button" class="account-set-default-button" data-default-address-detail="${escapeHTML(address.id)}">Thiết lập mặc định</button>`}</div></article>`,
      )
      .join("");
    return `<div class="account-content-heading account-address-detail-heading"><div><span class="account-eyebrow">THÔNG TIN GIAO HÀNG</span><h1>Địa chỉ của tôi</h1><p>Quản lý địa chỉ nhận hàng cho những đơn mua của bạn.</p></div><button type="button" class="account-primary-button" data-new-address-detail>＋ Thêm địa chỉ mới</button></div>${hienThiBieuMauDiaChi()}<div class="account-section-text-like"><strong>Sổ địa chỉ</strong><span>${addresses.length} địa chỉ</span></div><div class="account-address-detail-list">${cards || `<div class="account-address-detail-empty"><div class="account-empty-icon">⌖</div><h2>Chưa có địa chỉ nhận hàng</h2><p>Thêm địa chỉ để việc đặt hàng và nhận sản phẩm trở nên thuận tiện hơn.</p><button type="button" class="account-primary-button" data-new-address-detail>＋ Thêm địa chỉ đầu tiên</button></div>`}</div>`;
  }

  // Hiển thị danh sách đơn hàng và bộ lọc trạng thái.
  function hienThiDonHang() {
    let content;
    if (ordersLoading || (!ordersLoaded && !ordersError)) {
      content =
        '<div class="account-order-unavailable" role="status"><div class="account-loading-spinner"></div><p>Đang tải đơn hàng...</p></div>';
    } else if (ordersError) {
      content = `<div class="account-order-unavailable" role="alert"><div class="account-empty-icon">!</div><h2>Không thể tải đơn hàng</h2><p>${escapeHTML(ordersError)}</p><button class="account-primary-button" type="button" data-order-retry>Thử lại</button></div>`;
    } else if (!orders.length) {
      content =
        '<div class="account-order-unavailable"><div class="account-empty-icon">▤</div><h2>Bạn chưa có đơn hàng</h2><p>Các đơn hàng đã đặt sẽ hiển thị tại đây.</p></div>';
    } else {
      content = `<div class="account-order-list">${orders
        .map((order) => {
          const id = String(order.id);
          const isOpen = selectedOrderId === id;
          const statusClass = Object.hasOwn(ORDER_STATUS_LABELS, order.status)
            ? order.status
            : "unknown";
          return `<article class="account-order-card">
          <div class="account-order-card-heading">
            <div><span class="account-order-label">MÃ ĐƠN HÀNG</span><strong>#${escapeHTML(id)}</strong></div>
            <span class="account-order-status account-order-status-${escapeHTML(statusClass)}">${escapeHTML(getOrderStatus(order.status))}</span>
          </div>
          <div class="account-order-card-sub"><span>Ngày đặt</span><strong>${escapeHTML(formatOrderDate(order.created_at))}</strong></div>
          <div class="account-order-card-tong"><span>Tổng tiền</span><strong>${escapeHTML(formatCurrency(order.total_amount))}</strong></div>
          <button class="account-order-detail-button" type="button" data-order-detail="${escapeHTML(id)}" aria-expanded="${isOpen}" ${orderDetailLoading ? "disabled" : ""}>${isOpen && selectedOrder ? "Đóng chi tiết" : isOpen && orderDetailLoading ? "Đang tải..." : isOpen && orderDetailError ? "Thử lại chi tiết" : "Xem chi tiết"}</button>
          ${isOpen ? hienThiChiTietDonHang(id) : ""}
        </article>`;
        })
        .join("")}</div>`;
    }

    return `<div class="account-content-heading account-order-heading"><div><span class="account-eyebrow">LỊCH SỬ GIAO DỊCH</span><h1>Đơn hàng của tôi</h1><p>Theo dõi trạng thái và thông tin các đơn hàng đã đặt.</p></div><label class="account-order-filter">Trạng thái<select disabled aria-label="Lọc đơn hàng theo trạng thái"><option>Tất cả đơn hàng</option><option>Chờ xác nhận</option><option>Đã xác nhận</option><option>Đang chuẩn bị</option><option>Đang giao</option><option>Hoàn thành</option><option>Đã hủy</option></select></label></div>${content}`;
  }

  // Dựng thông tin chi tiết đơn được chọn.
  function hienThiChiTietDonHang(orderId) {
    if (orderDetailLoading)
      return '<div class="account-order-detail" role="status">Đang tải chi tiết đơn hàng...</div>';
    if (orderDetailError)
      return `<div class="account-order-detail account-order-detail-error" role="alert">${escapeHTML(orderDetailError)}</div>`;
    if (!selectedOrder || String(selectedOrder.id) !== orderId) return "";

    const items = Array.isArray(selectedOrder.items) ? selectedOrder.items : [];
    const itemMarkup = items.length
      ? items
          .map((item) => {
            const image = getProductImageUrl(item.product_image);
            return `<div class="account-order-product">
            <div class="account-order-product-image">${image ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(item.product_name || "Sản phẩm")}" data-order-image />` : "<span>❋</span>"}</div>
            <div class="account-order-product-content"><strong>${escapeHTML(item.product_name || "Sản phẩm")}</strong><span>${Number(item.quantity) || 0} × ${escapeHTML(formatCurrency(item.unit_price))}</span></div>
            <strong class="account-order-product-tong">${escapeHTML(formatCurrency(item.line_total))}</strong>
          </div>`;
          })
          .join("")
      : '<p class="account-order-detail-empty">Đơn hàng không có thông tin sản phẩm.</p>';

    return `<div class="account-order-detail">
      <h2>Chi tiết đơn hàng</h2>
      <div class="account-order-detail-item">${itemMarkup}</div>
      <div class="account-order-shipping"><strong>Thông tin nhận hàng</strong><span>${escapeHTML(selectedOrder.recipient_name || "")}${selectedOrder.recipient_phone ? ` · ${escapeHTML(selectedOrder.recipient_phone)}` : ""}</span><p>${escapeHTML(selectedOrder.shipping_address || "Chưa có địa chỉ giao hàng")}</p></div>
      <div class="account-order-detail-tong"><span>Tạm tính</span><strong>${escapeHTML(formatCurrency(selectedOrder.subtotal))}</strong></div>
      ${selectedOrder.shipping_fee == null ? "" : `<div class="account-order-detail-tong"><span>Phí giao hàng</span><strong>${escapeHTML(formatCurrency(selectedOrder.shipping_fee))}</strong></div>`}
      <div class="account-order-detail-tong account-order-detail-tong-tong"><span>Tổng thanh toán</span><strong>${escapeHTML(formatCurrency(selectedOrder.total_amount))}</strong></div>
    </div>`;
  }

  // Chọn nội dung tab đang mở và cập nhật vùng tài khoản.
  function hienThiTrangTaiKhoan() {
    huyBanDo();
    const avatar = getAvatarUrl(user.avatar_url);
    const summaryPicture = avatar
      ? `<img src="${escapeHTML(avatar)}" alt="" />`
      : escapeHTML(getInitials(user.full_name));
    root.innerHTML = `<div class="account-wrapper"><aside class="account-sidebar"><div class="account-user-summary"><div class="account-avatar-large">${summaryPicture}</div><div class="account-user-summary-info"><strong>${escapeHTML(user.full_name || "Tài khoản")}</strong><span>${escapeHTML(user.email || "Thành viên Ánh Nguyệt")}</span></div></div><nav class="account-navigation" aria-label="Khu vực tài khoản"><div class="account-menu-group"><div class="account-menu-heading"><span class="account-menu-icon"><img src="${accountIconUrl}" alt="" /></span><span>Tài khoản của tôi</span></div><button class="account-menu-link ${tab === "profile" ? "is-active" : ""}" type="button" data-card="profile"><span class="account-menu-dot"></span>Hồ sơ</button><button class="account-menu-link ${tab === "addresses" ? "is-active" : ""}" type="button" data-card="addresses"><span class="account-menu-dot"></span>Địa chỉ</button></div><div class="account-menu-group account-menu-group-order"><button class="account-menu-heading ${tab === "orders" ? "is-active" : ""}" type="button" data-card="orders"><span class="account-menu-icon">▤</span><span>Đơn hàng</span></button></div></nav><div class="account-sidebar-note"><span>✦</span><p>Cảm ơn bạn đã đồng hành cùng Ánh Nguyệt.</p></div></aside><section class="account-content"><div class="account-mobile-heading"><span>KHÔNG GIAN CÁ NHÂN</span><h1>Xin chào, ${escapeHTML(user.full_name || "bạn")}!</h1><div class="account-mobile-all-card"><button type="button" data-card="profile" class="${tab === "profile" ? "is-active" : ""}">Hồ sơ</button><button type="button" data-card="addresses" class="${tab === "addresses" ? "is-active" : ""}">Địa chỉ</button><button type="button" data-card="orders" class="${tab === "orders" ? "is-active" : ""}">Đơn hàng</button></div></div>${message ? `<div class="account-alert account-alert-${messageType}" role="${messageType === "error" ? "alert" : "status"}">${escapeHTML(message)}</div>` : ""}<div class="account-card-frame" data-card-frame>${tab === "profile" ? hienThiHoSo() : tab === "addresses" ? hienThiDanhSachDiaChi() : hienThiDonHang()}</div></section></div>`;
    root
      .querySelectorAll(
        ".account-avatar-large img, .account-avatar-view-preview img",
      )
      .forEach((img) =>
        img.addEventListener("error", () => img.remove(), { once: true }),
      );
    root
      .querySelectorAll("[data-order-image]")
      .forEach((img) =>
        img.addEventListener("error", () => img.remove(), { once: true }),
      );
    if (tab === "addresses" && addressFormOpen) khoiTaoBanDo();
  }

  // Nạp địa chỉ người dùng để dựng tab địa chỉ và bản đồ chọn vị trí.
  const taiDanhSachDiaChi = async () => {
    const result = await guiYeuCauTaiKhoanNoiBo("/auth/addresses");
    addresses = Array.isArray(result.data) ? result.data : [];
  };
  // Mở biểu mẫu với dữ liệu địa chỉ mới hoặc địa chỉ cần sửa.
  const moBieuMauDiaChi = (address = null) => {
    gpsPosition = null;
    editingId = address?.id ?? null;
    addressDraft = address
      ? {
          recipient_name: address.recipient_name || "",
          phone: address.phone || "",
          address: address.address || "",
          is_default: Boolean(address.is_default),
          latitude: address.latitude == null ? null : Number(address.latitude),
          longitude:
            address.longitude == null ? null : Number(address.longitude),
        }
      : {
          recipient_name: user.full_name || "",
          phone: user.phone || "",
          address: "",
          is_default: addresses.length === 0,
          latitude: null,
          longitude: null,
        };
    addressFormOpen = true;
    message = "";
    hienThiTrangTaiKhoan();
  };
  // Đóng biểu mẫu địa chỉ và giải phóng bản đồ đang gắn.
  const dongBieuMauDiaChi = () => {
    addressFormOpen = false;
    editingId = null;
    addressDraft = null;
    gpsPosition = null;
    hienThiTrangTaiKhoan();
  };

  root.addEventListener("click", async (event) => {
    const tabButton = event.target.closest("[data-card]");
    if (tabButton) {
      const nextTab = tabButton.dataset.card;
      if (nextTab !== tab) {
        tab = nextTab;
        message = "";
        hienThiTrangTaiKhoan();
      }
      if (tab === "orders" && !ordersLoaded) await loadOrders();
      return;
    }
    if (event.target.closest("[data-order-retry]")) {
      await loadOrders();
      return;
    }
    const orderDetailButton = event.target.closest("[data-order-detail]");
    if (orderDetailButton) {
      const orderId = orderDetailButton.dataset.orderDetail;
      if (selectedOrderId === orderId && selectedOrder) {
        selectedOrderId = null;
        selectedOrder = null;
        orderDetailError = "";
        hienThiTrangTaiKhoan();
        return;
      }
      selectedOrderId = orderId;
      selectedOrder = null;
      orderDetailError = "";
      orderDetailLoading = true;
      hienThiTrangTaiKhoan();
      try {
        const result = await guiYeuCauTaiKhoanNoiBo(
          `/orders/${encodeURIComponent(orderId)}`,
        );
        if (!result.data)
          throw new Error("Máy chủ không trả chi tiết đơn hàng.");
        selectedOrder = result.data;
      } catch (error) {
        if (error.status !== 401)
          orderDetailError =
            error.message || "Không thể tải chi tiết đơn hàng.";
      } finally {
        orderDetailLoading = false;
        hienThiTrangTaiKhoan();
      }
      return;
    }
    if (event.target.closest("[data-new-address-detail]")) {
      moBieuMauDiaChi();
      return;
    }
    if (event.target.closest("[data-cancel-address-detail]")) {
      dongBieuMauDiaChi();
      return;
    }
    const editButton = event.target.closest("[data-edit-address-detail]");
    if (editButton) {
      moBieuMauDiaChi(
        addresses.find(
          (item) => String(item.id) === editButton.dataset.editAddressDetail,
        ),
      );
      return;
    }
    const deleteButton = event.target.closest("[data-delete-address-detail]");
    if (deleteButton) {
      if (!window.confirm("Bạn có chắc chắn muốn xóa địa chỉ này không?"))
        return;
      try {
        busy = true;
        await guiYeuCauTaiKhoanNoiBo(
          `/auth/addresses/${encodeURIComponent(deleteButton.dataset.deleteAddressDetail)}`,
          { method: "DELETE" },
        );
        await taiDanhSachDiaChi();
        message = "Đã xóa địa chỉ.";
        messageType = "success";
      } catch (error) {
        message = error.message;
        messageType = "error";
      } finally {
        busy = false;
        hienThiTrangTaiKhoan();
      }
      return;
    }
    const defaultButton = event.target.closest("[data-default-address-detail]");
    if (defaultButton) {
      try {
        busy = true;
        await guiYeuCauTaiKhoanNoiBo(
          `/auth/addresses/${encodeURIComponent(defaultButton.dataset.defaultAddressDetail)}/default`,
          { method: "PATCH" },
        );
        await taiDanhSachDiaChi();
        message = "Đã cập nhật địa chỉ mặc định.";
        messageType = "success";
      } catch (error) {
        message = error.message;
        messageType = "error";
      } finally {
        busy = false;
        hienThiTrangTaiKhoan();
      }
      return;
    }
    if (event.target.closest("[data-format]")) {
      if (!navigator.geolocation) {
        hienThongBaoTaiKhoan(
          "Trình duyệt không hỗ trợ định vị. Bạn có thể nhập tọa độ hoặc địa chỉ thủ công.",
          "error",
        );
        return;
      }
      locating = true;
      hienThiTrangTaiKhoan();
      navigator.geolocation.getCurrentPosition(
        (position) => {
          locating = false;
          capNhatToaDo(
            position.coords.latitude,
            position.coords.longitude,
            true,
          );
          message =
            "Đã xác định vị trí hiện tại. Bạn có thể kéo ghim để điều chỉnh.";
          messageType = "success";
          hienThiTrangTaiKhoan();
        },
        (error) => {
          locating = false;
          const text =
            error.code === error.PERMISSION_DENIED
              ? "Bạn chưa cấp quyền định vị. Hãy nhập địa chỉ thủ công hoặc cho phép trình duyệt truy cập vị trí."
              : error.code === error.TIMEOUT
                ? "Định vị đã hết thời gian chờ. Bạn có thể nhập địa chỉ thủ công."
                : "Không lấy được vị trí. Bạn có thể nhập địa chỉ thủ công.";
          hienThongBaoTaiKhoan(text, "error");
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
      return;
    }
    if (event.target.closest("[data-delete-admin]")) {
      addressDraft.latitude = null;
      addressDraft.longitude = null;
      gpsPosition = null;
      hienThiTrangTaiKhoan();
      return;
    }
    if (event.target.closest("[data-select-avatar]")) {
      root.querySelector("[data-avatar-file]")?.click();
      return;
    }
    if (event.target.closest("[data-cancel-avatar]")) {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      avatarPreview = "";
      avatarFile = null;
      hienThiTrangTaiKhoan();
      return;
    }
    if (
      event.target.closest("[data-account-avatar]") &&
      avatarFile &&
      !uploading
    ) {
      uploading = true;
      hienThiTrangTaiKhoan();
      try {
        const body = new FormData();
        body.append("avatar", avatarFile);
        const result = await guiYeuCauTaiKhoanNoiBo("/auth/avatar", {
          method: "POST",
          body,
        });
        if (!result.user)
          throw new Error(
            "Máy chủ không trả thông tin tài khoản sau khi tải ảnh.",
          );
        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
        avatarPreview = "";
        avatarFile = null;
        capNhatNguoiDung(result.user);
        message = result.message || "Cập nhật ảnh đại diện thành công.";
        messageType = "success";
      } catch (error) {
        message = error.message;
        messageType = "error";
      } finally {
        uploading = false;
        hienThiTrangTaiKhoan();
      }
    }
  });

  root.addEventListener("input", (event) => {
    if (tab !== "addresses" || !addressFormOpen || !addressDraft) return;
    if (
      event.target.name === "recipient_name" ||
      event.target.name === "phone" ||
      event.target.name === "address"
    )
      addressDraft[event.target.name] = event.target.value;
    if (event.target.name === "latitude" || event.target.name === "longitude") {
      const other = event.target.name === "latitude" ? "longitude" : "latitude";
      const value = event.target.value;
      addressDraft[event.target.name] = value === "" ? null : Number(value);
      const otherValue = root.querySelector(`[name="${other}"]`)?.value;
      if (
        value !== "" &&
        otherValue !== "" &&
        Number.isFinite(Number(otherValue))
      ) {
        const coords = [
          Number(addressDraft.latitude),
          Number(addressDraft.longitude),
        ];
        if (map) {
          map.setView(coords, Math.max(map.getZoom(), 14));
          if (!marker) {
            marker = createMarker(coords, {
              draggable: true,
              icon: addressMarkerIcon,
            }).addTo(map);
            bindMapMarkerDrag();
          } else marker.setLatLng(coords);
        }
      }
    }
  });
  root.addEventListener("change", async (event) => {
    if (event.target.matches("[data-avatar-file]")) {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!/image\/(jpeg|png|webp|gif)/.test(file.type)) {
        hienThongBaoTaiKhoan(
          "Chỉ chấp nhận ảnh JPG, PNG, WEBP hoặc GIF.",
          "error",
        );
        return;
      }
      if (file.size > MAX_AVATAR_SIZE) {
        hienThongBaoTaiKhoan("Ảnh đại diện không được vượt quá 5MB.", "error");
        return;
      }
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      avatarFile = file;
      avatarPreview = URL.createObjectURL(file);
      message = "";
      hienThiTrangTaiKhoan();
      return;
    }
    if (
      tab === "addresses" &&
      addressFormOpen &&
      addressDraft &&
      event.target.name === "is_default"
    )
      addressDraft.is_default = event.target.checked;
  });
  root.addEventListener("submit", async (event) => {
    if (event.target.matches("[data-profile-form]")) {
      event.preventDefault();
      if (saving) return;
      const values = new FormData(event.target);
      const fullName = String(values.get("full_name") || "").trim();
      const phone = String(values.get("phone") || "").trim();
      if (!fullName || fullName.length > 100 || phone.length > 20) {
        hienThongBaoTaiKhoan(
          "Vui lòng kiểm tra họ tên và số điện thoại.",
          "error",
        );
        return;
      }
      saving = true;
      hienThiTrangTaiKhoan();
      try {
        const result = await guiYeuCauTaiKhoanNoiBo("/auth/me", {
          method: "PUT",
          body: JSON.stringify({
            full_name: fullName,
            phone,
            address: String(values.get("address") || "").trim(),
          }),
        });
        if (!result.user)
          throw new Error(
            "Máy chủ không trả thông tin tài khoản sau khi cập nhật.",
          );
        capNhatNguoiDung(result.user);
        message = "Thông tin tài khoản đã được cập nhật.";
        messageType = "success";
      } catch (error) {
        message = error.message;
        messageType = "error";
      } finally {
        saving = false;
        hienThiTrangTaiKhoan();
      }
      return;
    }
    if (event.target.matches("[data-address-detail-form]")) {
      event.preventDefault();
      if (saving) return;
      const data = new FormData(event.target);
      const latitudeValue = data.get("latitude");
      const longitudeValue = data.get("longitude");
      const payload = {
        recipient_name: String(data.get("recipient_name") || "").trim(),
        phone: String(data.get("phone") || "").trim(),
        address: String(data.get("address") || "").trim(),
        is_default: data.get("is_default") === "on",
        latitude:
          latitudeValue === "" || longitudeValue === ""
            ? null
            : Number(latitudeValue),
        longitude:
          latitudeValue === "" || longitudeValue === ""
            ? null
            : Number(longitudeValue),
      };
      if (!payload.recipient_name || !payload.phone || !payload.address) {
        hienThongBaoTaiKhoan(
          "Vui lòng nhập đầy đủ người nhận, số điện thoại và địa chỉ.",
          "error",
        );
        return;
      }
      if (
        (payload.latitude === null) !== (payload.longitude === null) ||
        (payload.latitude !== null &&
          (!Number.isFinite(payload.latitude) ||
            !Number.isFinite(payload.longitude) ||
            Math.abs(payload.latitude) > 90 ||
            Math.abs(payload.longitude) > 180))
      ) {
        hienThongBaoTaiKhoan(
          "Tọa độ không hợp lệ. Hãy nhập đủ vĩ độ và kinh độ trong phạm vi hợp lệ.",
          "error",
        );
        return;
      }
      saving = true;
      hienThiTrangTaiKhoan();
      try {
        const path = editingId
          ? `/auth/addresses/${encodeURIComponent(editingId)}`
          : "/auth/addresses";
        await guiYeuCauTaiKhoanNoiBo(path, {
          method: editingId ? "PUT" : "POST",
          body: JSON.stringify(payload),
        });
        await taiDanhSachDiaChi();
        addressFormOpen = false;
        editingId = null;
        addressDraft = null;
        message = "Đã lưu địa chỉ thành công.";
        messageType = "success";
      } catch (error) {
        message = error.message;
        messageType = "error";
      } finally {
        saving = false;
        hienThiTrangTaiKhoan();
      }
    }
  });

  root.innerHTML =
    '<div class="account-loading-card"><span class="account-loading-spinner"></span><p>Đang tải thông tin tài khoản...</p></div>';
  try {
    const result = await guiYeuCauTaiKhoanNoiBo("/auth/me");
    if (!result.user) throw new Error("Máy chủ không trả thông tin tài khoản.");
    capNhatNguoiDung(result.user);
    hienThiTrangTaiKhoan();
  } catch (error) {
    if (error.status === 401) return;
    hienThongBaoTaiKhoan(
      `Không thể tải hồ sơ từ máy chủ. ${error.message}`,
      "error",
    );
  }
  try {
    await taiDanhSachDiaChi();
  } catch (error) {
    if (error.status !== 401) {
      message = `Không thể tải sổ địa chỉ. ${error.message}`;
      messageType = "error";
    }
  }
  hienThiTrangTaiKhoan();
  if (tab === "orders") await loadOrders();
}
