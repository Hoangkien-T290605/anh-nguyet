import { getCartCount } from "../services/cart.js";
import { getAvatarUrl } from "../services/api.js";

const logoUrl = "./assets/logo-anh-nguyet.png";
const accountIconUrl = "./assets/icon-tai-khoan.png";

const AUTH_KEY = "anh-nguyet-auth";
const THEME_KEY = "anh-nguyet-theme";

function applyTheme(theme) {
  const normalized = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = normalized;
  localStorage.setItem(THEME_KEY, normalized);
  const button = document.querySelector("[data-theme-toggle]");
  if (!button) return;
  button.setAttribute("aria-pressed", String(normalized === "dark"));
  button.setAttribute("aria-label", normalized === "dark" ? "Chuyển giao diện sáng" : "Chuyển giao diện tối");
  button.textContent = normalized === "dark" ? "☀" : "☾";
}

function getSavedUser() {
  try {
    const auth = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    return auth?.token && auth?.user ? auth.user : null;
  } catch {
    return null;
  }
}

function safeText(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function renderAccount() {
  const mount = document.querySelector("[data-header-account]");
  if (!mount) return;
  const user = getSavedUser();

  if (!user) {
    mount.innerHTML = '<div class="account-guest"><a href="login.html">Đăng nhập</a><span class="account-separator">|</span><a href="register.html">Đăng ký</a></div>';
    return;
  }

  const name = safeText(user.full_name || "Tài khoản");
  const initials = name.trim().split(/\s+/).slice(-2).map((part) => part[0]).join("").toUpperCase();
  const avatar = getAvatarUrl(user.avatar_url);

  mount.innerHTML = `
    <div class="account-dropdown">
      <button class="account-trigger" type="button" data-account-toggle aria-expanded="false">
        <span class="account-avatar">${avatar ? `<img src="${safeText(avatar)}" alt="Ảnh đại diện" />` : initials}</span>
        <span class="account-trigger-name">${name}</span><span class="account-chevron">▾</span>
      </button>
      <div class="account-menu" data-account-menu hidden>
        <div class="account-menu-heading"><span class="account-menu-name">${name}</span><span class="account-menu-email">${safeText(user.email || "")}</span></div>
        <a class="account-menu-item" href="account.html"><span class="account-menu-icon"><img src="${accountIconUrl}" alt="" /></span>Tài khoản của tôi</a>
        <a class="account-menu-item" href="/don-mua"><span>▤</span>Đơn mua</a>
        <div class="account-menu-divider"></div>
        <button class="account-menu-item account-menu-logout" type="button" data-logout><span>↪</span>Đăng xuất</button>
      </div>
    </div>`;
}

export function mountHeader() {
  const mount = document.getElementById("site-header");
  if (!mount) return;

  mount.innerHTML = `
    <header class="site-header">
      <a class="brand" href="index.html" aria-label="Ánh Nguyệt - Trang chủ"><img src="${logoUrl}" alt="Logo Ánh Nguyệt" /></a>
      <button class="menu-toggle" type="button" data-menu-toggle aria-label="Mở hoặc đóng menu" aria-expanded="false">☰</button>
      <nav class="main-nav" data-main-nav aria-label="Điều hướng chính">
        <a class="nav-link ${document.body.dataset.page === "home" ? "active" : ""}" href="index.html">Trang chủ</a>
        <a class="nav-link ${["products", "product"].includes(document.body.dataset.page) ? "active" : ""}" href="products.html">Sản phẩm</a>
        <a class="nav-link" href="/gioi-thieu">Giới thiệu</a>
        <a class="nav-link" href="/lien-he">Liên hệ</a>
        <button class="theme-toggle" type="button" data-theme-toggle aria-pressed="false" aria-label="Chuyển giao diện tối">☾</button>
      </nav>
      <label class="search-box"><span aria-hidden="true">⌕</span><input type="search" data-search placeholder="Tìm kiếm sản phẩm..." aria-label="Tìm kiếm sản phẩm" /></label>
      <div data-header-account></div>
      <a class="header-action cart-link" href="cart.html"><span class="cart-icon" aria-hidden="true">🛒</span><span class="cart-label">Giỏ hàng</span><b data-cart-count>${getCartCount()}</b></a>
    </header>`;

  renderAccount();
  applyTheme(localStorage.getItem(THEME_KEY) || "light");

  mount.addEventListener("click", (event) => {
    const menuButton = event.target.closest("[data-menu-toggle]");
    if (menuButton) {
      const nav = mount.querySelector("[data-main-nav]");
      const open = nav.classList.toggle("is-open");
      menuButton.setAttribute("aria-expanded", String(open));
    }

    if (event.target.closest("[data-theme-toggle]")) {
      applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    }

    const accountButton = event.target.closest("[data-account-toggle]");
    if (accountButton) {
      const menu = mount.querySelector("[data-account-menu]");
      const open = menu.hidden;
      menu.hidden = !open;
      accountButton.setAttribute("aria-expanded", String(open));
    }

    if (event.target.closest("[data-logout]")) {
      localStorage.removeItem(AUTH_KEY);
      window.dispatchEvent(new CustomEvent("anh-nguyet-auth-updated", { detail: { user: null } }));
      renderAccount();
      window.location.assign("index.html");
    }
  });

  document.addEventListener("click", (event) => {
    const menu = mount.querySelector("[data-account-menu]");
    if (menu && !event.target.closest(".account-dropdown")) menu.hidden = true;
  });

  window.addEventListener("anh-nguyet-cart-updated", (event) => {
    const count = mount.querySelector("[data-cart-count]");
    if (count) count.textContent = String(event.detail?.count ?? getCartCount());
  });

  window.addEventListener("anh-nguyet-auth-updated", renderAccount);
  window.addEventListener("storage", renderAccount);

}
