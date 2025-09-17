/* Flipbook App (LOCAL libs + CORS-proof + guards)
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
  if (!window.pdfjsLib) {
    throw new Error("pdfjsLib not found. Check vendor/pdfjs/pdf.min.js is loading.");
  }
}

async function fetchPdfBytes(url) {
  const resp = await fetch(url, { cache: "reload" });
  if (!resp.ok) throw new Error(`Fetch failed (${resp.status}) for: ${url}`);
  const buf = await resp.arrayBuffer();
  return new Uint8Array(buf);
}

/* ---------- Thumbnails ---------- */
async function renderAllThumbnails() {
  el.thumbs.innerHTML = "";
  for (let i = 1; i <= state.total; i++) {
    const thumb = await renderPageToImage(i, 0.3);
    const item = document.createElement("a");
    item.href = "#";
    item.className = "page-thumb";
    item.dataset.index = i;
    item.innerHTML = `<img src="${thumb}" alt="Page ${i}">`;
    item.addEventListener("click", (e) => { e.preventDefault(); goToPage(i); });
    el.thumbs.appendChild(item);
  }
  markActiveThumb(1);
}

/* ---------- Flipbook build (safe) ---------- */
function pageFlipAvailable() {
  return (typeof St !== "undefined" && typeof St.PageFlip === "function");
}

async function buildFlipbook() {
  el.flipbook.innerHTML = "";

  // Render pages to images
  state.pages = [];
  for (let i = 1; i <= state.total; i++) {
    const imgSrc = await renderPageToImage(i, state.scale);
    state.pages.push({ index: i, imgSrc });
  }

  // DOM
  const book = document.createElement("div");
  book.className = "my-book";
  el.flipbook.appendChild(book);

  for (const p of state.pages) {
    const pageEl = document.createElement("div");
    pageEl.className = "page";
    pageEl.innerHTML = `<div class="page-content"><img src="${p.imgSrc}" alt="Page ${p.index}" /></div>`;
    book.appendChild(pageEl);
  }

  // If PageFlip not loaded, show flat pages and exit safely
  if (!pageFlipAvailable()) {
    console.warn("PageFlip library not loaded; showing flat pages without flip effect.");
    pageFlip = null;
    updatePageInfo();
    return;
  }

  // Init PageFlip
  pageFlip = new St.PageFlip(book, {
    width: 800,
    height: 1100,
    size: "stretch",
    maxShadowOpacity: 0.2,
    showCover: false,
    useMouseEvents: true,
    mobileScrollSupport: true,
    flippingTime: 600,
    autoSize: true,
    startPage: 0,
    swipeAngle: 10,
  });

  pageFlip.on("flip", (e) => {
    const pageNum = e.data + 1;
    state.currentIndex = pageNum;
    updatePageInfo();
    markActiveThumb(pageNum);
  });

  setMode(state.mode);   // safe now
  updatePageInfo();
}

function setMode(mode) {
  state.mode = mode;
  if (!pageFlip) return; // guard: no instance → nothing to update
  pageFlip.update({
    width: 800,
    height: 1100,
    size: "stretch",
    maxShadowOpacity: 0.2,
    singlePageMode: (mode === "single"),
  });
}

/* ---------- Rendering ---------- */
async function renderPageToImage(pageNumber, scale = 1) {
  const page = await state.pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.5 * scale });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.85);
}

function updatePageInfo() {
  el.pageInfo.textContent = `Page ${state.currentIndex} / ${state.total}`;
}

function goToPage(i) {
  const target = Math.min(Math.max(1, i), state.total);
  if (pageFlip) {
    pageFlip.flip(target - 1);
  } else {
    // simple scroll to image in fallback mode
    const node = el.flipbook.querySelectorAll(".page")[target - 1];
    if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
    state.currentIndex = target;
    updatePageInfo();
    markActiveThumb(target);
  }
}

function markActiveThumb(i) {
  document.querySelectorAll(".page-thumb").forEach(a => a.classList.remove("active"));
  const active = document.querySelector(`.page-thumb[data-index="${i}"]`);
  if (active) active.classList.add("active");
}

/* ---------- UI ---------- */
function wireUI() {
  el.btnPrev.addEventListener("click", () => pageFlip ? pageFlip.flipPrev() : goToPage(state.currentIndex - 1));
  el.btnNext.addEventListener("click", () => pageFlip ? pageFlip.flipNext() : goToPage(state.currentIndex + 1));
  el.btnSingle.addEventListener("click", () => setMode("single"));
  el.btnSpread.addEventListener("click", () => setMode("spread"));

  el.btnZoomIn.addEventListener("click", async () => {
    state.scale = Math.min(3, state.scale + 0.25);
    await rebuildWithNewScale();
  });
  el.btnZoomOut.addEventListener("click", async () => {
    state.scale = Math.max(0.5, state.scale - 0.25);
    await rebuildWithNewScale();
  });

  el.btnFullscreen.addEventListener("click", () => {
    const root = document.documentElement;
    if (!document.fullscreenElement) (el.flipbook.requestFullscreen || root.requestFullscreen).call(el.flipbook || root);
    else document.exitFullscreen();
  });

  el.btnThumbs.addEventListener("click", () => el.thumbs.classList.toggle("hidden"));

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") el.btnPrev.click();
    if (e.key === "ArrowRight") el.btnNext.click();
  });

  window.addEventListener("hashchange", () => {
    const page = parseInt(location.hash.replace("#p=", ""), 10);
    if (!isNaN(page)) goToPage(page);
  });
}

async function rebuildWithNewScale() {
  const saveIndex = state.currentIndex;
  await buildFlipbook();
  goToPage(saveIndex);
}
