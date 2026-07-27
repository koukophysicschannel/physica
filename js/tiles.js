// Shared tile rendering + tap/long-press handling, used by both the problem
// list view and the home screen's "today's problems" package nomination list.

import { lastTapRetention, hasTappedToday } from "./scoring.js";
import { addTap, undoLastTap } from "./storage.js";
import { showToast } from "./toast.js";

const LONG_PRESS_MS = 550;

const CATEGORY_LABEL = {
  基礎CHECK: "CHECK",
  基本例題: "例",
  基本問題: "問",
  応用問題: "応",
};

export function problemShortLabel(p) {
  if (p.source === "leadalpha") {
    return p.categoryKey === "基礎CHECK" ? "CHECK" : `${CATEGORY_LABEL[p.categoryKey]}${p.number}`;
  }
  const diffLabel = p.categoryKey === "重問A" ? "A" : p.categoryKey === "重問B" ? "B" : "考";
  return `${diffLabel}${p.num}`;
}

function tileColorStyle(config, tapCount, retention) {
  if (retention === null) return "";
  const tier = Math.min(tapCount, 5) || 1;
  const rgb = config.lapColors[String(tier)];
  return `background-color: rgba(${rgb},${retention.toFixed(3)});`;
}

export function tileHtml(entry, now, config, label) {
  const retention = lastTapRetention(entry.taps, now, config.decay);
  const emptyClass = retention === null ? " tile-empty" : "";
  const style = tileColorStyle(config, entry.taps.length, retention);
  const count = entry.taps.length;
  return `
    <button type="button" class="tile${emptyClass}" style="${style}" data-id="${entry.problem.id}" title="${entry.problem.title}">
      <span class="tile-label">${label}</span>
      ${count > 1 ? `<span class="tile-count">×${count}</span>` : ""}
    </button>
  `;
}

// Tap-vs-long-press is decided entirely from pointerdown/pointerup rather
// than the "click" event, and onChange() (which typically tears down and
// rebuilds every tile node) is never called while the pointer/touch is still
// down. Rebuilding the DOM mid-gesture detaches the tile the OS is tracking
// for this touch, which releases implicit pointer capture; the eventual
// pointerup/touchend then gets re-hit-tested and delivered to whatever *new*
// tile now sits at those coordinates instead -- a fresh element whose closure
// has no memory of the long-press, so it treats the lift as a plain tap and
// silently re-adds what the long-press just removed. The long-press timer
// therefore only mutates storage and flashes a class on the still-attached
// tile; the actual re-render is deferred to pointerup, after the gesture has
// fully ended.
export function attachTileHandlers(container, { getHistory, onChange, config }) {
  container.querySelectorAll(".tile").forEach((tile) => {
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
        onChange();
        return;
      }
      const history = getHistory();
      if (config?.dailyLimit && hasTappedToday(history[id], Date.now())) {
        tile.classList.remove("tile-blocked-shake");
        // force a reflow so the animation can be retriggered on back-to-back blocked taps
        void tile.offsetWidth;
        tile.classList.add("tile-blocked-shake");
        showToast("今日はもう解きました。また明日");
        return;
      }
      addTap(history, id);
      tile.classList.add("tile-pop");
      onChange();
    });
    tile.addEventListener("pointerleave", clearPress);
    tile.addEventListener("pointercancel", clearPress);
  });
}
