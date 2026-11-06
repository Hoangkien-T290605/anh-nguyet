
import React, { useState } from "react";
import "./AccountPage-password-styles.css";

const API_URL = "http://localhost:5000/api/auth";
const AUTH_STORAGE_KEY = "anh-nguyet-auth";

function getSavedToken() {
  try {
    const saved = localStorage.getItem(AUTH_STORAGE_KEY);

    if (!saved) return "";

    try {
      const parsed = JSON.parse(saved);

      if (typeof parsed === "string") return parsed;

      return (
        parsed?.token ||
        parsed?.accessToken ||
        parsed?.access_token ||
        ""
      );
    } catch {
      return saved;
    }
  } catch {
    return "";
  }
}

export default function PasswordChangeForm({
  token: suppliedToken,
  apiBaseUrl = API_URL,
}) {
  const [token] = useState(
    () => suppliedToken || getSavedToken()
  );

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showOtp, setShowOtp] = useState(false);

  const [otpStep, setOtpStep] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  function showMessage(text, type = "error") {
    setMessage(text);
    setMessageType(type);
  }

  async function readResponse(response) {
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success) {
      throw new Error(
        result.message || "Đã xảy ra lỗi. Vui lòng thử lại."
      );
    }

    return result;
  }

  async function handleRequestOtp(event) {
    event.preventDefault();
    setMessage("");

    if (!token) {
      showMessage("Bạn cần đăng nhập lại để đổi mật khẩu.");
      return;
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      showMessage("Vui lòng nhập đầy đủ thông tin.");
      return;
    }

    if (newPassword.length < 8) {
      showMessage("Mật khẩu mới phải có ít nhất 8 ký tự.");
      return;
    }

    if (newPassword !== confirmPassword) {
      showMessage("Mật khẩu xác nhận không khớp.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${apiBaseUrl}/change-password/request-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            current_password: currentPassword,
            new_password: newPassword,
            confirm_password: confirmPassword,
          }),
        }
      );

      const result = await readResponse(response);

      setOtpStep(true);
      setOtp("");
      showMessage(result.message, "success");
    } catch (error) {
      showMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(event) {
    event.preventDefault();
    setMessage("");

    if (!/^\d{6}$/.test(otp)) {
      showMessage("Vui lòng nhập OTP gồm 6 chữ số.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${apiBaseUrl}/change-password/verify-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ otp }),
        }
      );

      const result = await readResponse(response);

      showMessage(result.message, "success");

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setOtp("");
      setOtpStep(false);
    } catch (error) {
      showMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    setOtpStep(false);
    setOtp("");
    setMessage("");
  }

  return (
    <section className="password-change">
      <div className="password-change__header">
        <div>
          <span className="password-change__eyebrow">
            BẢO MẬT TÀI KHOẢN
          </span>

          <h2>Đổi mật khẩu</h2>

          <p>
            Bảo vệ tài khoản Ánh Nguyệt bằng mật khẩu mới của bạn.
          </p>
        </div>

        <div className="password-change__icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          >
            <rect x="4" y="10" width="16" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            <circle cx="12" cy="15" r="1" />
            <path d="M12 16v2" />
          </svg>
        </div>
      </div>

      <div className="password-change__progress">
        <div
          className={`password-change__progress-step ${
            !otpStep ? "active" : "completed"
          }`}
        >
          <span>1</span>
          <p>Thông tin mật khẩu</p>
        </div>

        <div
          className={`password-change__progress-line ${
            otpStep ? "active" : ""
          }`}
        />

        <div
          className={`password-change__progress-step ${
            otpStep ? "active" : ""
          }`}
        >
          <span>2</span>
          <p>Xác nhận OTP</p>
        </div>
      </div>

      {message && (
        <div
          className={`password-change__message ${
            messageType === "success"
              ? "password-change__message--success"
              : "password-change__message--error"
          }`}
          role="alert"
        >
          {message}
        </div>
      )}

      {!otpStep ? (
        <form
          className="password-change__form"
          onSubmit={handleRequestOtp}
        >
          <div className="password-change__field">
            <label htmlFor="current-password">
              Mật khẩu hiện tại
            </label>

            <div className="password-change__input-wrap">
              <input
                id="current-password"
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) =>
                  setCurrentPassword(e.target.value)
                }
                placeholder="Nhập mật khẩu hiện tại"
                autoComplete="current-password"
                required
              />

              <button
                type="button"
                className="password-change__toggle"
                onClick={() => setShowCurrent(!showCurrent)}
                aria-label={
                  showCurrent ? "Ẩn mật khẩu" : "Hiện mật khẩu"
                }
              >
                {showCurrent ? "Ẩn" : "Hiện"}
              </button>
            </div>
          </div>

          <div className="password-change__field">
            <label htmlFor="new-password">
              Mật khẩu mới
            </label>

            <div className="password-change__input-wrap">
              <input
                id="new-password"
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nhập mật khẩu mới"
                autoComplete="new-password"
                minLength={8}
                required
              />

              <button
                type="button"
                className="password-change__toggle"
                onClick={() => setShowNew(!showNew)}
                aria-label={
                  showNew ? "Ẩn mật khẩu" : "Hiện mật khẩu"
                }
              >
                {showNew ? "Ẩn" : "Hiện"}
              </button>
            </div>

            <small>
              Mật khẩu cần có ít nhất 8 ký tự.
            </small>
          </div>

          <div className="password-change__field">
            <label htmlFor="confirm-password">
              Xác nhận mật khẩu mới
            </label>

            <div className="password-change__input-wrap">
              <input
                id="confirm-password"
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) =>
                  setConfirmPassword(e.target.value)
                }
                placeholder="Nhập lại mật khẩu mới"
                autoComplete="new-password"
                minLength={8}
                required
              />

              <button
                type="button"
                className="password-change__toggle"
                onClick={() => setShowConfirm(!showConfirm)}
                aria-label={
                  showConfirm ? "Ẩn mật khẩu" : "Hiện mật khẩu"
                }
              >
                {showConfirm ? "Ẩn" : "Hiện"}
              </button>
            </div>
          </div>

          <div className="password-change__hint">
            <span aria-hidden="true">ⓘ</span>
            Sau khi kiểm tra mật khẩu, hệ thống sẽ gửi mã OTP
            đến email đã đăng ký trong tài khoản của bạn.
          </div>

          <button
            type="submit"
            className="password-change__submit"
            disabled={loading}
          >
            {loading ? "Đang xử lý..." : "Gửi mã OTP"}
          </button>
        </form>
      ) : (
        <form
          className="password-change__form"
          onSubmit={handleVerifyOtp}
        >
          <div className="password-change__otp-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
          </div>

          <h3 className="password-change__otp-title">
            Xác nhận email
          </h3>

          <p className="password-change__otp-description">
            Nhập mã OTP gồm 6 chữ số được gửi đến email đã đăng ký
            của bạn. Mã có hiệu lực trong 5 phút.
          </p>

          <div className="password-change__field">
            <label htmlFor="password-otp">
              Mã xác nhận OTP
            </label>

            <div className="password-change__input-wrap">
              <input
                id="password-otp"
                type={showOtp ? "text" : "password"}
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="Nhập mã 6 chữ số"
                autoComplete="one-time-code"
                required
              />

              <button
                type="button"
                className="password-change__toggle"
                onClick={() => setShowOtp(!showOtp)}
              >
                {showOtp ? "Ẩn" : "Hiện"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="password-change__submit"
            disabled={loading}
          >
            {loading ? "Đang xác minh..." : "Xác nhận và đổi mật khẩu"}
          </button>

          <button
            type="button"
            className="password-change__back"
            onClick={handleBack}
            disabled={loading}
          >
            Quay lại
          </button>
        </form>
      )}
    </section>
  );
}
