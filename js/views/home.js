import { computeSnapshot } from "../snapshot.js";
import { renderRadarSVG } from "../radar.js";
import { formatFixed, daysUntil } from "../format.js";

const TICK_MS = 150;

export function mountHome(container, ctx) {
  const { data, getHistory, getExamSettings } = ctx;

  container.innerHTML = `
    <section class="card home-hero">
      <div class="physica-label">PHYSICA値</div>
      <div class="physica-value" id="physica-value">0.0000</div>
      <div class="expected-score" id="expected-score">予想得点(全範囲) --点</div>
    </section>

    <section class="card rank-card">
      <div class="rank-current" id="rank-current"></div>
      <div class="rank-progress">
        <div class="rank-bar"><div class="rank-bar-fill" id="rank-bar-fill"></div></div>
        <div class="rank-next" id="rank-next"></div>
      </div>
    </section>

    <section class="card radar-card">
      <h2 class="card-title">分野別 予想得点</h2>
      <div id="radar-holder"></div>
    </section>

    <section id="exam-card-holder"></section>
  `;

  const physicaValueEl = container.querySelector("#physica-value");
  const expectedScoreEl = container.querySelector("#expected-score");
  const rankCurrentEl = container.querySelector("#rank-current");
  const rankBarFillEl = container.querySelector("#rank-bar-fill");
  const rankNextEl = container.querySelector("#rank-next");
  const radarHolder = container.querySelector("#radar-holder");
  const examHolder = container.querySelector("#exam-card-holder");

  function tick() {
    const history = getHistory();
    const examSettings = getExamSettings();
    const snap = computeSnapshot(data, history, examSettings, Date.now());

    physicaValueEl.textContent = formatFixed(snap.totalHeld, data.config.displayDecimals);
    expectedScoreEl.textContent = `予想得点(全範囲) ${Math.round(snap.overallExpected)}点`;

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

    const fieldValues = new Map(snap.fieldExpected);
    radarHolder.innerHTML = renderRadarSVG(data.config.fields, fieldValues);

    if (snap.exam) {
      const remain = daysUntil(snap.exam.date, snap.now);
      const remainText =
        remain > 0 ? `試験まであと${remain}日` : remain === 0 ? "本日が試験日です" : "試験日を過ぎています";
      examHolder.innerHTML = `
        <div class="card exam-card">
          <h2 class="card-title">定期考査モード</h2>
          <div class="exam-range">範囲: ${snap.exam.chapters.slice().sort((a, b) => a - b).join(", ")}章</div>
          <div class="exam-score">予想得点: ${Math.round(snap.exam.expected)}点</div>
          <div class="exam-countdown">${remainText}</div>
        </div>
      `;
    } else {
      examHolder.innerHTML = "";
    }
  }

  tick();
  const timer = setInterval(tick, TICK_MS);
  return () => clearInterval(timer);
}
