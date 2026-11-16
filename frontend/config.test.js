// Chỉ bật chế độ API thử nghiệm trong tab Live Server trên máy cục bộ.
const TEST_API_MODE_KEY = "anh-nguyet-api-environment";
const isLocalFrontend = ["localhost", "127.0.0.1", "::1"].includes(
  window.location.hostname,
);

if (!isLocalFrontend) {
  document.body.textContent =
    "Cấu hình thử nghiệm chỉ được dùng trên Live Server cục bộ.";
} else {
  try {
    const mode = new URLSearchParams(window.location.search).get("mode");
    if (mode === "normal") {
      sessionStorage.removeItem(TEST_API_MODE_KEY);
    } else {
      sessionStorage.setItem(TEST_API_MODE_KEY, "test");
    }
    window.location.replace("./index.html");
  } catch {
    document.body.textContent =
      "Không thể lưu lựa chọn môi trường thử nghiệm trong tab này.";
  }
}
