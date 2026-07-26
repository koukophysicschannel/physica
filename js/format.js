export function formatFixed(value, decimals) {
  return value.toFixed(decimals);
}

export function daysUntil(dateStr, now = Date.now()) {
  const target = new Date(`${dateStr}T00:00:00`).getTime();
  return Math.ceil((target - now) / 86400000);
}

// 締切なし(null、志望ランク等の長期目標)は常に一覧の最後に来るようソートする
export function deadlineSortKey(goal) {
  return goal.deadline ? new Date(`${goal.deadline}T00:00:00`).getTime() : Infinity;
}

// <input type="date"> はローカル日付を返すため、こちらもtoISOStringのUTC変換を避けて
// ローカルのY-M-D文字列を組み立てる(HANDOFF.mdに記載のタイムゾーン既知の注意点)。
export function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
