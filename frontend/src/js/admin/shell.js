import { escapeHTML } from "../components/product-card.js";

const AUTH_KEY = "anh-nguyet-auth";
const THEME_KEY = "anh-nguyet-theme";

const navigationItems = [
  { id: "dashboard", label: "Tổng quan", icon: "⌂", href: "admin-dashboard.html" },
  { id: "products", label: "Quản lý sản phẩm", icon: "▧", href: "admin-products.html" },
  { id: "categories", label: "Quản lý danh mục", icon: "▦", disabled: true },
  { id: "orders", label: "Quản lý đơn hàng", icon: "▤", href: "admin-orders.html" },
  { id: "customers", label: "Quản lý khách hàng", icon: "♙", disabled: true },
  { id: "reviews", label: "Quản lý đánh giá", icon: "★", href: "admin-reviews.html" },
  { id: "admin-users", label: "Tài khoản quản trị", icon: "♧", disabled: true },
];

function getInitials(name) {
  return String(name || "Admin")
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

export function applyAdminTheme() {
  try {
    document.documentElement.dataset.theme =
      localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    document.documentElement.dataset.theme = "light";
  }
}

export function mountAdminShell(user, activePage) {
  applyAdminTheme();
  const sidebar = document.getElementById("admin-sidebar");
  const topbar = document.getElementById("admin-topbar");
  const root = document.getElementById("admin-app");
  if (!sidebar || !topbar || !root) return;

  sidebar.innerHTML = `
    <a class="admin-brand" href="admin-dashboard.html">
      <img src="./assets/logo-anh-nguyet.png" alt="Logo Ánh Nguyệt" />
      <span>Ánh Nguyệt<small>ADMINISTRATION</small></span>
    </a>
    <nav class="admin-nav" aria-label="Điều hướng quản trị">
      ${navigationItems
        .map((item) =>
          item.disabled
            ? `<span class="admin-nav-disabled" aria-disabled="true"><span class="admin-nav-icon" aria-hidden="true">${item.icon}</span><span>${item.label}</span><small>Chưa triển khai</small></span>`
            : `<a class="admin-nav-link" href="${item.href}" ${activePage === item.id ? 'aria-current="page"' : ""}><span class="admin-nav-icon" aria-hidden="true">${item.icon}</span><span>${item.label}</span></a>`,
        )
        .join("")}
    </nav>
    <div class="admin-sidebar-bottom">
      <button class="admin-signout" type="button" data-admin-logout><span class="admin-nav-icon" aria-hidden="true">↪</span>Đăng xuất</button>
      <a class="admin-store-link" href="index.html">← Mở cửa hàng</a>
    </div>`;

  const fullName = user.full_name || "Quản trị viên";
  topbar.innerHTML = `
    <button class="admin-menu-toggle" type="button" data-admin-menu-toggle aria-label="Mở menu quản trị" aria-expanded="false">☰</button>
    <div class="admin-topbar-title"><strong>Khu vực quản trị</strong><span>Quản lý cửa hàng Ánh Nguyệt</span></div>
    <div class="admin-user-badge"><span class="admin-user-initials" aria-hidden="true">${escapeHTML(getInitials(fullName))}</span><span class="admin-user-info"><strong>${escapeHTML(fullName)}</strong><span>${escapeHTML(user.email || "")}</span></span></div>`;

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-admin-logout]")) {
      localStorage.removeItem(AUTH_KEY);
      window.dispatchEvent(
        new CustomEvent("anh-nguyet-xac-thuc-cap-nhat", {
          detail: { user: null },
        }),
      );
      window.location.assign("admin-login.html");
      return;
    }
    const toggle = event.target.closest("[data-admin-menu-toggle]");
    if (toggle) {
      const isOpen = root.classList.toggle("admin-menu-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    } else if (
      root.classList.contains("admin-menu-open") &&
      !event.target.closest("#admin-sidebar")
    ) {
      root.classList.remove("admin-menu-open");
      topbar
        .querySelector("[data-admin-menu-toggle]")
        ?.setAttribute("aria-expanded", "false");
    }
  });
}
