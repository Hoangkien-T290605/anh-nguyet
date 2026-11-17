import { apiRequest } from "../services/api.js";

export async function mountEmployeeInvitation() {
  const form = document.querySelector("[data-employee-invite-form]");
  const status = document.querySelector("[data-employee-invite-status]");
  const token = new URLSearchParams(window.location.search).get("token") || "";
  if (!form || !status || !token) {
    if (status) {
      status.textContent = "Liên kết lời mời bị thiếu hoặc không hợp lệ. Hãy yêu cầu Admin gửi lại.";
      status.classList.add("is-error");
    }
    return;
  }

  try {
    const invitation = await apiRequest(`/employee-invitations/${encodeURIComponent(token)}`);
    form.elements.email.value = invitation.data.email || "";
    form.hidden = false;
    status.textContent = "Lời mời hợp lệ. Liên kết có thời hạn; hãy hoàn tất đăng ký.";
    window.history.replaceState(null, "", window.location.pathname);
  } catch (error) {
    status.textContent = error.message || "Không thể xác minh lời mời.";
    status.classList.add("is-error");
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (form.elements.password.value !== form.elements.confirm_password.value) {
      status.textContent = "Mật khẩu nhập lại không khớp.";
      status.classList.add("is-error");
      return;
    }
    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true;
    status.textContent = "Đang tạo tài khoản...";
    status.classList.remove("is-error");
    try {
      const result = await apiRequest(`/employee-invitations/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        body: JSON.stringify({
          full_name: form.elements.full_name.value.trim(),
          phone: form.elements.phone.value.trim() || null,
          password: form.elements.password.value,
        }),
      });
      form.hidden = true;
      status.textContent = result.message || "Đã tạo tài khoản Nhân viên.";
      status.classList.remove("is-error");
      const loginLink = document.createElement("a");
      loginLink.className = "admin-back-link";
      loginLink.href = "employee-login.html";
      loginLink.textContent = "Đăng nhập Nhân viên";
      form.after(loginLink);
    } catch (error) {
      status.textContent = error.message || "Không thể chấp nhận lời mời.";
      status.classList.add("is-error");
      submit.disabled = false;
    }
  });
}

void mountEmployeeInvitation();
