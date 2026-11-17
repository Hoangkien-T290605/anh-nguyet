import { apiRequest } from "../services/api.js";
import { escapeHTML } from "../components/product-card.js";

const KEY = "anh-nguyet-auth";
const PAGE_SIZE = 20;
const ROLE_LABELS = { employee: "Nhân viên", customer: "Khách hàng", admin: "Admin" };
const HISTORY_LABELS = {
  granted: "Cấp quyền",
  revoked: "Thu hồi quyền",
  activated: "Kích hoạt",
  deactivated: "Khóa tài khoản",
  invitation_accepted: "Chấp nhận lời mời",
};

function session() {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}

function makeTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("vi-VN");
}

function showMessage(element, text, isError = false) {
  element.textContent = text;
  element.classList.toggle("is-error", isError);
  element.hidden = false;
}

export async function mountAdminEmployees() {
  const auth = session();
  const search = document.querySelector("[data-employee-search]");
  const message = document.querySelector("[data-employee-message]");
  const wrap = document.querySelector("[data-employee-wrap]");
  const rows = document.querySelector("[data-employee-rows]");
  const pagination = document.querySelector("[data-employee-pagination]");
  const inviteDialog = document.querySelector("[data-employee-invite-dialog]");
  const inviteForm = document.querySelector("[data-employee-invite-form]");
  const inviteMessage = document.querySelector("[data-employee-invite-message]");
  const grantDialog = document.querySelector("[data-employee-grant-dialog]");
  const grantForm = document.querySelector("[data-employee-grant-lookup-form]");
  const grantMessage = document.querySelector("[data-employee-grant-message]");
  const grantButton = document.querySelector("[data-employee-grant-submit]");
  const editDialog = document.querySelector("[data-employee-edit-dialog]");
  const editForm = document.querySelector("[data-employee-edit-form]");
  const editMessage = document.querySelector("[data-employee-edit-message]");
  const resetDialog = document.querySelector("[data-employee-reset-dialog]");
  const resetForm = document.querySelector("[data-employee-reset-form]");
  const resetMessage = document.querySelector("[data-employee-reset-message]");
  const invitationMessage = document.querySelector("[data-invitation-message]");
  const invitationWrap = document.querySelector("[data-invitation-wrap]");
  const invitationRows = document.querySelector("[data-invitation-rows]");
  const historySearch = document.querySelector("[data-role-history-search]");
  const historyMessage = document.querySelector("[data-role-history-message]");
  const historyWrap = document.querySelector("[data-role-history-wrap]");
  const historyRows = document.querySelector("[data-role-history-rows]");

  if (!auth?.token) {
    window.location.replace("admin-login.html?returnTo=admin-employees.html");
    return;
  }
  const headers = { Authorization: `Bearer ${auth.token}` };
  let page = 1;
  let totalPages = 1;
  let saving = false;
  let employeeTimer;
  let historyTimer;
  let employees = new Map();
  let grantCandidate = null;

  async function loadEmployees() {
    message.textContent = "Đang tải nhân viên...";
    message.classList.remove("is-error");
    try {
      const query = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        q: search.value.trim(),
      });
      const result = await apiRequest(`/admin/employees?${query}`, { headers });
      const list = Array.isArray(result.data) ? result.data : [];
      employees = new Map(list.map((user) => [String(user.id), user]));
      rows.innerHTML = list.map((user) => {
        const roleOptions = ["employee", "customer", "admin"].map((role) =>
          `<option value="${role}" ${user.role === role ? "selected" : ""}>${ROLE_LABELS[role]}</option>`,
        ).join("");
        return `<tr>
          <td><strong>${escapeHTML(user.full_name || "—")}</strong><small>#${escapeHTML(user.id)}${user.must_change_password ? " · Cần đổi mật khẩu" : ""}</small></td>
          <td>${escapeHTML(user.email || "—")}</td>
          <td>${escapeHTML(user.phone || "—")}</td>
          <td>${user.is_active ? "Đang hoạt động" : "Đã khóa"}</td>
          <td><select aria-label="Vai trò tài khoản ${escapeHTML(user.email)}" data-employee-role="${escapeHTML(user.id)}">${roleOptions}</select></td>
          <td><div class="admin-row-actions">
            <button type="button" class="admin-customer-view" data-employee-edit="${escapeHTML(user.id)}">Sửa</button>
            <button type="button" class="admin-review-action" data-employee-status="${escapeHTML(user.id)}" data-next-active="${String(!user.is_active)}">${user.is_active ? "Khóa" : "Kích hoạt"}</button>
            <button type="button" class="admin-review-action" data-employee-reset="${escapeHTML(user.id)}">Đặt lại mật khẩu</button>
          </div></td>
        </tr>`;
      }).join("");
      wrap.hidden = !list.length;
      totalPages = Math.max(1, Number(result.pagination?.total_pages) || 1);
      message.textContent = list.length
        ? `${Number(result.pagination.total).toLocaleString("vi-VN")} nhân viên · Trang ${page}/${totalPages}.`
        : "Chưa có nhân viên phù hợp.";
      pagination.hidden = totalPages <= 1;
      pagination.innerHTML = totalPages <= 1 ? "" :
        `<button type="button" data-employee-page="-1" ${page <= 1 ? "disabled" : ""}>Trang trước</button><span>Trang ${page}/${totalPages}</span><button type="button" data-employee-page="1" ${page >= totalPages ? "disabled" : ""}>Trang sau</button>`;
    } catch (error) {
      rows.replaceChildren();
      wrap.hidden = true;
      pagination.hidden = true;
      showMessage(message, error.message || "Không thể tải danh sách Nhân viên.", true);
      if (error.status === 401) window.location.replace("admin-login.html?session=expired&returnTo=admin-employees.html");
    }
  }

  async function loadInvitations() {
    invitationMessage.textContent = "Đang tải lời mời...";
    invitationMessage.classList.remove("is-error");
    try {
      const result = await apiRequest("/admin/employees/invitations?limit=50", { headers });
      const list = Array.isArray(result.data) ? result.data : [];
      invitationRows.innerHTML = list.map((invitation) => {
        const actions = invitation.status === "pending"
          ? `<button type="button" class="admin-customer-view" data-invitation-resend="${escapeHTML(invitation.id)}">Gửi lại</button><button type="button" class="admin-review-action" data-invitation-revoke="${escapeHTML(invitation.id)}">Thu hồi</button>`
          : "";
        const status = { pending: "Đang chờ", accepted: "Đã chấp nhận", expired: "Hết hạn", revoked: "Đã thu hồi" }[invitation.status] || invitation.status;
        const delivery = { pending: "Chờ gửi", sending: "Đang gửi", sent: "Đã gửi", failed: "Gửi lỗi" }[invitation.email_delivery_status] || invitation.email_delivery_status;
        return `<tr>
          <td>${escapeHTML(invitation.email)}</td>
          <td>${escapeHTML(status)}</td>
          <td>${escapeHTML(delivery)}${invitation.last_email_error_code ? `<small>${escapeHTML(invitation.last_email_error_code)}</small>` : ""}</td>
          <td>${escapeHTML(formatDate(invitation.sent_at))}</td>
          <td>${escapeHTML(formatDate(invitation.expires_at))}</td>
          <td><div class="admin-row-actions">${actions}</div></td>
        </tr>`;
      }).join("");
      invitationWrap.hidden = !list.length;
      invitationMessage.textContent = list.length
        ? `${Number(result.pagination?.total || list.length).toLocaleString("vi-VN")} lời mời gần đây.`
        : "Chưa có lời mời.";
    } catch (error) {
      invitationRows.replaceChildren();
      invitationWrap.hidden = true;
      showMessage(invitationMessage, error.message || "Không thể tải lời mời.", true);
      if (error.status === 401) window.location.replace("admin-login.html?session=expired&returnTo=admin-employees.html");
    }
  }

  async function loadHistory() {
    historyMessage.textContent = "Đang tải lịch sử...";
    historyMessage.classList.remove("is-error");
    try {
      const query = new URLSearchParams({ q: historySearch.value.trim(), limit: "100" });
      const result = await apiRequest(`/admin/employee-role-history?${query}`, { headers });
      const list = Array.isArray(result.data) ? result.data : [];
      historyRows.innerHTML = list.map((item) => `<tr>
        <td><strong>${escapeHTML(item.employee_name || "Tài khoản")}</strong><small>#${escapeHTML(item.employee_user_id)} · ${escapeHTML(item.employee_email || "—")}</small></td>
        <td>${escapeHTML(HISTORY_LABELS[item.action] || item.action)}</td>
        <td>${escapeHTML(ROLE_LABELS[item.role_before] || "—")} → ${escapeHTML(ROLE_LABELS[item.role_after] || "—")}</td>
        <td>${escapeHTML(item.admin_name || "Tài khoản Admin đã xóa")}</td>
        <td>${escapeHTML(formatDate(item.created_at))}</td>
      </tr>`).join("");
      historyWrap.hidden = !list.length;
      historyMessage.textContent = list.length ? `${list.length} sự kiện gần đây.` : "Chưa có lịch sử phân quyền.";
    } catch (error) {
      historyRows.replaceChildren();
      historyWrap.hidden = true;
      showMessage(historyMessage, error.message || "Không thể tải lịch sử phân quyền.", true);
      if (error.status === 401) window.location.replace("admin-login.html?session=expired&returnTo=admin-employees.html");
    }
  }

  function openEdit(user) {
    editForm.reset();
    editForm.elements.id.value = user.id;
    editForm.elements.full_name.value = user.full_name || "";
    editForm.elements.email.value = user.email || "";
    editForm.elements.phone.value = user.phone || "";
    editMessage.hidden = true;
    editDialog.showModal();
  }

  document.querySelector("[data-employee-invite-open]").addEventListener("click", () => {
    inviteForm.reset();
    inviteMessage.hidden = true;
    inviteDialog.showModal();
  });
  document.querySelector("[data-employee-grant-open]").addEventListener("click", () => {
    grantForm.reset();
    grantCandidate = null;
    grantButton.disabled = true;
    grantMessage.hidden = true;
    grantDialog.showModal();
  });
  document.querySelectorAll("[data-employee-invite-close]").forEach((button) => button.addEventListener("click", () => inviteDialog.close()));
  document.querySelectorAll("[data-employee-grant-close]").forEach((button) => button.addEventListener("click", () => grantDialog.close()));
  document.querySelectorAll("[data-employee-edit-close]").forEach((button) => button.addEventListener("click", () => editDialog.close()));
  document.querySelectorAll("[data-employee-reset-close]").forEach((button) => button.addEventListener("click", () => resetDialog.close()));

  inviteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving || !inviteForm.reportValidity()) return;
    saving = true;
    const submit = inviteForm.querySelector("button[type=submit]");
    submit.disabled = true;
    try {
      const result = await apiRequest("/admin/employees", {
        method: "POST",
        headers,
        body: JSON.stringify({ email: inviteForm.elements.email.value.trim() }),
      });
      inviteDialog.close();
      showMessage(invitationMessage, result.message || "Đã gửi lời mời.");
    } catch (error) {
      showMessage(inviteMessage, error.message || "Không thể gửi lời mời.", true);
    } finally {
      saving = false;
      submit.disabled = false;
      await Promise.all([loadInvitations(), loadHistory()]);
    }
  });

  grantForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving || !grantForm.reportValidity()) return;
    saving = true;
    grantCandidate = null;
    grantButton.disabled = true;
    try {
      const email = grantForm.elements.email.value.trim().toLowerCase();
      const query = new URLSearchParams({ email });
      const result = await apiRequest(`/admin/employees/lookup?${query}`, { headers });
      if (!result.data) {
        showMessage(grantMessage, "Email chưa đăng ký. Hãy dùng Mời email mới để gửi lời mời.", true);
      } else if (result.data.role !== "customer") {
        showMessage(grantMessage, `${result.data.full_name || result.data.email} hiện là ${ROLE_LABELS[result.data.role] || result.data.role}; không thể cấp lại quyền này.`, true);
      } else {
        grantCandidate = result.data;
        showMessage(grantMessage, `Tìm thấy ${result.data.full_name || result.data.email} (${result.data.email}). Tài khoản hiện tại sẽ được giữ nguyên.`);
        grantButton.disabled = false;
      }
    } catch (error) {
      showMessage(grantMessage, error.message || "Không thể tra cứu email.", true);
    } finally {
      saving = false;
    }
  });

  grantButton.addEventListener("click", async () => {
    if (saving || !grantCandidate) return;
    if (!window.confirm(`Cấp quyền Nhân viên cho ${grantCandidate.email}? Mật khẩu và dữ liệu mua hàng hiện có sẽ được giữ nguyên.`)) return;
    saving = true;
    grantButton.disabled = true;
    try {
      const result = await apiRequest("/admin/employees/grant", {
        method: "POST",
        headers,
        body: JSON.stringify({ email: grantCandidate.email }),
      });
      grantDialog.close();
      showMessage(message, result.message || "Đã cấp quyền Nhân viên.");
    } catch (error) {
      showMessage(grantMessage, error.message || "Không thể cấp quyền Nhân viên.", true);
    } finally {
      saving = false;
      await Promise.all([loadEmployees(), loadInvitations(), loadHistory()]);
    }
  });

  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving || !editForm.reportValidity()) return;
    saving = true;
    try {
      const id = editForm.elements.id.value;
      const result = await apiRequest(`/admin/employees/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          full_name: editForm.elements.full_name.value.trim(),
          phone: editForm.elements.phone.value.trim() || null,
        }),
      });
      editDialog.close();
      showMessage(message, result.message || "Đã cập nhật hồ sơ Nhân viên.");
    } catch (error) {
      showMessage(editMessage, error.message || "Không thể lưu hồ sơ.", true);
    } finally {
      saving = false;
      await loadEmployees();
    }
  });

  resetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving || !resetForm.reportValidity()) return;
    saving = true;
    const submit = resetForm.querySelector("button[type=submit]");
    submit.disabled = true;
    try {
      const result = await apiRequest(`/admin/employees/${encodeURIComponent(resetForm.dataset.userId)}/password-reset`, {
        method: "POST",
        headers,
        body: JSON.stringify({ temporary_password: resetForm.elements.temporary_password.value }),
      });
      showMessage(resetMessage, `${result.message || "Đã đặt lại mật khẩu."} Chuyển mật khẩu qua kênh riêng an toàn.`);
    } catch (error) {
      showMessage(resetMessage, error.message || "Không thể đặt lại mật khẩu.", true);
    } finally {
      saving = false;
      submit.disabled = false;
      await loadEmployees();
    }
  });

  rows.addEventListener("click", async (event) => {
    const edit = event.target.closest("[data-employee-edit]");
    if (edit) {
      const user = employees.get(edit.dataset.employeeEdit);
      if (user) openEdit(user);
      return;
    }
    const statusButton = event.target.closest("[data-employee-status]");
    if (statusButton && !saving) {
      const active = statusButton.dataset.nextActive === "true";
      if (!window.confirm(`${active ? "Kích hoạt" : "Khóa"} tài khoản Nhân viên #${statusButton.dataset.employeeStatus}?`)) return;
      saving = true;
      try {
        const result = await apiRequest(`/admin/employees/${encodeURIComponent(statusButton.dataset.employeeStatus)}/status`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ is_active: active }),
        });
        showMessage(message, result.message || "Đã cập nhật trạng thái.");
      } catch (error) {
        showMessage(message, error.message || "Không thể cập nhật trạng thái.", true);
      } finally {
        saving = false;
        await Promise.all([loadEmployees(), loadHistory()]);
      }
      return;
    }
    const reset = event.target.closest("[data-employee-reset]");
    if (reset) {
      const user = employees.get(reset.dataset.employeeReset);
      resetForm.reset();
      resetForm.dataset.userId = reset.dataset.employeeReset;
      resetForm.elements.temporary_password.value = makeTemporaryPassword();
      document.querySelector("[data-employee-reset-name]").textContent = user?.full_name || `Tài khoản #${reset.dataset.employeeReset}`;
      resetMessage.hidden = true;
      resetDialog.showModal();
    }
  });

  rows.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-employee-role]");
    if (!select || saving) return;
    const nextRole = select.value;
    if (!window.confirm(`Xác nhận đổi tài khoản #${select.dataset.employeeRole} sang vai trò ${ROLE_LABELS[nextRole]}?`)) {
      await loadEmployees();
      return;
    }
    saving = true;
    try {
      const result = await apiRequest(`/admin/users/${encodeURIComponent(select.dataset.employeeRole)}/role`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ role: nextRole }),
      });
      showMessage(message, result.message || "Đã cập nhật vai trò.");
    } catch (error) {
      showMessage(message, error.message || "Không thể đổi vai trò.", true);
    } finally {
      saving = false;
      await Promise.all([loadEmployees(), loadInvitations(), loadHistory()]);
    }
  });

  invitationRows.addEventListener("click", async (event) => {
    const resend = event.target.closest("[data-invitation-resend]");
    const revoke = event.target.closest("[data-invitation-revoke]");
    if ((!resend && !revoke) || saving) return;
    const id = (resend || revoke).dataset.invitationResend || (resend || revoke).dataset.invitationRevoke;
    const action = resend ? "resend" : "revoke";
    if (!window.confirm(action === "resend" ? "Gửi lại liên kết mới? Liên kết cũ sẽ mất hiệu lực." : "Thu hồi lời mời này?")) return;
    saving = true;
    try {
      const result = await apiRequest(`/admin/employees/invitations/${encodeURIComponent(id)}/${action}`, {
        method: "PATCH",
        headers,
      });
      showMessage(invitationMessage, result.message || (action === "resend" ? "Đã gửi lại lời mời." : "Đã thu hồi lời mời."));
    } catch (error) {
      showMessage(invitationMessage, error.message || "Không thể cập nhật lời mời.", true);
    } finally {
      saving = false;
      await loadInvitations();
    }
  });

  search.addEventListener("input", () => {
    clearTimeout(employeeTimer);
    employeeTimer = setTimeout(() => { page = 1; void loadEmployees(); }, 250);
  });
  historySearch.addEventListener("input", () => {
    clearTimeout(historyTimer);
    historyTimer = setTimeout(() => { void loadHistory(); }, 250);
  });
  pagination.addEventListener("click", (event) => {
    const button = event.target.closest("[data-employee-page]");
    if (!button || button.disabled) return;
    page += Number(button.dataset.employeePage);
    void loadEmployees();
  });

  await Promise.all([loadEmployees(), loadInvitations(), loadHistory()]);
}
