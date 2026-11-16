// Biểu mẫu liên hệ mở thư nháp trên thiết bị, không giả lập gửi thành công.
export function mountContact() {
  const form = document.getElementById("contact-form");
  const status = document.getElementById("contact-status");
  if (!form || !status) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const subject = String(data.get("subject") || "").trim();
    const message = String(data.get("message") || "").trim();
    if (!name || !email || !subject || !message) {
      status.textContent = "Vui lòng điền đầy đủ thông tin liên hệ.";
      status.hidden = false;
      return;
    }

    const body = `Họ tên: ${name}\nEmail: ${email}\n\n${message}`;
    const mailto = new URL("mailto:anhnguyet.moonlightrice@gmail.com");
    mailto.searchParams.set("subject", subject);
    mailto.searchParams.set("body", body);
    status.textContent = "Đang mở ứng dụng email. Hãy gửi thư trong ứng dụng để hoàn tất.";
    status.hidden = false;
    window.location.href = mailto.href;
  });
}
