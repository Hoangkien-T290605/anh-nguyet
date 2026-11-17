import { apiRequest, getAvatarUrl } from "../services/api.js";
import { escapeHTML } from "../components/product-card.js";

const AUTH_KEY = "anh-nguyet-auth";
const LIMIT = 20;
function readSession() { try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); } catch { return null; } }

export async function mountAdminUsers() {
  const session = readSession();
  if (!session?.token) { window.location.replace("admin-login.html?returnTo=admin-admins.html"); return; }
  const headers = { Authorization: `Bearer ${session.token}` };
  const profileForm = document.querySelector("[data-admin-profile-form]");
  const profileMessage = document.querySelector("[data-admin-account-message]");
  const passwordRequest = document.querySelector("[data-admin-password-request]");
  const passwordVerify = document.querySelector("[data-admin-password-verify]");
  const passwordMessage = document.querySelector("[data-admin-password-message]");
  const usersRows = document.querySelector("[data-admin-users-rows]");
  const usersWrap = document.querySelector("[data-admin-users-wrap]");
  const usersMessage = document.querySelector("[data-admin-users-message]");
  const usersPagination = document.querySelector("[data-admin-users-pagination]");
  const usersSearch = document.querySelector("[data-admin-users-search]");
  let page = 1, totalPages = 1, loading = false, profileSaving = false, passBusy = false, debounce;
  const fmtDate = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("vi-VN"); };

  try {
    const result = await apiRequest("/auth/me", { headers });
    const user = result.user;
    if (user?.role !== "admin") { window.location.replace("index.html"); return; }
    profileForm.elements.full_name.value = user.full_name || "";
    profileForm.elements.email.value = user.email || "";
    profileForm.elements.phone.value = user.phone || "";
    profileForm.hidden = false;
    if (user.must_change_password) profileForm.querySelectorAll("input, button").forEach((control) => { control.disabled = true; });
    profileMessage.textContent = "Hồ sơ quản trị đã tải.";
    if (user.avatar_url) {
      const avatar = document.createElement("img"); avatar.src = getAvatarUrl(user.avatar_url); avatar.alt = "Ảnh đại diện Admin"; avatar.className = "admin-account-avatar"; profileForm.prepend(avatar);
    }
  } catch (error) {
    profileMessage.textContent = error.message || "Không thể tải hồ sơ Admin."; profileMessage.classList.add("is-error");
    if (error.status === 401) window.location.replace("admin-login.html?session=expired&returnTo=admin-admins.html");
    return;
  }

  async function loadUsers() {
    if (loading) return; loading = true; usersMessage.textContent = "Đang tải tài khoản...";
    try {
      const query = new URLSearchParams({ page: String(page), limit: String(LIMIT), q: usersSearch.value.trim() });
      const result = await apiRequest(`/admin/admin-users?${query}`, { headers });
      usersRows.innerHTML = (result.data || []).map((user) => `<tr><td>${escapeHTML(user.full_name || "—")}</td><td>${escapeHTML(user.email || "—")}</td><td>${escapeHTML(user.phone || "—")}</td><td>${escapeHTML(fmtDate(user.created_at))}</td></tr>`).join("");
      totalPages = Math.max(1, Number(result.pagination?.total_pages) || 1);
      usersWrap.hidden = !result.data?.length;
      usersMessage.textContent = `${Number(result.pagination?.total || 0).toLocaleString("vi-VN")} tài khoản Admin · Trang ${page}/${totalPages}.`;
      usersPagination.hidden = totalPages <= 1;
      usersPagination.innerHTML = totalPages <= 1 ? "" : `<button type="button" data-admin-user-page="-1" ${page <= 1 ? "disabled" : ""}>Trang trước</button><span>Trang ${page}/${totalPages}</span><button type="button" data-admin-user-page="1" ${page >= totalPages ? "disabled" : ""}>Trang sau</button>`;
    } catch (error) {
      usersRows.replaceChildren(); usersWrap.hidden = true; usersPagination.hidden = true;
      usersMessage.textContent = error.message || "Không thể tải danh sách Admin."; usersMessage.classList.add("is-error");
      if (error.status === 401) window.location.replace("admin-login.html?session=expired&returnTo=admin-admins.html");
    } finally { loading = false; }
  }
  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault(); if (profileSaving || !profileForm.reportValidity()) return;
    profileSaving = true; const button = profileForm.querySelector("[data-admin-profile-save]"); button.disabled = true;
    try {
      const result = await apiRequest("/auth/me", { method: "PUT", headers, body: JSON.stringify({ full_name: profileForm.elements.full_name.value.trim(), phone: profileForm.elements.phone.value.trim() || null }) });
      if (result.user?.role === "admin") {
        const currentSession = readSession();
        if (currentSession?.token) localStorage.setItem(AUTH_KEY, JSON.stringify({ ...currentSession, user: result.user }));
        const sidebarName = document.querySelector(".admin-sidebar-account-info strong");
        if (sidebarName) sidebarName.textContent = result.user.full_name || "Quản trị viên";
      }
      profileMessage.textContent = result.message || "Đã cập nhật hồ sơ.";
      profileMessage.classList.remove("is-error");
    }
    catch (error) { profileMessage.textContent = error.message || "Không thể cập nhật hồ sơ."; profileMessage.classList.add("is-error"); }
    finally { profileSaving = false; button.disabled = false; }
  });
  passwordRequest.addEventListener("submit", async (event) => {
    event.preventDefault(); if (passBusy || !passwordRequest.reportValidity()) return;
    if (passwordRequest.elements.new_password.value !== passwordRequest.elements.confirm_password.value) { passwordMessage.textContent = "Mật khẩu xác nhận không khớp."; passwordMessage.classList.add("is-error"); return; }
    passBusy = true; passwordRequest.querySelector("button").disabled = true;
    try { const body = Object.fromEntries(new FormData(passwordRequest)); const result = await apiRequest("/auth/change-password/request-otp", { method: "POST", headers, body: JSON.stringify(body) }); passwordMessage.textContent = result.message || "Mã OTP đã gửi."; passwordMessage.classList.remove("is-error"); passwordRequest.hidden = true; passwordVerify.hidden = false; passwordRequest.reset(); }
    catch (error) { passwordMessage.textContent = error.message || "Không thể gửi OTP."; passwordMessage.classList.add("is-error"); }
    finally { passBusy = false; passwordRequest.querySelector("button").disabled = false; }
  });
  passwordVerify.addEventListener("submit", async (event) => {
    event.preventDefault(); if (passBusy || !passwordVerify.reportValidity()) return;
    passBusy = true; passwordVerify.querySelector("button[type=submit]").disabled = true;
    try { const result = await apiRequest("/auth/change-password/verify-otp", { method: "POST", headers, body: JSON.stringify({ otp: passwordVerify.elements.otp.value.trim() }) }); passwordMessage.textContent = result.message || "Đã đổi mật khẩu. Vui lòng đăng nhập lại nếu phiên hết hạn."; passwordMessage.classList.remove("is-error"); passwordVerify.reset(); passwordVerify.hidden = true; passwordRequest.hidden = false; }
    catch (error) { passwordMessage.textContent = error.message || "Không thể xác nhận OTP."; passwordMessage.classList.add("is-error"); }
    finally { passBusy = false; passwordVerify.querySelector("button[type=submit]").disabled = false; }
  });
  usersSearch.addEventListener("input", () => { clearTimeout(debounce); debounce = setTimeout(() => { page = 1; void loadUsers(); }, 250); });
  usersPagination.addEventListener("click", (event) => { const button = event.target.closest("[data-admin-user-page]"); if (!button || button.disabled) return; page += Number(button.dataset.adminUserPage); void loadUsers(); });
  await loadUsers();
}
