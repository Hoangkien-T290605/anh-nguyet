// Trang đăng nhập và đăng ký gửi dữ liệu đến các API xác thực hiện có.
import { apiRequest } from "../services/api.js";

const LOGO_PATH = "./assets/logo-anh-nguyet.png";
const AUTH_STORAGE_KEY = "anh-nguyet-auth";

// Hiển thị hoặc ẩn thông báo lỗi của biểu mẫu.
function showError(element, content) {
  element.textContent = content;
  element.hidden = !content;
}

// Gắn luồng gửi biểu mẫu theo chế độ đăng nhập hoặc đăng ký.
export function mountAuth(mode) {
  const laDangKy = mode === "register";
  const bieuMau = document.getElementById("auth-form");
  const thongBaoLoi = document.getElementById("auth-error");
  const thongBaoThanhCong = document.getElementById("auth-success");
  const nutGui = document.getElementById("auth-send");
  const anhLogo = document.querySelector("[data-auth-logo]");
  const oMatKhau = bieuMau.elements.password;
  const oXacNhanMatKhau = laDangKy
    ? bieuMau.elements["confirm-password"]
    : null;

  anhLogo.src = LOGO_PATH;

  if (
    !laDangKy &&
    new URLSearchParams(window.location.search).get("registered") === "1"
  ) {
    thongBaoThanhCong.textContent = "Đăng ký thành công. Vui lòng đăng nhập.";
    thongBaoThanhCong.hidden = false;
  }
  if (
    !laDangKy &&
    new URLSearchParams(window.location.search).get("session") === "expired"
  ) {
    showError(
      thongBaoLoi,
      "Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.",
    );
  }

  bieuMau.addEventListener("input", () => showError(thongBaoLoi, ""));

  document
    .querySelector("[data-password-toggle]")
    .addEventListener("click", (suKien) => {
      const nutAnHien = suKien.currentTarget;
      const dangHienMatKhau = oMatKhau.type === "password";
      oMatKhau.type = dangHienMatKhau ? "text" : "password";
      if (oXacNhanMatKhau) {
        oXacNhanMatKhau.type = dangHienMatKhau ? "text" : "password";
      }
      nutAnHien.textContent = dangHienMatKhau ? "Ẩn" : "Hiện";
      nutAnHien.setAttribute(
        "aria-label",
        dangHienMatKhau ? "Ẩn mật khẩu" : "Hiện mật khẩu",
      );
      nutAnHien.setAttribute("aria-pressed", String(dangHienMatKhau));
    });

  // Kiểm tra dữ liệu ở trình duyệt trước khi gửi đến API phù hợp.
  bieuMau.addEventListener("submit", async (suKien) => {
    suKien.preventDefault();
    showError(thongBaoLoi, "");

    const duLieuBieuMau = Object.fromEntries(
      new FormData(bieuMau).entries(),
    );
    const hoTen = String(duLieuBieuMau.full_name || "").trim();
    const email = String(duLieuBieuMau.email || "").trim();

    if (!email || !bieuMau.elements.email.validity.valid) {
      showError(thongBaoLoi, "Vui lòng nhập địa chỉ email hợp lệ.");
      bieuMau.elements.email.focus();
      return;
    }
    if (laDangKy && (!hoTen || hoTen.length > 100)) {
      showError(thongBaoLoi, "Vui lòng nhập họ tên không quá 100 ký tự.");
      bieuMau.elements.full_name.focus();
      return;
    }
    if (laDangKy && String(duLieuBieuMau.phone || "").length > 20) {
      showError(thongBaoLoi, "Số điện thoại không được vượt quá 20 ký tự.");
      bieuMau.elements.phone.focus();
      return;
    }
    if (oMatKhau.value.length < 6) {
      showError(thongBaoLoi, "Mật khẩu phải có ít nhất 6 ký tự.");
      oMatKhau.focus();
      return;
    }
    if (oMatKhau.value.length > 72) {
      showError(thongBaoLoi, "Mật khẩu không được vượt quá 72 ký tự.");
      oMatKhau.focus();
      return;
    }
    if (laDangKy && oMatKhau.value !== oXacNhanMatKhau.value) {
      showError(thongBaoLoi, "Mật khẩu xác nhận không khớp.");
      oXacNhanMatKhau.focus();
      return;
    }

    // Khóa JSON gửi Backend được giữ đúng hợp đồng API hiện tại.
    const duLieuGui = laDangKy
      ? {
          full_name: hoTen,
          email,
          password: oMatKhau.value,
          phone: String(duLieuBieuMau.phone || "").trim(),
          address: String(duLieuBieuMau.address || "").trim(),
        }
      : { email, password: oMatKhau.value };

    nutGui.disabled = true;
    nutGui.textContent = "Đang xử lý...";
    bieuMau.setAttribute("aria-busy", "true");

    try {
      const ketQua = await apiRequest(
        `/auth/${laDangKy ? "register" : "login"}`,
        {
          method: "POST",
          body: JSON.stringify(duLieuGui),
        },
      );

      if (ketQua.token && ketQua.user) {
        localStorage.setItem(
          AUTH_STORAGE_KEY,
          JSON.stringify({ token: ketQua.token, user: ketQua.user }),
        );
        window.dispatchEvent(
          new CustomEvent("anh-nguyet-xac-thuc-cap-nhat", {
            detail: { user: ketQua.user },
          }),
        );
        const duongDanQuayLai =
          new URLSearchParams(window.location.search).get("returnTo") || "";
        const duongDanAnToan =
          /^account\.html\?tab=(profile|addresses|orders)$/.test(
            duongDanQuayLai,
          ) ||
          ["checkout.html", "admin-orders.html"].includes(
            duongDanQuayLai,
          );
        window.location.assign(
          duongDanAnToan ? duongDanQuayLai : "index.html",
        );
        return;
      }

      if (laDangKy) {
        window.location.assign("login.html?registered=1");
        return;
      }

      throw new Error("Máy chủ không trả thông tin phiên đăng nhập hợp lệ.");
    } catch (loi) {
      showError(thongBaoLoi, loi.message || "Đã xảy ra lỗi. Vui lòng thử lại.");
    } finally {
      nutGui.disabled = false;
      nutGui.textContent = laDangKy ? "Đăng ký" : "Đăng nhập";
      bieuMau.removeAttribute("aria-busy");
    }
  });
}
