import { computeHeldByProblem, lastTapRetention, sumHeld } from "../scoring.js";
import { addTap, undoLastTap } from "../storage.js";

const LONG_PRESS_MS = 550;
const CATEGORY_LABEL = {
  基礎CHECK: "CHECK",
  基本例題: "例",
  基本問題: "問",
  応用問題: "応",
};
const CATEGORY_ORDER = ["基礎CHECK", "基本例題", "基本問題", "応用問題"];

function greenTileStyle(retention) {
  if (retention === null) return "";
  return `background-color: rgba(43,138,62,${retention.toFixed(3)});`;
}

function tileHtml(entry, now, decay, label) {
  const retention = lastTapRetention(entry.taps, now, decay);
  const emptyClass = retention === null ? " tile-empty" : "";
  const style = greenTileStyle(retention);
  const count = entry.taps.length;
  return `
    <button type="button" class="tile${emptyClass}" style="${style}" data-id="${entry.problem.id}" title="${entry.problem.title}">
      <span class="tile-label">${label}</span>
      ${count > 0 ? `<span class="tile-count">${count}</span>` : ""}
    </button>
  `;
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
          const label = p.categoryKey === "基礎CHECK" ? "CHECK" : `${CATEGORY_LABEL[p.categoryKey]}${p.number}`;
          return tileHtml(entry, now, data.config.decay, label);
        })
        .join("");
      return `
        <details class="chapter-group" data-key="${chapter}" ${openSet.has(String(chapter)) ? "open" : ""}>
          <summary>第${chapter}章 <span class="chapter-meta">${held.toFixed(1)} / ${max}</span></summary>
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
          const diffLabel = p.categoryKey === "重問A" ? "A" : p.categoryKey === "重問B" ? "B" : "考";
          return tileHtml(entry, now, data.config.decay, `${diffLabel}${p.num}`);
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
    attachTileHandlers();
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

  function attachTileHandlers() {
    // Tap-vs-long-press is decided entirely from pointerdown/pointerup rather
    // than the "click" event, and renderTiles() (which tears down and rebuilds
    // every tile node) is never called while the pointer/touch is still down.
    // Rebuilding the DOM mid-gesture detaches the tile the OS is tracking for
    // this touch, which releases implicit pointer capture; the eventual
    // pointerup/touchend then gets re-hit-tested and delivered to whatever
    // *new* tile now sits at those coordinates instead -- a fresh element
    // whose closure has no memory of the long-press, so it treats the lift as
    // a plain tap and silently re-adds what the long-press just removed. The
    // long-press timer therefore only mutates storage and flashes a class on
    // the still-attached tile; the actual re-render is deferred to pointerup,
    // after the gesture has fully ended.
    contentEl.querySelectorAll(".tile").forEach((tile) => {
      const id = tile.dataset.id;
      let pressTimer = null;
      let longPressFired = false;

      const clearPress = () => {
        if (pressTimer) clearTimeout(pressTimer);
        pressTimer = null;
      };

      tile.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        longPressFired = false;
        pressTimer = setTimeout(() => {
          longPressFired = true;
          const history = getHistory();
          undoLastTap(history, id);
          tile.classList.add("tile-undo-flash");
        }, LONG_PRESS_MS);
      });

      tile.addEventListener("pointerup", () => {
        clearPress();
        if (longPressFired) {
          longPressFired = false;
          renderTiles();
          return;
        }
        const history = getHistory();
        addTap(history, id);
        tile.classList.add("tile-pop");
        renderTiles();
      });
      tile.addEventListener("pointerleave", clearPress);
      tile.addEventListener("pointercancel", clearPress);
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
