import { escapeHTML } from "../components/product-card.js";
import { getAvatarUrl } from "../services/api.js";

const AUTH_KEY = "anh-nguyet-auth";
const THEME_KEY = "anh-nguyet-theme";

const navigationItems = [
  { id: "dashboard", label: "Tổng quan", icon: "⌂", href: "admin-dashboard.html" },
  { id: "products", label: "Quản lý sản phẩm", icon: "▧", href: "admin-products.html" },
  { id: "categories", label: "Quản lý danh mục", icon: "▦", href: "admin-categories.html" },
  { id: "orders", label: "Quản lý đơn hàng", icon: "▤", href: "admin-orders.html" },
  { id: "customers", label: "Quản lý khách hàng", icon: "♙", href: "admin-customers.html" },
  { id: "reviews", label: "Quản lý đánh giá", icon: "★", href: "admin-reviews.html" },
  { id: "inventory", label: "Quản lý tồn kho", icon: "▣", href: "admin-inventory.html" },
  { id: "shipping", label: "Cấu hình vận chuyển", icon: "⇢", href: "admin-shipping.html" },
  { id: "vouchers", label: "Quản lý Voucher", icon: "%", href: "admin-vouchers.html" },
  { id: "admin-users", label: "Quản lý tài khoản Admin", icon: "♧", href: "admin-admins.html" },
  { id: "employees", label: "Quản lý nhân viên", icon: "♟", href: "admin-employees.html" },
];

