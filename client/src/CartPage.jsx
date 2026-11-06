import { Link } from "react-router-dom";
import "./CartPage.css";

const formatPrice = (price) =>
  `${Number(price || 0).toLocaleString("vi-VN")}đ`;

function getProductSymbol(category) {
  if (category === "Gạo, bột") return "▤";
  if (category === "Đồ uống") return "♧";
  if (category === "Mỹ phẩm") return "✿";
  if (category === "Sản phẩm khác") return "✳";
  return "❋";
}

function CartPage({ cart = [], setCart }) {
  const cartCount = cart.reduce(
    (total, item) => total + Number(item.quantity || 0),
    0
  );

  const totalPrice = cart.reduce(
    (total, item) =>
      total + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );

  function getProductId(product) {
    return String(product._id ?? product.id);
  }

  function increaseQuantity(product) {
    setCart((current) =>
      current.map((item) => {
        if (getProductId(item) !== getProductId(product)) return item;

        const quantity = Number(item.quantity || 1);
        const hasStock =
          item.stock !== null &&
          item.stock !== undefined &&
          item.stock !== "";

        if (hasStock && quantity >= Number(item.stock)) return item;

        return { ...item, quantity: quantity + 1 };
      })
    );
  }

  function decreaseQuantity(product) {
    setCart((current) =>
      current.map((item) =>
        getProductId(item) === getProductId(product)
          ? {
              ...item,
              quantity: Math.max(1, Number(item.quantity || 1) - 1),
            }
          : item
      )
    );
  }

  function removeProduct(product) {
    setCart((current) =>
      current.filter(
        (item) => getProductId(item) !== getProductId(product)
      )
    );
  }

  return (
    <div className="cart-page">
      <main className="cart-main">
        <div className="cart-breadcrumb">
          <Link to="/">TRANG CHỦ</Link>
          <span>/</span>
          <span>GIỎ HÀNG</span>
        </div>

        <section className="cart-title">
          <p>ÁNH NGUYỆT COLLECTION</p>
          <h1>GIỎ HÀNG CỦA BẠN</h1>
          <span>Kiểm tra những sản phẩm bạn đã lựa chọn.</span>
        </section>

        {cart.length === 0 ? (
          <section className="cart-empty">
            <div className="cart-empty-icon">🛒</div>
            <h2>Giỏ hàng đang trống</h2>
            <p>
              Bạn chưa có sản phẩm nào trong giỏ hàng.
              Hãy khám phá các sản phẩm từ Ánh Nguyệt nhé!
            </p>
            <Link to="/san-pham" className="cart-continue-button">
              KHÁM PHÁ SẢN PHẨM
            </Link>
          </section>
        ) : (
          <section className="cart-content">
            <div className="cart-list">
              <div className="cart-list-heading">
                <h2>Sản phẩm đã chọn</h2>
                <span>{cartCount} sản phẩm</span>
              </div>

              {cart.map((product) => (
                <article className="cart-item" key={getProductId(product)}>
                  <div className="cart-item-image">
                    {product.image && (
                      <img
                        src={`/images/products/${product.image}`}
                        alt={product.name}
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    )}
                    <span className="cart-item-placeholder">
                      {getProductSymbol(product.category)}
                    </span>
                  </div>

                  <div className="cart-item-info">
                    <span className="cart-item-category">
                      {product.category}
                    </span>
                    <h3>{product.name}</h3>
                    <strong>{formatPrice(product.price)}</strong>
                    <button
                      type="button"
                      className="cart-remove"
                      onClick={() => removeProduct(product)}
                    >
                      Xóa sản phẩm
                    </button>
                  </div>

                  <div className="cart-item-quantity">
                    <span>Số lượng</span>
                    <div className="quantity-control">
                      <button
                        type="button"
                        onClick={() => decreaseQuantity(product)}
                        aria-label="Giảm số lượng"
                      >
                        −
                      </button>
                      <strong>{product.quantity}</strong>
                      <button
                        type="button"
                        onClick={() => increaseQuantity(product)}
                        aria-label="Tăng số lượng"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="cart-item-total">
                    <span>Thành tiền</span>
                    <strong>
                      {formatPrice(
                        Number(product.price || 0) *
                          Number(product.quantity || 0)
                      )}
                    </strong>
                  </div>
                </article>
              ))}

              <div className="cart-list-footer">
                <Link to="/san-pham">← Tiếp tục mua sắm</Link>
                <button type="button" onClick={() => setCart([])}>
                  Xóa toàn bộ giỏ hàng
                </button>
              </div>
            </div>

            <aside className="cart-summary">
              <h2>TỔNG ĐƠN HÀNG</h2>
              <div className="summary-row">
                <span>Số lượng sản phẩm</span>
                <strong>{cartCount}</strong>
              </div>
              <div className="summary-row">
                <span>Tạm tính</span>
                <strong>{formatPrice(totalPrice)}</strong>
              </div>
              <div className="summary-row">
                <span>Phí vận chuyển</span>
                <strong>Chưa tính</strong>
              </div>
              <div className="summary-divider" />
              <div className="summary-total">
                <span>Tổng tiền</span>
                <strong>{formatPrice(totalPrice)}</strong>
              </div>
              <button
                type="button"
                className="checkout-button"
                disabled
              >
                TIẾN HÀNH ĐẶT HÀNG
              </button>
              <p className="checkout-note">
                Chức năng đặt hàng và thanh toán sẽ được hoàn thiện ở giai
                đoạn tiếp theo.
              </p>
            </aside>
          </section>
        )}
      </main>
    </div>
  );
}

export default CartPage;