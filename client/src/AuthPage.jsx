// client/src/AuthPage.jsx

import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./AuthPage.css";
import logo from "./assets/logo-anh-nguyet.png";

const API_URL = "http://localhost:5000/api/auth";
const AUTH_STORAGE_KEY = "anh-nguyet-auth";

function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const isRegister = location.pathname === "/dang-ky";

  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    address: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));

    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (isRegister && formData.password !== formData.confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }

    if (formData.password.length < 6) {
      setError("Mật khẩu phải có ít nhất 6 ký tự.");
      return;
    }

    const endpoint = isRegister ? "/register" : "/login";

    const payload = isRegister
      ? {
          full_name: formData.full_name.trim(),
          email: formData.email.trim(),
          password: formData.password,
          phone: formData.phone.trim(),
          address: formData.address.trim(),
        }
      : {
          email: formData.email.trim(),
          password: formData.password,
        };

    try {
      setLoading(true);

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Không thể thực hiện yêu cầu.");
      }

      if (result.token && result.user) {
        localStorage.setItem(
          AUTH_STORAGE_KEY,
          JSON.stringify({
            token: result.token,
            user: result.user,
          })
        );

        navigate("/");
        window.location.reload();
        return;
      }

      if (isRegister) {
        navigate("/dang-nhap", {
          state: { message: "Đăng ký thành công. Vui lòng đăng nhập." },
        });
      }
    } catch (err) {
      setError(err.message || "Đã xảy ra lỗi. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link to="/" className="auth-logo-link">
          <img
            src={logo}
            alt="Ánh Nguyệt"
            className="auth-logo"
          />
        </Link>

        <div className="auth-heading">
          <p className="auth-eyebrow">CHÀO MỪNG BẠN ĐẾN VỚI</p>
          <h1>{isRegister ? "Tạo tài khoản" : "Đăng nhập"}</h1>
          <p className="auth-description">
            {isRegister
              ? "Tạo tài khoản để bắt đầu hành trình mua sắm cùng Ánh Nguyệt."
              : "Đăng nhập để tiếp tục mua sắm cùng Ánh Nguyệt."}
          </p>
        </div>

        {location.state?.message && (
          <div className="auth-success">
            {location.state.message}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          {isRegister && (
            <div className="auth-field">
              <label htmlFor="full_name">Họ và tên</label>
              <input
                id="full_name"
                name="full_name"
                type="text"
                placeholder="Nhập họ và tên"
                value={formData.full_name}
                onChange={handleChange}
                maxLength={100}
                autoComplete="name"
                required
              />
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="Nhập địa chỉ email"
              value={formData.email}
              onChange={handleChange}
              maxLength={150}
              autoComplete="email"
              required
            />
          </div>

          {isRegister && (
            <div className="auth-field">
              <label htmlFor="phone">Số điện thoại</label>
              <input
                id="phone"
                name="phone"
                type="tel"
                placeholder="Nhập số điện thoại (không bắt buộc)"
                value={formData.phone}
                onChange={handleChange}
                maxLength={20}
                autoComplete="tel"
              />
            </div>
          )}

          {isRegister && (
            <div className="auth-field">
              <label htmlFor="address">Địa chỉ</label>
              <input
                id="address"
                name="address"
                type="text"
                placeholder="Nhập địa chỉ (không bắt buộc)"
                value={formData.address}
                onChange={handleChange}
                autoComplete="street-address"
              />
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="password">Mật khẩu</label>
            <div className="auth-password-wrap">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Nhập mật khẩu"
                value={formData.password}
                onChange={handleChange}
                autoComplete={isRegister ? "new-password" : "current-password"}
                required
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword((previous) => !previous)}
              >
                {showPassword ? "Ẩn" : "Hiện"}
              </button>
            </div>
          </div>

          {isRegister && (
            <div className="auth-field">
              <label htmlFor="confirmPassword">Xác nhận mật khẩu</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showPassword ? "text" : "password"}
                placeholder="Nhập lại mật khẩu"
                value={formData.confirmPassword}
                onChange={handleChange}
                autoComplete="new-password"
                required
              />
            </div>
          )}

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="auth-submit"
            disabled={loading}
          >
            {loading
              ? "Đang xử lý..."
              : isRegister
                ? "Đăng ký"
                : "Đăng nhập"}
          </button>
        </form>

        <div className="auth-switch">
          {isRegister ? (
            <>
              Bạn đã có tài khoản?
              <Link to="/dang-nhap">Đăng nhập</Link>
            </>
          ) : (
            <>
              Bạn chưa có tài khoản?
              <Link to="/dang-ky">Đăng ký ngay</Link>
            </>
          )}
        </div>

        <Link to="/" className="auth-back-home">
          ← Quay về trang chủ
        </Link>
      </section>
    </main>
  );
}

export default AuthPage;