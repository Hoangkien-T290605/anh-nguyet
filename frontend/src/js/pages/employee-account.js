import { apiRequest, getAvatarUrl } from "../services/api.js";

const AUTH_KEY = "anh-nguyet-auth";
function readSession() { try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); } catch { return null; } }

export async function mountEmployeeAccount() {
  const session = readSession();
  const info = document.querySelector("[data-employee-account-message]");
  const profile = document.querySelector("[data-employee-profile-form]");
  const requestForm = document.querySelector("[data-employee-password-request]");
  const verifyForm = document.querySelector("[data-employee-password-verify]");
  const passwordMessage = document.querySelector("[data-employee-password-message]");
  if (!session?.token) { window.location.replace("employee-login.html"); return; }
  const headers = { Authorization: "Bearer " + session.token };
  try {
    const result = await apiRequest("/auth/me", { headers });
    const user = result.user;
    if (user?.role !== "employee") { window.location.replace("index.html"); return; }
    profile.elements.full_name.value = user.full_name || ""; profile.elements.email.value = user.email || ""; profile.elements.phone.value = user.phone || ""; profile.hidden = false;
    if (user.avatar_url) { const avatar = document.createElement("img"); avatar.src = getAvatarUrl(user.avatar_url); avatar.alt = "Ảnh đại diện Nhân viên"; avatar.className = "admin-account-avatar"; profile.prepend(avatar); }
    info.textContent = user.must_change_password ? "Bạn phải đổi mật khẩu tạm thời trước khi sử dụng các chức năng khác." : "Hồ sơ Nhân viên đã tải.";
    if (user.must_change_password) { info.classList.add("is-error"); profile.querySelectorAll("input, button").forEach((control) => { control.disabled = true; }); }
  } catch (error) { info.textContent = error.message || "Không thể tải hồ sơ."; info.classList.add("is-error"); return; }

  profile.addEventListener("submit", async (event) => {
    event.preventDefault(); if (!profile.reportValidity()) return;
    try {
      const result = await apiRequest("/auth/me", { method: "PUT", headers, body: JSON.stringify({ full_name: profile.elements.full_name.value.trim(), phone: profile.elements.phone.value.trim() || null }) });
      info.textContent = result.message || "Đã cập nhật hồ sơ."; info.classList.remove("is-error");
      const current = readSession(); if (current?.token === session.token) localStorage.setItem(AUTH_KEY, JSON.stringify({ ...current, user: result.user }));
      const name = document.querySelector(".admin-sidebar-account-info strong"); if (name) name.textContent = result.user.full_name || "Nhân viên";
    } catch (error) { info.textContent = error.message || "Không thể cập nhật hồ sơ."; info.classList.add("is-error"); }
  });
  requestForm.addEventListener("submit", async (event) => {
    event.preventDefault(); if (!requestForm.reportValidity()) return;
    if (requestForm.elements.new_password.value !== requestForm.elements.confirm_password.value) { passwordMessage.textContent = "Mật khẩu xác nhận không khớp."; passwordMessage.classList.add("is-error"); return; }
    try {
      const body = Object.fromEntries(new FormData(requestForm));
      const result = await apiRequest("/auth/change-password/request-otp", { method: "POST", headers, body: JSON.stringify(body) });
      passwordMessage.textContent = result.message || "Mã xác nhận đã gửi."; passwordMessage.classList.remove("is-error"); requestForm.hidden = true; verifyForm.hidden = false;
    } catch (error) { passwordMessage.textContent = error.message || "Không thể gửi mã xác nhận."; passwordMessage.classList.add("is-error"); }
  });
  verifyForm.addEventListener("submit", async (event) => {
    event.preventDefault(); if (!verifyForm.reportValidity()) return;
    try {
      const result = await apiRequest("/auth/change-password/verify-otp", { method: "POST", headers, body: JSON.stringify({ otp: verifyForm.elements.otp.value.trim() }) });
      passwordMessage.textContent = result.message || "Đã đổi mật khẩu. Hãy đăng nhập lại."; passwordMessage.classList.remove("is-error"); localStorage.removeItem(AUTH_KEY); window.location.replace("employee-login.html?session=expired");
    } catch (error) { passwordMessage.textContent = error.message || "Không thể xác nhận mã."; passwordMessage.classList.add("is-error"); }
  });
}
