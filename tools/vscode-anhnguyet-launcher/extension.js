const vscode = require("vscode");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const fs = require("node:fs");
const { execFileSync, spawn } = require("node:child_process");

const BACKEND_PORT = 5000;
const EXPECTED_DATABASE = "anh_nguyet";
const BACKEND_BASE = `http://127.0.0.1:${BACKEND_PORT}`;
const LIVE_SERVER_ONLINE_COMMAND = "extension.liveServer.goOnline";
const LIVE_SERVER_OFFLINE_COMMAND = "extension.liveServer.goOffline";
const HEALTH_TIMEOUT_MS = 1500;
const BACKEND_START_TIMEOUT_MS = 60000;

let backendProcess = null;
let backendOwnedByExtension = false;
let backendProcessError = "";
let dependencyInstallChild = null;
let frontendOwnedByExtension = false;
let frontendMode = null;
let frontendPort = null;
let internalFrontendServer = null;
let launchInProgress = null;
let stopItem;
let goLiveItem;
let output;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function requestJson(url, timeoutMs = HEALTH_TIMEOUT_MS, maxBodyBytes = 16 * 1024) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
        if (body.length > maxBodyBytes) request.destroy(new Error("Phản hồi API quá lớn."));
      });
      response.on("end", () => {
        let json = null;
        try {
          json = JSON.parse(body);
        } catch {
          // A non-JSON response is treated as an unrecognized service.
        }
        resolve({ status: response.statusCode || 0, json, body });
      });
    });

    request.on("timeout", () => request.destroy(new Error("Hết thời gian chờ API.")));
    request.on("error", reject);
  });
}

async function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(700);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function inspectBackend() {
  let health;
  try {
    health = await requestJson(`${BACKEND_BASE}/api/health`);
  } catch {
    return { ready: false, occupied: await isPortInUse(BACKEND_PORT) };
  }

  if (health.status === 200 && health.json?.success === true && health.json?.database === "connected") {
    if (health.json?.databaseName !== EXPECTED_DATABASE) {
      return {
        ready: false,
        occupied: true,
        databaseMismatch: health.json?.databaseName !== undefined,
        databaseUnverified: health.json?.databaseName === undefined,
      };
    }
    let hello;
    try {
      hello = await requestJson(`${BACKEND_BASE}/api/hello`);
    } catch {
      return { ready: false, occupied: true };
    }

    if (
      hello.status === 200 &&
      hello.json?.success === true &&
      hello.json?.message === "Backend Ánh Nguyệt đang hoạt động!"
    ) {
      let products;
      try {
        products = await requestJson(`${BACKEND_BASE}/api/products`, HEALTH_TIMEOUT_MS, 2 * 1024 * 1024);
      } catch {
        return { ready: false, occupied: true, productsUnavailable: true };
      }

      if (
        products.status === 200 &&
        products.json?.success === true &&
        Array.isArray(products.json?.data)
      ) {
        return { ready: true, occupied: true };
      }

      return { ready: false, occupied: true, productsUnavailable: true };
    }
  }

  return {
    ready: false,
    occupied: true,
    databaseDisconnected: health.status === 503 && health.json?.database === "disconnected",
  };
}

function showOwnedBackendState() {
  const ownsBackend = backendOwnedByExtension && backendProcess;
  if (ownsBackend || frontendOwnedByExtension || dependencyInstallChild) {
    stopItem.show();
    goLiveItem.tooltip = "Hệ thống Ánh Nguyệt đang chạy. Bấm để kiểm tra Backend và Frontend.";
  } else {
    stopItem.hide();
    goLiveItem.tooltip = "Khởi chạy Backend rồi mở Frontend Ánh Nguyệt.";
  }
}

function getWorkspaceRoot() {
  const folders = vscode.workspace.workspaceFolders || [];
  if (folders.length !== 1) {
    throw new Error("Hãy mở riêng thư mục gốc Ánh Nguyệt trong VS Code trước.");
  }

  const root = path.resolve(folders[0].uri.fsPath);
  const requiredFiles = [
    path.join(root, "server", "package.json"),
    path.join(root, "frontend", "index.html"),
    path.join(root, "index.html"),
  ];
  if (!requiredFiles.every((file) => fs.existsSync(file))) {
    throw new Error("Workspace hiện tại không có đủ server/package.json, frontend/index.html và index.html của Ánh Nguyệt.");
  }
  return root;
}

