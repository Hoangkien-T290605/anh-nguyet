import { apiRequest } from "../services/api.js";
import { applyAdminTheme } from "../admin/shell.js";

const AUTH_KEY = "anh-nguyet-auth";
const ADMIN_DESTINATIONS = new Set([
  "admin-dashboard.html",
  "admin-products.html",
  "admin-orders.html",
  "admin-reviews.html",
]);

export function mountAdminLogin() {
  applyAdminTheme();
  const form = document.getElementById("admin-login-form");
  const status = document.getElementById("admin-login-status");
  const submit = document.getElementById("admin-login-submit");
  let submitting = false;

  const showMessage = (message) => {
    status.textContent = message;
    status.hidden = !message;
  };

  if (new URLSearchParams(window.location.search).get("session") === "expired") {
    showMessage("Phiên quản trị đã hết hạn. Vui lòng đăng nhập lại.");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting || !form.reportValidity()) return;
    showMessage("");
    submitting = true;
    submit.disabled = true;
    submit.textContent = "Đang xác minh...";
    form.setAttribute("aria-busy", "true");

    try {
      const credentials = Object.fromEntries(new FormData(form).entries());
      const login = await apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: String(credentials.email || "").trim(),
          password: String(credentials.password || ""),
        }),
      });
      if (!login.token || !login.user) {
        throw new Error("Máy chủ không trả thông tin phiên đăng nhập hợp lệ.");
      }

      const verified = await apiRequest("/auth/me", {
        headers: { Authorization: `Bearer ${login.token}` },
      });
      if (verified.user?.role !== "admin") {
        showMessage("Tài khoản này không được cấp quyền quản trị.");
        return;
      }

      localStorage.setItem(
        AUTH_KEY,
        JSON.stringify({ token: login.token, user: verified.user }),
      );
      window.dispatchEvent(
        new CustomEvent("anh-nguyet-xac-thuc-cap-nhat", {
          detail: { user: verified.user },
        }),
      );
      const requested = new URLSearchParams(window.location.search).get("returnTo");
      window.location.assign(
        ADMIN_DESTINATIONS.has(requested) ? requested : "admin-dashboard.html",
      );
    } catch (error) {
      showMessage(error.message || "Không thể đăng nhập. Vui lòng thử lại.");
    } finally {
      submitting = false;
      submit.disabled = false;
      submit.textContent = "Đăng nhập";
      form.removeAttribute("aria-busy");
    }
  });
}
