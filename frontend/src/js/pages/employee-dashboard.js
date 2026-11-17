import { apiRequest } from "../services/api.js";
import { escapeHTML } from "../components/product-card.js";

export async function mountEmployeeDashboard() {
  const message = document.querySelector("[data-employee-dashboard-message]");
  const metrics = document.querySelector("[data-employee-dashboard-metrics]");
  let token = "";
  try { token = JSON.parse(localStorage.getItem("anh-nguyet-auth") || "null")?.token || ""; } catch { /* phiên không hợp lệ */ }
  if (!token) { window.location.replace("employee-login.html"); return; }
  try {
    const result = await apiRequest("/employee/dashboard", { headers: { Authorization: `Bearer ${token}` } });
    const data = result.data;
    const cards = [["Tổng đơn hàng", data.total_orders], ["Chờ xử lý", data.pending_orders], ["Đang xử lý", data.processing_orders], ["Đang giao", data.shipping_orders], ["Sản phẩm sắp hết", data.low_stock_products], ["Đánh giá cần kiểm tra", data.reviews_needing_attention]];
    metrics.innerHTML = cards.map(([label, value]) => `<article class="admin-employee-metric"><span>${escapeHTML(label)}</span><strong>${value === null || value === undefined ? "Chưa khả dụng" : Number(value).toLocaleString("vi-VN")}</strong></article>`).join("");
    metrics.hidden = false;
    message.textContent = "Thống kê được tải từ dữ liệu hệ thống hiện tại.";
  } catch (error) {
    message.textContent = error.message || "Không thể tải thống kê Nhân viên.";
    message.classList.add("is-error");
    if (error.status === 401) window.location.replace("employee-login.html?session=expired");
  }
}
