const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const MIME_EXTENSIONS = {
  "image/jpeg": new Set([".jpg", ".jpeg"]),
  "image/png": new Set([".png"]),
  "image/webp": new Set([".webp"]),
  "image/gif": new Set([".gif"]),
};

function tenGocAnToan(originalName) {
  const baseName = String(originalName || "")
    .split(/[\\/]/)
    .pop()
    .trim();
  const extension = path.extname(baseName);
  const source = extension ? baseName.slice(0, -extension.length) : baseName;
  const normalized = source
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return normalized || "anh-san-pham";
}

function phanMoRongHopLe(originalName, mimeType, allowedImageTypes) {
  const validExtensions = MIME_EXTENSIONS[mimeType];
  if (!validExtensions) throw new Error("Định dạng ảnh không được hỗ trợ");
  const requestedExtension = path.extname(String(originalName || "")).toLowerCase();
  if (validExtensions.has(requestedExtension)) return requestedExtension;
  return allowedImageTypes[mimeType];
}

async function luuAnhSanPhamCucBo({
  directory,
  file,
  allowedImageTypes,
  nhanDangDinhDangAnh,
  taoMaDinhDanh = () => crypto.randomBytes(8).toString("hex"),
}) {
  if (!file || !Buffer.isBuffer(file.buffer)) throw new Error("Thiếu nội dung ảnh");
  if (!Object.hasOwn(allowedImageTypes, file.mimetype) || nhanDangDinhDangAnh(file.buffer) !== file.mimetype) {
    throw new Error("Nội dung tệp không khớp định dạng ảnh được hỗ trợ");
  }

  const stem = tenGocAnToan(file.originalname);
  const extension = phanMoRongHopLe(file.originalname, file.mimetype, allowedImageTypes);
  await fs.mkdir(directory, { recursive: true });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const uniqueId = String(taoMaDinhDanh()).toLowerCase();
    if (!/^[a-f0-9]{16,32}$/.test(uniqueId)) throw new Error("Mã định danh ảnh không hợp lệ");
    const fileName = `${stem}-${uniqueId}${extension}`;
    const filePath = path.join(directory, fileName);
    let handle;
    try {
      handle = await fs.open(filePath, "wx", 0o644);
      await handle.writeFile(file.buffer);
      await handle.close();
      handle = null;
      return { fileName, filePath, extension };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    } finally {
      if (handle) {
        await handle.close().catch(() => {});
        await fs.unlink(filePath).catch((cleanupError) => {
          if (cleanupError.code !== "ENOENT") throw cleanupError;
        });
      }
    }
  }

  throw new Error("Không thể tạo tên ảnh duy nhất sau nhiều lần thử");
}

function tenTepGalleryQuanTriDuoc(fileName) {
  if (typeof fileName !== "string" || path.basename(fileName) !== fileName) return false;
  const extension = "(?:jpg|jpeg|png|webp|gif)";
  const legacyName = new RegExp(`^[a-z0-9][a-z0-9_-]{0,150}_[a-f0-9]{24}\\.${extension}$`, "i");
  const namedFile = new RegExp(`^[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{16,32}\\.${extension}$`, "i");
  return legacyName.test(fileName) || namedFile.test(fileName);
}

module.exports = {
  luuAnhSanPhamCucBo,
  tenGocAnToan,
  tenTepGalleryQuanTriDuoc,
};
