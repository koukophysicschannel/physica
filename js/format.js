export function formatFixed(value, decimals) {
  return value.toFixed(decimals);
}

export function daysUntil(dateStr, now = Date.now()) {
  const target = new Date(`${dateStr}T00:00:00`).getTime();
  return Math.ceil((target - now) / 86400000);
}
