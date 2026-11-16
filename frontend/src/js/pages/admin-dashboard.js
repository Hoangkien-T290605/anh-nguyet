import { apiRequest, getProductImageUrl } from "../services/api.js";
import { escapeHTML } from "../components/product-card.js";

const AUTH_KEY = "anh-nguyet-auth";
const STATUS_LABELS = {
  pending_confirmation: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  preparing: "Đang chuẩn bị",
  shipping: "Đang giao hàng",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
};
const STATUS_COLORS = ["#9a74c4", "#7041a6", "#b58a42", "#5386b6", "#43865a", "#bd5966"];

function readSession() {
  try {
    const session = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    return session?.token ? session : null;
  } catch {
    return null;
  }
}

function dateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function completeDailySeries(rows, from, to) {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const cursor = new Date(`${from}T12:00:00`);
  const last = new Date(`${to}T12:00:00`);
  const completed = [];
  while (cursor <= last) {
    const date = dateInputValue(cursor);
    completed.push(byDate.get(date) || { date, order_count: 0, revenue: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return completed;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatCurrency(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(amount)
    : "—";
}

function validCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function drawBarChart(rows, valueKey, mode) {
  if (!rows.length) return '<p class="admin-dashboard-empty">Không có dữ liệu trong khoảng thời gian này.</p>';
  const widthPerItem = rows.length > 20 ? 28 : 54;
  const width = Math.max(720, rows.length * widthPerItem + 70);
  const chartHeight = 205;
  const top = 18;
  const bottom = 42;
  const plotHeight = chartHeight - top - bottom;
  const maxValue = Math.max(1, ...rows.map((row) => validCount(row[valueKey])));
  const step = width / rows.length;
  const barWidth = Math.max(5, Math.min(24, step * 0.56));
  const labelEvery = Math.max(1, Math.ceil(rows.length / 9));
  const bars = rows.map((row, index) => {
    const value = validCount(row[valueKey]);
    const barHeight = value ? Math.max(2, (value / maxValue) * plotHeight) : 0;
    const x = index * step + (step - barWidth) / 2;
    const y = top + plotHeight - barHeight;
    const label = String(row.date || "").slice(5);
    return `<g><title>${escapeHTML(row.date || "")} · ${mode === "revenue" ? formatCurrency(value) : `${value} đơn hàng`}</title><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="4" fill="${mode === "revenue" ? "#7041a6" : "#a881d0"}" opacity="${value ? "0.9" : "0.18"}"/><text x="${(x + barWidth / 2).toFixed(1)}" y="${chartHeight - 12}" text-anchor="middle" class="admin-chart-label">${index % labelEvery === 0 || index === rows.length - 1 ? escapeHTML(label) : ""}</text></g>`;
  }).join("");
  const grid = [0, 1, 2, 3].map((line) => {
    const y = top + (plotHeight / 3) * line;
    return `<line x1="36" x2="${width - 8}" y1="${y}" y2="${y}" class="admin-chart-gridline"/>`;
  }).join("");
  return `<div class="admin-chart-scroll"><svg class="admin-bar-chart" viewBox="0 0 ${width} ${chartHeight}" role="img" aria-label="Biểu đồ ${mode === "revenue" ? "doanh thu" : "số đơn hàng"}">${grid}${bars}</svg></div>`;
}

function renderStatusChart(statusRows) {
  const known = Object.keys(STATUS_LABELS).map((status, index) => ({
    status,
    label: STATUS_LABELS[status],
    count: validCount(statusRows.find((row) => row.status === status)?.count),
    color: STATUS_COLORS[index],
  }));
  const total = known.reduce((sum, row) => sum + row.count, 0);
  if (!total) return '<p class="admin-dashboard-empty">Chưa có đơn hàng trong khoảng thời gian này.</p>';
  let accumulated = 0;
  const stops = known.map((row) => {
    const start = (accumulated / total) * 100;
    accumulated += row.count;
    return `${row.color} ${start.toFixed(2)}% ${(accumulated / total * 100).toFixed(2)}%`;
  });
  return `<div class="admin-status-chart-layout"><div class="admin-status-donut" role="img" aria-label="Cơ cấu ${total} đơn hàng theo trạng thái" style="--admin-status-chart: conic-gradient(${stops.join(",")})"><span><strong>${total.toLocaleString("vi-VN")}</strong><small>đơn hàng</small></span></div><ul class="admin-status-legend">${known.map((row) => `<li><span><i style="--status-color:${row.color}"></i>${row.label}</span><strong>${row.count.toLocaleString("vi-VN")}</strong></li>`).join("")}</ul></div>`;
}

export function mountAdminDashboard() {
  const content = document.getElementById("admin-content");
  const session = readSession();
  if (!content) return;
  if (!session) {
    window.location.replace("admin-login.html?returnTo=admin-dashboard.html");
    return;
  }

  const today = new Date();
  const initialStart = new Date(today);
  initialStart.setDate(initialStart.getDate() - 6);
  let fromDate = dateInputValue(initialStart);
  let toDate = dateInputValue(today);
  let dashboardData = null;
  let loading = true;
  let loadError = "";

  content.innerHTML = `
    <section class="admin-page-heading admin-dashboard-heading">
      <div><span>TỔNG QUAN</span><h1>Dashboard cửa hàng</h1><p>Theo dõi tình hình sản phẩm, đơn hàng, khách hàng và doanh thu từ dữ liệu hệ thống.</p></div>
      <label class="admin-dashboard-period">Khoảng thời gian
        <select data-dashboard-period>
          <option value="7">7 ngày qua</option>
          <option value="30">30 ngày qua</option>
          <option value="today">Hôm nay</option>
          <option value="month">Tháng này</option>
          <option value="custom">Tùy chỉnh</option>
        </select>
      </label>
    </section>
    <form class="admin-dashboard-custom-range" data-dashboard-custom hidden>
      <label>Từ ngày<input type="date" data-dashboard-from value="${fromDate}" /></label>
      <label>Đến ngày<input type="date" data-dashboard-to value="${toDate}" /></label>
      <button class="admin-primary-button" type="submit">Áp dụng</button>
    </form>
    <p class="admin-dashboard-feedback" data-dashboard-feedback role="status" aria-live="polite"></p>
    <section class="admin-stat-grid" data-dashboard-stats aria-label="Thống kê tổng quan"></section>
    <section class="admin-dashboard-chart-grid" aria-label="Biểu đồ thống kê">
      <article class="admin-dashboard-panel admin-dashboard-chart-panel"><header><div><h2>Doanh thu theo ngày</h2><p>Chỉ tính đơn hàng đã hoàn thành</p></div></header><div data-dashboard-revenue></div></article>
      <article class="admin-dashboard-panel admin-dashboard-chart-panel"><header><div><h2>Đơn hàng theo ngày</h2><p>Số đơn được tạo trong khoảng đã chọn</p></div></header><div data-dashboard-orders-chart></div></article>
      <article class="admin-dashboard-panel admin-dashboard-status-panel"><header><div><h2>Trạng thái đơn hàng</h2><p>Phân bổ trong cùng khoảng thời gian</p></div></header><div data-dashboard-status></div></article>
    </section>
    <section class="admin-dashboard-data-grid">
      <article class="admin-dashboard-panel"><header><div><h2>Đơn hàng gần đây</h2><p>Trong khoảng thời gian đang chọn</p></div><a href="admin-orders.html">Quản lý đơn hàng</a></header><div data-dashboard-recent></div></article>
      <article class="admin-dashboard-panel"><header><div><h2>Sản phẩm bán chạy</h2><p>Dựa trên các đơn hàng đã hoàn thành</p></div><a href="admin-products.html">Quản lý sản phẩm</a></header><div data-dashboard-best-sellers></div></article>
    </section>`;

  const periodSelect = content.querySelector("[data-dashboard-period]");
  const customForm = content.querySelector("[data-dashboard-custom]");
  const feedback = content.querySelector("[data-dashboard-feedback]");

  function showFeedback(message, isError = false) {
    feedback.textContent = message;
    feedback.hidden = !message;
    feedback.classList.toggle("is-error", isError);
    feedback.setAttribute("role", isError ? "alert" : "status");
  }

  function render() {
    const statsNode = content.querySelector("[data-dashboard-stats]");
    const revenueNode = content.querySelector("[data-dashboard-revenue]");
    const ordersChartNode = content.querySelector("[data-dashboard-orders-chart]");
    const statusNode = content.querySelector("[data-dashboard-status]");
    const recentNode = content.querySelector("[data-dashboard-recent]");
    const bestSellersNode = content.querySelector("[data-dashboard-best-sellers]");
    if (loading) {
      statsNode.innerHTML = Array.from({ length: 4 }, () => '<div class="admin-stat-card is-loading"><span class="admin-stat-icon">◌</span><div><small>Đang tải</small><strong>—</strong></div></div>').join("");
      for (const node of [revenueNode, ordersChartNode, statusNode, recentNode, bestSellersNode]) node.innerHTML = '<p class="admin-dashboard-empty">Đang tải dữ liệu...</p>';
      return;
    }
    if (loadError) {
      statsNode.innerHTML = `<div class="admin-dashboard-error" role="alert"><strong>Không tải được Dashboard</strong><span>${escapeHTML(loadError)}</span><button type="button" class="admin-secondary-button" data-dashboard-retry>Thử lại</button></div>`;
      for (const node of [revenueNode, ordersChartNode, statusNode, recentNode, bestSellersNode]) node.innerHTML = '<p class="admin-dashboard-empty">Dữ liệu chưa tải được.</p>';
      return;
    }

    const stats = dashboardData.stats || {};
    const cards = [
      ["▧", "Tổng sản phẩm", validCount(stats.total_products).toLocaleString("vi-VN"), "Trong toàn hệ thống"],
      ["▤", "Tổng đơn hàng", validCount(stats.total_orders).toLocaleString("vi-VN"), "Trong khoảng đã chọn"],
      ["♙", "Tổng khách hàng", validCount(stats.total_customers).toLocaleString("vi-VN"), "Tài khoản khách hàng trong hệ thống"],
      ["◈", "Tổng doanh thu", formatCurrency(stats.total_revenue), "Đơn hàng đã hoàn thành"],
    ];
    statsNode.innerHTML = cards.map(([icon, label, value, note]) => `<article class="admin-stat-card"><span class="admin-stat-icon" aria-hidden="true">${icon}</span><div><small>${label}</small><strong>${value}</strong><span>${note}</span></div></article>`).join("");

    const series = completeDailySeries(
      Array.isArray(dashboardData.series) ? dashboardData.series : [],
      fromDate,
      toDate,
    );
    revenueNode.innerHTML = drawBarChart(series, "revenue", "revenue");
    ordersChartNode.innerHTML = drawBarChart(series, "order_count", "orders");
    statusNode.innerHTML = renderStatusChart(Array.isArray(dashboardData.orders_by_status) ? dashboardData.orders_by_status : []);
    renderRecentOrders(recentNode, dashboardData.recent_orders);
    renderBestSellers(bestSellersNode, dashboardData.top_products);
    showFeedback(`Thống kê từ ${fromDate} đến ${toDate}. Doanh thu chỉ tính đơn hoàn thành.`);
  }

  function renderRecentOrders(node, orders) {
    if (!Array.isArray(orders) || !orders.length) {
      node.innerHTML = '<p class="admin-dashboard-empty">Không có đơn hàng trong khoảng thời gian này.</p>';
      return;
    }
    node.innerHTML = `<div class="admin-dashboard-table-wrap"><table class="admin-dashboard-table"><thead><tr><th>Mã đơn</th><th>Khách hàng</th><th>Ngày đặt</th><th>Tổng tiền</th><th>Trạng thái</th><th></th></tr></thead><tbody>${orders.map((order) => {
      const id = escapeHTML(order.id ?? "—");
      const status = STATUS_LABELS[order.status] || "Không xác định";
      return `<tr><td><strong>#${id}</strong></td><td>${escapeHTML(order.customer_name || "Khách vãng lai")}</td><td>${escapeHTML(formatDate(order.created_at))}</td><td>${formatCurrency(order.total_amount)}</td><td><span class="admin-dashboard-status-badge">${status}</span></td><td><a href="admin-orders.html" aria-label="Mở quản lý đơn hàng ${id}">Xem</a></td></tr>`;
    }).join("")}</tbody></table></div>`;
  }

  function renderBestSellers(node, products) {
    if (!Array.isArray(products) || !products.length) {
      node.innerHTML = '<p class="admin-dashboard-empty">Chưa có sản phẩm bán trong các đơn hoàn thành của khoảng thời gian này.</p>';
      return;
    }
    node.innerHTML = `<div class="admin-dashboard-table-wrap"><table class="admin-dashboard-table admin-dashboard-product-table"><thead><tr><th>Sản phẩm</th><th>Đã bán</th><th>Doanh thu</th></tr></thead><tbody>${products.map((product) => {
      const image = getProductImageUrl(product.image);
      return `<tr><td><span class="admin-dashboard-product"><span class="admin-dashboard-product-image">${image ? `<img src="${escapeHTML(image)}" alt="" loading="lazy" data-dashboard-image />` : "❋"}</span><span>${escapeHTML(product.name || "Sản phẩm đã lưu trong đơn")}</span></span></td><td>${validCount(product.quantity_sold).toLocaleString("vi-VN")}</td><td>${formatCurrency(product.revenue)}</td></tr>`;
    }).join("")}</tbody></table></div>`;
    node.querySelectorAll("[data-dashboard-image]").forEach((image) => image.addEventListener("error", () => {
      image.hidden = true;
      image.parentElement.textContent = "❋";
    }, { once: true }));
  }

  async function loadDashboard() {
    loading = true;
    loadError = "";
    render();
    try {
      const query = new URLSearchParams({ from: fromDate, to: toDate });
      const result = await apiRequest(`/admin/dashboard?${query}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!result || result.success !== true || !result.stats || !Array.isArray(result.series)) {
        throw new Error("Máy chủ trả về dữ liệu thống kê không hợp lệ.");
      }
      dashboardData = result;
    } catch (error) {
      if (error.status === 401) {
        window.location.replace("admin-login.html?session=expired&returnTo=admin-dashboard.html");
        return;
      }
      loadError = error.message || "Không thể tải số liệu quản trị.";
    } finally {
      loading = false;
      render();
    }
  }

  function presetRange(value) {
    const end = new Date();
    const start = new Date(end);
    if (value === "today") {
      // Cả hai mốc cùng ngày.
    } else if (value === "month") {
      start.setDate(1);
    } else {
      start.setDate(start.getDate() - (Number(value) - 1));
    }
    fromDate = dateInputValue(start);
    toDate = dateInputValue(end);
    customForm.querySelector("[data-dashboard-from]").value = fromDate;
    customForm.querySelector("[data-dashboard-to]").value = toDate;
  }

  periodSelect.addEventListener("change", () => {
    const custom = periodSelect.value === "custom";
    customForm.hidden = !custom;
    if (!custom) {
      presetRange(periodSelect.value);
      loadDashboard();
    }
  });
  customForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const start = customForm.querySelector("[data-dashboard-from]").value;
    const end = customForm.querySelector("[data-dashboard-to]").value;
    if (!start || !end || start > end) {
      showFeedback("Vui lòng chọn khoảng ngày hợp lệ.", true);
      return;
    }
    fromDate = start;
    toDate = end;
    loadDashboard();
  });
  content.addEventListener("click", (event) => {
    if (event.target.closest("[data-dashboard-retry]")) loadDashboard();
  });

  loadDashboard();
}