function checkRuntime() {
  try {
    const version = execFileSync("node.exe", ["-p", "process.versions.node"], {
      encoding: "utf8",
      windowsHide: true,
    }).trim();
    if (Number(version.split(".")[0]) < 20) {
      throw new Error("Node.js cần từ phiên bản 20 trở lên.");
    }
    execFileSync(process.platform === "win32" ? "where.exe" : "which", [
      process.platform === "win32" ? "npm.cmd" : "npm",
    ], { stdio: "ignore", windowsHide: true });
  } catch (error) {
    if (error?.message === "Node.js cần từ phiên bản 20 trở lên.") throw error;
    throw new Error("Chưa tìm thấy Node.js và npm trong PATH. Hãy cài Node.js LTS rồi mở lại VS Code.");
  }
}

function checkEnvironmentFile(root) {
  const envFile = path.join(root, "server", ".env");
  if (!fs.existsSync(envFile)) {
    throw new Error("Thiếu server/.env. Hãy sao chép server/.env.example thành server/.env và cấu hình MySQL/JWT; Go Live không tự tạo hoặc ghi đè thông tin bí mật.");
  }
}

function backendPackagesPresent(serverDirectory) {
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(serverDirectory, "package.json"), "utf8"),
    );
    return Object.keys(packageJson.dependencies || {}).every((name) =>
      fs.existsSync(path.join(serverDirectory, "node_modules", name, "package.json")),
    );
  } catch {
    return false;
  }
}

function installBackendDependencies(serverDirectory) {
  return new Promise((resolve, reject) => {
    const windows = process.platform === "win32";
    const command = windows ? (process.env.ComSpec || "cmd.exe") : "npm";
    const installCommand = fs.existsSync(path.join(serverDirectory, "node_modules"))
      ? "install"
      : "ci";
    const args = windows
      ? ["/d", "/s", "/c", `npm.cmd ${installCommand} --no-audit --no-fund`]
      : [installCommand, "--no-audit", "--no-fund"];
    const child = spawn(command, args, {
      cwd: serverDirectory,
      windowsHide: true,
    });
    dependencyInstallChild = child;
    showOwnedBackendState();
    child.stdout?.on("data", (chunk) => output.append(chunk.toString()));
    child.stderr?.on("data", (chunk) => output.append(chunk.toString()));
    child.once("error", () => {
      dependencyInstallChild = null;
      showOwnedBackendState();
      reject(new Error("Không thể chạy npm để chuẩn bị thư viện Backend."));
    });
    child.once("close", (code) => {
      dependencyInstallChild = null;
      showOwnedBackendState();
      if (code === 0) resolve();
      else reject(new Error(`npm install kết thúc với mã ${code ?? "không xác định"}. Xem kênh Output “Ánh Nguyệt Go Live”.`));
    });
  });
}

async function ensureBackendDependencies(root) {
  checkRuntime();
  const serverDirectory = path.join(root, "server");
  if (backendPackagesPresent(serverDirectory)) return;
  if (!fs.existsSync(path.join(serverDirectory, "package-lock.json"))) {
    throw new Error("Thiếu server/package-lock.json; không thể chuẩn bị bộ thư viện Backend có phiên bản tái lập.");
  }
  output.appendLine("Thiếu một số thư viện Backend; cài các dependency theo package-lock.json.");
  await installBackendDependencies(serverDirectory);
  if (!backendPackagesPresent(serverDirectory)) {
    throw new Error("npm kết thúc nhưng các thư viện Backend cần thiết vẫn chưa sẵn sàng.");
  }
}

