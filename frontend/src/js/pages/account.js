import { API_BASE_URL, getAvatarUrl } from "../services/api.js";

const { divIcon, map: createMap, marker: createMarker, tileLayer } = globalThis.L;
const accountIconUrl = "./assets/icon-tai-khoan.png";

const AUTH_KEY = "anh-nguyet-auth";
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const DEFAULT_CENTER = [16, 106];
const addressMarkerIcon = divIcon({
  className: "account-map-marker",
  html: '<span class="account-map-marker-pin" aria-hidden="true"></span>',
  iconSize: [28, 36],
  iconAnchor: [14, 34],
});
const gpsMarkerIcon = divIcon({
  className: "account-gps-marker",
  html: '<span class="account-gps-marker-ring" aria-hidden="true"><span></span></span>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function storedAuth() {
  try {
    const auth = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    return auth?.token && auth?.user ? auth : null;
  } catch {
    return null;
  }
}

function initials(name = "") {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  return words.length > 1 ? `${words.at(-1)[0]}${words[0][0]}`.toUpperCase() : (words[0] || "AN").slice(0, 2).toUpperCase();
}

async function request(path, auth, options = {}) {
  const multipart = options.body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body && !multipart ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${auth.token}`,
      ...options.headers,
    },
  });
  let result;
  try { result = await response.json(); } catch { throw new Error("Máy chủ trả về dữ liệu không hợp lệ."); }
  if (response.status === 401) {
    const error = new Error(result?.message || "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.");
    error.status = 401;
    throw error;
  }
  if (!response.ok || result?.success === false) {
    const error = new Error(result?.message || `Yêu cầu thất bại (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return result;
}

export async function mountAccount() {
  const root = document.getElementById("account-root");
  const auth = storedAuth();
  if (!auth) { window.location.replace("login.html"); return; }

  let user = auth.user;
  let addresses = [];
  let tab = "profile";
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

  const notify = (text, type = "success") => { message = text; messageType = type; render(); };
  const dropSession = () => {
    localStorage.removeItem(AUTH_KEY);
    window.dispatchEvent(new CustomEvent("anh-nguyet-auth-updated", { detail: { user: null } }));
    window.location.replace("login.html?session=expired");
  };
  const updateUser = (value) => {
    user = value;
    localStorage.setItem(AUTH_KEY, JSON.stringify({ ...auth, user }));
    window.dispatchEvent(new CustomEvent("anh-nguyet-auth-updated", { detail: { user } }));
  };
  const api = async (path, options) => {
    try { return await request(path, auth, options); }
    catch (error) { if (error.status === 401) dropSession(); throw error; }
  };
  const setPosition = (latitude, longitude, fromGPS = false) => {
    addressDraft.latitude = Number(latitude.toFixed(7));
    addressDraft.longitude = Number(longitude.toFixed(7));
    const coords = [addressDraft.latitude, addressDraft.longitude];
    if (map) {
      if (!marker) marker = createMarker(coords, { draggable: true, icon: addressMarkerIcon }).addTo(map);
      else marker.setLatLng(coords);
      if (fromGPS) {
        gpsPosition = coords;
        if (gpsMarker) gpsMarker.setLatLng(coords);
        else gpsMarker = createMarker(coords, { icon: gpsMarkerIcon, interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(map);
      }
      map.flyTo(coords, Math.max(map.getZoom(), 15), { duration: 0.5 });
    }
    if (fromGPS) gpsPosition = coords;
    render();
  };
  const bindMarkerDrag = () => marker?.on("dragend", () => {
    const point = marker.getLatLng();
    addressDraft.latitude = Number(point.lat.toFixed(7));
    addressDraft.longitude = Number(point.lng.toFixed(7));
    render();
  });
  const removeMap = () => { if (map) { map.remove(); map = null; marker = null; gpsMarker = null; } };
  const initMap = () => {
    const element = root.querySelector("[data-address-map]");
    if (!element) return;
    const hasPoint = addressDraft?.latitude !== null && addressDraft?.latitude !== undefined
      && addressDraft?.longitude !== null && addressDraft?.longitude !== undefined
      && Number.isFinite(Number(addressDraft.latitude)) && Number.isFinite(Number(addressDraft.longitude));
    const center = hasPoint ? [Number(addressDraft.latitude), Number(addressDraft.longitude)] : DEFAULT_CENTER;
    map = createMap(element, { scrollWheelZoom: true }).setView(center, hasPoint ? 15 : 5);
    const tiles = tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
    }).addTo(map);
    tiles.on("tileerror", () => {
      const notice = root.querySelector("[data-map-error]");
      if (notice) notice.hidden = false;
    });
    tiles.on("tileload", () => {
      const notice = root.querySelector("[data-map-error]");
      if (notice) notice.hidden = true;
    });
    map.on("click", (event) => setPosition(event.latlng.lat, event.latlng.lng));
    if (hasPoint) {
      marker = createMarker(center, { draggable: true, icon: addressMarkerIcon }).addTo(map);
      bindMarkerDrag();
    }
    if (gpsPosition) {
      gpsMarker = createMarker(gpsPosition, { icon: gpsMarkerIcon, interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(map);
    }
    requestAnimationFrame(() => map?.invalidateSize());
  };

  function renderAddressForm() {
    if (!addressFormOpen) return "";
    const d = addressDraft;
    const hasCoords = d.latitude !== null && d.longitude !== null && Number.isFinite(Number(d.latitude)) && Number.isFinite(Number(d.longitude));
    return `<form class="account-address-form" data-address-form>
      <div class="account-form-title"><div><span class="account-eyebrow">ĐỊA CHỈ GIAO HÀNG</span><h2>${editingId ? "Cập nhật địa chỉ" : "Thêm địa chỉ mới"}</h2></div><button class="account-close-form" type="button" data-cancel-address aria-label="Đóng biểu mẫu">×</button></div>
      <div class="account-address-form-grid">
        <div class="account-field"><label for="recipient-name">Họ và tên người nhận</label><input id="recipient-name" name="recipient_name" value="${escapeHTML(d.recipient_name)}" maxlength="100" required /></div>
        <div class="account-field"><label for="recipient-phone">Số điện thoại</label><input id="recipient-phone" name="phone" type="tel" value="${escapeHTML(d.phone)}" maxlength="20" required /></div>
        <div class="account-field account-address-full"><label for="recipient-address">Địa chỉ nhận hàng</label><textarea id="recipient-address" name="address" rows="3" required placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành phố">${escapeHTML(d.address)}</textarea></div>
      </div>
      <section class="account-map-section"><div class="account-map-heading"><div><strong>Chọn vị trí trên bản đồ</strong><p>Nhấn vào bản đồ để đặt ghim hoặc kéo ghim đến vị trí chính xác.</p></div><div class="account-map-heading-actions"><button class="account-map-gps-button" type="button" data-geolocate ${locating ? "disabled" : ""}>⌖ ${locating ? "Đang định vị..." : "Định vị vị trí hiện tại"}</button>${hasCoords ? '<button class="account-map-clear" type="button" data-clear-position>Xóa vị trí</button>' : ""}</div></div>
        <div class="account-map-wrapper"><div class="account-address-map" data-address-map aria-label="Bản đồ chọn vị trí giao hàng"></div><div class="account-map-tile-error" data-map-error hidden>Không tải được ảnh bản đồ. Hãy kiểm tra kết nối mạng rồi thử lại.</div></div>
        ${hasCoords ? `<div class="account-map-coordinates"><span class="account-map-status-dot"></span><div><strong>Đã chọn vị trí giao hàng</strong><p>Vĩ độ: ${Number(d.latitude).toFixed(7)} · Kinh độ: ${Number(d.longitude).toFixed(7)}</p></div></div>` : '<div class="account-map-hint"><span>⌖</span>Chưa chọn vị trí. Bạn có thể nhập địa chỉ thủ công nếu không cấp quyền định vị.</div>'}
        <div class="account-address-coordinate-fields"><label>Vĩ độ<input name="latitude" type="number" step="any" value="${hasCoords ? escapeHTML(d.latitude) : ""}" placeholder="Tùy chọn" /></label><label>Kinh độ<input name="longitude" type="number" step="any" value="${hasCoords ? escapeHTML(d.longitude) : ""}" placeholder="Tùy chọn" /></label></div>
      </section>
      <label class="account-default-checkbox"><input type="checkbox" name="is_default" ${d.is_default ? "checked" : ""} /><span>Đặt làm địa chỉ mặc định</span></label>
      <div class="account-address-form-actions"><button type="button" class="account-secondary-button" data-cancel-address>Hủy</button><button type="submit" class="account-primary-button" ${saving ? "disabled" : ""}>${saving ? "Đang lưu..." : "Lưu địa chỉ"}</button></div>
    </form>`;
  }

  function renderProfile() {
    const picture = avatarPreview || getAvatarUrl(user.avatar_url);
    const avatar = picture ? `<img src="${escapeHTML(picture)}" alt="Ảnh đại diện" />` : escapeHTML(initials(user.full_name));
    return `<div class="account-content-heading"><div><span class="account-eyebrow">THÔNG TIN CÁ NHÂN</span><h1>Hồ sơ của tôi</h1><p>Quản lý thông tin hồ sơ để tài khoản của bạn luôn được cập nhật.</p></div></div>
      <form class="account-form" data-profile-form><div class="account-form-fields">
        <div class="account-field"><label for="account-full-name">Họ và tên</label><input id="account-full-name" name="full_name" value="${escapeHTML(user.full_name || "")}" maxlength="100" required /></div>
        <div class="account-field"><label for="account-email">Email</label><div class="account-input-wrap"><input id="account-email" type="email" value="${escapeHTML(user.email || "")}" readonly /><span class="account-input-lock">Đã xác thực</span></div><span class="account-field-note">Email được sử dụng để đăng nhập và hiện chưa thể thay đổi.</span></div>
        <div class="account-field"><label for="account-phone">Số điện thoại</label><input id="account-phone" name="phone" type="tel" value="${escapeHTML(user.phone || "")}" maxlength="20" /></div>
        <div class="account-field account-field-address"><label for="account-address">Địa chỉ</label><textarea id="account-address" name="address" rows="4">${escapeHTML(user.address || "")}</textarea></div>
        <div class="account-form-actions"><button class="account-primary-button" type="submit" data-save-profile ${saving ? "disabled" : ""}>${saving ? "Đang lưu..." : "Lưu thay đổi"}</button></div>
      </div><div class="account-avatar-panel"><div class="account-avatar-preview">${avatar}</div><strong>${escapeHTML(user.full_name || "Thành viên Ánh Nguyệt")}</strong><span>Thành viên Ánh Nguyệt</span><p>Chọn ảnh JPG, PNG, WEBP hoặc GIF, tối đa 5MB.</p><input type="file" data-avatar-file accept="image/jpeg,image/png,image/webp,image/gif" hidden /><button type="button" class="account-primary-button" data-choose-avatar ${uploading ? "disabled" : ""}>Chọn ảnh đại diện</button><div class="account-avatar-actions" ${avatarFile ? "" : "hidden"}><button type="button" class="account-primary-button" data-upload-avatar ${uploading ? "disabled" : ""}>${uploading ? "Đang tải lên..." : "Lưu ảnh"}</button><button type="button" class="account-secondary-button" data-cancel-avatar>Hủy</button></div></div></form>`;
  }

  function renderAddresses() {
    const cards = addresses.map((address) => `<article class="account-address-card"><div class="account-address-card-main"><div class="account-address-recipient"><strong>${escapeHTML(address.recipient_name)}</strong><span class="account-address-divider">|</span><span>${escapeHTML(address.phone)}</span>${address.is_default ? '<span class="account-default-badge">Mặc định</span>' : ""}</div><p>${escapeHTML(address.address)}</p>${address.latitude != null && address.longitude != null ? `<span class="account-address-map-saved">⌖ Đã lưu vị trí · ${Number(address.latitude).toFixed(5)}, ${Number(address.longitude).toFixed(5)}</span>` : ""}</div><div class="account-address-card-actions"><div class="account-address-edit-delete"><button type="button" data-edit-address="${escapeHTML(address.id)}">Sửa</button><button type="button" class="account-delete-button" data-delete-address="${escapeHTML(address.id)}">Xóa</button></div>${address.is_default ? "" : `<button type="button" class="account-set-default-button" data-default-address="${escapeHTML(address.id)}">Thiết lập mặc định</button>`}</div></article>`).join("");
    return `<div class="account-content-heading account-address-heading"><div><span class="account-eyebrow">THÔNG TIN GIAO HÀNG</span><h1>Địa chỉ của tôi</h1><p>Quản lý địa chỉ nhận hàng cho những đơn mua của bạn.</p></div><button type="button" class="account-primary-button" data-new-address>＋ Thêm địa chỉ mới</button></div>${renderAddressForm()}<div class="account-section-caption"><strong>Sổ địa chỉ</strong><span>${addresses.length} địa chỉ</span></div><div class="account-address-list">${cards || `<div class="account-address-empty"><div class="account-empty-symbol">⌖</div><h2>Chưa có địa chỉ nhận hàng</h2><p>Thêm địa chỉ để việc đặt hàng và nhận sản phẩm trở nên thuận tiện hơn.</p><button type="button" class="account-primary-button" data-new-address>＋ Thêm địa chỉ đầu tiên</button></div>`}</div>`;
  }

  function renderOrders() {
    return `<div class="account-content-heading account-orders-heading"><div><span class="account-eyebrow">LỊCH SỬ GIAO DỊCH</span><h1>Đơn hàng của tôi</h1><p>Theo dõi trạng thái và thông tin các đơn hàng đã đặt.</p></div><label class="account-order-filter">Trạng thái<select disabled aria-label="Lọc đơn hàng theo trạng thái"><option>Tất cả đơn hàng</option><option>Chờ xác nhận</option><option>Đã xác nhận</option><option>Đang chuẩn bị</option><option>Đang giao</option><option>Hoàn thành</option><option>Đã hủy</option></select></label></div><div class="account-order-unavailable"><div class="account-empty-symbol">▤</div><h2>Chưa thể tải danh sách đơn hàng</h2><p>Backend hiện chưa cung cấp API lấy đơn hàng của tài khoản. Khu vực này chưa kết nối dữ liệu và không hiển thị đơn hàng minh họa.</p><span>API đơn hàng: chưa có trong server/server.js</span></div>`;
  }

  function render() {
    removeMap();
    const avatar = getAvatarUrl(user.avatar_url);
    const summaryPicture = avatar ? `<img src="${escapeHTML(avatar)}" alt="" />` : escapeHTML(initials(user.full_name));
    root.innerHTML = `<div class="account-container"><aside class="account-sidebar"><div class="account-user-summary"><div class="account-avatar-large">${summaryPicture}</div><div class="account-user-summary-info"><strong>${escapeHTML(user.full_name || "Tài khoản")}</strong><span>${escapeHTML(user.email || "Thành viên Ánh Nguyệt")}</span></div></div><nav class="account-navigation" aria-label="Khu vực tài khoản"><div class="account-menu-group"><div class="account-menu-heading"><span class="account-menu-icon"><img src="${accountIconUrl}" alt="" /></span><span>Tài khoản của tôi</span></div><button class="account-menu-link ${tab === "profile" ? "active" : ""}" type="button" data-tab="profile"><span class="account-menu-dot"></span>Hồ sơ</button><button class="account-menu-link ${tab === "addresses" ? "active" : ""}" type="button" data-tab="addresses"><span class="account-menu-dot"></span>Địa chỉ</button></div><div class="account-menu-group account-menu-group-orders"><button class="account-menu-heading ${tab === "orders" ? "active" : ""}" type="button" data-tab="orders"><span class="account-menu-icon">▤</span><span>Đơn hàng</span></button></div></nav><div class="account-sidebar-note"><span>✦</span><p>Cảm ơn bạn đã đồng hành cùng Ánh Nguyệt.</p></div></aside><section class="account-content"><div class="account-mobile-heading"><span>KHÔNG GIAN CÁ NHÂN</span><h1>Xin chào, ${escapeHTML(user.full_name || "bạn")}!</h1><div class="account-mobile-tabs"><button type="button" data-tab="profile" class="${tab === "profile" ? "active" : ""}">Hồ sơ</button><button type="button" data-tab="addresses" class="${tab === "addresses" ? "active" : ""}">Địa chỉ</button><button type="button" data-tab="orders" class="${tab === "orders" ? "active" : ""}">Đơn hàng</button></div></div>${message ? `<div class="account-message account-message-${messageType}" role="${messageType === "error" ? "alert" : "status"}">${escapeHTML(message)}</div>` : ""}<div class="account-tab-panel" data-tab-panel>${tab === "profile" ? renderProfile() : tab === "addresses" ? renderAddresses() : renderOrders()}</div></section></div>`;
    root.querySelectorAll(".account-avatar-large img, .account-avatar-preview img").forEach((img) => img.addEventListener("error", () => img.remove(), { once: true }));
    if (tab === "addresses" && addressFormOpen) initMap();
  }

  const fetchAddresses = async () => {
    const result = await api("/auth/addresses");
    addresses = Array.isArray(result.data) ? result.data : [];
  };
  const openAddress = (address = null) => {
    gpsPosition = null;
    editingId = address?.id ?? null;
    addressDraft = address ? {
      recipient_name: address.recipient_name || "", phone: address.phone || "", address: address.address || "",
      is_default: Boolean(address.is_default), latitude: address.latitude == null ? null : Number(address.latitude), longitude: address.longitude == null ? null : Number(address.longitude),
    } : { recipient_name: user.full_name || "", phone: user.phone || "", address: "", is_default: addresses.length === 0, latitude: null, longitude: null };
    addressFormOpen = true;
    message = "";
    render();
  };
  const closeAddress = () => { addressFormOpen = false; editingId = null; addressDraft = null; gpsPosition = null; render(); };

  root.addEventListener("click", async (event) => {
    const tabButton = event.target.closest("[data-tab]");
    if (tabButton) {
      const nextTab = tabButton.dataset.tab;
      if (nextTab !== tab) { tab = nextTab; message = ""; render(); }
      return;
    }
    if (event.target.closest("[data-new-address]")) { openAddress(); return; }
    if (event.target.closest("[data-cancel-address]")) { closeAddress(); return; }
    const editButton = event.target.closest("[data-edit-address]");
    if (editButton) { openAddress(addresses.find((item) => String(item.id) === editButton.dataset.editAddress)); return; }
    const deleteButton = event.target.closest("[data-delete-address]");
    if (deleteButton) {
      if (!window.confirm("Bạn có chắc chắn muốn xóa địa chỉ này không?")) return;
      try { busy = true; await api(`/auth/addresses/${encodeURIComponent(deleteButton.dataset.deleteAddress)}`, { method: "DELETE" }); await fetchAddresses(); message = "Đã xóa địa chỉ."; messageType = "success"; }
      catch (error) { message = error.message; messageType = "error"; }
      finally { busy = false; render(); }
      return;
    }
    const defaultButton = event.target.closest("[data-default-address]");
    if (defaultButton) {
      try { busy = true; await api(`/auth/addresses/${encodeURIComponent(defaultButton.dataset.defaultAddress)}/default`, { method: "PATCH" }); await fetchAddresses(); message = "Đã cập nhật địa chỉ mặc định."; messageType = "success"; }
      catch (error) { message = error.message; messageType = "error"; }
      finally { busy = false; render(); }
      return;
    }
    if (event.target.closest("[data-geolocate]")) {
      if (!navigator.geolocation) { notify("Trình duyệt không hỗ trợ định vị. Bạn có thể nhập tọa độ hoặc địa chỉ thủ công.", "error"); return; }
      locating = true; render();
      navigator.geolocation.getCurrentPosition((position) => {
        locating = false;
        setPosition(position.coords.latitude, position.coords.longitude, true);
        message = "Đã xác định vị trí hiện tại. Bạn có thể kéo ghim để điều chỉnh.";
        messageType = "success";
        render();
      }, (error) => {
        locating = false;
        const text = error.code === error.PERMISSION_DENIED ? "Bạn chưa cấp quyền định vị. Hãy nhập địa chỉ thủ công hoặc cho phép trình duyệt truy cập vị trí." : error.code === error.TIMEOUT ? "Định vị đã hết thời gian chờ. Bạn có thể nhập địa chỉ thủ công." : "Không lấy được vị trí. Bạn có thể nhập địa chỉ thủ công.";
        notify(text, "error");
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
      return;
    }
    if (event.target.closest("[data-clear-position]")) {
      addressDraft.latitude = null; addressDraft.longitude = null; gpsPosition = null; render(); return;
    }
    if (event.target.closest("[data-choose-avatar]")) { root.querySelector("[data-avatar-file]")?.click(); return; }
    if (event.target.closest("[data-cancel-avatar]")) {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      avatarPreview = ""; avatarFile = null; render(); return;
    }
    if (event.target.closest("[data-upload-avatar]") && avatarFile && !uploading) {
      uploading = true; render();
      try {
        const body = new FormData(); body.append("avatar", avatarFile);
        const result = await api("/auth/avatar", { method: "POST", body });
        if (!result.user) throw new Error("Máy chủ không trả thông tin tài khoản sau khi tải ảnh.");
        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
        avatarPreview = ""; avatarFile = null; updateUser(result.user); message = result.message || "Cập nhật ảnh đại diện thành công."; messageType = "success";
      } catch (error) { message = error.message; messageType = "error"; }
      finally { uploading = false; render(); }
    }
  });

  root.addEventListener("input", (event) => {
    if (tab !== "addresses" || !addressFormOpen || !addressDraft) return;
    if (event.target.name === "recipient_name" || event.target.name === "phone" || event.target.name === "address") addressDraft[event.target.name] = event.target.value;
    if (event.target.name === "latitude" || event.target.name === "longitude") {
      const other = event.target.name === "latitude" ? "longitude" : "latitude";
      const value = event.target.value;
      addressDraft[event.target.name] = value === "" ? null : Number(value);
      const otherValue = root.querySelector(`[name="${other}"]`)?.value;
      if (value !== "" && otherValue !== "" && Number.isFinite(Number(otherValue))) {
        const coords = [Number(addressDraft.latitude), Number(addressDraft.longitude)];
        if (map) { map.setView(coords, Math.max(map.getZoom(), 14)); if (!marker) { marker = createMarker(coords, { draggable: true, icon: addressMarkerIcon }).addTo(map); bindMarkerDrag(); } else marker.setLatLng(coords); }
      }
    }
  });
  root.addEventListener("change", async (event) => {
    if (event.target.matches("[data-avatar-file]")) {
      const file = event.target.files?.[0]; if (!file) return;
      if (!/image\/(jpeg|png|webp|gif)/.test(file.type)) { notify("Chỉ chấp nhận ảnh JPG, PNG, WEBP hoặc GIF.", "error"); return; }
      if (file.size > MAX_AVATAR_SIZE) { notify("Ảnh đại diện không được vượt quá 5MB.", "error"); return; }
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      avatarFile = file; avatarPreview = URL.createObjectURL(file); message = ""; render(); return;
    }
    if (tab === "addresses" && addressFormOpen && addressDraft && event.target.name === "is_default") addressDraft.is_default = event.target.checked;
  });
  root.addEventListener("submit", async (event) => {
    if (event.target.matches("[data-profile-form]")) {
      event.preventDefault(); if (saving) return;
      const values = new FormData(event.target);
      const fullName = String(values.get("full_name") || "").trim();
      const phone = String(values.get("phone") || "").trim();
      if (!fullName || fullName.length > 100 || phone.length > 20) { notify("Vui lòng kiểm tra họ tên và số điện thoại.", "error"); return; }
      saving = true; render();
      try {
        const result = await api("/auth/me", { method: "PUT", body: JSON.stringify({ full_name: fullName, phone, address: String(values.get("address") || "").trim() }) });
        if (!result.user) throw new Error("Máy chủ không trả thông tin tài khoản sau khi cập nhật.");
        updateUser(result.user); message = "Thông tin tài khoản đã được cập nhật."; messageType = "success";
      } catch (error) { message = error.message; messageType = "error"; }
      finally { saving = false; render(); }
      return;
    }
    if (event.target.matches("[data-address-form]")) {
      event.preventDefault(); if (saving) return;
      const data = new FormData(event.target);
      const latitudeValue = data.get("latitude"); const longitudeValue = data.get("longitude");
      const payload = {
        recipient_name: String(data.get("recipient_name") || "").trim(), phone: String(data.get("phone") || "").trim(), address: String(data.get("address") || "").trim(), is_default: data.get("is_default") === "on",
        latitude: latitudeValue === "" || longitudeValue === "" ? null : Number(latitudeValue),
        longitude: latitudeValue === "" || longitudeValue === "" ? null : Number(longitudeValue),
      };
      if (!payload.recipient_name || !payload.phone || !payload.address) { notify("Vui lòng nhập đầy đủ người nhận, số điện thoại và địa chỉ.", "error"); return; }
      if ((payload.latitude === null) !== (payload.longitude === null) || (payload.latitude !== null && (!Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude) || Math.abs(payload.latitude) > 90 || Math.abs(payload.longitude) > 180))) { notify("Tọa độ không hợp lệ. Hãy nhập đủ vĩ độ và kinh độ trong phạm vi hợp lệ.", "error"); return; }
      saving = true; render();
      try {
        const path = editingId ? `/auth/addresses/${encodeURIComponent(editingId)}` : "/auth/addresses";
        await api(path, { method: editingId ? "PUT" : "POST", body: JSON.stringify(payload) });
        await fetchAddresses(); addressFormOpen = false; editingId = null; addressDraft = null; message = "Đã lưu địa chỉ thành công."; messageType = "success";
      } catch (error) { message = error.message; messageType = "error"; }
      finally { saving = false; render(); }
    }
  });

  root.innerHTML = '<div class="account-loading-card"><span class="account-loading-spinner"></span><p>Đang tải thông tin tài khoản...</p></div>';
  try {
    const result = await api("/auth/me");
    if (!result.user) throw new Error("Máy chủ không trả thông tin tài khoản.");
    updateUser(result.user);
    render();
  } catch (error) {
    if (error.status === 401) return;
    notify(`Không thể tải hồ sơ từ máy chủ. ${error.message}`, "error");
  }
  try { await fetchAddresses(); } catch (error) { if (error.status !== 401) { message = `Không thể tải sổ địa chỉ. ${error.message}`; messageType = "error"; } }
  render();
}
