import { computeSnapshot, computeGoalSnapshot } from "../snapshot.js";
import { resolveScope, computeHeldByProblem } from "../scoring.js";
import { renderRadarSVG } from "../radar.js";
import { tileHtml, attachTileHandlers, problemShortLabel } from "../tiles.js";
import { formatFixed, daysUntil, deadlineSortKey } from "../format.js";

const FAST_TICK_MS = 150;
const SLOW_TICK_MS = 5000;
const TYPE_LABELS = { exam: "定期考査", mocktest: "模試", rank: "志望ランク", period: "期間目標" };

function countdownText(deadline, now) {
  const remain = daysUntil(deadline, now);
  return remain > 0 ? `締切まであと${remain}日` : remain === 0 ? "本日が締切です" : "締切を過ぎています";
}

function examCardBody(goal, gs, now) {
  const chapters = goal.target.chapters.slice().sort((a, b) => a - b).join(", ");
  return `
    <div class="goal-range">範囲: ${chapters}章</div>
    <div class="goal-score">予想得点: ${Math.round(gs.expected)}点</div>
    <div class="goal-countdown">${countdownText(goal.deadline, now)}</div>
  `;
}

function mocktestCardBody(goal, gs, config, now) {
  const chapters = goal.target.chapters.slice().sort((a, b) => a - b).join(", ");
  const radar = renderRadarSVG(config.fields, gs.fieldCoverage, gs.fieldFinish);
  return `
    <div class="goal-range">範囲: ${chapters}章</div>
    <div class="goal-score">仕上がり度: ${Math.round(gs.finish)}%(予想得点ではなく、範囲内カバー率ベースの指標です)</div>
    <div class="goal-radar">${radar}</div>
    <div class="goal-countdown">${countdownText(goal.deadline, now)}</div>
  `;
}

function rankCardBody(goal, gs, overallSnap) {
  const currentLabel = overallSnap.rankInfo.current ? overallSnap.rankInfo.current.label : "ランク圏外";
  if (!gs.targetRank) return `<div class="goal-score">志望ランクの設定が見つかりません</div>`;
  return `
    <div class="goal-score">現在ランク: ${currentLabel}</div>
    <div class="goal-score">${gs.achieved ? `${gs.targetRank.label} 到達済み` : `${gs.targetRank.label}まであと ${Math.round(gs.remaining)}点`}</div>
    ${gs.weakestField ? `<div class="goal-countdown">弱点分野: ${gs.weakestField}</div>` : ""}
  `;
}

function periodCardBody(goal, gs, data, history, now) {
  const pct = Math.max(0, Math.min(100, gs.progressPct));
  let html = `
    <div class="rank-bar"><div class="rank-bar-fill" style="width:${pct}%"></div></div>
    <div class="goal-countdown">${countdownText(goal.deadline, now)} / あと${Math.round(gs.remainingPoints)}点</div>
  `;

  if (gs.package) {
    const pkg = gs.package;
    if (pkg.complete) {
      html += `<div class="package-complete">パッケージ完了！お疲れさまでした</div>`;
    } else {
      const scoped = resolveScope(goal.target.scope, data.problems);
      const heldMap = computeHeldByProblem(scoped, history, data.config, now);
      // 動画リンクはタイルの外側(兄弟要素)に置き、タップ加点の当たり判定と
      // 絶対に重ならないようにする。今日の問題リストにのみ表示する(通常の
      // 問題リストのタイルには追加しない)。
      const tiles = pkg.todayProblems
        .map((p) => {
          const tile = tileHtml(heldMap.get(p.id), now, data.config, problemShortLabel(p));
          const videoLink = p.videoId
            ? `<a class="video-link" href="https://www.youtube.com/watch?v=${p.videoId}" target="_blank" rel="noopener" aria-label="解説動画を見る">▶</a>`
            : "";
          return `<div class="today-problem-item">${tile}${videoLink}</div>`;
        })
        .join("");
      html += `
        <div class="today-problems">
          <div class="today-problems-title">今日の問題(あと${pkg.todayQuota}問)</div>
          <div class="tile-grid" data-goal-id="${goal.id}">${tiles}</div>
        </div>
      `;
    }
  }
  return html;
}