function getLiveServerOptions(root) {
  const configuration = vscode.workspace.getConfiguration("liveServer");
  const port = configuration.get("settings.port", 5500);
  const rootSetting = configuration.get("settings.root", "/") || "/";

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Live Server cần dùng một cổng cố định từ 1 đến 65535; extension không đổi cấu hình cổng của bạn.");
  }

  const relativeRoot = rootSetting.replace(/^\/+|\/+$/g, "");
  if (relativeRoot && relativeRoot.toLowerCase() !== "frontend") {
    throw new Error("Live Server Root chỉ được để trống (thư mục dự án) hoặc là /frontend để bảo vệ file cấu hình nội bộ.");
  }
  const serveRoot = path.resolve(root, relativeRoot);
  if (serveRoot !== root && !serveRoot.startsWith(`${root}${path.sep}`)) {
    throw new Error("Root Live Server đang trỏ ra ngoài workspace; extension đã dừng để tránh phục vụ nhầm thư mục.");
  }

  return {
    port,
    rootSetting,
    serveRoot,
    indexFile: path.join(serveRoot, "index.html"),
    homePath: relativeRoot ? "/index.html" : "/frontend/index.html",
    adminPath: relativeRoot ? "/admin-login.html" : "/frontend/admin-login.html",
  };
}

async function verifyFrontend(port, homePath, adminPath) {
  try {
    const [home, admin] = await Promise.all([
      requestJson(`http://127.0.0.1:${port}${homePath}`),
      requestJson(`http://127.0.0.1:${port}${adminPath}`),
    ]);
    return (
      home.status === 200 &&
      home.body?.includes('<body data-page="home">') &&
      admin.status === 200 &&
      admin.body?.includes('<body data-admin-page="login">')
    );
  } catch {
    return false;
  }
}

async function waitForBackend() {
  const deadline = Date.now() + BACKEND_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!backendProcess) {
      throw new Error(backendProcessError || "Backend tự kết thúc trước khi API sẵn sàng. Mở Output “Ánh Nguyệt Go Live”; Frontend chưa được mở.");
    }
    const status = await inspectBackend();
    if (status.ready) return;
    if (status.databaseDisconnected) {
      throw new Error("Backend chưa kết nối được MySQL. Kiểm tra MySQL đang chạy và database anh_nguyet đã được chuẩn bị; tiện ích không tự tạo database hoặc chạy migration.");
    }
    await delay(500);
  }
  throw new Error("Backend không trả API health sẵn sàng trong 60 giây. Xem Output “Ánh Nguyệt Go Live”; Frontend chưa được mở.");
}

function ownedProcessHasExited(child) {
  return child?.exitCode !== null && child?.exitCode !== undefined ||
    child?.signalCode !== null && child?.signalCode !== undefined;
}

function waitForOwnedProcessExit(child, timeoutMs = 5000) {
  if (!child || ownedProcessHasExited(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    let timer;
    const finish = (exited) => {
      clearTimeout(timer);
      child.removeListener("close", onClose);
      resolve(exited);
    };
    const onClose = () => finish(true);
    child.once("close", onClose);
    timer = setTimeout(() => finish(ownedProcessHasExited(child)), timeoutMs);
  });
}

async function stopOwnedBackendProcess(child) {
  if (!child) return true;
  if (ownedProcessHasExited(child)) return true;
  if (child.pid && process.platform === "win32") {
    try {
      // This PID is the cmd.exe process created by this extension; stop only its child tree.
      execFileSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
        timeout: 5000,
      });
    } catch {
      try { child.kill(); } catch { /* The process may have exited already. */ }
    }
  } else {
    try { child.kill("SIGTERM"); } catch { /* The process may have exited already. */ }
  }
  return waitForOwnedProcessExit(child);
}

