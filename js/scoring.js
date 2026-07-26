// Pure scoring/decay math. No DOM, no I/O — kept testable in isolation.

const MS_PER_DAY = 86400000;

// R(t) = floor + (1 - floor) * exp(-sqrt(t / tau))
export function retention(tDays, tau, floor) {
  const t = Math.max(tDays, 0);
  return floor + (1 - floor) * Math.exp(-Math.sqrt(t / tau));
}

export function heldValueForTaps(points, taps, now, decay) {
  let sum = 0;
  for (const ts of taps) {
    const tDays = (now - ts) / MS_PER_DAY;
    sum += points * retention(tDays, decay.tau, decay.floor);
  }
  return sum;
}

// { problemId -> { problem, points, taps, held } }
export function computeHeldByProblem(problems, history, config, now) {
  const map = new Map();
  for (const p of problems) {
    const points = config.points[p.categoryKey];
    const taps = history[p.id] || [];
    const held = heldValueForTaps(points, taps, now, config.decay);
    map.set(p.id, { problem: p, points, taps, held });
  }
  return map;
}

export function sumHeld(heldMap, problems) {
  let held = 0;
  let max = 0;
  for (const p of problems) {
    const entry = heldMap.get(p.id);
    held += entry.held;
    max += entry.points;
  }
  return { held, max };
}

// 予想得点 = 範囲内保持点 / (範囲内満点 * k) * 100, capped
export function expectedScore(held, max, conversion) {
  if (max <= 0) return 0;
  const raw = (held / (max * conversion.k)) * 100;
  return Math.min(raw, conversion.cap);
}

// 分野別の held/max。config.fields に含まれない分野（「考察」等）は除外する。
export function statsByField(problems, heldMap, fields) {
  const stats = new Map(fields.map((f) => [f, { held: 0, max: 0 }]));
  for (const p of problems) {
    const bucket = stats.get(p.field);
    if (!bucket) continue;
    const entry = heldMap.get(p.id);
    bucket.held += entry.held;
    bucket.max += entry.points;
  }
  return stats;
}

// 大学ランク判定: 5分野すべてがランク相当の水準を超えたときそのランクと認定。
// 分野ごとの held/max 比の最小値を全範囲満点に投影した値をランク境界(config.ranks[].score)と比較する。
export function currentRankInfo(totalMax, fieldStats, ranks) {
  let minRatio = Infinity;
  let weakestField = null;
  for (const [field, { held, max }] of fieldStats) {
    if (max <= 0) continue;
    const ratio = held / max;
    if (ratio < minRatio) {
      minRatio = ratio;
      weakestField = field;
    }
  }
  if (!Number.isFinite(minRatio)) minRatio = 0;

  const effectiveTotal = totalMax * minRatio;
  const sorted = [...ranks].sort((a, b) => b.score - a.score);

  let current = null;
  let next = null;
  for (let i = 0; i < sorted.length; i++) {
    if (effectiveTotal >= sorted[i].score) {
      current = sorted[i];
      next = i > 0 ? sorted[i - 1] : null;
      break;
    }
  }
  if (!current) {
    next = sorted[sorted.length - 1];
  }

  return {
    effectiveTotal,
    weakestField,
    current, // null if below lowest rank
    next, // null if already at top rank
    remainingToNext: next ? Math.max(next.score - effectiveTotal, 0) : 0,
  };
}

// タイル濃淡用: 直近タップからの保持率（0件なら null = 未着手）
export function lastTapRetention(taps, now, decay) {
  if (!taps || taps.length === 0) return null;
  const lastTs = Math.max(...taps);
  const tDays = (now - lastTs) / MS_PER_DAY;
  return retention(tDays, decay.tau, decay.floor);
}
