import { saveExamSettings, clearExamSettings } from "../storage.js";

export function mountExam(container, ctx) {
  const { data, getExamSettings } = ctx;
  const existing = getExamSettings();
  const selectedChapters = new Set(existing?.chapters ?? []);

  const chapters = [...new Set(data.leadalpha.map((p) => p.chapter))].sort((a, b) => a - b);
  const maxByChapter = new Map();
  for (const p of data.leadalpha) {
    const pts = data.config.points[p.categoryKey];
    maxByChapter.set(p.chapter, (maxByChapter.get(p.chapter) || 0) + pts);
  }

  container.innerHTML = `
    <section class="card">
      <h2 class="card-title">定期考査モード設定</h2>
      <label class="field-label" for="exam-date">試験日</label>
      <input type="date" id="exam-date" value="${existing?.date ?? ""}" />

      <div class="field-label" style="margin-top:16px;">範囲(章を選択)</div>
      <div class="chapter-select-grid" id="chapter-grid">
        ${chapters
          .map(
            (ch) => `
          <label class="chapter-checkbox">
            <input type="checkbox" value="${ch}" ${selectedChapters.has(ch) ? "checked" : ""} />
            第${ch}章
          </label>`
          )
          .join("")}
      </div>

      <div class="exam-range-total" id="range-total"></div>

      <div class="button-row">
        <button type="button" class="btn-primary" id="save-exam">保存</button>
        <button type="button" class="btn-secondary" id="clear-exam">定期考査モードを解除</button>
      </div>
    </section>
  `;

  const dateInput = container.querySelector("#exam-date");
  const checkboxes = [...container.querySelectorAll('.chapter-checkbox input[type="checkbox"]')];
  const rangeTotalEl = container.querySelector("#range-total");

  function updateRangeTotal() {
    const selected = checkboxes.filter((c) => c.checked).map((c) => Number(c.value));
    const total = selected.reduce((sum, ch) => sum + (maxByChapter.get(ch) || 0), 0);
    rangeTotalEl.textContent = `選択範囲 満点: ${total}点(${selected.length}章)`;
  }

  checkboxes.forEach((cb) => cb.addEventListener("change", updateRangeTotal));
  updateRangeTotal();

  container.querySelector("#save-exam").addEventListener("click", () => {
    const chapters = checkboxes.filter((c) => c.checked).map((c) => Number(c.value));
    const date = dateInput.value;
    if (!date || chapters.length === 0) {
      alert("試験日と範囲を選択してください");
      return;
    }
    saveExamSettings({ date, chapters });
    ctx.navigate("home");
  });

  container.querySelector("#clear-exam").addEventListener("click", () => {
    clearExamSettings();
    checkboxes.forEach((c) => (c.checked = false));
    dateInput.value = "";
    updateRangeTotal();
  });
}
