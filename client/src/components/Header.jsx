
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";

import logo from "../assets/logo-anh-nguyet.png";
import accountIcon from "../assets/icon-tai-khoan.png";
import "./Header.css";

const AUTH_STORAGE_KEY = "anh-nguyet-auth";
const SERVER_URL = "http://localhost:5000";

function getSavedUser() {
  try {
    const savedAuth = localStorage.getItem(AUTH_STORAGE_KEY);

    if (!savedAuth) return null;

    const auth = JSON.parse(savedAuth);

    if (!auth.token || !auth.user) return null;

    return auth.user;
  } catch {
    return null;
  }
}

function getAvatarUrl(avatarUrl) {
  if (!avatarUrl) return "";

  if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://")) {
    return avatarUrl;
  }

  return `${SERVER_URL}${avatarUrl.startsWith("/") ? "" : "/"}${avatarUrl}`;
}

function Header({
  cartCount = 0,
  search = "",
  onSearchChange = () => {},
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [user, setUser] = useState(getSavedUser);

  const accountRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleStorageChange() {
      setUser(getSavedUser());
    }

    function handleAuthUpdate(event) {
      setUser(event.detail?.user || getSavedUser());
    }

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("anh-nguyet-auth-updated", handleAuthUpdate);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("anh-nguyet-auth-updated", handleAuthUpdate);
    };
  }, []);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (
        accountRef.current &&
        !accountRef.current.contains(event.target)
      ) {
        setAccountOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setAccountOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  function closeMenu() {
    setMenuOpen(false);
    setAccountOpen(false);
  }

  function getNavClass({ isActive }) {
    return `nav-link ${isActive ? "active" : ""}`;
  }

  function handleLogout() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setUser(null);
    closeMenu();
    navigate("/");
  }

  function getInitials(name) {
    if (!name) return "K";

    const words = name.trim().split(/\s+/);

    if (words.length === 1) {
      return words[0].charAt(0).toUpperCase();
    }

    return (
      words[words.length - 1].charAt(0) +
      words[0].charAt(0)
    ).toUpperCase();
  }

  const avatarUrl = getAvatarUrl(user?.avatar_url);

  return (
    <header className="site-header">
      <Link
        className="brand"
        to="/"
        aria-label="Ánh Nguyệt - Trang chủ"
        onClick={closeMenu}
      >
        <img src={logo} alt="Logo Ánh Nguyệt" />
      </Link>

      <button
        className="menu-toggle"
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-label="Mở hoặc đóng menu"
        aria-expanded={menuOpen}
      >
        ☰
      </button>

      <nav className={`main-nav ${menuOpen ? "is-open" : ""}`}>
        <NavLink to="/" end className={getNavClass} onClick={closeMenu}>
          Trang chủ
        </NavLink>

        <NavLink to="/san-pham" className={getNavClass} onClick={closeMenu}>
          Sản phẩm
        </NavLink>

        <NavLink to="/gioi-thieu" className={getNavClass} onClick={closeMenu}>
          Giới thiệu
        </NavLink>

        <NavLink to="/lien-he" className={getNavClass} onClick={closeMenu}>
          Liên hệ
        </NavLink>
      </nav>

      <label className="search-box">
        <span aria-hidden="true">⌕</span>

        <input
          type="search"
          placeholder="Tìm kiếm sản phẩm..."
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          aria-label="Tìm kiếm sản phẩm"
        />
      </label>

      {user ? (
        <div className="account-dropdown" ref={accountRef}>
          <button
            type="button"
            className="account-trigger"
            onClick={() => setAccountOpen((open) => !open)}
            aria-expanded={accountOpen}
            aria-haspopup="true"
          >
            <span className="account-avatar">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Ảnh đại diện"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    borderRadius: "50%",
                    display: "block",
                  }}
                />
              ) : (
                getInitials(user.full_name)
              )}
            </span>

            <span className="account-trigger-name">
              {user.full_name}
            </span>

            <span className={`account-chevron ${accountOpen ? "is-open" : ""}`}>
              ▾
            </span>
          </button>

          {accountOpen && (
            <div className="account-menu">
              <div className="account-menu-heading">
                <span className="account-menu-name">
                  {user.full_name}
                </span>
                <span className="account-menu-email">
                  {user.email}
                </span>
              </div>

              <Link
                to="/tai-khoan"
                className="account-menu-item"
                onClick={closeMenu}
              >
                <span className="account-menu-icon">
                  <img src={accountIcon} alt="" />
                </span>
                Tài khoản của tôi
              </Link>

              <Link
                to="/don-mua"
                className="account-menu-item"
                onClick={closeMenu}
              >
                <span>▤</span>
                Đơn mua
              </Link>

              <div className="account-menu-divider" />

              <button
                type="button"
                className="account-menu-item account-menu-logout"
                onClick={handleLogout}
              >
                <span>↪</span>
                Đăng xuất
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="account-guest">
          <Link to="/dang-nhap" onClick={closeMenu}>
            Đăng nhập
          </Link>

          <span className="account-separator">|</span>

          <Link to="/dang-ky" onClick={closeMenu}>
            Đăng ký
          </Link>
        </div>
      )}

      <Link
        className="header-action cart-link"
        to="/gio-hang"
        onClick={closeMenu}
      >
        <span className="cart-icon" aria-hidden="true">
          🛒
        </span>

        <span className="cart-label">Giỏ hàng</span>

        <b>{cartCount}</b>
      </Link>
    </header>
  );
}

export default Header;
