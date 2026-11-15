export const MAX_REPORT_PHOTOS = 3;

export function appendReportPhotos(current, assets) {
  const selected = (assets || []).map(asset => asset?.uri).filter(uri => typeof uri === "string" && uri.length > 0);
  return [...current, ...selected].slice(0, MAX_REPORT_PHOTOS);
}
