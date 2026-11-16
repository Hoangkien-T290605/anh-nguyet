// Danh sách yêu thích luôn được lấy và lưu qua API gắn với tài khoản.
import { apiRequest } from "./api.js";

const AUTH_KEY = "anh-nguyet-auth";

export function readFavoriteSession() {
  try {
    const session = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    return session?.token && session?.user?.id ? session : null;
  } catch {
    return null;
  }
}

export function requireFavoriteLogin() {
  const returnTo = `${window.location.pathname.split("/").pop()}${window.location.search}`;
  window.location.assign(`login.html?returnTo=${encodeURIComponent(returnTo)}`);
}

export async function loadFavoriteProducts(session = readFavoriteSession()) {
  if (!session) return [];
  const result = await apiRequest("/favorites", {
    headers: { Authorization: `Bearer ${session.token}` },
    signal: AbortSignal.timeout(12000),
  });
  if (!Array.isArray(result.data)) {
    throw new Error("Máy chủ trả về danh sách yêu thích không hợp lệ.");
  }
  return result.data;
}

export async function saveFavoriteState(productId, shouldFavorite, session = readFavoriteSession()) {
  if (!session) {
    const error = new Error("Vui lòng đăng nhập để sử dụng danh sách yêu thích.");
    error.status = 401;
    throw error;
  }
  return apiRequest(`/favorites/${encodeURIComponent(productId)}`, {
    method: shouldFavorite ? "PUT" : "DELETE",
    headers: { Authorization: `Bearer ${session.token}` },
    signal: AbortSignal.timeout(12000),
  });
}