async function startOwnedBackend(root) {
  if (backendProcess) {
    throw new Error("Backend do tiện ích quản lý vẫn còn chạy; không tạo tiến trình thứ hai.");
  }

  const serverDirectory = path.join(root, "server");
  backendProcessError = "";
  const windows = process.platform === "win32";
  const command = windows ? (process.env.ComSpec || "cmd.exe") : "npm";
  const args = windows
    ? ["/d", "/s", "/c", "npm.cmd run dev"]
    : ["run", "dev"];
  const child = spawn(command, args, {
    cwd: serverDirectory,
    windowsHide: true,
    env: { ...process.env, DB_NAME: EXPECTED_DATABASE, PORT: String(BACKEND_PORT) },
  });
  backendProcess = child;
  backendOwnedByExtension = true;
  showOwnedBackendState();
  child.stdout?.on("data", (chunk) => output.append(chunk.toString()));
  child.stderr?.on("data", (chunk) => output.append(chunk.toString()));
  child.once("error", (error) => {
    backendProcessError = `Không thể chạy npm run dev: ${error.message}`;
    output.appendLine(backendProcessError);
    if (backendProcess === child) {
      backendProcess = null;
      backendOwnedByExtension = false;
      showOwnedBackendState();
    }
  });
  child.once("close", (code, signal) => {
    if (backendProcess === child) {
      if (code !== 0) backendProcessError = `Backend đã kết thúc trước khi sẵn sàng (mã ${code ?? signal ?? "không xác định"}).`;
      backendProcess = null;
      backendOwnedByExtension = false;
      showOwnedBackendState();
    }
  });

  try {
    await waitForBackend();
  } catch (error) {
    if (backendProcess === child) {
      const stopped = await stopOwnedBackendProcess(child);
      if (stopped) {
        backendProcess = null;
        backendOwnedByExtension = false;
      } else {
        backendProcessError = "Backend do tiện ích vẫn chưa dừng sau khi khởi động thất bại.";
        output.appendLine(`${backendProcessError} PID=${child.pid || "unknown"}`);
      }
    }
    showOwnedBackendState();
    throw error;
  }
}

async function startLiveServer(root, options) {
  const baseUrl = (port) => `http://127.0.0.1:${port}`;
  const portOccupied = await isPortInUse(options.port);
  if (portOccupied) {
    if (await verifyFrontend(options.port, options.homePath, options.adminPath)) {
      return { url: baseUrl(options.port), port: options.port, reused: true };
    }
    output.appendLine(`Cổng Frontend ${options.port} đang được dịch vụ khác sử dụng; sẽ không dừng dịch vụ đó.`);
  }

  const commands = await vscode.commands.getCommands(true);
  if (!commands.includes(LIVE_SERVER_ONLINE_COMMAND)) {
    let port = options.port;
    while (port <= 65535 && await isPortInUse(port)) port += 1;
    if (port > 65535) throw new Error("Không tìm thấy cổng trống cho Frontend trong dải cổng khả dụng.");
    const internalOptions = { ...options, port };
    await startInternalFrontend(root, internalOptions);
    frontendOwnedByExtension = true;
    frontendMode = "internal";
    frontendPort = port;
    showOwnedBackendState();
    return { url: baseUrl(port), port, reused: false, mode: "internal" };
  }

  await vscode.commands.executeCommand(
    LIVE_SERVER_ONLINE_COMMAND,
    vscode.Uri.file(options.indexFile),
  );

  const deadline = Date.now() + 15000;
  const lastPort = Math.min(65535, options.port + 20);
  while (Date.now() < deadline) {
    for (let port = options.port; port <= lastPort; port += 1) {
      if (await verifyFrontend(port, options.homePath, options.adminPath)) {
        frontendOwnedByExtension = true;
        frontendMode = "liveServer";
        frontendPort = port;
        showOwnedBackendState();
        return { url: baseUrl(port), port, reused: false, mode: "liveServer" };
      }
    }
    await delay(300);
  }

  throw new Error(`Live Server chưa phục vụ được hai trang cần thiết trong dải cổng ${options.port}–${lastPort}.`);
}