export function mountHome(container, ctx) {
  const { data, getHistory, getGoals } = ctx;

  container.innerHTML = `
    <section id="quota-banner"></section>

    <section class="card home-hero">
      <div class="physica-label">PHYSICA値</div>
      <div class="physica-value" id="physica-value">0.0000</div>
    </section>

    <section class="card rank-card">
      <div class="rank-current" id="rank-current"></div>
      <div class="rank-progress">
        <div class="rank-bar"><div class="rank-bar-fill" id="rank-bar-fill"></div></div>
        <div class="rank-next" id="rank-next"></div>
      </div>
    </section>

    <section class="card radar-card">
      <h2 class="card-title">分野別 カバー率(ラベルは予想得点併記)</h2>
      <div id="radar-holder"></div>
    </section>

    <section id="goals-holder"></section>
  `;

  const physicaValueEl = container.querySelector("#physica-value");
  const rankCurrentEl = container.querySelector("#rank-current");
  const rankBarFillEl = container.querySelector("#rank-bar-fill");
  const rankNextEl = container.querySelector("#rank-next");
  const radarHolder = container.querySelector("#radar-holder");
  const quotaBannerEl = container.querySelector("#quota-banner");
  const goalsHolder = container.querySelector("#goals-holder");

  function tickFast() {
    const history = getHistory();
    const snap = computeSnapshot(data, history, Date.now());

    physicaValueEl.textContent = formatFixed(snap.totalHeld, data.config.displayDecimals);

    const { rankInfo } = snap;
    rankCurrentEl.textContent = rankInfo.current
      ? `現在ランク: ${rankInfo.current.label}`
      : "現在ランク: ランク圏外";
    if (rankInfo.next) {
      const span = rankInfo.next.score - (rankInfo.current ? rankInfo.current.score : 0);
      const progressed = span > 0 ? (span - rankInfo.remainingToNext) / span : 0;
      rankBarFillEl.style.width = `${Math.max(0, Math.min(100, progressed * 100))}%`;
      rankNextEl.textContent = `次: ${rankInfo.next.label} まであと ${Math.max(0, Math.round(rankInfo.remainingToNext))}点`;
    } else {
      rankBarFillEl.style.width = "100%";
      rankNextEl.textContent = "最高ランク到達";
    }
    if (rankInfo.weakestField) {
      rankNextEl.textContent += `(弱点: ${rankInfo.weakestField})`;
    }

    radarHolder.innerHTML = renderRadarSVG(data.config.fields, snap.fieldCoverage, snap.fieldExpected);
  }

  function renderGoals() {
    const history = getHistory();
    const now = Date.now();
    const overallSnap = computeSnapshot(data, history, now);
    const goals = getGoals().slice().sort((a, b) => deadlineSortKey(a) - deadlineSortKey(b));

    const goalSnaps = goals.map((g) => ({ goal: g, gs: computeGoalSnapshot(g, data, overallSnap, history, now) }));

    const quotaLines = goalSnaps
      .filter(({ gs }) => gs?.package && !gs.package.complete)
      .map(({ goal, gs }) => `<div class="today-quota-line">${goal.label}: 今日はあと${gs.package.todayQuota}問</div>`)
      .join("");
    quotaBannerEl.innerHTML = quotaLines ? `<section class="card quota-banner-card">${quotaLines}</section>` : "";

    goalsHolder.innerHTML = goalSnaps.length
      ? goalSnaps
          .map(({ goal, gs }) => {
            if (!gs) return "";
            let body = "";
            if (goal.type === "exam") body = examCardBody(goal, gs, now);
            else if (goal.type === "mocktest") body = mocktestCardBody(goal, gs, data.config, now);
            else if (goal.type === "rank") body = rankCardBody(goal, gs, overallSnap);
            else if (goal.type === "period") body = periodCardBody(goal, gs, data, history, now);
            return `
              <section class="card goal-card">
                <h2 class="card-title">${goal.label}<span class="goal-type-badge">${TYPE_LABELS[goal.type]}</span></h2>
                ${body}
              </section>
            `;
          })
          .join("")
      : `<p class="settings-desc goal-empty">まだ目標がありません。「目標」タブから追加できます。</p>`;

    goalsHolder.querySelectorAll(".tile-grid[data-goal-id]").forEach((grid) => {
      attachTileHandlers(grid, { getHistory, onChange: renderGoals, config: data.config });
    });
  }

  tickFast();
  renderGoals();
  const fastTimer = setInterval(tickFast, FAST_TICK_MS);
  const slowTimer = setInterval(renderGoals, SLOW_TICK_MS);
  return () => {
    clearInterval(fastTimer);
    clearInterval(slowTimer);
  };
}
