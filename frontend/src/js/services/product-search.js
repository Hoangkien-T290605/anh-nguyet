// Tạo bộ so khớp tên sản phẩm, hỗ trợ dấu tiếng Việt và từ khóa đầu tên.
function foldSearchText(value = "") {
  return String(value)
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim()
    .replace(/\s+/g, " ");
}

export function createProductSearchMatcher(products, value = "") {
  const query = foldSearchText(value);
  if (!query) return () => true;

  const words = query.split(" ");
  const searchByFirstWord =
    words.length === 1 &&
    products.some((product) =>
      foldSearchText(product.name).split(" ")[0]?.startsWith(query),
    );

  return (product) => {
    const name = foldSearchText(product.name);
    if (searchByFirstWord)
      return name.split(" ")[0]?.startsWith(query) ?? false;
    if (name.includes(query)) return true;
    return words.length > 1 && words.every((word) => name.includes(word));
  };
}
