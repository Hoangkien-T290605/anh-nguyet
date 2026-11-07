// Trang giỏ hàng đọc dữ liệu đã lưu, đồng bộ tồn kho và cho phép cập nhật số lượng.
import { apiRequest, getProductImageUrl } from "../services/api.js";
import { loadCart, readCart, writeCart } from "../services/cart.js";
import { escapeHTML, formatPrice } from "../components/product-card.js";

// Kết xuất trạng thái hiện tại và gắn thao tác cho các dòng hàng trong giỏ.
export async function mountCart() {
  const trangThai = document.getElementById("cart-status");
  const khuVucTrong = document.getElementById("cart-empty");
  const noiDungGioHang = document.getElementById("cart-content");
  const danhSachMatHang = document.getElementById("cart-item");
  const nutThanhToan = document.getElementById("checkout-button");
  let gioHang = readCart();
  let canhBaoDongBo = "";

  window.addEventListener("anh-nguyet-cart-dong-bo-loi", (suKien) => {
    canhBaoDongBo = suKien.detail?.message
      ? `Chưa đồng bộ được giỏ hàng tài khoản: ${suKien.detail.message}`
      : "Chưa đồng bộ được giỏ hàng tài khoản.";
    renderCart();
  });
  window.addEventListener("anh-nguyet-cart-cap-nhat", () => {
    gioHang = readCart();
    renderCart();
  });

  // Hiển thị thông báo đồng bộ, trạng thái rỗng hoặc tổng tiền của giỏ.
  function renderCart() {
    if (!gioHang.length) {
      noiDungGioHang.hidden = true;
      khuVucTrong.hidden = false;
      nutThanhToan.disabled = true;
      trangThai.hidden = !canhBaoDongBo;
      trangThai.textContent = canhBaoDongBo;
      return;
    }

    khuVucTrong.hidden = true;
    trangThai.hidden = !canhBaoDongBo;
    trangThai.textContent = canhBaoDongBo;
    noiDungGioHang.hidden = false;
    nutThanhToan.disabled = false;

    const tamTinh = gioHang.reduce(
      (tong, matHang) =>
        tong + Number(matHang.price || 0) * Number(matHang.quantity || 0),
      0,
    );
    const tongSoLuong = gioHang.reduce(
      (tong, matHang) => tong + Number(matHang.quantity || 0),
      0,
    );

    document.getElementById("cart-item-quantity").textContent =
      `${tongSoLuong} sản phẩm`;
    document.getElementById("cart-item-quantity-summary").textContent =
      String(tongSoLuong);
    document.getElementById("cart-tam-tinh").textContent =
      formatPrice(tamTinh);
    document.getElementById("cart-tong").textContent = formatPrice(tamTinh);

    danhSachMatHang.innerHTML = gioHang
      .map((matHang) => {
        const maSanPham = String(matHang._id ?? matHang.id);
        const urlAnh = getProductImageUrl(matHang.image);
        const tonKhoToiDa = Math.max(0, Number(matHang.stock) || 0);

        return `<article class="cart-item" data-cart-item="${escapeHTML(maSanPham)}">
          <a class="cart-item-image" href="product-detail.html?id=${encodeURIComponent(maSanPham)}">
            ${urlAnh ? `<img src="${escapeHTML(urlAnh)}" alt="${escapeHTML(matHang.name)}" loading="lazy" data-cart-image>` : ""}
            <span class="cart-item-placeholder-empty" ${urlAnh ? "hidden" : ""}>❋</span>
          </a>
          <div class="cart-item-info">
            <span class="cart-item-category">${escapeHTML(matHang.category || "Sản phẩm")}</span>
            <h3><a href="product-detail.html?id=${encodeURIComponent(maSanPham)}">${escapeHTML(matHang.name || "Sản phẩm")}</a></h3>
            <strong>${formatPrice(matHang.price)}</strong>
            <button class="cart-delete" type="button" data-delete="${escapeHTML(maSanPham)}">Xóa sản phẩm</button>
          </div>
          <div class="cart-item-quantity">
            <span>Số lượng</span>
            <div class="quantity-control-control">
              <button type="button" data-min="${escapeHTML(maSanPham)}" aria-label="Giảm số lượng">−</button>
              <strong>${Number(matHang.quantity) || 1}</strong>
              <button type="button" data-max="${escapeHTML(maSanPham)}" aria-label="Tăng số lượng" ${Number(matHang.quantity) >= tonKhoToiDa ? "disabled" : ""}>+</button>
            </div>
          </div>
          <div class="cart-item-tong">
            <span>Thành tiền</span>
            <strong>${formatPrice(Number(matHang.price || 0) * Number(matHang.quantity || 0))}</strong>
          </div>
        </article>`;
      })
      .join("");

    danhSachMatHang.querySelectorAll("[data-cart-image]").forEach((anh) =>
      anh.addEventListener(
        "error",
        () => {
          anh.hidden = true;
          anh.parentElement.querySelector(".cart-item-placeholder-empty").hidden =
            false;
        },
        { once: true },
      ),
    );
  }

  // Lưu thay đổi vào dịch vụ giỏ hàng để giữ đồng bộ giữa các trang.
  function saveCart() {
    writeCart(gioHang);
    renderCart();
  }

  noiDungGioHang.addEventListener("click", (suKien) => {
    const nutXoa = suKien.target.closest("[data-delete]");
    const nutTang = suKien.target.closest("[data-max]");
    const nutGiam = suKien.target.closest("[data-min]");

    if (nutXoa) {
      gioHang = gioHang.filter(
        (matHang) => String(matHang._id ?? matHang.id) !== nutXoa.dataset.delete,
      );
    }

    if (nutTang) {
      gioHang = gioHang.map((matHang) => {
        if (String(matHang._id ?? matHang.id) !== nutTang.dataset.max) {
          return matHang;
        }
        const tonKhoToiDa = Math.max(0, Number(matHang.stock) || 0);
        return {
          ...matHang,
          quantity: Math.min(tonKhoToiDa, Number(matHang.quantity || 1) + 1),
        };
      });
    }

    if (nutGiam) {
      gioHang = gioHang.map((matHang) =>
        String(matHang._id ?? matHang.id) === nutGiam.dataset.min
          ? { ...matHang, quantity: Math.max(1, Number(matHang.quantity || 1) - 1) }
          : matHang,
      );
    }

    if (nutXoa || nutTang || nutGiam) saveCart();
  });

  document.getElementById("delete-cart").addEventListener("click", () => {
    gioHang = [];
    saveCart();
  });

  nutThanhToan.addEventListener("click", () => {
    if (!gioHang.length) return;
    window.location.assign("checkout.html");
  });

  await loadCart();
  gioHang = readCart();

  if (gioHang.length) {
    try {
      const ketQua = await apiRequest("/products", {
        signal: AbortSignal.timeout(12000),
      });
      const sanPhamDangBan = Array.isArray(ketQua.data) ? ketQua.data : [];

      gioHang = gioHang.flatMap((matHangDaLuu) => {
        const product = sanPhamDangBan.find(
          (matHang) =>
            String(matHang._id ?? matHang.id) ===
            String(matHangDaLuu._id ?? matHangDaLuu.id),
        );
        if (!product) return [{ ...matHangDaLuu, unavailable: true }];

        const tonKhoToiDa = Math.max(0, Number(product.stock) || 0);
        return [
          {
            ...product,
            quantity: Math.max(
              1,
              Math.min(
                Number(matHangDaLuu.quantity) || 1,
                tonKhoToiDa || Number(matHangDaLuu.quantity) || 1,
              ),
            ),
          },
        ];
      });
      writeCart(gioHang);
    } catch (loi) {
      canhBaoDongBo = `Không thể đồng bộ giá và tồn kho từ máy chủ (${loi.message}). Đang hiển thị thông tin đã lưu trên thiết bị.`;
    }
  }

  renderCart();
}
