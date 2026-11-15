import { waitForReportImages } from "./formalReport.js";

// Keep a renderable document for printing, without opening a tab or navigating
// away. Do not use display:none: browsers may then print an empty document.
export async function printReportInFrame(html, host = document, prepareImages = waitForReportImages) {
  const frame = host.createElement("iframe");
  frame.title = "Report PDF export";
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;pointer-events:none;";
  let timer;
  let printWindow;
  const cleanup = () => {
    clearTimeout(timer);
    printWindow?.removeEventListener("afterprint", cleanup);
    frame.remove();
  };
  try {
    host.body.appendChild(frame);
    printWindow = frame.contentWindow;
    const printDocument = frame.contentDocument;
    if (!printWindow || !printDocument) throw new Error("Could not prepare the PDF export. Please try again.");
    printDocument.open();
    printDocument.write(html);
    printDocument.close();
    await prepareImages(printDocument);
    if (printDocument.fonts?.ready) await printDocument.fonts.ready;
    printWindow.addEventListener("afterprint", cleanup);
    // Fallback for browsers that omit afterprint; never remove the frame as
    // soon as print() returns because some browsers open the dialog async.
    timer = setTimeout(cleanup, 5 * 60 * 1000);
    printWindow.focus();
    printWindow.print();
  } catch (error) {
    cleanup();
    throw error;
  }
}
