import { ARGAO_POLICE_STATION, PNP_LOGO_URI, STATION_LOGO_URI } from "../constants/policeStation.js";

const valueOr = (value, placeholder) => {
  const text = String(value ?? "").trim();
  return text || placeholder;
};

const escapeHtml = (value) => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

export const CERTIFICATION_OPENING = "THIS IS TO CERTIFY that based on the Police Blotter of this Police Station, record of the events mentioned hereunder was entered in the Log Book Blotter, to wit;";

// Do not substitute the database ID, report date, or current date for official
// blotter/issuance details. Missing official information stays a placeholder.
export const getPoliceCertification = (record) => {
  const issuanceDate = String(record.issuanceDate || record.issuance_date || "");
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(issuanceDate);
  const parsed = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
  const validDate = parsed && parsed.getFullYear() === Number(match[1])
    && parsed.getMonth() === Number(match[2]) - 1 && parsed.getDate() === Number(match[3]);
  const day = validDate ? parsed.getDate() : "[Day]";
  const month = validDate ? parsed.toLocaleString("en-US", { month: "long" }) : "[Month]";
  const year = validDate ? parsed.getFullYear() : "[Year]";
  const requester = valueOr(record.requestedBy || record.requested_by || record.complainantName || record.complainant_name, "[Concerned Person]");
  const purpose = valueOr(record.certificationPurpose || record.certification_purpose, "[Intended Purpose]");
  const narrative = valueOr(record.incidentDescription || record.incident_description || record.details, "[Detailed narrative of the incident]");

  return {
    officeLines: [
      "Republic of the Philippines",
      "National Police Commission",
      "PHILIPPINE NATIONAL POLICE",
      ARGAO_POLICE_STATION.provincialOffice,
      ARGAO_POLICE_STATION.name,
      ARGAO_POLICE_STATION.address,
    ],
    fields: [
      ["BLOTTER ENTRY No.", valueOr(record.blotterNo || record.blotter_no, "[Blotter Entry Number]")],
      ["PAGE NUMBER", valueOr(record.pageNumber || record.page_number, "[Page Number]")],
      ["NATURE OF CASE, INCIDENT", valueOr(record.incidentType || record.incident_type, "[Nature of Case / Incident]")],
      ["DATE/TIME OF OCCURRENCE", valueOr(record.incidentDateTime || record.incident_datetime || record.incident_date, "[Date/Time of Occurrence]")],
      ["PLACE OF OCCURRENCE", valueOr(record.location, "[Place of Occurrence]")],
    ],
    // Preserve the supplied narrative and its paragraphs rather than generating facts.
    paragraphs: narrative.split(/\r?\n\s*\r?\n/),
    disposition: valueOr(record.disposition || record.actionTaken || record.action_taken, "[Disposition]"),
    attendedBy: valueOr(record.blotterOfficer || record.blotter_officer, "[Officer's Name]"),
    purpose: `This certification is issued upon the request of ${requester} for ${purpose}.`,
    issuance: `Issued this ${day} day of ${month}, ${year}, ${ARGAO_POLICE_STATION.municipality}, ${ARGAO_POLICE_STATION.province}, Philippines.`,
    commanderName: valueOr(record.commanderName || record.commander_name, "[COMMANDER'S FULL NAME]"),
    commanderRank: valueOr(record.commanderRank || record.commander_rank, "Police [Rank]"),
    commanderPosition: valueOr(record.commanderPosition || record.commander_position, "[Official Position]"),
    logoUri: record.pnpLogoUri || record.pnp_logo_uri || PNP_LOGO_URI,
    rightLogoUri: record.rightLogoUri || record.right_logo_uri || STATION_LOGO_URI,
  };
};

