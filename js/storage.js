// localStorage persistence. The only thing ever stored is tap history
// (plus goals and a tiny profile) — no derived scores are cached.

const HISTORY_KEY = "physica_tap_history_v1";
const EXAM_KEY = "physica_exam_settings_v1"; // legacy v1 key, migrated then unused
const GOALS_KEY = "physica_goals_v1";
const PROFILE_KEY = "physica_profile_v1";
const ONBOARDING_KEY = "physica_onboarding_done_v1";
const ANON_ID_KEY = "physica_anon_id_v1";

export function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function addTap(history, problemId, timestamp = Date.now()) {
  if (!history[problemId]) history[problemId] = [];
  history[problemId].push(timestamp);
  saveHistory(history);
  return history;
}

// 直近タップ1件を取り消す（誤タップ対策の長押し操作）
export function undoLastTap(history, problemId) {
  const taps = history[problemId];
  if (!taps || taps.length === 0) return history;
  taps.pop();
  if (taps.length === 0) delete history[problemId];
  saveHistory(history);
  return history;
}

export function loadGoals() {
  try {
    const raw = localStorage.getItem(GOALS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveGoals(goals) {
  localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
}

export function addGoal(goal) {
  const goals = loadGoals();
  goals.push(goal);
  saveGoals(goals);
  return goals;
}

export function deleteGoal(id) {
  const goals = loadGoals().filter((g) => g.id !== id);
  saveGoals(goals);
  return goals;
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

// v1 stored a single exam-mode setting directly; v2 folds it into the goals
// array as a type:"exam" goal. Runs once at startup and is a no-op after the
// legacy key is gone.
function examSettingsToGoal(examSettings) {
  return {
    id: `migrated-exam-${Date.now()}`,
    type: "exam",
    label: "定期考査",
    deadline: examSettings.date,
    createdAt: Date.now(),
    target: { chapters: examSettings.chapters },
  };
}

export function migrateLegacyExamSettings() {
  const raw = localStorage.getItem(EXAM_KEY);
  if (!raw) return;
  try {
    const examSettings = JSON.parse(raw);
    if (examSettings && Array.isArray(examSettings.chapters) && examSettings.chapters.length > 0) {
      addGoal(examSettingsToGoal(examSettings));
    }
  } finally {
    localStorage.removeItem(EXAM_KEY);
  }
}

// この端末をまたがずに識別するためだけの匿名ID。個人情報は含まない。
// エクスポートファイルに同梱し、複数の生徒から集めたバックアップを区別できるようにする。
export function getOrCreateAnonId() {
  let id = localStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}

export function exportData(config) {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    anonId: getOrCreateAnonId(),
    config,
    history: loadHistory(),
    goals: loadGoals(),
    profile: loadProfile(),
  };
}

export function importData(data) {
  if (!data || typeof data !== "object" || !data.history) {
    throw new Error("不正なデータ形式です");
  }
  saveHistory(data.history);
  if (Array.isArray(data.goals)) {
    saveGoals(data.goals);
  }
  if (data.profile) {
    saveProfile(data.profile);
  }
  // legacy (v1) backup file: fold its single exam setting into a goal
  if (data.examSettings && Array.isArray(data.examSettings.chapters)) {
    addGoal(examSettingsToGoal(data.examSettings));
  }
}

export function resetAll() {
  localStorage.removeItem(HISTORY_KEY);
  localStorage.removeItem(GOALS_KEY);
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(EXAM_KEY);
  localStorage.removeItem(ONBOARDING_KEY);
}

// 初回起動ウィザードの完了フラグ。タップ履歴・目標・学年のいずれも保存されていない
// 「未初期化」な状態かどうかは、このフラグの有無だけで判定する(何も選ばずスキップし
// 続けた場合でもウィザードを一度きりにするため)。
export function isOnboardingDone() {
  return localStorage.getItem(ONBOARDING_KEY) === "1";
}

export function markOnboardingDone() {
  localStorage.setItem(ONBOARDING_KEY, "1");
}

export function resetOnboarding() {
  localStorage.removeItem(ONBOARDING_KEY);
}
