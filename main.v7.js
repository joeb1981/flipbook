/* Flipbook App (LOCAL libs + CORS-proof + robust PageFlip detection)
   - Accepts ?pdf=<path-or-URL>, defaults to pdfs/ironworks.pdf
   - Loads PDF via bytes (no CORS issues)
   - Detects PageFlip class from several globals (St.PageFlip, PageFlip, etc.)
   - Sets mode at init (no early update); toggles rebuild safely
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
  currentIndex: 1,
  fallback: false   // true = flat pages (no flip)
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

  // Fetch PDF bytes (CORS-proof)
  const bytes = await fetchPdfBytes(pdfAbsoluteUrl);
  state.pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  state.total = state.pdf.numPages;

  await renderAllThumbnails();
  await buildFlipbook();   // no update() right after init
  wireUI();
}

/* ---------- Helpers ---------- */
function ensurePdfJsPresent() {
  if (!window.pdfjsLib) throw new Error("pdfjsLib not found. Check vendor/pdfjs/pdf.min.js is loading.");
}

async function fetchPdfBytes(url) {
  const resp = await fetch(url, { cache: "reload" });
  if (!resp.ok) throw new Error(`Fetch failed (${resp.status}) for: ${url}`);
  const buf = await resp.arrayBuffer();
  return new Uint8Array(buf);
}

function getPageFlipClass() {
  // Try common globals created by different builds
  const candidates = [
    window.St && window.St.PageFlip,
    window.PageFlip,                        // some builds export directly
    window.pageFlip && window.pageFlip.PageFlip,
    window.StPageFlip && window.StPageFlip.PageFlip,
  ].filter(Boolean);
  return candidates[0] || null;
}

function showFallbackBadge() {
  let badge = document.getElementById("fallback-badge");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "fallback-badge";
    badge.style.cssText = "position:fixed;bottom:10px;left:10px;background:#1f2937;color:#fff;padding:6px 10px;border-radius:6px;font:12px/1 system-ui;opacity:.85;z-index:9999";
    document.body.appendChild(badge);
  }
  badge.textContent = "Flip effect disabled (using fallback view)";
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
async function buildFlipbook() {
  // Clear container
  el.flipbook.innerHTML = "";

  // Render pages to images at current scale
  state.pages = [];
  for (let i = 1; i <= state.total; i++) {
    const imgSrc = await renderPageToImage(i, state.scale);
    state.pages.push({ index: i, imgSrc });
  }

  // Build DOM
  const book = document.createElement("div");
  book.className = "my-book";
  book.style.cssText = "width:100%;height:100%;";
  el.flipbook.appendChild(book);

  for (const p of state.pages) {
    const pageEl = document.createElement("div");
    pageEl.className = "page";
    pageEl.innerHTML = `<div class="page-content"><img src="${p.imgSrc}" alt="Page ${p.index}" /></div>`;
    book.appendChild(pageEl);
  }

  // Try to init PageFlip
  const PageFlipClass = getPageFlipClass();

  if (!PageFlipClass) {
    console.warn("PageFlip library not detected; showing flat pages without flip effect.");
    state.fallback = true;
    showFallbackBadge();
    updatePageInfo();
    return;
  }

  // Init PageFlip; set mode here so we don't call update() immediately
  pageFlip = new PageFlipClass(book, {
    width: 800,
    height: 1100,
    size: "stretch",
    maxShadowOpacity: 0.2,
    showCover: false,
    useMouseEvents: true,
    mobileScrollSupport: true,
    flippingTime: 600,
    autoSize: true,
    startPage: Math.max(0, state.currentIndex - 1),
    swipeAngle: 10,
    singlePageMode: (state.mode === "single"),
  });

  pageFlip.on("flip", (e) => {
    const pageNum = e.data + 1;
    state.currentIndex = pageNum;
    updatePageInfo();
    markActiveThumb(pageNum);
  });

  state.fallback = false;
  updatePageInfo();
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

/* ---------- Navigation ---------- */
function goToPage(i) {
  const target = Math.min(Math.max(1, i), state.total);
  if (pageFlip && !state.fallback) {
    pageFlip.flip(target - 1);
  } else {
    // fallback: scroll flat image into view
    const node = el.flipbook.querySelectorAll(".page")[target - 1];
    if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
    state.currentIndex = target;
    updatePageInfo();
    markActiveThumb(target);
  }
}

function updatePageInfo() {
  el.pageInfo.textContent = `Page ${state.currentIndex} / ${state.total}`;
}

function markActiveThumb(i) {
  document.querySelectorAll(".page-thumb").forEach(a => a.classList.remove("active"));
  const active = document.querySelector(`.page-thumb[data-index="${i}"]`);
  if (active) active.classList.add("active");
}

/* ---------- UI ---------- */
function wireUI() {
  el.btnPrev.addEventListener("click", () => pageFlip && !state.fallback ? pageFlip.flipPrev() : goToPage(state.currentIndex - 1));
  el.btnNext.addEventListener("click", () => pageFlip && !state.fallback ? pageFlip.flipNext() : goToPage(state.currentIndex + 1));

  // Rebuild on mode change (rock-solid)
  el.btnSingle.addEventListener("click", async () => { state.mode = "single"; await rebuildPreservingPage(); });
  el.btnSpread.addEventListener("click", async () => { state.mode = "spread"; await rebuildPreservingPage(); });

  el.btnZoomIn.addEventListener("click", async () => {
    state.scale = Math.min(3, state.scale + 0.25);
    await rebuildPreservingPage();
  });
  el.btnZoomOut.addEventListener("click", async () => {
    state.scale = Math.max(0.5, state.scale - 0.25);
    await rebuildPreservingPage();
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

  // Deep links like #p=12
  window.addEventListener("hashchange", () => {
    const page = parseInt(location.hash.replace("#p=", ""), 10);
    if (!isNaN(page)) goToPage(page);
  });
}

async function rebuildPreservingPage() {
  const saveIndex = state.currentIndex;
  try { if (pageFlip && typeof pageFlip.destroy === "function") pageFlip.destroy(); } catch {}
  pageFlip = null;
  await buildFlipbook();
  goToPage(saveIndex);
}
