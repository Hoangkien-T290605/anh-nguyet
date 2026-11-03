
import { Link } from "react-router-dom";

import logo from "../assets/logo-anh-nguyet.png";
import iconPhone from "../assets/icon-phone.png";

function Footer() {
  function preventPageScroll(event) {
    event.preventDefault();
  }

  return (
    <footer className="site-footer" id="footer">
      <div className="footer-brand">
        <Link
          className="footer-logo"
          to="/"
          aria-label="Về trang chủ"
        >
          <img src={logo} alt="Logo Ánh Nguyệt" />
        </Link>

        <p>Tinh hoa từ đất - Sáng bừng vị ngon</p>

        <small>
          © 2026 Ánh Nguyệt. Mọi quyền được bảo lưu.
        </small>
      </div>

      <div className="footer-column">
        <h3>Thông tin</h3>

        <Link to="/gioi-thieu">Giới thiệu</Link>
        <Link to="/san-pham">Sản phẩm</Link>
        <Link to="/tin-tuc">Tin tức</Link>
        <Link to="/lien-he">Liên hệ</Link>
      </div>

      <div className="footer-column">
        <h3>Hỗ trợ khách hàng</h3>

        <a href="#" onClick={preventPageScroll}>
          Chính sách vận chuyển
        </a>

        <a href="#" onClick={preventPageScroll}>
          Chính sách đổi trả
        </a>

        <a href="#" onClick={preventPageScroll}>
          Phương thức thanh toán
        </a>

        <a href="#" onClick={preventPageScroll}>
          Điều khoản sử dụng
        </a>
      </div>

      <div className="footer-column contact-column">
        <h3>Liên hệ</h3>

        <p className="contact-item">
          <img src={iconPhone} alt="" />
          <a href="tel:0387536592">0387536592</a>
        </p>

        <a
          className="contact-item"
          href="mailto:anhnguyet.moonlightrice@gmail.com"
        >
          <span className="contact-symbol">✉</span>
          <span>anhnguyet.moonlightrice@gmail.com</span>
        </a>

        <p className="contact-item">
          <span className="contact-symbol">⌖</span>
          <span>
            149D, Nguyễn Văn Trường, Ninh Kiều, Cần Thơ
          </span>
        </p>

        <div className="social-links" aria-label="Mạng xã hội">
          <a href="#" onClick={preventPageScroll} aria-label="Facebook">
            f
          </a>

          <a href="#" onClick={preventPageScroll} aria-label="Instagram">
            ◎
          </a>

          <a href="#" onClick={preventPageScroll} aria-label="TikTok">
            ♪
          </a>
        </div>
      </div>

      <div className="footer-column footer-newsletter">
        <h3>Đăng ký nhận tin</h3>

        <p>
          Nhận thông tin sản phẩm mới và ưu đãi đặc biệt.
        </p>

        <form
          className="newsletter-form"
          onSubmit={(event) => {
            event.preventDefault();

            window.alert(
              "Chức năng đăng ký nhận tin sẽ được hoàn thiện sau."
            );
          }}
        >
          <input
            type="email"
            placeholder="Nhập email của bạn"
            aria-label="Email nhận tin"
            required
          />

          <button type="submit" aria-label="Đăng ký">
            ➤
          </button>
        </form>
      </div>
    </footer>
  );
}

export default Footer;
