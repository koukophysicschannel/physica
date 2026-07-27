import { computeHeldByProblem, sumHeld } from "../scoring.js";
import { tileHtml, attachTileHandlers, problemShortLabel } from "../tiles.js";
import { attachScrollTopButton } from "../scrollTop.js";

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

function jumpKeysForTab(tab, data) {
  if (tab === "leadalpha") {
    return [...new Set(data.leadalpha.map((p) => p.chapter))].sort((a, b) => a - b).map(String);
  }
  const fieldOrder = [...data.config.fields, "考察"];
  return fieldOrder.filter((f) => data.juyomon.some((p) => p.field === f));
}

function renderJumpBar(tab, data) {
  const keys = jumpKeysForTab(tab, data);
  const chips = keys
    .map((k) => `<button type="button" class="chip-jump" data-key="${k}">${k}</button>`)
    .join("");
  return `<div class="chapter-jump-bar">${chips}</div>`;
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
  let lastActiveKey = null;

  container.innerHTML = `
    ${renderLapLegend(data.config)}
    <div class="tabs">
      <button type="button" class="tab-btn active" data-tab="leadalpha">リードα</button>
      <button type="button" class="tab-btn" data-tab="juyomon">重問</button>
    </div>
    <div id="jump-bar-holder"></div>
    <div id="list-content"></div>
  `;

  const contentEl = container.querySelector("#list-content");
  const jumpBarHolder = container.querySelector("#jump-bar-holder");
  const tabBtns = [...container.querySelectorAll(".tab-btn")];

  function renderJumpBarForActiveTab() {
    jumpBarHolder.innerHTML = renderJumpBar(activeTab, data);
    lastActiveKey = null;
    attachJumpBarHandlers();
  }

  function attachJumpBarHandlers() {
    jumpBarHolder.querySelectorAll(".chip-jump").forEach((chip) => {
      chip.addEventListener("click", () => {
        const target = contentEl.querySelector(`.chapter-group[data-key="${CSS.escape(chip.dataset.key)}"]`);
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function updateActiveChip() {
    const groups = [...contentEl.querySelectorAll(".chapter-group")];
    if (groups.length === 0) return;
    // The jump bar scrolls away with the page (it isn't sticky), so its own
    // position can't be used as the reference line once scrolled past it.
    // Use a fixed viewport offset instead, just below the topbar.
    const refY = 80;
    let currentKey = groups[0].dataset.key;
    for (const g of groups) {
      if (g.getBoundingClientRect().top <= refY) currentKey = g.dataset.key;
      else break;
    }
    if (currentKey === lastActiveKey) return;
    lastActiveKey = currentKey;
    const chips = [...jumpBarHolder.querySelectorAll(".chip-jump")];
    chips.forEach((c) => c.classList.toggle("active", c.dataset.key === currentKey));
    const activeChip = chips.find((c) => c.dataset.key === currentKey);
    if (activeChip) scrollChipIntoView(activeChip);
  }

  // Scrolls only the jump bar's own horizontal axis to reveal the active chip.
  // Deliberately not scrollIntoView(): with block:"nearest" it would also drag
  // the page's vertical scroll back up to reveal the (off-screen) jump bar
  // itself, cancelling out the very scroll that made the chip change.
  function scrollChipIntoView(chip) {
    const bar = chip.parentElement;
    const barRect = bar.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    if (chipRect.left >= barRect.left && chipRect.right <= barRect.right) return;
    const delta = chipRect.left - barRect.left - (barRect.width - chipRect.width) / 2;
    bar.scrollBy({ left: delta, behavior: "smooth" });
  }

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
    updateActiveChip();
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
      renderJumpBarForActiveTab();
      renderTiles();
    });
  });

  // #view declares overflow-y:auto, but in practice body only sets
  // min-height (not height), so the flex item never gets height-constrained
  // and the page scrolls at the window level instead of inside #view.
  const onScroll = () => requestAnimationFrame(updateActiveChip);
  window.addEventListener("scroll", onScroll, { passive: true });

  renderJumpBarForActiveTab();
  renderTiles();
  const timer = setInterval(renderTiles, 5000);
  const removeScrollTopButton = attachScrollTopButton(window);
  return () => {
    clearInterval(timer);
    window.removeEventListener("scroll", onScroll);
    removeScrollTopButton();
  };
}
