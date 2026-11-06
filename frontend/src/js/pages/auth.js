import { apiRequest } from "../services/api.js";

const logoUrl = "./assets/logo-anh-nguyet.png";

const AUTH_STORAGE_KEY = "anh-nguyet-auth";

function showError(element, message) {
  element.textContent = message;
  element.hidden = !message;
}

export function mountAuth(mode) {
  const isRegister = mode === "register";
  const form = document.getElementById("auth-form");
  const errorNode = document.getElementById("auth-error");
  const successNode = document.getElementById("auth-success");
  const submitButton = document.getElementById("auth-submit");
  const logo = document.querySelector("[data-auth-logo]");
  const password = form.elements.password;
  const confirmPassword = isRegister ? form.elements.confirmPassword : null;

  logo.src = logoUrl;

  if (!isRegister && new URLSearchParams(window.location.search).get("registered") === "1") {
    successNode.textContent = "Đăng ký thành công. Vui lòng đăng nhập.";
    successNode.hidden = false;
  }
  if (!isRegister && new URLSearchParams(window.location.search).get("session") === "expired") {
    showError(errorNode, "Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.");
  }

  form.addEventListener("input", () => showError(errorNode, ""));

  document.querySelector("[data-password-toggle]").addEventListener("click", (event) => {
    const button = event.currentTarget;
    const show = password.type === "password";
    password.type = show ? "text" : "password";
    if (confirmPassword) confirmPassword.type = show ? "text" : "password";
    button.textContent = show ? "Ẩn" : "Hiện";
    button.setAttribute("aria-label", show ? "Ẩn mật khẩu" : "Hiện mật khẩu");
    button.setAttribute("aria-pressed", String(show));
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showError(errorNode, "");

    const values = Object.fromEntries(new FormData(form).entries());
    const fullName = String(values.full_name || "").trim();
    const email = String(values.email || "").trim();

    if (!email || !form.elements.email.validity.valid) {
      showError(errorNode, "Vui lòng nhập địa chỉ email hợp lệ.");
      form.elements.email.focus();
      return;
    }
    if (isRegister && (!fullName || fullName.length > 100)) {
      showError(errorNode, "Vui lòng nhập họ tên không quá 100 ký tự.");
      form.elements.full_name.focus();
      return;
    }
    if (isRegister && String(values.phone || "").length > 20) {
      showError(errorNode, "Số điện thoại không được vượt quá 20 ký tự.");
      form.elements.phone.focus();
      return;
    }
    if (password.value.length < 6) {
      showError(errorNode, "Mật khẩu phải có ít nhất 6 ký tự.");
      password.focus();
      return;
    }
    if (password.value.length > 72) {
      showError(errorNode, "Mật khẩu không được vượt quá 72 ký tự.");
      password.focus();
      return;
    }
    if (isRegister && password.value !== confirmPassword.value) {
      showError(errorNode, "Mật khẩu xác nhận không khớp.");
      confirmPassword.focus();
      return;
    }

    const payload = isRegister
      ? {
          full_name: fullName,
          email,
          password: password.value,
          phone: String(values.phone || "").trim(),
          address: String(values.address || "").trim(),
        }
      : { email, password: password.value };

    submitButton.disabled = true;
    submitButton.textContent = "Đang xử lý...";
    form.setAttribute("aria-busy", "true");

    try {
      const result = await apiRequest(`/auth/${isRegister ? "register" : "login"}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (result.token && result.user) {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: result.token, user: result.user }));
        window.dispatchEvent(new CustomEvent("anh-nguyet-auth-updated", { detail: { user: result.user } }));
        window.location.assign("index.html");
        return;
      }

      if (isRegister) {
        window.location.assign("login.html?registered=1");
        return;
      }

      throw new Error("Máy chủ không trả thông tin phiên đăng nhập hợp lệ.");
    } catch (error) {
      showError(errorNode, error.message || "Đã xảy ra lỗi. Vui lòng thử lại.");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = isRegister ? "Đăng ký" : "Đăng nhập";
      form.removeAttribute("aria-busy");
    }
  });
}
