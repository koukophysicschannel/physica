import { exportData, importData, resetAll, resetOnboarding, loadProfile, saveProfile } from "../storage.js";
import { GRADE_ORDER, GRADE_LABELS } from "../grades.js";

export function mountSettings(container, ctx) {
  const { data } = ctx;

  function render() {
    const profile = loadProfile();

    container.innerHTML = `
      <section class="card">
        <h2 class="card-title">学年</h2>
        <p class="settings-desc">模試・パッケージの候補を絞り込むために使われます。</p>
        <div class="type-picker grade-grid">
          ${GRADE_ORDER.map(
            (g) =>
              `<button type="button" class="type-picker-btn${profile?.grade === g ? " active" : ""}" data-grade="${g}">${GRADE_LABELS[g]}</button>`
          ).join("")}
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">初回ウィザード</h2>
        <p class="settings-desc">ようこそ画面・ホーム画面への追加案内・学年・志望ランクを選ぶ最初の案内を、もう一度表示します。</p>
        <div class="button-row">
          <button type="button" class="btn-secondary" id="redo-onboarding-btn">初回ウィザードをやり直す</button>
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">データのエクスポート/インポート</h2>
        <p class="settings-desc">タップ履歴をJSONファイルとして保存・読込できます。機種変更やブラウザデータ消失に備えて、定期的にエクスポートしておくことをおすすめします。</p>
        <div class="button-row">
          <button type="button" class="btn-primary" id="export-btn">エクスポート</button>
          <button type="button" class="btn-secondary" id="import-btn">インポート</button>
        </div>
        <input type="file" id="import-file" accept="application/json" style="display:none;" />
        <div id="import-status" class="settings-status"></div>
      </section>

      <section class="card">
        <h2 class="card-title">リセット</h2>
        <p class="settings-desc">すべてのタップ履歴と定期考査設定を削除します。この操作は取り消せません。</p>
        <div class="button-row">
          <button type="button" class="btn-danger" id="reset-step1">データをリセット</button>
        </div>
        <div id="reset-confirm" class="reset-confirm" hidden>
          <p>本当にすべてのデータを削除しますか?</p>
          <div class="button-row">
            <button type="button" class="btn-danger" id="reset-step2">完全に削除する</button>
            <button type="button" class="btn-secondary" id="reset-cancel">キャンセル</button>
          </div>
        </div>
      </section>
    `;

    container.querySelectorAll("[data-grade]").forEach((btn) => {
      btn.addEventListener("click", () => {
        saveProfile({ ...loadProfile(), grade: Number(btn.dataset.grade) });
        render();
      });
    });

    container.querySelector("#redo-onboarding-btn").addEventListener("click", () => {
      resetOnboarding();
      ctx.navigate("onboarding");
    });

    container.querySelector("#export-btn").addEventListener("click", () => {
      const exported = exportData(data.config);
      const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `physica-backup-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    const fileInput = container.querySelector("#import-file");
    const statusEl = container.querySelector("#import-status");

    container.querySelector("#import-btn").addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        importData(parsed);
        statusEl.textContent = "インポートが完了しました。";
        statusEl.classList.remove("error");
      } catch (e) {
        statusEl.textContent = `インポートに失敗しました: ${e.message}`;
        statusEl.classList.add("error");
      }
      fileInput.value = "";
    });

    const confirmBox = container.querySelector("#reset-confirm");
    container.querySelector("#reset-step1").addEventListener("click", () => {
      confirmBox.hidden = false;
    });
    container.querySelector("#reset-cancel").addEventListener("click", () => {
      confirmBox.hidden = true;
    });
    container.querySelector("#reset-step2").addEventListener("click", () => {
      resetAll();
      confirmBox.hidden = true;
      statusEl.textContent = "";
      alert("すべてのデータを削除しました。");
    });
  }

  render();
}