async function startInternalFrontend(root, options) {
  const webRoot = options.serveRoot;
  const rootIsProject = path.resolve(webRoot) === path.resolve(root);
  const mimeTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".webp": "image/webp",
    ".woff2": "font/woff2",
  };
  const server = http.createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    } catch {
      response.writeHead(400).end("Invalid URL");
      return;
    }
    let relativePath;
    let requestRoot;
    if (rootIsProject) {
      if (pathname === "/" || pathname === "/index.html") {
        requestRoot = root;
        relativePath = "index.html";
      } else if (pathname.startsWith("/frontend/")) {
        requestRoot = path.join(root, "frontend");
        relativePath = pathname.slice("/frontend/".length) || "index.html";
      } else {
        response.writeHead(404).end("Not found");
        return;
      }
    } else {
      requestRoot = webRoot;
      relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
    }
    const candidate = path.resolve(requestRoot, relativePath);
    const rootPrefix = `${path.resolve(requestRoot)}${path.sep}`;
    if (candidate !== path.resolve(requestRoot) && !candidate.startsWith(rootPrefix)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    try {
      const [realRoot, realFile] = await Promise.all([
        fs.promises.realpath(requestRoot),
        fs.promises.realpath(candidate),
      ]);
      if (realFile !== realRoot && !realFile.startsWith(`${realRoot}${path.sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const stat = await fs.promises.stat(realFile);
      if (!stat.isFile()) {
        response.writeHead(404).end("Not found");
        return;
      }
      response.writeHead(200, {
        "Cache-Control": "no-cache",
        "Content-Length": stat.size,
        "Content-Type": mimeTypes[path.extname(realFile).toLowerCase()] || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      });
      if (request.method === "HEAD") response.end();
      else fs.createReadStream(realFile).on("error", () => response.destroy()).pipe(response);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  internalFrontendServer = server;
  const ready = await verifyFrontend(options.port, options.homePath, options.adminPath);
  if (!ready) {
    await new Promise((resolve) => server.close(resolve));
    internalFrontendServer = null;
    throw new Error(`Máy chủ Frontend tích hợp không phục vụ được hai trang trên cổng ${options.port}.`);
  }
}

async function runGoLive() {
  if (launchInProgress) {
    vscode.window.showInformationMessage("Đang kiểm tra Backend Ánh Nguyệt.");
    return launchInProgress;
  }

  launchInProgress = (async () => {
    const root = getWorkspaceRoot();
    const liveOptions = getLiveServerOptions(root);
    checkRuntime();
    checkEnvironmentFile(root);
    let backend = await inspectBackend();

    if (backend.ready) {
      output.appendLine("Backend trên cổng 5000 đã trả health và hello hợp lệ; sẽ dùng tiến trình hiện có.");
    } else if (backend.occupied) {
      const detail = backend.databaseDisconnected
        ? "Backend Ánh Nguyệt đang phản hồi nhưng MySQL chưa kết nối. Không mở Frontend."
        : backend.databaseMismatch
          ? `Backend trên cổng 5000 đang kết nối database khác ${EXPECTED_DATABASE}. Không mở Frontend.`
          : backend.databaseUnverified
            ? "Backend trên cổng 5000 chưa xác nhận database đích. Cập nhật Backend rồi thử lại; không mở Frontend."
        : backend.productsUnavailable
          ? "Backend đã phản hồi nhưng API danh sách sản phẩm chưa hoạt động. Không mở Frontend."
        : "Cổng 5000 đang bận nhưng không xác minh được API Backend Ánh Nguyệt. Không dừng tiến trình đó và không mở Frontend.";
      throw new Error(detail);
    } else {
      output.appendLine("Cổng 5000 trống; khởi chạy npm run dev trong server với DB_NAME=anh_nguyet.");
      await ensureBackendDependencies(root);
      await startOwnedBackend(root);
      backend = await inspectBackend();
      if (!backend.ready) throw new Error("Backend vừa khởi chạy nhưng kiểm tra health/hello không thành công.");
    }

    const frontend = await startLiveServer(root, liveOptions);
    const customerUrl = `${frontend.url}${liveOptions.homePath}`;
    const adminUrl = `${frontend.url}${liveOptions.adminPath}`;
    try {
      await vscode.env.openExternal(vscode.Uri.parse(customerUrl));
    } catch {
      vscode.window.showWarningMessage(`Website đã sẵn sàng nhưng không mở được trình duyệt. Mở thủ công: ${customerUrl}`);
    }
    vscode.window.showInformationMessage(
      `Ánh Nguyệt đã sẵn sàng. Khách hàng: ${customerUrl} | Admin: ${adminUrl}${frontend.reused ? " (Live Server đang chạy)" : ""}`,
    );
    output.appendLine(`Sẵn sàng: ${customerUrl} ; ${adminUrl}`);
  })()
    .catch((error) => {
      const message = error instanceof Error ? error.message : "Không thể khởi chạy Ánh Nguyệt.";
      output.appendLine(`Lỗi Go Live: ${message}`);
      vscode.window.showErrorMessage(message);
    })
    .finally(() => {
      launchInProgress = null;
    });

  return launchInProgress;
}

async function stopOwnedBackend() {
  if (!backendOwnedByExtension && !frontendOwnedByExtension && !dependencyInstallChild) {
    vscode.window.showInformationMessage("Không có dịch vụ nào do tiện ích khởi chạy để dừng.");
    return;
  }

  let frontendStopped = true;
  if (dependencyInstallChild) {
    const child = dependencyInstallChild;
    try {
      if (child.pid) {
        execFileSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
          timeout: 5000,
        });
      } else {
        child.kill();
      }
    } catch {
      try { child.kill(); } catch { /* Tiến trình có thể vừa kết thúc. */ }
    }
  }
  if (frontendOwnedByExtension) {
    if (frontendMode === "internal" && internalFrontendServer) {
      const server = internalFrontendServer;
      internalFrontendServer = null;
      await new Promise((resolve) => server.close(resolve));
      frontendOwnedByExtension = false;
      frontendMode = null;
      frontendPort = null;
    } else if (frontendMode === "liveServer") {
      const commands = await vscode.commands.getCommands(true);
      if (!commands.includes(LIVE_SERVER_OFFLINE_COMMAND)) {
        frontendStopped = false;
        vscode.window.showWarningMessage("Không tìm thấy lệnh dừng Live Server; Frontend vẫn chạy và không bị kết thúc bằng cách khác.");
      } else {
        await vscode.commands.executeCommand(LIVE_SERVER_OFFLINE_COMMAND);
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline && await isPortInUse(frontendPort || 5500)) await delay(200);
        if (await isPortInUse(frontendPort || 5500)) {
          frontendStopped = false;
          vscode.window.showWarningMessage("Đã yêu cầu Live Server dừng, nhưng cổng của Frontend vẫn bận. Không kết thúc tiến trình còn lại.");
        } else {
          frontendOwnedByExtension = false;
          frontendMode = null;
          frontendPort = null;
        }
      }
    }
  }

  if (backendOwnedByExtension && backendProcess) {
    const child = backendProcess;
    const processStopped = await stopOwnedBackendProcess(child);
    if (!processStopped) {
      showOwnedBackendState();
      vscode.window.showWarningMessage(`Windows chưa dừng được cây Backend do tiện ích tạo (PID ${child.pid || "không xác định"}). Hãy thử lại nút Dừng; không kết thúc tiến trình khác.`);
      return;
    }

    const deadline = Date.now() + 8000;
    while (Date.now() < deadline && await isPortInUse(BACKEND_PORT)) await delay(200);
    if (await isPortInUse(BACKEND_PORT)) {
      if (backendProcess === child) backendProcess = null;
      backendOwnedByExtension = false;
      showOwnedBackendState();
      vscode.window.showWarningMessage("Đã dừng tiến trình khởi chạy do tiện ích tạo, nhưng cổng 5000 vẫn bận. Không dừng tiến trình còn lại vì quyền sở hữu chưa được xác minh.");
      return;
    }
    if (backendProcess === child) backendProcess = null;
    backendOwnedByExtension = false;
  }

  showOwnedBackendState();
  if (frontendStopped) vscode.window.showInformationMessage("Các dịch vụ do tiện ích khởi chạy đã được dừng.");
}

function activate(context) {
  output = vscode.window.createOutputChannel("Ánh Nguyệt Go Live");
  goLiveItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  goLiveItem.text = "$(play) Go Live Ánh Nguyệt";
  goLiveItem.command = "anhnguyet.goLive";
  stopItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  stopItem.text = "$(debug-stop) Dừng dịch vụ Ánh Nguyệt";
  stopItem.command = "anhnguyet.stopOwnedBackend";
  stopItem.tooltip = "Chỉ dừng Frontend hoặc Backend do tiện ích khởi chạy.";
  stopItem.hide();
  showOwnedBackendState();
  goLiveItem.show();

  context.subscriptions.push(
    output,
    goLiveItem,
    stopItem,
    vscode.commands.registerCommand("anhnguyet.goLive", runGoLive),
    vscode.commands.registerCommand("anhnguyet.stopOwnedBackend", stopOwnedBackend),
  );
}

function deactivate() {
  // Do not dispose a backend terminal here: an unrelated VS Code reload must not stop it.
}

module.exports = { activate, deactivate };
