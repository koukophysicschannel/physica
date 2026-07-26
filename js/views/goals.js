import { addGoal, deleteGoal, loadProfile, saveProfile } from "../storage.js";
import { resolveScope } from "../scoring.js";
import { deadlineSortKey, todayStr, addDays } from "../format.js";

const TYPE_LABELS = { exam: "定期考査", mocktest: "模試", rank: "志望ランク", period: "期間目標" };

function chaptersOf(data) {
  return [...new Set(data.leadalpha.map((p) => p.chapter))].sort((a, b) => a - b);
}

function maxByChapter(data) {
  const map = new Map();
  for (const p of data.leadalpha) {
    map.set(p.chapter, (map.get(p.chapter) || 0) + data.config.points[p.categoryKey]);
  }
  return map;
}

function scopeMaxPoints(scope, data) {
  return resolveScope(scope, data.problems).reduce((sum, p) => sum + data.config.points[p.categoryKey], 0);
}

function packageRangeToScope(範囲) {
  if (範囲.章 !== undefined) return { chapters: 範囲.章 };
  if (範囲.分野 !== undefined) return { field: 範囲.分野 };
  return null;
}

function chapterCheckboxGrid(chapters, selected) {
  return chapters
    .map(
      (ch) => `
    <label class="chapter-checkbox">
      <input type="checkbox" class="ch-checkbox" data-chapter="${ch}" ${selected.has(ch) ? "checked" : ""} />
      第${ch}章
    </label>`
    )
    .join("");
}

