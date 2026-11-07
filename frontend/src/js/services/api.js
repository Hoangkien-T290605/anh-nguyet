// Chuẩn hóa địa chỉ gốc để mọi yêu cầu dùng chung một cấu hình API.
const API_ORIGIN = (
  globalThis.ANH_NGUYET_CONFIG?.apiBaseUrl || "http://localhost:5000"
).replace(/\/+$/, "");

export const API_BASE_URL = `${API_ORIGIN}/api`;

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

// Gửi yêu cầu JSON hoặc FormData và chuẩn hóa lỗi trả về từ Backend.
export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("Backend trả về dữ liệu không hợp lệ.");
  }

  if (!response.ok || result?.success === false) {
    throw new Error(
      result?.message || `Yêu cầu thất bại (${response.status}).`,
    );
  }

  return result;
}

// Chuẩn hóa đường dẫn ảnh sản phẩm theo cấu trúc tài nguyên hiện tại.
export function getProductImageUrl(image) {
  if (!image) return "";
  if (/^https?:\/\//i.test(image)) return image;
  if (image.startsWith("index.html")) return image;
  return `images/products/${encodeURIComponent(image)}`;
}
