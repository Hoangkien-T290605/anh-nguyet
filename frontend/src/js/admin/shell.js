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

  const fullName = user.full_name || "Quản trị viên";
  const avatarUrl = getAvatarUrl(user.avatar_url);
  const defaultAvatarUrl = "./assets/icon-account.png";
  const avatarMarkup = `<span class="admin-user-avatar"><img class="admin-user-avatar-image" src="${escapeHTML(avatarUrl || defaultAvatarUrl)}" alt="Ảnh đại diện ${escapeHTML(fullName)}" data-admin-avatar-image data-using-default="${avatarUrl ? "false" : "true"}" /><span class="admin-user-initials" aria-hidden="true" hidden>${escapeHTML(getInitials(fullName))}</span></span>`;

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
      <div class="admin-sidebar-account" aria-label="Tài khoản ${escapeHTML(fullName)}">
        ${avatarMarkup}
        <span class="admin-sidebar-account-info"><strong>${escapeHTML(fullName)}</strong><span>${escapeHTML(user.email || "")}</span></span>
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
