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

// v2の旧4ランク制(label+score)から8Tier制(tier+score+universities)への
// 一度きりの移行。既存のrank目標が指していたlabelはもう存在しないので、
// スコアが最も近い新Tierの先頭大学へ差し替える。新形式のrankLabel(実在する
// 大学名)を指している目標はそのまま素通りするので、何度呼んでも安全。
const LEGACY_RANK_NEAREST_TIER = {
  "東大・京大": 2,
  "早慶・旧帝": 4,
  "MARCH・地方国立": 6,
  "日東駒専・地方私立": 8,
};

// 大学名の略称・旧称 → 正式名称の読み替え。ドロップダウンには正式名称しか
// 出てこないが、旧バックアップの手動編集・インポートや今後の改称
// (東京工業大学→東京科学大学など)に備えて、実在しない旧表記を見つけたら
// 正式名称へ差し替える。正式名称を指している目標はそのまま素通りする。
const UNIVERSITY_RENAMES = {
  東工大: "東京科学大学(理)",
  東京工業大学: "東京科学大学(理)",
  阪大: "大阪大学",
  京大: "京都大学",
  東大: "東京大学",
  早稲田: "早稲田大学",
  東北: "東北大学",
  慶應: "慶應義塾大学",
  慶応: "慶應義塾大学",
  理科大理: "東京理科大学(理)",
  理科大工: "東京理科大学(工)",
  上智: "上智大学",
  名古屋: "名古屋大学",
  横国: "横浜国立大学",
  千葉: "千葉大学",
  立教: "立教大学",
  神戸: "神戸大学",
  お茶女: "お茶の水女子大学",
  埼玉: "埼玉大学",
  横市: "横浜市立大学",
  筑波: "筑波大学",
  青学: "青山学院大学",
  中央: "中央大学",
  北海道: "北海道大学",
  九州: "九州大学",
  農工: "東京農工大学",
  金沢: "金沢大学",
  広島: "広島大学",
  明治: "明治大学",
  学習院: "学習院大学",
  海洋大: "東京海洋大学",
  信州: "信州大学",
  都立: "東京都立大学",
  電通: "電気通信大学",
  法政: "法政大学",
  芝浦工業: "芝浦工業大学",
  東京都市: "東京都市大学",
  東京電機: "東京電機大学",
  工学院: "工学院大学",
  日大: "日本大学",
  東洋: "東洋大学",
};

export function migrateRenamedUniversities() {
  const goals = loadGoals();
  let changed = false;
  const migrated = goals.map((g) => {
    if (g.type !== "rank") return g;
    const newName = UNIVERSITY_RENAMES[g.target?.rankLabel];
    if (!newName) return g;
    changed = true;
    return { ...g, label: `志望: ${newName}`, target: { rankLabel: newName } };
  });
  if (changed) saveGoals(migrated);
}

export function migrateLegacyRankGoals(ranksConfig) {
  const allUniversities = new Set(ranksConfig.flatMap((r) => r.universities));
  const goals = loadGoals();
  let changed = false;

  const migrated = goals.map((g) => {
    if (g.type !== "rank" || allUniversities.has(g.target?.rankLabel)) return g;
    const tierNum = LEGACY_RANK_NEAREST_TIER[g.target?.rankLabel];
    const tier = ranksConfig.find((r) => r.tier === tierNum) ?? ranksConfig[ranksConfig.length - 1];
    const university = tier.universities[0];
    changed = true;
    return { ...g, label: `志望: ${university}`, target: { rankLabel: university } };
  });

  if (changed) saveGoals(migrated);
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