export function mountGoals(container, ctx) {
  const { data, getGoals, navigate } = ctx;
  let step = "list";

  function goTo(nextStep) {
    step = nextStep;
    render();
  }

  function goalListSection() {
    const goals = getGoals().slice().sort((a, b) => deadlineSortKey(a) - deadlineSortKey(b));
    const rows = goals.length
      ? goals
          .map(
            (g) => `
        <div class="goal-list-item">
          <div class="goal-list-info">
            <span class="goal-list-type">${TYPE_LABELS[g.type]}</span>
            <span class="goal-list-label">${g.label}</span>
            <span class="goal-list-deadline">${g.deadline ?? "締切なし"}</span>
          </div>
          <button type="button" class="btn-danger goal-delete-btn" data-id="${g.id}">削除</button>
        </div>`
          )
          .join("")
      : `<p class="settings-desc">まだ目標がありません。「目標を追加」から作成してください。</p>`;

    return `
      <section class="card">
        <h2 class="card-title">目標一覧</h2>
        <div class="goal-list">${rows}</div>
        <div class="button-row">
          <button type="button" class="btn-primary" id="add-goal-btn">＋ 目標を追加</button>
        </div>
      </section>
    `;
  }

  function renderList() {
    container.innerHTML = goalListSection();
    container.querySelector("#add-goal-btn").addEventListener("click", () => goTo("pick-type"));
    container.querySelectorAll(".goal-delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        deleteGoal(btn.dataset.id);
        renderList();
      });
    });
  }

  function renderPickType() {
    container.innerHTML = `
      <section class="card">
        <h2 class="card-title">目標の種類を選択</h2>
        <div class="type-picker">
          <button type="button" class="type-picker-btn" data-type="exam">定期考査<br><span>短期・範囲を決めて予想得点</span></button>
          <button type="button" class="type-picker-btn" data-type="mocktest">模試<br><span>中期・仕上がり度%</span></button>
          <button type="button" class="type-picker-btn" data-type="rank">志望ランク<br><span>長期・大学ランク判定</span></button>
          <button type="button" class="type-picker-btn" data-type="period">期間目標<br><span>期間中の獲得量で進捗</span></button>
        </div>
        <div class="button-row">
          <button type="button" class="btn-secondary" id="cancel-btn">キャンセル</button>
        </div>
      </section>
    `;
    container.querySelectorAll(".type-picker-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const type = btn.dataset.type;
        if (type === "exam") goTo("form-exam");
        else if (type === "mocktest") goTo(loadProfile()?.grade ? "form-mocktest" : "form-mocktest-grade");
        else if (type === "rank") goTo("form-rank");
        else if (type === "period") goTo("form-period-choice");
      });
    });
    container.querySelector("#cancel-btn").addEventListener("click", () => goTo("list"));
  }

  function renderFormExam() {
    const chapters = chaptersOf(data);
    const byChapter = maxByChapter(data);
    const selected = new Set();

    container.innerHTML = `
      <section class="card">
        <h2 class="card-title">定期考査の目標を追加</h2>
        <label class="field-label" for="goal-label">名前</label>
        <input type="text" id="goal-label" placeholder="例: 第2回定期考査" />
        <label class="field-label" for="goal-date" style="margin-top:16px;">試験日</label>
        <input type="date" id="goal-date" />
        <div class="field-label" style="margin-top:16px;">範囲(章を選択)</div>
        <div class="chapter-select-grid" id="chapter-grid">${chapterCheckboxGrid(chapters, selected)}</div>
        <div class="exam-range-total" id="range-total"></div>
        <div class="button-row">
          <button type="button" class="btn-primary" id="save-btn">保存</button>
          <button type="button" class="btn-secondary" id="cancel-btn">キャンセル</button>
        </div>
      </section>
    `;

    const checkboxes = [...container.querySelectorAll(".ch-checkbox")];
    const rangeTotalEl = container.querySelector("#range-total");
    function updateTotal() {
      const sel = checkboxes.filter((c) => c.checked).map((c) => Number(c.dataset.chapter));
      const total = sel.reduce((sum, ch) => sum + (byChapter.get(ch) || 0), 0);
      rangeTotalEl.textContent = `選択範囲 満点: ${total}点(${sel.length}章)`;
    }
    checkboxes.forEach((cb) => cb.addEventListener("change", updateTotal));
    updateTotal();

    container.querySelector("#save-btn").addEventListener("click", () => {
      const date = container.querySelector("#goal-date").value;
      const chs = checkboxes.filter((c) => c.checked).map((c) => Number(c.dataset.chapter));
      if (!date || chs.length === 0) {
        alert("試験日と範囲を選択してください");
        return;
      }
      const label = container.querySelector("#goal-label").value.trim() || "定期考査";
      addGoal({
        id: `goal-${Date.now()}`,
        type: "exam",
        label,
        deadline: date,
        createdAt: Date.now(),
        target: { chapters: chs },
      });
      navigate("home");
    });
    container.querySelector("#cancel-btn").addEventListener("click", () => goTo("list"));
  }

  function renderFormMocktestGrade() {
    container.innerHTML = `
      <section class="card">
        <h2 class="card-title">学年を教えてください</h2>
        <p class="settings-desc">模試の対象学年を絞り込むため、最初の一度だけ確認します。</p>
        <div class="type-picker">
          <button type="button" class="type-picker-btn" data-grade="1">高校1年</button>
          <button type="button" class="type-picker-btn" data-grade="2">高校2年</button>
          <button type="button" class="type-picker-btn" data-grade="3">高校3年</button>
        </div>
        <div class="button-row">
          <button type="button" class="btn-secondary" id="cancel-btn">キャンセル</button>
        </div>
      </section>
    `;
    container.querySelectorAll(".type-picker-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        saveProfile({ grade: Number(btn.dataset.grade) });
        goTo("form-mocktest");
      });
    });
    container.querySelector("#cancel-btn").addEventListener("click", () => goTo("list"));
  }

  function renderFormMocktest() {
    const grade = loadProfile()?.grade;
    const candidates = data.exams.filter(
      (e) => e.対象学年 === grade && e.科目.includes(data.config.subject)
    );
    const chapters = chaptersOf(data);
    const byChapter = maxByChapter(data);
    const selected = new Set();

    if (candidates.length === 0) {
      container.innerHTML = `
        <section class="card">
          <h2 class="card-title">模試の目標を追加</h2>
          <p class="settings-desc">対象学年(高${grade})・物理を含む模試が exams.json に見つかりません。</p>
          <div class="button-row">
            <button type="button" class="btn-secondary" id="cancel-btn">戻る</button>
          </div>
        </section>
      `;
      container.querySelector("#cancel-btn").addEventListener("click", () => goTo("list"));
      return;
    }

    container.innerHTML = `
      <section class="card">
        <h2 class="card-title">模試の目標を追加</h2>
        <label class="field-label" for="exam-select">模試を選択</label>
        <select id="exam-select">
          ${candidates
            .map((e) => `<option value="${e.id}">${e.主催} ${e.名称}(${e.標準時期})</option>`)
            .join("")}
        </select>
        <label class="field-label" for="goal-date" style="margin-top:16px;">実施日</label>
        <input type="date" id="goal-date" value="${candidates[0].標準時期}-01" />
        <div class="field-label" style="margin-top:16px;">範囲(章を選択)</div>
        <div class="chapter-select-grid" id="chapter-grid">${chapterCheckboxGrid(chapters, selected)}</div>
        <div class="exam-range-total" id="range-total"></div>
        <div class="button-row">
          <button type="button" class="btn-primary" id="save-btn">保存</button>
          <button type="button" class="btn-secondary" id="cancel-btn">キャンセル</button>
        </div>
      </section>
    `;

    const examSelect = container.querySelector("#exam-select");
    const dateInput = container.querySelector("#goal-date");
    examSelect.addEventListener("change", () => {
      const exam = candidates.find((e) => e.id === examSelect.value);
      dateInput.value = `${exam.標準時期}-01`;
    });

    const checkboxes = [...container.querySelectorAll(".ch-checkbox")];
    const rangeTotalEl = container.querySelector("#range-total");
    function updateTotal() {
      const sel = checkboxes.filter((c) => c.checked).map((c) => Number(c.dataset.chapter));
      const total = sel.reduce((sum, ch) => sum + (byChapter.get(ch) || 0), 0);
      rangeTotalEl.textContent = `選択範囲 満点: ${total}点(${sel.length}章)`;
    }
    checkboxes.forEach((cb) => cb.addEventListener("change", updateTotal));
    updateTotal();

    container.querySelector("#save-btn").addEventListener("click", () => {
      const exam = candidates.find((e) => e.id === examSelect.value);
      const date = dateInput.value;
      const chs = checkboxes.filter((c) => c.checked).map((c) => Number(c.dataset.chapter));
      if (!date || chs.length === 0) {
        alert("実施日と範囲を選択してください");
        return;
      }
      addGoal({
        id: `goal-${Date.now()}`,
        type: "mocktest",
        label: exam.名称,
        deadline: date,
        createdAt: Date.now(),
        target: { examId: exam.id, chapters: chs },
      });
      navigate("home");
    });
    container.querySelector("#cancel-btn").addEventListener("click", () => goTo("list"));
  }

  function renderFormRank() {
    container.innerHTML = `
      <section class="card">
        <h2 class="card-title">志望ランクの目標を追加</h2>
        <label class="field-label" for="rank-select">志望ランク</label>
        <select id="rank-select">
          ${data.config.ranks.map((r) => `<option value="${r.label}">${r.label}</option>`).join("")}
        </select>
        <div class="button-row">
          <button type="button" class="btn-primary" id="save-btn">保存</button>
          <button type="button" class="btn-secondary" id="cancel-btn">キャンセル</button>
        </div>
      </section>
    `;
    container.querySelector("#save-btn").addEventListener("click", () => {
      const rankLabel = container.querySelector("#rank-select").value;
      addGoal({
        id: `goal-${Date.now()}`,
        type: "rank",
        label: `志望: ${rankLabel}`,
        deadline: null,
        createdAt: Date.now(),
        target: { rankLabel },
      });
      navigate("home");
    });
    container.querySelector("#cancel-btn").addEventListener("click", () => goTo("list"));
  }

  function renderFormPeriodChoice() {
    container.innerHTML = `
      <section class="card">
        <h2 class="card-title">期間目標を追加</h2>
        <div class="type-picker">
          <button type="button" class="type-picker-btn" id="from-package">パッケージから選ぶ<br><span>選ぶだけで日々のノルマまで自動化</span></button>
          <button type="button" class="type-picker-btn" id="free-form">自由に設定<br><span>範囲・目標を自分で決める</span></button>
        </div>
        <div class="button-row">
          <button type="button" class="btn-secondary" id="cancel-btn">キャンセル</button>
        </div>
      </section>
    `;
    container.querySelector("#from-package").addEventListener("click", () => goTo("form-period-package"));
    container.querySelector("#free-form").addEventListener("click", () => goTo("form-period-custom"));
    container.querySelector("#cancel-btn").addEventListener("click", () => goTo("list"));
  }

  function renderFormPeriodPackage() {
    const profile = loadProfile();
    const candidates = data.packages.filter((pkg) => pkg.対象学年 == null || pkg.対象学年 === profile?.grade);

    container.innerHTML = `
      <section class="card">
        <h2 class="card-title">パッケージを選ぶ</h2>
        <label class="field-label" for="package-select">パッケージ</label>
        <select id="package-select">
          ${candidates
            .map((pkg) => `<option value="${pkg.id}">${pkg.名称}(推奨${pkg.推奨期間日数}日)</option>`)
            .join("")}
        </select>
        <p class="settings-desc" id="package-comment"></p>
        <label class="field-label" for="start-date">開始日</label>
        <input type="date" id="start-date" value="${todayStr()}" />
        <label class="field-label" for="end-date" style="margin-top:16px;">終了日</label>
        <input type="date" id="end-date" />
        <div class="button-row">
          <button type="button" class="btn-primary" id="save-btn">この内容で始める</button>
          <button type="button" class="btn-secondary" id="cancel-btn">キャンセル</button>
        </div>
      </section>
    `;

    const select = container.querySelector("#package-select");
    const startInput = container.querySelector("#start-date");
    const endInput = container.querySelector("#end-date");
    const commentEl = container.querySelector("#package-comment");

    function updateDefaults() {
      const pkg = candidates.find((p) => p.id === select.value);
      endInput.value = addDays(startInput.value, pkg.推奨期間日数);
      commentEl.textContent = pkg.コメント || "";
    }
    select.addEventListener("change", updateDefaults);
    startInput.addEventListener("change", updateDefaults);
    updateDefaults();

    container.querySelector("#save-btn").addEventListener("click", () => {
      const pkg = candidates.find((p) => p.id === select.value);
      const scope = packageRangeToScope(pkg.範囲);
      const targetPoints = scopeMaxPoints(scope, data) * pkg.周回;
      addGoal({
        id: `goal-${Date.now()}`,
        type: "period",
        label: pkg.名称,
        deadline: endInput.value,
        createdAt: Date.now(),
        target: { scope, rounds: pkg.周回, targetPoints, packageId: pkg.id },
      });
      navigate("home");
    });
    container.querySelector("#cancel-btn").addEventListener("click", () => goTo("form-period-choice"));
  }

  function renderFormPeriodCustom() {
    const chapters = chaptersOf(data);
    const selected = new Set();

    container.innerHTML = `
      <section class="card">
        <h2 class="card-title">期間目標を自由に設定</h2>
        <label class="field-label" for="goal-label">名前</label>
        <input type="text" id="goal-label" placeholder="例: 夏休みに力学2周" />

        <div class="field-label" style="margin-top:16px;">範囲</div>
        <div class="type-picker" id="scope-picker">
          <button type="button" class="type-picker-btn active" data-scope="all">全範囲</button>
          <button type="button" class="type-picker-btn" data-scope="chapters">章を選択</button>
          <button type="button" class="type-picker-btn" data-scope="field">分野を選択</button>
        </div>
        <div class="chapter-select-grid" id="chapter-grid" hidden>${chapterCheckboxGrid(chapters, selected)}</div>
        <select id="field-select" hidden>
          ${data.config.fields.map((f) => `<option value="${f}">${f}</option>`).join("")}
        </select>

        <label class="field-label" for="rounds-input" style="margin-top:16px;">周回数</label>
        <input type="number" id="rounds-input" min="1" value="1" />

        <label class="field-label" for="start-date" style="margin-top:16px;">開始日</label>
        <input type="date" id="start-date" value="${todayStr()}" />
        <label class="field-label" for="end-date" style="margin-top:16px;">終了日</label>
        <input type="date" id="end-date" value="${addDays(todayStr(), 14)}" />

        <div class="button-row">
          <button type="button" class="btn-primary" id="save-btn">保存</button>
          <button type="button" class="btn-secondary" id="cancel-btn">キャンセル</button>
        </div>
      </section>
    `;

    let scopeMode = "all";
    const scopeBtns = [...container.querySelectorAll("#scope-picker .type-picker-btn")];
    const chapterGrid = container.querySelector("#chapter-grid");
    const fieldSelect = container.querySelector("#field-select");
    scopeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        scopeMode = btn.dataset.scope;
        scopeBtns.forEach((b) => b.classList.toggle("active", b === btn));
        chapterGrid.hidden = scopeMode !== "chapters";
        fieldSelect.hidden = scopeMode !== "field";
      });
    });

    container.querySelector("#save-btn").addEventListener("click", () => {
      let scope;
      if (scopeMode === "all") scope = { chapters: "all" };
      else if (scopeMode === "chapters") {
        const chs = [...container.querySelectorAll(".ch-checkbox")]
          .filter((c) => c.checked)
          .map((c) => Number(c.dataset.chapter));
        if (chs.length === 0) {
          alert("章を選択してください");
          return;
        }
        scope = { chapters: chs };
      } else {
        scope = { field: fieldSelect.value };
      }

      const rounds = Number(container.querySelector("#rounds-input").value) || 1;
      const endDate = container.querySelector("#end-date").value;
      if (!endDate) {
        alert("終了日を選択してください");
        return;
      }
      const label = container.querySelector("#goal-label").value.trim() || "期間目標";
      const targetPoints = scopeMaxPoints(scope, data) * rounds;
      addGoal({
        id: `goal-${Date.now()}`,
        type: "period",
        label,
        deadline: endDate,
        createdAt: Date.now(),
        target: { scope, rounds, targetPoints },
      });
      navigate("home");
    });
    container.querySelector("#cancel-btn").addEventListener("click", () => goTo("form-period-choice"));
  }

  function render() {
    if (step === "list") renderList();
    else if (step === "pick-type") renderPickType();
    else if (step === "form-exam") renderFormExam();
    else if (step === "form-mocktest-grade") renderFormMocktestGrade();
    else if (step === "form-mocktest") renderFormMocktest();
    else if (step === "form-rank") renderFormRank();
    else if (step === "form-period-choice") renderFormPeriodChoice();
    else if (step === "form-period-package") renderFormPeriodPackage();
    else if (step === "form-period-custom") renderFormPeriodCustom();
  }

  render();
}
