export function reportImageSource(image) {
  if (typeof image === "number") return image;
  const uri = typeof image === "string" ? image : image?.uri || image?.url || image?.image_url;
  if (typeof uri !== "string" || !uri.trim()) return null;
  return { ...(typeof image === "object" && image?.uri ? image : {}), uri: uri.trim() };
}

export function reportImageList(images) {
  return Array.isArray(images) ? images.map(reportImageSource).filter(Boolean) : [];
}
