import { saveProfile, addGoal, markOnboardingDone } from "../storage.js";
import { getDeferredPrompt, clearDeferredPrompt, isStandalone, isIOS, isAndroid } from "../installPrompt.js";
import { GRADE_ORDER, GRADE_LABELS } from "../grades.js";
import { universityOptionsHtml } from "../ranks.js";

function shareIconSVG() {
  return `
    <svg viewBox="0 0 40 40" class="onboarding-step-icon" aria-hidden="true">
      <rect x="9" y="16" width="22" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2" />
      <line x1="20" y1="4" x2="20" y2="22" stroke="currentColor" stroke-width="2" />
      <polyline points="13,10 20,3 27,10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}

function addHomeIconSVG() {
  return `
    <svg viewBox="0 0 40 40" class="onboarding-step-icon" aria-hidden="true">
      <rect x="5" y="5" width="30" height="30" rx="8" fill="none" stroke="currentColor" stroke-width="2" />
      <line x1="20" y1="13" x2="20" y2="27" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <line x1="13" y1="20" x2="27" y2="20" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  `;
}

export function mountOnboarding(container, ctx) {
  const { data, navigate } = ctx;
  const allSteps = ["welcome", "install", "grade", "rank", "finish"];
  const steps = isStandalone() ? allSteps.filter((s) => s !== "install") : allSteps;
  let index = 0;

  function dots() {
    const items = steps
      .map((_, i) => `<span class="onboarding-dot${i === index ? " active" : ""}"></span>`)
      .join("");
    return `<div class="onboarding-dots">${items}</div>`;
  }

  function advance() {
    index++;
    if (index >= steps.length) {
      markOnboardingDone();
      navigate("list");
      return;
    }
    render();
  }

  function renderWelcome() {
    container.innerHTML = `
      <div class="onboarding-screen">
        ${dots()}
        <div class="onboarding-title">PHYSICAへようこそ</div>
        <p class="onboarding-text">物理の問題を解くとタップした分だけ点数が加算され、時間の経過とともに少しずつ減っていきます。</p>
        <button type="button" class="btn-primary onboarding-main-btn" id="ob-next">次へ</button>
      </div>
    `;
    container.querySelector("#ob-next").addEventListener("click", advance);
  }

  function renderInstall() {
    const prompt = getDeferredPrompt();

    let body;
    if (isAndroid() && prompt) {
      body = `
        <p class="onboarding-text">ホーム画面に追加すると、次回からアイコンからすぐに開けるようになります。</p>
        <button type="button" class="btn-primary onboarding-main-btn" id="ob-install">ホーム画面に追加</button>
        <button type="button" class="onboarding-skip" id="ob-skip">あとで</button>
      `;
    } else if (isIOS()) {
      body = `
        <p class="onboarding-text">ホーム画面に追加すると、次回からアイコンからすぐに開けるようになります。</p>
        <div class="onboarding-steps">
          <div class="onboarding-step-row">${shareIconSVG()}<span>1. 共有ボタンをタップする</span></div>
          <div class="onboarding-step-row">${addHomeIconSVG()}<span>2.「ホーム画面に追加」をタップする</span></div>
        </div>
        <button type="button" class="btn-primary onboarding-main-btn" id="ob-next">次へ</button>
      `;
    } else {
      body = `
        <p class="onboarding-text">ブラウザのメニューから「ホーム画面に追加」または「アプリをインストール」を選択できます。</p>
        <button type="button" class="btn-primary onboarding-main-btn" id="ob-next">次へ</button>
      `;
    }

    container.innerHTML = `
      <div class="onboarding-screen">
        ${dots()}
        <div class="onboarding-title">ホーム画面に追加</div>
        ${body}
      </div>
    `;

    const installBtn = container.querySelector("#ob-install");
    if (installBtn) {
      installBtn.addEventListener("click", async () => {
        prompt.prompt();
        await prompt.userChoice;
        clearDeferredPrompt();
        advance();
      });
    }
    const skipBtn = container.querySelector("#ob-skip");
    if (skipBtn) skipBtn.addEventListener("click", advance);
    const nextBtn = container.querySelector("#ob-next");
    if (nextBtn) nextBtn.addEventListener("click", advance);
  }

  function renderGrade() {
    container.innerHTML = `
      <div class="onboarding-screen">
        ${dots()}
        <div class="onboarding-title">学年を選んでください</div>
        <p class="onboarding-text">模試の候補を絞り込むために使われます。</p>
        <div class="type-picker onboarding-choices grade-grid">
          ${GRADE_ORDER.map((g) => `<button type="button" class="type-picker-btn" data-grade="${g}">${GRADE_LABELS[g]}</button>`).join("")}
        </div>
        <button type="button" class="onboarding-skip" id="ob-skip">スキップ</button>
      </div>
    `;
    container.querySelectorAll("[data-grade]").forEach((btn) => {
      btn.addEventListener("click", () => {
        saveProfile({ grade: Number(btn.dataset.grade) });
        advance();
      });
    });
    container.querySelector("#ob-skip").addEventListener("click", advance);
  }

  function renderRank() {
    container.innerHTML = `
      <div class="onboarding-screen">
        ${dots()}
        <div class="onboarding-title">志望大学を選んでください</div>
        <p class="onboarding-text">選ぶと、目標として登録されます。</p>
        <select id="rank-select" class="onboarding-choices">
          ${universityOptionsHtml(data.config.ranks)}
        </select>
        <button type="button" class="btn-primary onboarding-main-btn" id="ob-next">決定</button>
        <button type="button" class="onboarding-skip" id="ob-skip">スキップ</button>
      </div>
    `;
    container.querySelector("#ob-next").addEventListener("click", () => {
      const rankLabel = container.querySelector("#rank-select").value;
      addGoal({
        id: `goal-${Date.now()}`,
        type: "rank",
        label: `志望: ${rankLabel}`,
        deadline: null,
        createdAt: Date.now(),
        target: { rankLabel },
      });
      advance();
    });
    container.querySelector("#ob-skip").addEventListener("click", advance);
  }

  function renderFinish() {
    container.innerHTML = `
      <div class="onboarding-screen">
        ${dots()}
        <div class="onboarding-title">準備ができました</div>
        <p class="onboarding-text">「問題」タブから問題をタップすると、点数が加算されます。</p>
        <p class="onboarding-text">間違えてタップしたら、長押しで取り消せます。</p>
        <button type="button" class="btn-primary onboarding-main-btn" id="ob-finish">問題リストを見る</button>
      </div>
    `;
    container.querySelector("#ob-finish").addEventListener("click", advance);
  }

  function render() {
    const step = steps[index];
    if (step === "welcome") renderWelcome();
    else if (step === "install") renderInstall();
    else if (step === "grade") renderGrade();
    else if (step === "rank") renderRank();
    else if (step === "finish") renderFinish();
  }

  render();
}
