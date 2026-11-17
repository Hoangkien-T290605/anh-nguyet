import { apiRequest } from "../services/api.js";
import { mountAdminShell } from "./shell.js";

const AUTH_KEY = "anh-nguyet-auth";

function readSession() {
  try {
    const value = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    return value?.token && value?.user ? value : null;
  } catch {
    return null;
  }
}

function redirectToLogin(page, expired = false, employeePortal = false) {
  const returnTo = `${employeePortal ? "employee" : "admin"}-${page}.html`;
  const query = new URLSearchParams({ returnTo });
  if (expired) query.set("session", "expired");
  window.location.replace(`${employeePortal ? "employee" : "admin"}-login.html?${query.toString()}`);
}

async function startAdminPage() {
  const page = document.body.dataset.adminPage;
  if (page === "login" || page === "employee-login") {
    const { mountAdminLogin } = await import("../pages/admin-login.js");
    mountAdminLogin(page === "employee-login" ? "employee" : "admin");
    return;
  }

  const employeePortal = page.startsWith("employee-");
  const pageKey = employeePortal ? page.slice("employee-".length) : page;

  const root = document.getElementById("admin-app");
  const gate = document.getElementById("admin-gate");
  const session = readSession();
  if (!session) {
    redirectToLogin(pageKey, false, employeePortal);
    return;
  }

  try {
    const result = await apiRequest("/auth/me", {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    const expectedRole = employeePortal ? "employee" : "admin";
    if (result.user?.role !== expectedRole) {
      gate.innerHTML = `<h1>Không có quyền truy cập</h1><p>Tài khoản hiện tại không có quyền vào khu vực ${employeePortal ? "Nhân viên" : "Admin"}.</p><a href="index.html">Quay về cửa hàng</a>`;
      gate.setAttribute("role", "alert");
      return;
    }

    const verifiedSession = { token: session.token, user: result.user };
    try {
      localStorage.setItem(AUTH_KEY, JSON.stringify(verifiedSession));
    } catch {
      // Phiên đã được đọc và API đã xác minh; giao diện quản trị vẫn dùng bản hiện tại.
    }
    if (employeePortal && result.user.must_change_password && pageKey !== "account") {
      window.location.replace("employee-account.html");
      return;
    }
    mountAdminShell(result.user, page, employeePortal ? "employee" : "admin");
    gate.hidden = true;
    root.hidden = false;

    if (employeePortal && pageKey === "dashboard") {
      const { mountEmployeeDashboard } = await import("../pages/employee-dashboard.js");
      await mountEmployeeDashboard();
    } else if (employeePortal && pageKey === "vouchers") {
      const { mountEmployeeVouchers } = await import("../pages/employee-vouchers.js");
      await mountEmployeeVouchers();
    } else if (employeePortal && pageKey === "account") {
      const { mountEmployeeAccount } = await import("../pages/employee-account.js");
      await mountEmployeeAccount();
    } else if (!employeePortal && page === "employees") {
      const { mountAdminEmployees } = await import("../pages/admin-employees.js");
      await mountAdminEmployees();
    } else if (pageKey === "dashboard" && !employeePortal) {
      const { mountAdminDashboard } = await import("../pages/admin-dashboard.js");
      mountAdminDashboard();
    } else if (pageKey === "products" && !employeePortal) {
      const { mountAdminProducts } = await import("../pages/admin-products.js");
      await mountAdminProducts();
    } else if (pageKey === "categories" && !employeePortal) {
      const { mountAdminCategories } = await import("../pages/admin-categories.js");
      await mountAdminCategories();
    } else if (pageKey === "customers") {
      const { mountAdminCustomers } = await import("../pages/admin-customers.js");
      await mountAdminCustomers();
    } else if (pageKey === "orders") {
      const { mountAdminOrders } = await import("../pages/admin-orders.js");
      await mountAdminOrders();
    } else if (pageKey === "reviews") {
      const { mountAdminReviews } = await import("../pages/admin-reviews.js");
      await mountAdminReviews();
    } else if (pageKey === "vouchers" && !employeePortal) {
      const { mountAdminVouchers } = await import("../pages/admin-vouchers.js");
      await mountAdminVouchers();
    } else if (pageKey === "inventory") {
      const { mountAdminInventory } = await import("../pages/admin-inventory.js");
      await mountAdminInventory();
    } else if (pageKey === "shipping" && !employeePortal) {
      const { mountAdminShipping } = await import("../pages/admin-shipping.js");
      await mountAdminShipping();
    } else if (pageKey === "admin-users" && !employeePortal) {
      const { mountAdminUsers } = await import("../pages/admin-users.js");
      await mountAdminUsers();
    } else {
      window.location.replace(employeePortal ? "employee-dashboard.html" : "admin-dashboard.html");
    }
  } catch (error) {
    if (error.status === 401) {
      localStorage.removeItem(AUTH_KEY);
      window.dispatchEvent(
        new CustomEvent("anh-nguyet-xac-thuc-cap-nhat", {
          detail: { user: null },
        }),
      );
      redirectToLogin(pageKey, true, employeePortal);
      return;
    }
    gate.textContent = error.message || "Không thể xác minh quyền quản trị.";
    gate.setAttribute("role", "alert");
  }
}

startAdminPage();
