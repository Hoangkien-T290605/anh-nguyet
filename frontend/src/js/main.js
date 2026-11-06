import { mountFooter } from "./components/footer.js";
import { mountHeader } from "./components/header.js";

mountHeader();
mountFooter();

const page = document.body.dataset.page;

if (page === "home") {
  const { mountHome } = await import("./pages/home.js");
  mountHome();
} else if (page === "products") {
  const { mountProducts } = await import("./pages/products.js");
  mountProducts();
} else if (page === "product") {
  const { mountProductDetail } = await import("./pages/product-detail.js");
  mountProductDetail();
} else if (page === "cart") {
  const { mountCart } = await import("./pages/cart.js");
  mountCart();
} else if (page === "checkout") {
  const { mountCheckout } = await import("./pages/checkout.js");
  mountCheckout();
} else if (page === "login" || page === "register") {
  const { mountAuth } = await import("./pages/auth.js");
  mountAuth(page);
} else if (page === "account") {
  const { mountAccount } = await import("./pages/account.js");
  mountAccount();
}
