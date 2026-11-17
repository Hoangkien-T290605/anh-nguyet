// Chuẩn hóa địa chỉ gốc để mọi yêu cầu dùng chung một cấu hình API.
const API_ORIGIN = (
  globalThis.ANH_NGUYET_CONFIG?.apiBaseUrl || "http://localhost:5000"
).replace(/\/+$/, "");

export const API_BASE_URL = `${API_ORIGIN}/api`;
const AUTH_STORAGE_KEY = "anh-nguyet-auth";

// Chỉ xóa đúng phiên gửi request nếu Backend xác nhận token đó không còn hợp lệ.
function clearExpiredSession(options) {
  const authorization = options.headers?.Authorization;
  const token = /^Bearer\s+(.+)$/i.exec(authorization || "")?.[1];
  if (!token) return;

  try {
    const session = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null");
    if (session?.token !== token) return;
    localStorage.removeItem(AUTH_STORAGE_KEY);
    window.dispatchEvent(
      new CustomEvent("anh-nguyet-xac-thuc-cap-nhat", {
        detail: { user: null },
      }),
    );
  } catch {
    // Trình duyệt có thể chặn localStorage; lỗi API vẫn được trả về cho trang gọi.
  }
}

// Chuyển đường dẫn ảnh đại diện thành URL tuyệt đối hợp lệ.
export function getAvatarUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";

  try {
    const source = value.trim();
    const url = /^https?:\/\//i.test(source)
      ? new URL(source)
      : new URL(source.replace(/^\/+/, ""), `${API_ORIGIN}/`);
    url.pathname = url.pathname.replace(/\/{2,}/g, "/");
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : "";
  } catch {
    return "";
  }
}

// Ảnh do Backend lưu cục bộ phải được tải từ cùng origin với API, không phải Live Server.
export function getApiAssetUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const source = value.trim();
    const url = /^https?:\/\//i.test(source)
      ? new URL(source)
      : new URL(source.replace(/^\/+/, ""), `${API_ORIGIN}/`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

// Gửi yêu cầu JSON hoặc FormData và chuẩn hóa lỗi trả về từ Backend.
export async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal:
        options.signal ??
        AbortSignal.timeout(options.body instanceof FormData ? 60000 : 12000),
      headers: {
        ...(options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...options.headers,
      },
    });
  } catch (cause) {
    const error = new Error(
      cause?.name === "TimeoutError" || cause?.name === "AbortError"
        ? "Máy chủ không phản hồi trong thời gian chờ. Vui lòng thử lại."
        : "Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối và thử lại.",
    );
    error.name = cause?.name || "NetworkError";
    throw error;
  }

  let result;
  try {
    result = await response.json();
  } catch {
    if (response.status === 401) clearExpiredSession(options);
    const error = new Error(
      response.ok
        ? "Backend trả về dữ liệu không hợp lệ."
        : `Backend trả về phản hồi không phải JSON (HTTP ${response.status}).`,
    );
    error.status = response.status;
    if (response.status === 401) error.status = 401;
    throw error;
  }

  if (!response.ok || result?.success === false) {
    if (response.status === 401) clearExpiredSession(options);
    const error = new Error(result?.message || `Yêu cầu thất bại (${response.status}).`);
    error.status = response.status;
    throw error;
  }

  return result;
}

// Chuẩn hóa đường dẫn ảnh sản phẩm theo cấu trúc tài nguyên hiện tại.
export function getProductImageUrl(image) {
  if (!image) return "";
  if (/^https?:\/\//i.test(image)) return image;
  if (image.startsWith("index.html")) return image;
  if (image.startsWith("/uploads/")) return getApiAssetUrl(image);
  if (image.startsWith("uploads/")) return getApiAssetUrl(`/${image}`);
  const normalized = image.replace(/^\/+/, "");
  if (normalized.startsWith("images/products/")) {
    return normalized.split("/").map((part) => encodeURIComponent(part)).join("/");
  }
  return `images/products/${encodeURIComponent(image)}`;
}
