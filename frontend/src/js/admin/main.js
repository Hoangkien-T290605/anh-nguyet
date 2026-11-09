import { apiRequest } from "../services/api.js";
import { mountAdminShell } from "./shell.js";

const AUTH_KEY = "anh-nguyet-auth";

function readSession() {
  try {
    const value = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    return value?.token && value?.user ? value : null;
  } catch {
    return null;
  }
}

function redirectToLogin(page, expired = false) {
  const returnTo = `admin-${page}.html`;
  const query = new URLSearchParams({ returnTo });
  if (expired) query.set("session", "expired");
  window.location.replace(`admin-login.html?${query.toString()}`);
}

async function startAdminPage() {
  const page = document.body.dataset.adminPage;
  if (page === "login") {
    const { mountAdminLogin } = await import("../pages/admin-login.js");
    mountAdminLogin();
    return;
  }

  const root = document.getElementById("admin-app");
  const gate = document.getElementById("admin-gate");
  const session = readSession();
  if (!session) {
    redirectToLogin(page);
    return;
  }

  try {
    const result = await apiRequest("/auth/me", {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    if (result.user?.role !== "admin") {
      gate.innerHTML = '<h1>Không có quyền truy cập</h1><p>Tài khoản hiện tại không có quyền quản trị.</p><a href="index.html">Quay về cửa hàng</a>';
      gate.setAttribute("role", "alert");
      return;
    }

    const verifiedSession = { token: session.token, user: result.user };
    try {
      localStorage.setItem(AUTH_KEY, JSON.stringify(verifiedSession));
    } catch {
      // Phiên đã được đọc và API đã xác minh; giao diện quản trị vẫn dùng bản hiện tại.
    }
    mountAdminShell(result.user, page);
    gate.hidden = true;
    root.hidden = false;

    if (page === "dashboard") {
      const { mountAdminDashboard } = await import("../pages/admin-dashboard.js");
      mountAdminDashboard();
    } else if (page === "products") {
      const { mountAdminProducts } = await import("../pages/admin-products.js");
      await mountAdminProducts();
    } else if (page === "categories") {
      const { mountAdminCategories } = await import("../pages/admin-categories.js");
      await mountAdminCategories();
    } else if (page === "orders") {
      const { mountAdminOrders } = await import("../pages/admin-orders.js");
      await mountAdminOrders();
    } else if (page === "reviews") {
      const { mountAdminReviews } = await import("../pages/admin-reviews.js");
      await mountAdminReviews();
    } else {
      window.location.replace("admin-dashboard.html");
    }
  } catch (error) {
    if (error.status === 401) {
      localStorage.removeItem(AUTH_KEY);
      window.dispatchEvent(
        new CustomEvent("anh-nguyet-xac-thuc-cap-nhat", {
          detail: { user: null },
        }),
      );
      redirectToLogin(page, true);
      return;
    }
    gate.textContent = error.message || "Không thể xác minh quyền quản trị.";
    gate.setAttribute("role", "alert");
  }
}

startAdminPage();
