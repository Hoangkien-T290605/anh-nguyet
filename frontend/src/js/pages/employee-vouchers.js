import { apiRequest } from "../services/api.js";
import { escapeHTML } from "../components/product-card.js";

const statusNames = { active: "Đang hoạt động", scheduled: "Chưa bắt đầu", expired: "Đã hết hạn", exhausted: "Hết lượt", inactive: "Tạm ngừng" };
const formatDate = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("vi-VN"); };
const formatMoney = (value) => Number(value).toLocaleString("vi-VN") + "đ";

export async function mountEmployeeVouchers() {
  const search = document.querySelector("[data-employee-voucher-search]");
  const filter = document.querySelector("[data-employee-voucher-status]");
  const message = document.querySelector("[data-employee-voucher-message]");
  const wrap = document.querySelector("[data-employee-voucher-wrap]");
  const rows = document.querySelector("[data-employee-voucher-rows]");
  try {
    const token = JSON.parse(localStorage.getItem("anh-nguyet-auth") || "null")?.token || "";
    const result = await apiRequest("/employee/vouchers", { headers: { Authorization: "Bearer " + token } });
    const vouchers = Array.isArray(result.data) ? result.data : [];
    const render = () => {
      const q = search.value.trim().toLocaleLowerCase("vi");
      const list = vouchers.filter((v) => (!q || (v.code + " " + v.campaign_name).toLocaleLowerCase("vi").includes(q)) && (filter.value === "all" || v.status === filter.value));
      rows.innerHTML = list.map((v) => {
        const discount = v.discount_type === "percentage" ? Number(v.discount_value) + "%" + (v.maximum_discount == null ? "" : " · tối đa " + formatMoney(v.maximum_discount)) : formatMoney(v.discount_value);
        return "<tr><td><strong>" + escapeHTML(v.code) + "</strong></td><td>" + escapeHTML(v.campaign_name) + "<small>" + escapeHTML(v.description || "") + "</small></td><td>" + discount + "<small>Đơn tối thiểu " + formatMoney(v.minimum_subtotal) + "</small></td><td>" + Number(v.used_count).toLocaleString("vi-VN") + " / " + Number(v.quantity_limit).toLocaleString("vi-VN") + "</td><td>" + formatDate(v.starts_at) + " – " + formatDate(v.ends_at) + "</td><td>" + escapeHTML(statusNames[v.status] || "Không xác định") + "</td></tr>";
      }).join("");
      wrap.hidden = !list.length;
      message.textContent = list.length ? list.length + " Voucher phù hợp." : "Không có Voucher phù hợp.";
    };
    search.addEventListener("input", render); filter.addEventListener("change", render); render();
  } catch (error) {
    message.textContent = error.message || "Không thể tải Voucher."; message.classList.add("is-error");
    if (error.status === 401) window.location.replace("employee-login.html?session=expired");
  }
}