export const buildPoliceCertificationHtml = (record) => {
  const certificate = getPoliceCertification(record);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>Police Certification</title>
<style>
  @page { size: A4 portrait; margin: 18mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font: 10.5pt Arial, sans-serif; line-height: 1.5; }
  .page { position: relative; width: 174mm; height: 260mm; margin: 0 auto; overflow: hidden; }
  .certificate { position: absolute; top: 0; left: 0; width: 100%; transform-origin: top left; overflow-wrap: anywhere; }
  header { display: flex; align-items: center; gap: 0; margin: 0 21mm 6mm; padding-bottom: 5mm; }
  .header-balance { width: 28mm; flex: 0 0 28mm; }
  .logo { width: 28mm; height: 32mm; flex: 0 0 28mm; object-fit: contain; }
  .logo-left { transform: translateX(3mm) scale(1.9); transform-origin: center right; }
  .logo-right { transform: scale(1.35); transform-origin: center left; }
  .logo-placeholder { display: flex; align-items: center; justify-content: center; text-align: center; font-size: 9pt; }
  .office { flex: 1; text-align: center; line-height: 1.3; font-size: 9.5pt; }
  .office .station { font-size: 11pt; font-weight: bold; text-transform: uppercase; margin-top: 1mm; }
  h1 { text-align: center; font-size: 16pt; margin: 0 0 6mm; letter-spacing: 2pt; }
  h2 { font-size: 10.5pt; margin: 6mm 0 3mm; padding-bottom: 2mm; letter-spacing: 0.5pt; break-after: avoid; }
  p { margin: 0 0 4mm; text-align: justify; }
  .opening, .narrative { text-indent: 10mm; }
  .narrative { white-space: pre-wrap; }
  .salutation { font-weight: bold; margin-bottom: 5mm; }
  table { border-collapse: collapse; width: 100%; margin: 5mm 0; table-layout: fixed; }
  tr { break-inside: avoid; }
  th, td { padding: 2.5mm 3mm; vertical-align: top; text-align: left; white-space: pre-wrap; }
  th { width: 65mm; font-weight: bold; font-size: 9pt; }
  .disposition { margin: 5mm 0; padding: 3mm 4mm; break-inside: avoid; }
  .disposition p { margin-bottom: 2mm; white-space: pre-wrap; text-align: left; }
  .disposition p:last-child { margin-bottom: 0; }
  .signature { width: 48%; margin: 7mm 0 0 auto; text-align: center; break-inside: avoid; }
  .signature p { text-align: center; margin: 0; }
  .signature .name { margin-top: 12mm; padding-top: 2mm; font-weight: bold; text-transform: uppercase; }
</style></head><body><main class="page"><article class="certificate">
  <header>
    ${certificate.logoUri ? `<img class="logo logo-left" src="${escapeHtml(certificate.logoUri)}" alt="Philippine National Police logo" />` : '<div class="logo logo-placeholder">[PNP Logo]</div>'}
    <div class="office">${certificate.officeLines.map((line, index) => `<div${index === 4 ? ' class="station"' : ""}>${index === 2 ? `<strong>${escapeHtml(line)}</strong>` : escapeHtml(line)}</div>`).join("")}</div>
    ${certificate.rightLogoUri ? `<img class="logo logo-right" src="${escapeHtml(certificate.rightLogoUri)}" alt="Station logo" />` : '<div class="header-balance"></div>'}
  </header>
  <h1>CERTIFICATION</h1>
  <p class="salutation">TO WHOM IT MAY CONCERN:</p>
  <p class="opening">${CERTIFICATION_OPENING}</p>
  <table><tbody>${certificate.fields.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}</tbody></table>
  <h2>FACTS OF THE CASE</h2>
  ${certificate.paragraphs.map((paragraph) => `<p class="narrative">${escapeHtml(paragraph)}</p>`).join("")}
  <div class="disposition"><p><strong>DISPOSITION:</strong> ${escapeHtml(certificate.disposition)}</p><p><strong>ATTENDED BY:</strong> ${escapeHtml(certificate.attendedBy)}</p></div>
  <p class="opening">${escapeHtml(certificate.purpose)}</p>
  <p class="opening">${escapeHtml(certificate.issuance)}</p>
  <div class="signature"><p>For the Station Commander:</p><p class="name">${escapeHtml(certificate.commanderName)}</p><p>${escapeHtml(certificate.commanderRank)}</p><p>${escapeHtml(certificate.commanderPosition)}</p></div>
</article></main>
<script>
  // Fit the complete record on one A4 page without truncating the narrative.
  function fitCertification() {
    var page = document.querySelector('.page');
    var content = document.querySelector('.certificate');
    content.style.transform = '';
    var scale = Math.min(1, (page.clientHeight - 1) / content.scrollHeight);
    content.style.transform = 'scale(' + scale + ')';
  }
  fitCertification();
  window.addEventListener('load', fitCertification);
  window.addEventListener('beforeprint', fitCertification);
</script></body></html>`;
};
