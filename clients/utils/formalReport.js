import { ARGAO_POLICE_STATION } from "../constants/policeStation.js";

const escapeHtml = (value) => String(value === null || value === undefined || value === "" ? "—" : value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

export const getReportImages = (record) => {
  const images = [
    ...(Array.isArray(record.images) ? record.images : []),
    ...(Array.isArray(record.photos) ? record.photos : []),
    record.pic_url,
  ].map((image) => typeof image === "string" ? image : image?.uri || image?.url || image?.image_url);
  return [...new Set(images.filter(Boolean))];
};

export const waitForReportImages = async (document) => {
  await Promise.all(Array.from(document.images).map((image) => new Promise((resolve, reject) => {
    let timeout;
    const finish = (error) => {
      clearTimeout(timeout);
      image.removeEventListener("load", loaded);
      image.removeEventListener("error", failed);
      if (error) reject(error);
      else resolve();
    };
    const loaded = () => finish();
    const failed = () => finish(new Error("An attached picture could not be loaded. Please try exporting the PDF again."));
    if (image.complete) {
      if (image.naturalWidth > 0) resolve();
      else failed();
      return;
    }
    image.addEventListener("load", loaded);
    image.addEventListener("error", failed);
    timeout = setTimeout(failed, 30000);
  })));
};

// Use the same field sections as the modal so the exported record stays complete.
export const buildFormalReportHtml = (record, sections) => {
  const announcement = record.kind === "Announcement";
  const title = announcement ? "ANNOUNCEMENT REPORT" : "INCIDENT REPORT";
  const officeLines = [
    "Republic of the Philippines",
    "National Police Commission",
    "PHILIPPINE NATIONAL POLICE",
    ARGAO_POLICE_STATION.provincialOffice,
    ARGAO_POLICE_STATION.name,
    ARGAO_POLICE_STATION.address,
  ];
  const sectionMarkup = sections.map((section, index) => {
    const fields = section.fields.filter(([label]) => !["Description", "Details"].includes(label));
    const narratives = section.fields.filter(([label]) => ["Description", "Details"].includes(label));
    return `<section>
      <h2>${index + 1}. ${escapeHtml(section.title)}</h2>
      ${fields.length ? `<table><tbody>${fields.map(([label, value]) => `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}</tbody></table>` : ""}
      ${narratives.map(([label, value]) => `<div class="narrative"><h3>${announcement ? "Announcement Details" : escapeHtml(label)}</h3>${String(value || "—").split(/\r?\n\s*\r?\n/).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}</div>`).join("")}
    </section>`;
  }).join("");
  const images = getReportImages(record);
  const attachments = images.length ? `<section class="attachments"><h2>${sections.length + 1}. ${announcement ? "Announcement Attachment" : "Photographic Documentation"}</h2>
    ${images.map((uri, index) => `<figure><img src="${escapeHtml(uri)}" alt="${announcement ? "Announcement attachment" : "Incident photograph"} ${index + 1}" /><figcaption>Attachment ${index + 1} — ${announcement ? "Announcement image" : "Incident photograph"}</figcaption></figure>`).join("")}
  </section>` : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>${title} — ${escapeHtml(record.id)}</title>
<style>
  @page { size: A4 portrait; margin: 18mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font: 10.5pt Arial, sans-serif; line-height: 1.4; overflow-wrap: anywhere; }
  header { text-align: center; line-height: 1.25; margin-bottom: 8mm; padding-bottom: 5mm; border-bottom: 1pt solid #000; }
  .office-name { font-weight: bold; text-transform: uppercase; }
  .system { margin-top: 3mm; font-size: 9pt; letter-spacing: 1pt; }
  h1 { text-align: center; font-size: 14pt; letter-spacing: 1pt; margin: 0 0 3mm; }
  .reference { text-align: center; font-size: 9pt; margin-bottom: 7mm; }
  section { margin-bottom: 6mm; }
  h2 { font-size: 10.5pt; text-transform: uppercase; margin: 0 0 3mm; padding-bottom: 1.5mm; border-bottom: 0.5pt solid #777; break-after: avoid; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  tr { break-inside: avoid; }
  th, td { padding: 1.5mm 0; vertical-align: top; text-align: left; white-space: pre-wrap; }
  th { width: 58mm; font-weight: bold; padding-right: 4mm; }
  td::before { content: ": "; }
  h3 { font-size: 10.5pt; margin: 4mm 0 2mm; break-after: avoid; }
  p { text-align: justify; text-indent: 10mm; white-space: pre-wrap; margin: 0 0 3mm; orphans: 3; widows: 3; }
  figure { margin: 4mm 0 6mm; text-align: center; break-inside: avoid; }
  img { display: block; margin: 0 auto; max-width: 100%; max-height: 160mm; object-fit: contain; }
  figcaption { margin-top: 2mm; font-size: 9pt; }
  footer { border-top: 0.5pt solid #777; margin-top: 8mm; padding-top: 3mm; font-size: 8pt; break-inside: avoid; }
</style></head><body>
  <header>${officeLines.map((line, index) => `<div${index === 2 || index === 4 ? ' class="office-name"' : ""}>${escapeHtml(line)}</div>`).join("")}<div class="system">COMMUNISHIELD · COMMUNITY SAFETY RECORDS</div></header>
  <main><h1>${title}</h1><div class="reference">Reference No.: ${escapeHtml(record.id)}</div>
  ${sectionMarkup}${attachments}</main>
  <footer>CommuniShield · ${title}<br />Generated: ${escapeHtml(new Date().toLocaleString())}<br />This document reproduces the details recorded in the system.</footer>
</body></html>`;
};
