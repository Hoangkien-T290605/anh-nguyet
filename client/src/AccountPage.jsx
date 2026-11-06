import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import accountIcon from "./assets/icon-tai-khoan.png";
import PasswordChangeForm from "./PasswordChangeForm";
import "./AccountPage.css";

const API_URL = "http://localhost:5000/api/auth";
const SERVER_URL = "http://localhost:5000";
const AUTH_STORAGE_KEY = "anh-nguyet-auth";
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

const DEFAULT_MAP_CENTER = [16.0, 106.0];
const DEFAULT_MAP_ZOOM = 5;

const addressMarkerIcon = L.divIcon({
  className: "account-map-marker",
  html: '<span class="account-map-marker-pin"></span>',
  iconSize: [28, 36],
  iconAnchor: [14, 34],
});

function getInitials(name = "") {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return "AN";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return `${words[words.length - 1][0]}${words[0][0]}`.toUpperCase();
}

function getAvatarUrl(avatarUrl) {
  if (!avatarUrl) return "";

  if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://")) {
    return avatarUrl;
  }

  return `${SERVER_URL}${avatarUrl.startsWith("/") ? "" : "/"}${avatarUrl}`;
}

function getAuth() {
  try {
    const savedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
    return savedAuth ? JSON.parse(savedAuth) : null;
  } catch {
    return null;
  }
}

function saveUpdatedUser(auth, updatedUser) {
  const updatedAuth = {
    ...auth,
    user: updatedUser,
  };

  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updatedAuth));

  window.dispatchEvent(
    new CustomEvent("anh-nguyet-auth-updated", {
      detail: { user: updatedUser },
    })
  );
}

function MapClickHandler({ onPositionChange }) {
  useMapEvents({
    click(event) {
      onPositionChange({
        latitude: Number(event.latlng.lat.toFixed(7)),
        longitude: Number(event.latlng.lng.toFixed(7)),
      });
    },
  });

  return null;
}

function AddressMarker({ position, onPositionChange }) {
  if (!position) return null;

  return (
    <Marker
      position={position}
      icon={addressMarkerIcon}
      draggable
      eventHandlers={{
        dragend(event) {
          const coordinates = event.target.getLatLng();

          onPositionChange({
            latitude: Number(coordinates.lat.toFixed(7)),
            longitude: Number(coordinates.lng.toFixed(7)),
          });
        },
      }}
    />
  );
}

// Tự di chuyển bản đồ đến vị trí GPS vừa lấy được.
function MapRecenter({ position, zoom }) {
  const map = useMap();

  useEffect(() => {
    if (position) {
      map.flyTo(position, zoom, {
        animate: true,
        duration: 0.8,
      });
    }
  }, [map, position, zoom]);

  return null;
}

function AddressMap({
  addressForm,
  onPositionChange,
  onGetCurrentLocation,
  gettingLocation,
  mapKey,
  gpsPosition,
}) {
  const hasPosition =
    addressForm.latitude !== null &&
    addressForm.latitude !== undefined &&
    addressForm.longitude !== null &&
    addressForm.longitude !== undefined &&
    Number.isFinite(Number(addressForm.latitude)) &&
    Number.isFinite(Number(addressForm.longitude));

  const position = hasPosition
    ? [Number(addressForm.latitude), Number(addressForm.longitude)]
    : null;

  return (
    <div className="account-map-section">
      <div className="account-map-heading">
        <div>
          <strong>Chọn vị trí trên bản đồ</strong>
          <p>
            Nhấn vào bản đồ để đặt ghim hoặc kéo ghim đến vị trí chính xác.
          </p>
        </div>

        <div className="account-map-heading-actions">
          <button
            type="button"
            className="account-map-gps-button"
            onClick={onGetCurrentLocation}
            disabled={gettingLocation}
          >
            <span aria-hidden="true">⌖</span>
            {gettingLocation ? "Đang định vị..." : "Định vị vị trí hiện tại"}
          </button>

          {position && (
            <button
              type="button"
              className="account-map-clear"
              onClick={() =>
                onPositionChange({
                  latitude: null,
                  longitude: null,
                })
              }
            >
              Xóa vị trí
            </button>
          )}
        </div>
      </div>

      <div className="account-map-wrapper">
        <MapContainer
          key={mapKey}
          center={position || DEFAULT_MAP_CENTER}
          zoom={position ? 15 : DEFAULT_MAP_ZOOM}
          scrollWheelZoom
          className="account-address-map"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapClickHandler onPositionChange={onPositionChange} />

          <AddressMarker
            position={position}
            onPositionChange={onPositionChange}
          />

          <MapRecenter position={gpsPosition} zoom={16} />
        </MapContainer>
      </div>

      {position ? (
        <div className="account-map-coordinates">
          <span className="account-map-status-dot" />
          <div>
            <strong>Đã chọn vị trí giao hàng</strong>
            <p>
              Vĩ độ: {Number(addressForm.latitude).toFixed(7)}
              {" · "}
              Kinh độ: {Number(addressForm.longitude).toFixed(7)}
            </p>
          </div>
        </div>
      ) : (
        <div className="account-map-hint">
          <span>⌖</span>
          Chưa chọn vị trí. Hãy nhấn vào bản đồ hoặc sử dụng GPS để đặt ghim
          giao hàng.
        </div>
      )}
    </div>
  );
}