const employeeNavigationItems = [
  { id: "employee-dashboard", label: "Tổng quan", icon: "⌂", href: "employee-dashboard.html" },
  { id: "employee-orders", label: "Đơn hàng", icon: "▤", href: "employee-orders.html" },
  { id: "employee-inventory", label: "Tồn kho", icon: "▣", href: "employee-inventory.html" },
  { id: "employee-customers", label: "Tra cứu khách hàng", icon: "♙", href: "employee-customers.html" },
  { id: "employee-reviews", label: "Kiểm duyệt đánh giá", icon: "★", href: "employee-reviews.html" },
  { id: "employee-vouchers", label: "Tra cứu Voucher", icon: "%", href: "employee-vouchers.html" },
  { id: "employee-account", label: "Tài khoản của tôi", icon: "♧", href: "employee-account.html" },
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

export function mountAdminShell(user, activePage, portal = "admin") {
  applyAdminTheme();
  const sidebar = document.getElementById("admin-sidebar");
  const topbar = document.getElementById("admin-topbar");
  const root = document.getElementById("admin-app");
  if (!sidebar || !topbar || !root) return;

  const isEmployeePortal = portal === "employee";
  const fullName = user.full_name || (isEmployeePortal ? "Nhân viên" : "Quản trị viên");
  const items = isEmployeePortal ? employeeNavigationItems : navigationItems;
  const avatarUrl = getAvatarUrl(user.avatar_url);
  const defaultAvatarUrl = "./assets/icon-account.png";
  const avatarMarkup = `<span class="admin-user-avatar"><img class="admin-user-avatar-image" src="${escapeHTML(avatarUrl || defaultAvatarUrl)}" alt="Ảnh đại diện ${escapeHTML(fullName)}" data-admin-avatar-image data-using-default="${avatarUrl ? "false" : "true"}" /><span class="admin-user-initials" aria-hidden="true" hidden>${escapeHTML(getInitials(fullName))}</span></span>`;

  sidebar.innerHTML = `
    <a class="admin-brand" href="${isEmployeePortal ? "employee-dashboard.html" : "admin-dashboard.html"}">
      <img src="./assets/logo-anh-nguyet.png" alt="Logo Ánh Nguyệt" />
      <span>Ánh Nguyệt<small>${isEmployeePortal ? "EMPLOYEE PORTAL" : "ADMINISTRATION"}</small></span>
    </a>
    <nav class="admin-nav" aria-label="Điều hướng quản trị">
      ${items
        .map((item) => `<a class="admin-nav-link" href="${item.href}" ${activePage === item.id ? 'aria-current="page"' : ""}><span class="admin-nav-icon" aria-hidden="true">${item.icon}</span><span>${item.label}</span></a>`)
        .join("")}
    </nav>
    <div class="admin-sidebar-bottom">
      <div class="admin-sidebar-account" aria-label="Tài khoản ${escapeHTML(fullName)}">
        ${avatarMarkup}
        <span class="admin-sidebar-account-info"><strong>${escapeHTML(fullName)}</strong><span>${isEmployeePortal ? "Nhân viên" : "Quản trị viên"} · ${escapeHTML(user.email || "")}</span></span>
      </div>
      <button class="admin-signout" type="button" data-admin-logout><span class="admin-nav-icon" aria-hidden="true">↪</span>Đăng xuất</button>
      <a class="admin-store-link" href="index.html">← Mở cửa hàng</a>
    </div>`;

  const pageTitles = {
    dashboard: "Tổng quan",
    products: "Quản lý sản phẩm",
    categories: "Quản lý danh mục",
    orders: "Quản lý đơn hàng",
    customers: "Quản lý khách hàng",
    reviews: "Quản lý đánh giá",
    inventory: "Quản lý tồn kho",
    shipping: "Cấu hình vận chuyển",
    vouchers: "Quản lý Voucher",
    "admin-users": "Tài khoản quản trị",
    employees: "Quản lý nhân viên",
    "employee-dashboard": "Tổng quan nhân viên",
    "employee-orders": "Đơn hàng",
    "employee-inventory": "Tồn kho",
    "employee-customers": "Tra cứu khách hàng",
    "employee-reviews": "Kiểm duyệt đánh giá",
    "employee-vouchers": "Tra cứu Voucher",
    "employee-account": "Tài khoản của tôi",
  };
  const pageTitle = pageTitles[activePage] || "Khu vực quản trị";
  topbar.innerHTML = `
    <button class="admin-menu-toggle" type="button" data-admin-menu-toggle aria-label="Mở menu quản trị" aria-expanded="false">☰</button>
    <div class="admin-topbar-title"><strong>${pageTitle}</strong><span>Quản lý cửa hàng Ánh Nguyệt</span></div>
    <div class="admin-topbar-actions">
      <button class="admin-theme-toggle" type="button" data-admin-theme-toggle aria-label="Chuyển giao diện sáng/tối">${document.documentElement.dataset.theme === "dark" ? "☀" : "☾"}<span>${document.documentElement.dataset.theme === "dark" ? "Giao diện sáng" : "Giao diện tối"}</span></button>
      <a class="admin-open-store" href="index.html">Mở cửa hàng</a>
    </div>`;

  sidebar.querySelectorAll("[data-admin-avatar-image]").forEach((avatarImage) => avatarImage.addEventListener("error", () => {
    if (avatarImage.dataset.usingDefault !== "true") {
      avatarImage.dataset.usingDefault = "true";
      avatarImage.src = defaultAvatarUrl;
      return;
    }
    avatarImage.hidden = true;
    avatarImage.parentElement.querySelector(".admin-user-initials")?.removeAttribute("hidden");
  }));

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-admin-theme-toggle]")) {
      const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = nextTheme;
      try {
        localStorage.setItem(THEME_KEY, nextTheme);
      } catch {
        // Chủ đề vẫn đổi trong trang hiện tại nếu bộ nhớ trình duyệt bị chặn.
      }
      const button = topbar.querySelector("[data-admin-theme-toggle]");
      if (button) {
        button.innerHTML = `${nextTheme === "dark" ? "☀" : "☾"}<span>Giao diện ${nextTheme === "dark" ? "sáng" : "tối"}</span>`;
        button.setAttribute("aria-label", `Chuyển sang giao diện ${nextTheme === "dark" ? "sáng" : "tối"}`);
      }
      return;
    }
    if (event.target.closest("[data-admin-logout]")) {
      localStorage.removeItem(AUTH_KEY);
      window.dispatchEvent(
        new CustomEvent("anh-nguyet-xac-thuc-cap-nhat", {
          detail: { user: null },
        }),
      );
      window.location.assign(isEmployeePortal ? "employee-login.html" : "admin-login.html");
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
