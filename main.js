/* Flipbook App
   - Loads ?pdf=<url> (prefer pdfs in /pdfs to avoid CORS)
   - Renders thumbnails
   - Builds page-flip with single/spread modes, zoom, fullscreen, nav
*/

const qs = new URLSearchParams(location.search);
const pdfUrl = qs.get("pdf") || "pdfs/sample.pdf"; // default if no ?pdf= given

const state = {
  pdf: null,
  total: 0,
  scale: 1,          // affects render sharpness
  mode: "spread",    // "single" or "spread"
  pages: [],         // {index, imgSrc}
  currentIndex: 1    // 1-based
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

let pageFlip;

init().catch(err => {
  console.error("PDF load error:", err);
  alert(
    "Failed to load PDF.\n\n" +
    "Troubleshoot:\n" +
    "1) Confirm the PDF path is correct (?pdf=pdfs/ironworks.pdf).\n" +
    "2) Make sure the PDF really exists in your repo.\n" +
    "3) Hard refresh or try incognito mode."
  );
});

async function init() {
  state.pdf = await pdfjsLib.getDocument(pdfUrl).promise;
  state.total = state.pdf.numPages;

  await renderAllThumbnails();     // sidebar thumbs
  await buildFlipbook();           // main viewer

  wireUI();
}

async function renderAllThumbnails() {
  el.thumbs.innerHTML = "";
  for (let i = 1; i <= state.total; i++) {
    const thumb = await renderPageToImage(i, 0.3);
    const item = document.createElement("a");
    item.href = "#";
    item.className = "page-thumb";
    item.dataset.index = i;
    item.innerHTML = `<img src="${thumb}" alt="Page ${i}">`;
    item.addEventListener("click", (e) => {
      e.preventDefault();
      goToPage(i);
    });
    el.thumbs.appendChild(item);
  }
  markActiveThumb(1);
}

async function buildFlipbook() {
  el.flipbook.innerHTML = ""; // reset

  // Prepare pages as images
  state.pages = [];
  for (let i = 1; i <= state.total; i++) {
    const imgSrc = await renderPageToImage(i, state.scale);
    state.pages.push({ index: i, imgSrc });
  }

  // Container
  const book = document.createElement("div");
  book.className = "my-book";
  el.flipbook.appendChild(book);

  // Add page elements
  for (const p of state.pages) {
    const pageEl = document.createElement("div");
    pageEl.className = "page";
    pageEl.innerHTML = `<div class="page-content"><img src="${p.imgSrc}" alt="Page ${p.index}" /></div>`;
    book.appendChild(pageEl);
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

  setMode(state.mode);
  updatePageInfo();
}

function setMode(mode) {
  state.mode = mode;
  pageFlip.update({
    width: 800,
    height: 1100,
    size: "stretch",
    maxShadowOpacity: 0.2,
    singlePageMode: (mode === "single")
  });
}

async function renderPageToImage(pageNumber, scale = 1) {
  const page = await state.pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.5 * scale });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.85);
}

function updatePageInfo() {
  el.pageInfo.textContent = `Page ${state.currentIndex} / ${state.total}`;
}

function goToPage(i) {
  const target = Math.min(Math.max(1, i), state.total);
  pageFlip.flip(target - 1);
}

function markActiveThumb(i) {
  document.querySelectorAll(".page-thumb").forEach(a => a.classList.remove("active"));
  const active = document.querySelector(`.page-thumb[data-index="${i}"]`);
  if (active) active.classList.add("active");
}

function wireUI() {
  el.btnPrev.addEventListener("click", () => pageFlip.flipPrev());
  el.btnNext.addEventListener("click", () => pageFlip.flipNext());
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
    if (!document.fullscreenElement) {
      (el.flipbook.requestFullscreen || root.requestFullscreen).call(el.flipbook || root);
    } else {
      document.exitFullscreen();
    }
  });

  el.btnThumbs.addEventListener("click", () => {
    el.thumbs.classList.toggle("hidden");
  });

  // Keyboard shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") pageFlip.flipPrev();
    if (e.key === "ArrowRight") pageFlip.flipNext();
  });

  // Support deep links like #p=12
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