function AccountPage() {
  const location = useLocation();
  const currentPage = location.pathname;
  const avatarInputRef = useRef(null);

  const isAddressPage = currentPage === "/tai-khoan/dia-chi";
  const isPasswordPage = currentPage === "/tai-khoan/doi-mat-khau";

  const [user, setUser] = useState(null);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    address: "",
  });

  const [addresses, setAddresses] = useState([]);
  const [addressForm, setAddressForm] = useState({
    recipient_name: "",
    phone: "",
    address: "",
    is_default: false,
    latitude: null,
    longitude: null,
  });

  const [editingAddressId, setEditingAddressId] = useState(null);
  const [showAddressForm, setShowAddressForm] = useState(false);

  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [gpsPosition, setGpsPosition] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function fetchAccount() {
      const auth = getAuth();

      if (!auth?.token) {
        if (isMounted) {
          setError("Bạn cần đăng nhập để xem thông tin tài khoản.");
          setLoading(false);
        }
        return;
      }

      try {
        const headers = {
          Authorization: `Bearer ${auth.token}`,
        };

        const requests = [fetch(`${API_URL}/me`, { headers })];

        if (isAddressPage) {
          requests.push(fetch(`${API_URL}/addresses`, { headers }));
        }

        const responses = await Promise.all(requests);
        const results = await Promise.all(
          responses.map((response) => response.json())
        );

        if (!responses[0].ok || !results[0].success) {
          throw new Error(
            results[0].message || "Không thể tải thông tin tài khoản."
          );
        }

        if (!isMounted) return;

        const profile = results[0].user;

        setUser(profile);
        setForm({
          full_name: profile.full_name || "",
          email: profile.email || "",
          phone: profile.phone || "",
          address: profile.address || "",
        });

        if (isAddressPage) {
          if (!responses[1].ok || !results[1].success) {
            throw new Error(
              results[1].message || "Không thể tải danh sách địa chỉ."
            );
          }

          setAddresses(results[1].data || []);
        }

        saveUpdatedUser(auth, profile);
      } catch (err) {
        console.error("Lỗi tải tài khoản:", err);

        if (isMounted) {
          setError(err.message || "Đã xảy ra lỗi khi tải tài khoản.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    setLoading(true);
    setError("");
    setNotice("");
    fetchAccount();

    return () => {
      isMounted = false;
    };
  }, [isAddressPage]);

  useEffect(() => {
    return () => {
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!form.full_name.trim()) {
      setError("Vui lòng nhập họ và tên.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setNotice("");

      const auth = getAuth();

      if (!auth?.token) {
        throw new Error("Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.");
      }

      const response = await fetch(`${API_URL}/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Không thể cập nhật hồ sơ.");
      }

      const updatedUser = result.user;

      setUser(updatedUser);
      setForm((current) => ({
        ...current,
        full_name: updatedUser.full_name || "",
        phone: updatedUser.phone || "",
        address: updatedUser.address || "",
      }));

      saveUpdatedUser(auth, updatedUser);
      setNotice("Thông tin tài khoản đã được cập nhật.");
    } catch (err) {
      console.error("Lỗi cập nhật hồ sơ:", err);
      setError(err.message || "Đã xảy ra lỗi khi cập nhật hồ sơ.");
    } finally {
      setSaving(false);
    }
  }

  function handleChooseAvatar() {
    avatarInputRef.current?.click();
  }

  function handleAvatarChange(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ];

    if (!allowedTypes.includes(file.type)) {
      setError("Chỉ chấp nhận ảnh JPG, PNG, WEBP hoặc GIF.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_AVATAR_SIZE) {
      setError("Ảnh đại diện không được vượt quá 5MB.");
      event.target.value = "";
      return;
    }

    setError("");
    setNotice("");
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleUploadAvatar() {
    if (!avatarFile) {
      setError("Vui lòng chọn ảnh đại diện trước.");
      return;
    }

    const auth = getAuth();

    if (!auth?.token) {
      setError("Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.");
      return;
    }

    try {
      setUploadingAvatar(true);
      setError("");
      setNotice("");

      const formData = new FormData();
      formData.append("avatar", avatarFile);

      const response = await fetch(`${API_URL}/avatar`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.token}`,
        },
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Không thể tải ảnh đại diện lên.");
      }

      if (!result.user) {
        throw new Error(
          "Server chưa trả về thông tin người dùng sau khi tải ảnh."
        );
      }

      const updatedUser = result.user;

      setUser(updatedUser);
      saveUpdatedUser(auth, updatedUser);

      setAvatarFile(null);
      setAvatarPreview("");

      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }

      setNotice(result.message || "Cập nhật ảnh đại diện thành công.");
    } catch (err) {
      console.error("Lỗi tải ảnh đại diện:", err);
      setError(err.message || "Đã xảy ra lỗi khi tải ảnh đại diện.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  function handleCancelAvatar() {
    setAvatarFile(null);
    setAvatarPreview("");

    if (avatarInputRef.current) {
      avatarInputRef.current.value = "";
    }

    setError("");
  }

  function resetAddressForm() {
    setAddressForm({
      recipient_name: "",
      phone: "",
      address: "",
      is_default: addresses.length === 0,
      latitude: null,
      longitude: null,
    });
    setEditingAddressId(null);
    setShowAddressForm(false);
    setGpsPosition(null);
  }

  function openAddAddress() {
    setAddressForm({
      recipient_name: user?.full_name || "",
      phone: user?.phone || "",
      address: "",
      is_default: addresses.length === 0,
      latitude: null,
      longitude: null,
    });
    setEditingAddressId(null);
    setGpsPosition(null);
    setError("");
    setNotice("");
    setShowAddressForm(true);
  }

  function openEditAddress(address) {
    setAddressForm({
      recipient_name: address.recipient_name || "",
      phone: address.phone || "",
      address: address.address || "",
      is_default: Boolean(address.is_default),
      latitude:
        address.latitude === null || address.latitude === undefined
          ? null
          : Number(address.latitude),
      longitude:
        address.longitude === null || address.longitude === undefined
          ? null
          : Number(address.longitude),
    });

    setEditingAddressId(address.id);
    setGpsPosition(null);
    setError("");
    setNotice("");
    setShowAddressForm(true);
  }

  function handleAddressChange(event) {
    const { name, value, checked, type } = event.target;

    setAddressForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function handleMapPositionChange(coordinates) {
    setAddressForm((current) => ({
      ...current,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    }));
  }

  // Lấy tọa độ GPS của thiết bị và đưa bản đồ đến vị trí đó.
  function handleGetCurrentLocation() {
    if (!navigator.geolocation) {
      setError(
        "Trình duyệt của bạn không hỗ trợ chức năng định vị vị trí."
      );
      return;
    }

    setGettingLocation(true);
    setError("");
    setNotice("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude.toFixed(7));
        const longitude = Number(position.coords.longitude.toFixed(7));

        setAddressForm((current) => ({
          ...current,
          latitude,
          longitude,
        }));

        setGpsPosition([latitude, longitude]);
        setGettingLocation(false);
        setNotice("Đã xác định vị trí hiện tại. Bạn có thể kéo ghim để điều chỉnh.");
      },
      (geoError) => {
        let message = "Không thể xác định vị trí hiện tại.";

        switch (geoError.code) {
          case geoError.PERMISSION_DENIED:
            message =
              "Bạn chưa cấp quyền truy cập vị trí. Hãy cho phép trình duyệt sử dụng vị trí rồi thử lại.";
            break;
          case geoError.POSITION_UNAVAILABLE:
            message =
              "Không thể lấy thông tin vị trí. Vui lòng kiểm tra GPS hoặc kết nối mạng.";
            break;
          case geoError.TIMEOUT:
            message =
              "Đã hết thời gian chờ định vị. Vui lòng thử lại.";
            break;
          default:
            break;
        }

        setError(message);
        setGettingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }

  async function fetchAddresses(token) {
    const response = await fetch(`${API_URL}/addresses`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Không thể tải danh sách địa chỉ.");
    }

    setAddresses(result.data || []);
  }

  async function handleAddressSubmit(event) {
    event.preventDefault();

    if (
      !addressForm.recipient_name.trim() ||
      !addressForm.phone.trim() ||
      !addressForm.address.trim()
    ) {
      setError("Vui lòng nhập đầy đủ thông tin địa chỉ.");
      return;
    }

    const auth = getAuth();

    if (!auth?.token) {
      setError("Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setNotice("");

      const isEditing = editingAddressId !== null;

      const response = await fetch(
        isEditing
          ? `${API_URL}/addresses/${editingAddressId}`
          : `${API_URL}/addresses`,
        {
          method: isEditing ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${auth.token}`,
          },
          body: JSON.stringify({
            ...addressForm,
            latitude:
              addressForm.latitude === null
                ? null
                : Number(addressForm.latitude),
            longitude:
              addressForm.longitude === null
                ? null
                : Number(addressForm.longitude),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Không thể lưu địa chỉ.");
      }

      await fetchAddresses(auth.token);
      resetAddressForm();
      setNotice(result.message || "Đã lưu địa chỉ thành công.");
    } catch (err) {
      console.error("Lỗi lưu địa chỉ:", err);
      setError(err.message || "Đã xảy ra lỗi khi lưu địa chỉ.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSetDefault(id) {
    const auth = getAuth();

    if (!auth?.token) return;

    try {
      setError("");
      setNotice("");

      const response = await fetch(`${API_URL}/addresses/${id}/default`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${auth.token}`,
        },
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Không thể đặt địa chỉ mặc định.");
      }

      await fetchAddresses(auth.token);
      setNotice(result.message || "Đã cập nhật địa chỉ mặc định.");
    } catch (err) {
      setError(err.message || "Không thể đặt địa chỉ mặc định.");
    }
  }

  async function handleDeleteAddress(id) {
    const confirmed = window.confirm(
      "Bạn có chắc chắn muốn xóa địa chỉ này không?"
    );

    if (!confirmed) return;

    const auth = getAuth();

    if (!auth?.token) return;

    try {
      setError("");
      setNotice("");

      const response = await fetch(`${API_URL}/addresses/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${auth.token}`,
        },
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Không thể xóa địa chỉ.");
      }

      await fetchAddresses(auth.token);
      setNotice(result.message || "Đã xóa địa chỉ.");
    } catch (err) {
      setError(err.message || "Không thể xóa địa chỉ.");
    }
  }

  if (loading) {
    return (
      <main className="account-page">
        <div className="account-loading-card">
          <span className="account-loading-spinner" />
          <p>Đang tải thông tin tài khoản...</p>
        </div>
      </main>
    );
  }

  if (error && !user) {
    return (
      <main className="account-page">
        <div className="account-login-required">
          <div className="account-empty-symbol">
            <img src={accountIcon} alt="Tài khoản" />
          </div>
          <h1>Bạn chưa đăng nhập</h1>
          <p>Vui lòng đăng nhập để quản lý thông tin tài khoản.</p>
          <Link className="account-primary-button" to="/dang-nhap">
            Đăng nhập ngay
          </Link>
        </div>
      </main>
    );
  }

  const currentAvatar = avatarPreview || getAvatarUrl(user?.avatar_url);

  return (
    <main className="account-page">
      <div className="account-container">
        <aside className="account-sidebar">
          <div className="account-user-summary">
            <div className="account-avatar-large">
              {currentAvatar ? (
                <img
                  src={currentAvatar}
                  alt="Ảnh đại diện"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    borderRadius: "50%",
                  }}
                />
              ) : (
                getInitials(user?.full_name)
              )}
            </div>

            <div className="account-user-summary-info">
              <strong>{user?.full_name || "Thành viên Ánh Nguyệt"}</strong>
              <span>Thành viên Ánh Nguyệt</span>
            </div>
          </div>

          <nav className="account-navigation" aria-label="Tài khoản">
            <div className="account-menu-group">
              <div className="account-menu-heading">
                <span className="account-menu-icon">
                  <img src={accountIcon} alt="" />
                </span>
                <span>Tài khoản của tôi</span>
              </div>

              <NavLink
                to="/tai-khoan"
                end
                className={({ isActive }) =>
                  `account-menu-link ${isActive ? "active" : ""}`
                }
              >
                <span className="account-menu-dot" />
                Hồ sơ
              </NavLink>

              <NavLink
                to="/tai-khoan/dia-chi"
                className={({ isActive }) =>
                  `account-menu-link ${isActive ? "active" : ""}`
                }
              >
                <span className="account-menu-dot" />
                Địa chỉ
              </NavLink>

              <NavLink
                to="/tai-khoan/doi-mat-khau"
                className={({ isActive }) =>
                  `account-menu-link ${isActive ? "active" : ""}`
                }
              >
                <span className="account-menu-dot" />
                Đổi mật khẩu
              </NavLink>
            </div>

            <div className="account-menu-group account-menu-group-orders">
              <Link
                to="/don-mua"
                className={`account-menu-heading ${
                  currentPage === "/don-mua" ? "active" : ""
                }`}
              >
                <span className="account-menu-icon">▤</span>
                <span>Đơn mua</span>
              </Link>
            </div>
          </nav>

          <div className="account-sidebar-note">
            <span>✦</span>
            <p>Cảm ơn bạn đã đồng hành cùng Ánh Nguyệt.</p>
          </div>
        </aside>

        <section className="account-content">
          <div className="account-mobile-heading">
            <span>KHÔNG GIAN CÁ NHÂN</span>
            <h1>Xin chào, {user?.full_name || "bạn"}!</h1>
          </div>

          {error && (
            <div className="account-message account-message-error" role="alert">
              {error}
            </div>
          )}

          {notice && (
            <div
              className="account-message account-message-success"
              role="status"
            >
              {notice}
            </div>
          )}

          {isAddressPage ? (
            <>
              <div className="account-content-heading account-address-heading">
                <div>
                  <span className="account-eyebrow">THÔNG TIN GIAO HÀNG</span>
                  <h1>Địa chỉ của tôi</h1>
                  <p>Quản lý địa chỉ nhận hàng cho những đơn mua của bạn.</p>
                </div>

                <button
                  type="button"
                  className="account-primary-button"
                  onClick={openAddAddress}
                >
                  <span>＋</span> Thêm địa chỉ mới
                </button>
              </div>

              {showAddressForm && (
                <form
                  className="account-address-form"
                  onSubmit={handleAddressSubmit}
                >
                  <div className="account-form-title">
                    <div>
                      <span className="account-eyebrow">ĐỊA CHỈ GIAO HÀNG</span>
                      <h2>
                        {editingAddressId
                          ? "Cập nhật địa chỉ"
                          : "Thêm địa chỉ mới"}
                      </h2>
                    </div>

                    <button
                      type="button"
                      className="account-close-form"
                      onClick={resetAddressForm}
                      aria-label="Đóng biểu mẫu"
                    >
                      ×
                    </button>
                  </div>

                  <div className="account-address-form-grid">
                    <div className="account-field">
                      <label htmlFor="recipient-name">
                        Họ và tên người nhận
                      </label>
                      <input
                        id="recipient-name"
                        name="recipient_name"
                        value={addressForm.recipient_name}
                        onChange={handleAddressChange}
                        placeholder="Nhập tên người nhận"
                        maxLength={100}
                        required
                      />
                    </div>

                    <div className="account-field">
                      <label htmlFor="recipient-phone">Số điện thoại</label>
                      <input
                        id="recipient-phone"
                        name="phone"
                        type="tel"
                        value={addressForm.phone}
                        onChange={handleAddressChange}
                        placeholder="Nhập số điện thoại"
                        maxLength={20}
                        required
                      />
                    </div>

                    <div className="account-field account-address-full">
                      <label htmlFor="recipient-address">
                        Địa chỉ nhận hàng
                      </label>
                      <textarea
                        id="recipient-address"
                        name="address"
                        value={addressForm.address}
                        onChange={handleAddressChange}
                        placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành phố"
                        rows={3}
                        required
                      />
                    </div>
                  </div>

                  <AddressMap
                    addressForm={addressForm}
                    onPositionChange={handleMapPositionChange}
                    onGetCurrentLocation={handleGetCurrentLocation}
                    gettingLocation={gettingLocation}
                    gpsPosition={gpsPosition}
                    mapKey={editingAddressId ?? "new-address"}
                  />

                  <label className="account-default-checkbox">
                    <input
                      type="checkbox"
                      name="is_default"
                      checked={addressForm.is_default}
                      onChange={handleAddressChange}
                    />
                    <span>Đặt làm địa chỉ mặc định</span>
                  </label>

                  <div className="account-address-form-actions">
                    <button
                      type="button"
                      className="account-secondary-button"
                      onClick={resetAddressForm}
                      disabled={saving}
                    >
                      Hủy
                    </button>

                    <button
                      type="submit"
                      className="account-primary-button"
                      disabled={saving}
                    >
                      {saving ? "Đang lưu..." : "Lưu địa chỉ"}
                    </button>
                  </div>
                </form>
              )}

              <div className="account-section-caption">
                <strong>Sổ địa chỉ</strong>
                <span>{addresses.length} địa chỉ</span>
              </div>

              <div className="account-address-list">
                {addresses.length === 0 ? (
                  <div className="account-address-empty">
                    <div className="account-empty-symbol">⌖</div>
                    <h2>Chưa có địa chỉ nhận hàng</h2>
                    <p>
                      Thêm địa chỉ để việc đặt hàng và nhận sản phẩm trở nên
                      thuận tiện hơn.
                    </p>
                    <button
                      type="button"
                      className="account-primary-button"
                      onClick={openAddAddress}
                    >
                      ＋ Thêm địa chỉ đầu tiên
                    </button>
                  </div>
                ) : (
                  addresses.map((address) => (
                    <article className="account-address-card" key={address.id}>
                      <div className="account-address-card-main">
                        <div className="account-address-recipient">
                          <strong>{address.recipient_name}</strong>
                          <span className="account-address-divider">|</span>
                          <span>{address.phone}</span>

                          {address.is_default && (
                            <span className="account-default-badge">
                              Mặc định
                            </span>
                          )}
                        </div>

                        <p>{address.address}</p>

                        {address.latitude !== null &&
                          address.latitude !== undefined &&
                          address.longitude !== null &&
                          address.longitude !== undefined && (
                            <span className="account-address-map-saved">
                              <span>⌖</span> Đã lưu vị trí bản đồ
                            </span>
                          )}
                      </div>

                      <div className="account-address-card-actions">
                        <div className="account-address-edit-delete">
                          <button
                            type="button"
                            onClick={() => openEditAddress(address)}
                          >
                            Sửa
                          </button>

                          <button
                            type="button"
                            className="account-delete-button"
                            onClick={() => handleDeleteAddress(address.id)}
                          >
                            Xóa
                          </button>
                        </div>

                        {!address.is_default && (
                          <button
                            type="button"
                            className="account-set-default-button"
                            onClick={() => handleSetDefault(address.id)}
                          >
                            Thiết lập mặc định
                          </button>
                        )}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </>
          ) : isPasswordPage ? (
            <PasswordChangeForm token={getAuth()?.token} />
          ) : (
            <>
              <div className="account-content-heading">
                <div>
                  <span className="account-eyebrow">THÔNG TIN CÁ NHÂN</span>
                  <h1>Hồ sơ của tôi</h1>
                  <p>
                    Quản lý thông tin hồ sơ để tài khoản của bạn luôn được cập
                    nhật.
                  </p>
                </div>
              </div>

              <form className="account-form" onSubmit={handleSubmit}>
                <div className="account-form-fields">
                  <div className="account-field">
                    <label htmlFor="account-full-name">Họ và tên</label>
                    <input
                      id="account-full-name"
                      name="full_name"
                      type="text"
                      value={form.full_name}
                      onChange={handleChange}
                      placeholder="Nhập họ và tên"
                      maxLength={100}
                      required
                    />
                  </div>

                  <div className="account-field">
                    <label htmlFor="account-email">Email</label>
                    <div className="account-input-wrap">
                      <input
                        id="account-email"
                        name="email"
                        type="email"
                        value={form.email}
                        readOnly
                      />
                      <span className="account-input-lock">Đã xác thực</span>
                    </div>
                    <span className="account-field-note">
                      Email được sử dụng để đăng nhập và hiện chưa thể thay
                      đổi.
                    </span>
                  </div>

                  <div className="account-field">
                    <label htmlFor="account-phone">Số điện thoại</label>
                    <input
                      id="account-phone"
                      name="phone"
                      type="tel"
                      value={form.phone}
                      onChange={handleChange}
                      placeholder="Nhập số điện thoại"
                      maxLength={20}
                    />
                  </div>

                  <div className="account-field account-field-address">
                    <label htmlFor="account-address">Địa chỉ</label>
                    <textarea
                      id="account-address"
                      name="address"
                      value={form.address}
                      onChange={handleChange}
                      placeholder="Nhập địa chỉ của bạn"
                      rows={4}
                    />
                  </div>

                  <div className="account-form-actions">
                    <button
                      className="account-primary-button"
                      type="submit"
                      disabled={saving}
                    >
                      {saving ? "Đang lưu..." : "Lưu thay đổi"}
                    </button>
                  </div>
                </div>

                <div className="account-avatar-panel">
                  <div className="account-avatar-preview">
                    {currentAvatar ? (
                      <img
                        src={currentAvatar}
                        alt="Ảnh đại diện của bạn"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          borderRadius: "50%",
                        }}
                      />
                    ) : (
                      getInitials(user?.full_name)
                    )}
                  </div>

                  <strong>{user?.full_name}</strong>
                  <span>Thành viên Ánh Nguyệt</span>

                  <div className="account-avatar-decoration">✦</div>

                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleAvatarChange}
                    style={{ display: "none" }}
                  />

                  <button
                    type="button"
                    className="account-primary-button"
                    onClick={handleChooseAvatar}
                    disabled={uploadingAvatar}
                  >
                    Chọn ảnh đại diện
                  </button>

                  {avatarFile && (
                    <div
                      style={{
                        display: "flex",
                        gap: "10px",
                        justifyContent: "center",
                        flexWrap: "wrap",
                        marginTop: "12px",
                      }}
                    >
                      <button
                        type="button"
                        className="account-primary-button"
                        onClick={handleUploadAvatar}
                        disabled={uploadingAvatar}
                      >
                        {uploadingAvatar ? "Đang tải lên..." : "Lưu ảnh"}
                      </button>

                      <button
                        type="button"
                        className="account-secondary-button"
                        onClick={handleCancelAvatar}
                        disabled={uploadingAvatar}
                      >
                        Hủy
                      </button>
                    </div>
                  )}
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

export default AccountPage;