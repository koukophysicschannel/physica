// localStorage persistence. The only thing ever stored is tap history
// (plus the small exam-mode setting) — no derived scores are cached.

const HISTORY_KEY = "physica_tap_history_v1";
const EXAM_KEY = "physica_exam_settings_v1";

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

export function loadExamSettings() {
  try {
    const raw = localStorage.getItem(EXAM_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveExamSettings(settings) {
  localStorage.setItem(EXAM_KEY, JSON.stringify(settings));
}

export function clearExamSettings() {
  localStorage.removeItem(EXAM_KEY);
}

export function exportData() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    history: loadHistory(),
    examSettings: loadExamSettings(),
  };
}

export function importData(data) {
  if (!data || typeof data !== "object" || !data.history) {
    throw new Error("不正なデータ形式です");
  }
  saveHistory(data.history);
  if (data.examSettings) {
    saveExamSettings(data.examSettings);
  }
}

export function resetAll() {
  localStorage.removeItem(HISTORY_KEY);
  localStorage.removeItem(EXAM_KEY);
}
