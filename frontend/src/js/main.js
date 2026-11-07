// Điểm khởi chạy frontend: gắn thành phần chung và nạp module theo trang.
import { mountFooter } from "./components/footer.js";
import { mountHeader } from "./components/header.js";

mountHeader();
mountFooter();

const currentPage = document.body.dataset.page;

if (currentPage === "home") {
  const { mountHome } = await import("./pages/home.js");
  mountHome();
} else if (currentPage === "products") {
  const { mountProducts } = await import("./pages/products.js");
  mountProducts();
} else if (currentPage === "product-detail") {
  const { mountProductDetail } = await import("./pages/product-detail.js");
  mountProductDetail();
} else if (currentPage === "cart") {
  const { mountCart } = await import("./pages/cart.js");
  mountCart();
} else if (currentPage === "checkout") {
  const { mountCheckout } = await import("./pages/checkout.js");
  mountCheckout();
} else if (currentPage === "order-lookup") {
  const { mountOrderLookup } = await import("./pages/order-lookup.js");
  mountOrderLookup();
} else if (currentPage === "admin-orders") {
  const { mountAdminOrders } = await import("./pages/admin-orders.js");
  mountAdminOrders();
} else if (currentPage === "login" || currentPage === "register") {
  const { mountAuth } = await import("./pages/auth.js");
  mountAuth(currentPage);
} else if (currentPage === "account") {
  const { mountAccount } = await import("./pages/account.js");
  mountAccount();
}
