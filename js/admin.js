// 管理者用の問題評価ページ(admin.html)。ナビからはリンクしない隠しページで、
// URL直打ちでのみ到達する。スマホでの片手操作(通勤中の評価作業)を最優先に設計。
//
// 評価はここではlocalStorageの下書き(ratings-admin state)にのみ保存され、
// アプリ本体の採点・選問には影響しない。「ratings.jsonをエクスポート」で
// ダウンロードしたファイルを data/ratings.json に置いて
// build/build_problems.py を再実行して初めて、problems.json 経由でアプリに反映される。
import { loadData } from "./data.js";
import { loadRatingsAdminState, saveRatingsAdminState } from "./storage.js";

function problemMetaLabel(p) {
  if (p.source === "leadalpha") {
    const catLabel = p.categoryKey === "基礎CHECK" ? "基礎CHECK" : `${p.categoryKey}${p.number}`;
    return `リードα 第${p.chapter}章 ${catLabel}`;
  }
  return `重問 ${p.field} ${p.categoryKey}${p.num}`;
}

function buildFilterOptions(data) {
  const options = [{ value: "all", label: "全て" }];
  const chapters = [...new Set(data.leadalpha.map((p) => p.chapter))].sort((a, b) => a - b);
  for (const ch of chapters) options.push({ value: `ch-${ch}`, label: `リードα 第${ch}章` });
  const fields = [...data.config.fields, "考察"];
  for (const f of fields) {
    if (data.juyomon.some((p) => p.field === f)) options.push({ value: `field-${f}`, label: `重問 ${f}` });
  }
  return options;
}

function filterProblems(data, filterValue) {
  if (filterValue.startsWith("ch-")) {
    const ch = Number(filterValue.slice(3));
    return data.leadalpha.filter((p) => p.chapter === ch);
  }
  if (filterValue.startsWith("field-")) {
    const field = filterValue.slice(6);
    return data.juyomon.filter((p) => p.field === field);
  }
  return data.problems;
}

function ratingFor(draft, problem) {
  return draft[problem.id] ?? problem.rating ?? { stars: 2, skip: false };
}

function firstUnvisitedIndex(list, draft) {
  const idx = list.findIndex((p) => !(p.id in draft));
  return idx === -1 ? 0 : idx;
}

export async function mountAdmin(container) {
  const data = await loadData();
  const state = loadRatingsAdminState();

  // problems.json に既に焼き込まれている(=前回のratings.json→ビルドで確定済みの)
  // 非デフォルト評価を下書きへ種付けする。これにより、別端末・ビルド後の再訪問でも
  // 進捗表示と「次へ」の再開位置が最初から正しくなる。
  for (const p of data.problems) {
    if (!(p.id in state.draft) && (p.rating.stars !== 2 || p.rating.skip)) {
      state.draft[p.id] = { stars: p.rating.stars, skip: p.rating.skip };
    }
  }

  let workingList = filterProblems(data, state.filter);
  if (state.index == null || state.index > workingList.length) state.index = 0;

  const filterOptions = buildFilterOptions(data);

  container.innerHTML = `
    <div class="admin-progress" id="admin-progress"></div>

    <div class="admin-filter-row">
      <select id="admin-filter-select">
        ${filterOptions
          .map((o) => `<option value="${o.value}" ${o.value === state.filter ? "selected" : ""}>${o.label}</option>`)
          .join("")}
      </select>
    </div>

    <div class="admin-card" id="admin-card"></div>

    <div class="admin-action-bar">
      <div class="admin-star-row">
        <button type="button" class="admin-star-btn" data-stars="1">★1</button>
        <button type="button" class="admin-star-btn" data-stars="2">★2</button>
        <button type="button" class="admin-star-btn" data-stars="3">★3</button>
      </div>
      <button type="button" class="admin-skip-btn" id="admin-skip-btn">この問題はスキップ可にする</button>
      <div class="admin-nav-row">
        <button type="button" id="admin-prev">← 前へ</button>
        <span class="admin-position" id="admin-position"></span>
        <button type="button" id="admin-next">次へ →</button>
      </div>
    </div>

    <div class="admin-io-row">
      <button type="button" class="btn-secondary" id="admin-export">ratings.jsonをエクスポート</button>
      <button type="button" class="btn-secondary" id="admin-import">ratings.jsonをインポート</button>
      <input type="file" id="admin-import-file" accept="application/json" hidden />
    </div>
  `;

  const progressEl = container.querySelector("#admin-progress");
  const cardEl = container.querySelector("#admin-card");
  const positionEl = container.querySelector("#admin-position");
  const filterSelect = container.querySelector("#admin-filter-select");

  function persist() {
    saveRatingsAdminState(state);
  }

  function render() {
    const total = data.problems.length;
    const done = Object.keys(state.draft).length;
    progressEl.textContent = `評価済み ${done} / ${total}`;

    if (workingList.length === 0) {
      cardEl.innerHTML = `<p>この絞り込みには問題がありません。</p>`;
      positionEl.textContent = "";
      return;
    }
    if (state.index >= workingList.length) {
      cardEl.innerHTML = `<p class="admin-done">この範囲は最後まで評価しました。</p>`;
      positionEl.textContent = `${workingList.length} / ${workingList.length}`;
      return;
    }
    const p = workingList[state.index];
    const rating = ratingFor(state.draft, p);
    cardEl.innerHTML = `
      <div class="admin-problem-meta">${problemMetaLabel(p)}</div>
      <div class="admin-problem-title">${p.title}</div>
      <div class="admin-current-rating">現在: ★${rating.stars}${rating.skip ? " ・ スキップ可" : ""}</div>
    `;
    positionEl.textContent = `${state.index + 1} / ${workingList.length}`;
  }

  function setRating(stars, skip) {
    if (state.index >= workingList.length) return;
    const p = workingList[state.index];
    state.draft[p.id] = { stars, skip };
    state.index += 1;
    persist();
    render();
  }

  container.querySelectorAll(".admin-star-btn").forEach((btn) => {
    btn.addEventListener("click", () => setRating(Number(btn.dataset.stars), false));
  });

  container.querySelector("#admin-skip-btn").addEventListener("click", () => setRating(2, true));

  container.querySelector("#admin-prev").addEventListener("click", () => {
    if (state.index > 0) {
      state.index -= 1;
      persist();
      render();
    }
  });
  container.querySelector("#admin-next").addEventListener("click", () => {
    if (state.index < workingList.length) {
      state.index += 1;
      persist();
      render();
    }
  });

  filterSelect.addEventListener("change", () => {
    state.filter = filterSelect.value;
    workingList = filterProblems(data, state.filter);
    state.index = firstUnvisitedIndex(workingList, state.draft);
    persist();
    render();
  });

  container.querySelector("#admin-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state.draft, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ratings.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  const fileInput = container.querySelector("#admin-import-file");
  container.querySelector("#admin-import").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      state.draft = imported;
      state.index = firstUnvisitedIndex(workingList, state.draft);
      persist();
      render();
    } catch (e) {
      alert(`インポートに失敗しました: ${e.message}`);
    }
    fileInput.value = "";
  });

  render();
}

mountAdmin(document.getElementById("admin-view"));
