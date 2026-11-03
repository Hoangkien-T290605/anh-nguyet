
import { useState } from "react";
import { Link, NavLink } from "react-router-dom";

import logo from "../assets/logo-anh-nguyet.png";
import "./Header.css";

function Header({
  cartCount = 0,
  search = "",
  onSearchChange = () => {},
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  function closeMenu() {
    setMenuOpen(false);
  }

  function getNavClass({ isActive }) {
    return `nav-link ${isActive ? "active" : ""}`;
  }

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
        <NavLink
          to="/"
          end
          className={getNavClass}
          onClick={closeMenu}
        >
          Trang chủ
        </NavLink>

        <NavLink
          to="/san-pham"
          className={getNavClass}
          onClick={closeMenu}
        >
          Sản phẩm
        </NavLink>

        <NavLink
          to="/gioi-thieu"
          className={getNavClass}
          onClick={closeMenu}
        >
          Giới thiệu
        </NavLink>

        <NavLink
          to="/lien-he"
          className={getNavClass}
          onClick={closeMenu}
        >
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

      <div className="account-guest">
        <Link to="/dang-nhap" onClick={closeMenu}>
          Đăng nhập
        </Link>

        <span className="account-separator">|</span>

        <Link to="/dang-ky" onClick={closeMenu}>
          Đăng ký
        </Link>
      </div>

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
