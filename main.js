/* Flipbook App (LOCAL libs + CORS-proof)
   - Accepts ?pdf=<path-or-URL>, defaults to pdfs/ironworks.pdf
   - Fetches PDF as bytes -> PDF.js { data: Uint8Array } (bypasses CORS)
   - Safe if PageFlip not loaded (falls back to flat pages)
*/

const qs = new URLSearchParams(location.search);
const pdfParam = qs.get("pdf") || "pdfs/ironworks.pdf";
const pdfAbsoluteUrl = new URL(pdfParam, location.href).href;

const state = {
  pdf: null,
  total: 0,
  scale: 1,
  mode: "spread",   // "single" | "spread"
  pages: [],
  currentIndex: 1
};

const el = {
  flipbook: document.getElementById("flipbook"),
  thumbs: document.getElementById("thumbs"),
  pageInfo: document.getElementById("pageInfo"),
  btnPrev: document.getElementById("btnPrev"),
  btnNext: document.getElementById("btnNext"),
  btnSingle: document.getElementById("btnSingle"),
  btnSpread: document.getElementById("btnSpread"),
  btnZoomIn: document.getElementById("btnZoomIn"),
  btnZoomOut: document.getElementById("btnZoomOut"),
  btnFullscreen: document.getElementById("btnFullscreen"),
  btnThumbs: document.getElementById("btnThumbs"),
};

let pageFlip = null;

init().catch(err => {
  console.error("Startup error:", err);
  alert("Failed to load PDF.\n\nOpen DevTools (F12) → Console to see the exact error.");
});

async function init() {
  ensurePdfJsPresent();

  // 1) Fetch PDF bytes (works even across origins)
  const bytes = await fetchPdfBytes(pdfAbsoluteUrl);

  // 2) Load with PDF.js using data
  state.pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  state.total = state.pdf.numPages;

  await renderAllThumbnails();
  await buildFlipbook();
  wireUI();
}

function ensurePdfJsPresent() {
  if (!window.pdfjsLib
