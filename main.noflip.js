/* Simple, robust PDF viewer (no flip animation)
   - Accepts ?pdf=<path-or-URL>, defaults to pdfs/ironworks.pdf
   - Single / Spread view
   - Prev / Next, Zoom, Fullscreen, Thumbnails
   - Uses PDF.js only (local)
*/

const qs = new URLSearchParams(location.search);
const pdfParam = qs.get("pdf") || "pdfs/ironworks.pdf";
const pdfAbsoluteUrl = new URL(pdfParam, location.href).href;

const state = {
  pdf: null,
  total: 0,
  scale: 1.25,     // base render scale
  mode: "spread",  // "single" | "spread"
  currentIndex: 1  // 1-based
};

const el = {
  pageView: document.getElementById("pageView"),
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

init().catch(err => {
  console.error("Startup error:", err);
  alert("Failed to load PDF.\n\nOpen DevTools (F12) → Console to see the exact error.");
});

async function init() {
  const bytes = await fetchBytes(pdfAbsoluteUrl);
  state.pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  state.total = state.pdf.numPages;

  await renderThumbs();
  await renderView();
  wireUI();

  updatePageInfo();
}

/* ---------- Core rendering ---------- */
async function renderView() {
  el.pageView.innerHTML = "";

  if (state.mode === "single") {
    const c1 = await renderPageToCanvas(state.currentIndex, state.scale);
    el.pageView.appendChild(c1);
  } else {
    // Spread view: show current and next page
    const leftIndex = normalizeIndexToLeft(state.currentIndex);
    const rightIndex = leftIndex + 1;

    const cLeft = await renderPageToCanvas(leftIndex, state.scale);
    el.pageView.appendChild(cLeft);

    if (rightIndex <= state.total) {
      const cRight = await renderPageToCanvas(rightIndex, state.scale);
      el.pageView.appendChild(cRight);
    }
    state.currentIndex = leftIndex; // keep left page selected
  }

  updatePageInfo();
  markActiveThumb(state.currentIndex);
}

async function renderThumbs() {
  el.thumbs.innerHTML = "";
  for (let i = 1; i <= state.total; i++) {
    const dataUrl = await renderPageToDataURL(i, 0.25);
    const a = document.createElement("a");
    a.href = "#";
    a.className = "page-thumb";
    a.dataset.index = i;
    a.innerHTML = `<img src="${dataUrl}" alt="Page ${i}" />`;
    a.addEventListener("click", e => {
      e.preventDefault();
      state.currentIndex = i;
      renderView();
    });
    el.thumbs.appendChild(a);
  }
  markActiveThumb(state.currentIndex);
}

function markActiveThumb(i) {
  document.querySelectorAll(".page-thumb").forEach(a => a.classList.remove("active"));
  const active = document.querySelector(`.page-thumb[data-index="${i}"]`);
  if (active) active.classList.add("active");
}

function normalizeIndexToLeft(i) {
  // Ensure left page is odd (1,3,5,...) for spreads
  return i % 2 === 1 ? i : i - 1;
}

/* ---------- Navigation ---------- */
function prev() {
  if (state.mode === "single") {
    state.currentIndex = Math.max(1, state.currentIndex - 1);
  } else {
    state.currentIndex = Math.max(1, normalizeIndexToLeft(state.currentIndex) - 2);
  }
  renderView();
}

function next() {
  if (state.mode === "single") {
    state.currentIndex = Math.min(state.total, state.currentIndex + 1);
  } else {
    const left = normalizeIndexToLeft(state.currentIndex) + 2;
    state.currentIndex = Math.min(state.total, left);
  }
  renderView();
}

function updatePageInfo() {
  el.pageInfo.textContent = `Page ${state.currentIndex} / ${state.total}`;
}

/* ---------- Wire UI ---------- */
function wireUI() {
  el.btnPrev.addEventListener("click", prev);
  el.btnNext.addEventListener("click", next);

  el.btnSingle.addEventListener("click", () => {
    state.mode = "single";
    renderView();
  });
  el.btnSpread.addEventListener("click", () => {
    state.mode = "spread";
    renderView();
  });

  el.btnZoomIn.addEventListener("click", () => {
    state.scale = Math.min(3, state.scale + 0.25);
    renderView();
  });
  el.btnZoomOut.addEventListener("click", () => {
    state.scale = Math.max(0.5, state.scale - 0.25);
    renderView();
  });

  el.btnFullscreen.addEventListener("click", () => {
    const root = document.documentElement;
    if (!document.fullscreenElement) (document.getElementById("flipbook").requestFullscreen || root.requestFullscreen).call(document.getElementById("flipbook") || root);
    else document.exitFullscreen();
  });

  el.btnThumbs.addEventListener("click", () => {
    el.thumbs.classList.toggle("hidden");
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") prev();
    if (e.key === "ArrowRight") next();
  });

  // deep link like #p=12
  window.addEventListener("hashchange", () => {
    const n = parseInt(location.hash.replace("#p=", ""), 10);
    if (!isNaN(n)) {
      state.currentIndex = Math.min(Math.max(1, n), state.total);
      renderView();
    }
  });
}

/* ---------- PDF helpers ---------- */
async function renderPageToCanvas(pageNumber, scale = 1) {
  const page = await state.pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

async function renderPageToDataURL(pageNumber, scale = 0.3) {
  const c = await renderPageToCanvas(pageNumber, scale);
  return c.toDataURL("image/jpeg", 0.8);
}

async function fetchBytes(url) {
  const r = await fetch(url, { cache: "reload" });
  if (!r.ok) throw new Error(`Fetch failed (${r.status}) for: ${url}`);
  const buf = await r.arrayBuffer();
  return new Uint8Array(buf);
}
