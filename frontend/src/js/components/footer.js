// Dựng chân trang dùng chung cho toàn bộ trang của cửa hàng.
const logoUrl = "./assets/logo-anh-nguyet.png";
const phoneUrl = "./assets/icon-phone.png";

// Gắn nội dung chân trang và xử lý các tương tác của thành phần.
export function mountFooter() {
  const mount = document.getElementById("footer-container");
  if (!mount) return;

  mount.innerHTML = `
    <footer class="site-footer" id="footer">
        <div class="footer-brand"><a class="footer-logo" href="index.html" aria-label="Về trang chủ"><img src="${logoUrl}" alt="Logo Ánh Nguyệt" /></a><p>Tinh hoa từ đất - Sáng bừng vị ngon</p><small>© 2026 Ánh Nguyệt. Mọi quyền được bảo lưu.</small></div>
        <div class="footer-column"><h3>Thông tin</h3><a href="/gioi-thieu">Giới thiệu</a><a href="products.html">Sản phẩm</a><a href="/lien-he">Liên hệ</a></div>
        <div class="footer-column"><h3>Hỗ trợ khách hàng</h3><a href="order-lookup.html">Tra cứu đơn hàng</a><a href="#footer" data-not-active-row-link>Chính sách vận chuyển</a><a href="#footer" data-not-active-row-link>Chính sách đổi trả</a><a href="#footer" data-not-active-row-link>Phương thức thanh toán</a><a href="#footer" data-not-active-row-link>Điều khoản sử dụng</a></div>
        <div class="footer-column contact-cot"><h3>Liên hệ</h3><p class="contact-item"><img src="${phoneUrl}" alt="" /><a href="tel:0387536592">0387536592</a></p><a class="contact-item" href="mailto:anhnguyet.moonlightrice@gmail.com"><span class="contact-icon">✉</span><span>anhnguyet.moonlightrice@gmail.com</span></a><p class="contact-item"><span class="contact-icon">⌖</span><span>149D, Nguyễn Văn Trường, Ninh Kiều, Cần Thơ</span></p><div class="social-link" aria-label="Mạng xã hội"><a href="#footer" data-not-active-row-link aria-label="Facebook">f</a><a href="#footer" data-not-active-row-link aria-label="Instagram">◎</a><a href="#footer" data-not-active-row-link aria-label="TikTok">♪</a></div></div>
        <div class="footer-column footer-newsletter"><h3>Đăng ký nhận tin</h3><p>Nhận thông tin sản phẩm mới và ưu đãi đặc biệt.</p><form class="newsletter-form" data-newsletter><input type="email" placeholder="Nhập email của bạn" aria-label="Email nhận tin" required /><button type="submit" aria-label="Đăng ký">➤</button></form></div>
    </footer>`;

  mount.addEventListener("click", (event) => {
    if (event.target.closest("[data-not-active-row-link]")) event.preventDefault();
  });
  mount
    .querySelector("[data-newsletter]")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      window.alert("Chức năng đăng ký nhận tin sẽ được hoàn thiện sau.");
    });

  if (window.location.hash === "#footer") {
    requestAnimationFrame(() =>
      mount.querySelector(".site-footer")?.scrollIntoView({ block: "start" }),
    );
  }
}
