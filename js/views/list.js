import { computeHeldByProblem, sumHeld } from "../scoring.js";
import { tileHtml, attachTileHandlers, problemShortLabel } from "../tiles.js";

const CATEGORY_ORDER = ["基礎CHECK", "基本例題", "基本問題", "応用問題"];
const LAP_LEGEND_LABELS = ["1周目", "2周目", "3周目", "4周目", "5周目〜"];

function renderLapLegend(config) {
  const swatches = LAP_LEGEND_LABELS.map((label, i) => {
    const rgb = config.lapColors[String(i + 1)];
    return `
      <div class="lap-legend-item">
        <span class="lap-legend-swatch" style="background-color: rgb(${rgb});"></span>
        <span class="lap-legend-label">${label}</span>
      </div>
    `;
  }).join("");
  return `<div class="lap-legend">${swatches}</div>`;
}

function renderLeadalpha(data, history, now, openSet) {
  const heldMap = computeHeldByProblem(data.leadalpha, history, data.config, now);
  const chapters = [...new Set(data.leadalpha.map((p) => p.chapter))].sort((a, b) => a - b);

  return chapters
    .map((chapter) => {
      const items = data.leadalpha.filter((p) => p.chapter === chapter);
      const { held, max } = sumHeld(heldMap, items);
      const byCategory = CATEGORY_ORDER.map((cat) => items.filter((p) => p.categoryKey === cat)).flat();
      const tiles = byCategory
        .map((p) => {
          const entry = heldMap.get(p.id);
          return tileHtml(entry, now, data.config, problemShortLabel(p));
        })
        .join("");
      const playlistUrl = data.playlists?.[String(chapter)];
      const playlistLink = playlistUrl
        ? `<a class="playlist-link" href="${playlistUrl}" target="_blank" rel="noopener" aria-label="第${chapter}章の再生リストを開く">▶</a>`
        : "";
      return `
        <details class="chapter-group" data-key="${chapter}" ${openSet.has(String(chapter)) ? "open" : ""}>
          <summary>
            <span class="chapter-summary-text">第${chapter}章 <span class="chapter-meta">${held.toFixed(1)} / ${max}</span></span>
            ${playlistLink}
          </summary>
          <div class="tile-grid">${tiles}</div>
        </details>
      `;
    })
    .join("");
}

function renderJuyomon(data, history, now, openSet) {
  const heldMap = computeHeldByProblem(data.juyomon, history, data.config, now);
  const fieldOrder = [...data.config.fields, "考察"];

  return fieldOrder
    .map((field) => {
      const items = data.juyomon.filter((p) => p.field === field);
      if (items.length === 0) return "";
      const { held, max } = sumHeld(heldMap, items);
      const tiles = items
        .map((p) => {
          const entry = heldMap.get(p.id);
          return tileHtml(entry, now, data.config, problemShortLabel(p));
        })
        .join("");
      return `
        <details class="chapter-group" data-key="${field}" ${openSet.has(String(field)) ? "open" : ""}>
          <summary>${field} <span class="chapter-meta">${held.toFixed(1)} / ${max}</span></summary>
          <div class="tile-grid">${tiles}</div>
        </details>
      `;
    })
    .join("");
}

export function mountList(container, ctx) {
  const { data, getHistory } = ctx;
  let activeTab = "leadalpha";
  const openState = {
    leadalpha: new Set(["1"]),
    juyomon: new Set([String(data.config.fields[0])]),
  };

  container.innerHTML = `
    ${renderLapLegend(data.config)}
    <div class="tabs">
      <button type="button" class="tab-btn active" data-tab="leadalpha">リードα</button>
      <button type="button" class="tab-btn" data-tab="juyomon">重問</button>
    </div>
    <div id="list-content"></div>
  `;

  const contentEl = container.querySelector("#list-content");
  const tabBtns = [...container.querySelectorAll(".tab-btn")];

  function renderTiles() {
    const history = getHistory();
    const now = Date.now();
    const openSet = openState[activeTab];
    contentEl.innerHTML =
      activeTab === "leadalpha"
        ? renderLeadalpha(data, history, now, openSet)
        : renderJuyomon(data, history, now, openSet);
    attachDetailsHandlers(openSet);
    attachPlaylistLinkHandlers();
    attachTileHandlers(contentEl, { getHistory, onChange: renderTiles, config: data.config });
  }

  function attachDetailsHandlers(openSet) {
    contentEl.querySelectorAll("details.chapter-group").forEach((details) => {
      details.addEventListener("toggle", () => {
        const key = details.dataset.key;
        if (details.open) openSet.add(key);
        else openSet.delete(key);
      });
    });
  }

  // <summary> toggles its <details> on any click within it, including nested
  // elements. Stop propagation here so tapping the playlist icon opens the
  // link without also collapsing/expanding the chapter.
  function attachPlaylistLinkHandlers() {
    contentEl.querySelectorAll(".playlist-link").forEach((link) => {
      link.addEventListener("click", (event) => event.stopPropagation());
      link.addEventListener("pointerdown", (event) => event.stopPropagation());
    });
  }

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.tab === activeTab) return;
      activeTab = btn.dataset.tab;
      tabBtns.forEach((b) => b.classList.toggle("active", b === btn));
      renderTiles();
    });
  });

  renderTiles();
  const timer = setInterval(renderTiles, 5000);
  return () => clearInterval(timer);
}
