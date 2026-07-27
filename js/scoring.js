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

// 同日タップ制限用: 直近タップが「今日」(端末ローカル時刻の0時切り替わり)かどうか。
// 長押し取り消しで直近タップが消えれば、残る最新タップは別日になるため自然に再タップ可能になる。
export function hasTappedToday(taps, now) {
  if (!taps || taps.length === 0) return false;
  const last = new Date(Math.max(...taps));
  const today = new Date(now);
  return (
    last.getFullYear() === today.getFullYear() &&
    last.getMonth() === today.getMonth() &&
    last.getDate() === today.getDate()
  );
}

// 目標(goal)のscopeを実問題配列に解決する。
// chapters系はリードα(章番号を持つのはリードαのみ)、field系はリードα・重問両方から集める。
export function resolveScope(scope, problems) {
  if (!scope) return [];
  if (scope.chapters === "all") {
    return problems.filter((p) => p.source === "leadalpha");
  }
  if (Array.isArray(scope.chapters)) {
    const set = new Set(scope.chapters);
    return problems.filter((p) => p.source === "leadalpha" && set.has(p.chapter));
  }
  if (scope.field) {
    return problems.filter((p) => p.field === scope.field);
  }
  return [];
}

// period目標の進捗用: 指定期間内のタップのみを対象に、減衰を無視した生配点を合計する。
export function rawPointsInWindow(problems, history, config, sinceTs, now) {
  let sum = 0;
  for (const p of problems) {
    const points = config.points[p.categoryKey];
    const taps = history[p.id] || [];
    for (const ts of taps) {
      if (ts >= sinceTs && ts <= now) sum += points;
    }
  }
  return sum;
}

// 分野別カバー率: 一度でも解いた問題数 ÷ 総問題数 × 100（配点ではなく問題数ベース、減衰非依存）。
// config.fields に含まれない分野（「考察」等）は statsByField 同様に除外する。
export function coverageByField(problems, history, fields) {
  const stats = new Map(fields.map((f) => [f, { solved: 0, total: 0 }]));
  for (const p of problems) {
    const bucket = stats.get(p.field);
    if (!bucket) continue;
    bucket.total += 1;
    const taps = history[p.id];
    if (taps && taps.length > 0) bucket.solved += 1;
  }
  const coverage = new Map();
  for (const [field, { solved, total }] of stats) {
    coverage.set(field, total > 0 ? (solved / total) * 100 : 0);
  }
  return coverage;
}

// パッケージ(period目標+packageId)の日割りエンジン。
// 総ノルマ=問題数×周回。連打での水増しを防ぐため、問題ごとにタップ数をroundsで頭打ちにする。
export function packageProgress(scopeProblems, history, goal, decay, now) {
  const rounds = goal.target.rounds;
  const sinceTs = goal.createdAt;
  const totalUnits = scopeProblems.length * rounds;

  let earnedUnits = 0;
  const remaining = [];
  for (const p of scopeProblems) {
    const taps = (history[p.id] || []).filter((ts) => ts >= sinceTs && ts <= now);
    const count = Math.min(taps.length, rounds);
    earnedUnits += count;
    if (count < rounds) remaining.push(p);
  }
  const remainingUnits = totalUnits - earnedUnits;

  const deadlineTs = new Date(`${goal.deadline}T00:00:00`).getTime();
  const remainingDays = Math.max(Math.ceil((deadlineTs - now) / MS_PER_DAY), 1);
  const todayQuota = remainingUnits > 0 ? Math.ceil(remainingUnits / remainingDays) : 0;

  const sorted = remaining
    .map((p) => ({ p, retention: lastTapRetention(history[p.id], now, decay) ?? 0 }))
    .sort((a, b) => a.retention - b.retention)
    .map((x) => x.p);
  const todayProblems = sorted.slice(0, todayQuota);

  return {
    totalUnits,
    earnedUnits,
    remainingUnits,
    remainingDays,
    todayQuota,
    todayProblems,
    complete: remainingUnits <= 0,
  };
}
