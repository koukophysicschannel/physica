import {
  computeHeldByProblem,
  sumHeld,
  expectedScore,
  statsByField,
  currentRankInfo,
  coverageByField,
  resolveScope,
  rawPointsInWindow,
  packageProgress,
} from "./scoring.js";

// Builds every derived number the home screen needs, for a single instant `now`.
// Nothing here is cached/stored — it is recomputed from tap history each call
// so that reload-from-history and continuous decay both fall out for free.
export function computeSnapshot(data, history, now = Date.now()) {
  const { config, problems } = data;

  const heldMap = computeHeldByProblem(problems, history, config, now);
  const { held: totalHeld, max: totalMax } = sumHeld(heldMap, problems);
  const overallExpected = expectedScore(totalHeld, totalMax, config.conversion);

  const fieldStats = statsByField(problems, heldMap, config.fields);
  const fieldExpected = new Map();
  for (const [field, { held, max }] of fieldStats) {
    fieldExpected.set(field, expectedScore(held, max, config.conversion));
  }
  const fieldCoverage = coverageByField(problems, history, config.fields);

  const rankInfo = currentRankInfo(totalMax, fieldStats, config.ranks);

  return {
    now,
    heldMap,
    totalHeld,
    totalMax,
    overallExpected,
    fieldStats,
    fieldExpected,
    fieldCoverage,
    rankInfo,
  };
}

// Per-goal derived values, dispatched by goal.type. Reuses the overall
// snapshot's heldMap (computed once per tick) rather than recomputing decay
// for every goal card.
export function computeGoalSnapshot(goal, data, overallSnap, history, now) {
  const { config, problems } = data;
  const { heldMap } = overallSnap;

  switch (goal.type) {
    case "exam": {
      const scoped = resolveScope(goal.target, problems);
      const { held, max } = sumHeld(heldMap, scoped);
      return { held, max, expected: expectedScore(held, max, config.conversion) };
    }
    case "mocktest": {
      const scoped = resolveScope(goal.target, problems);
      const { held, max } = sumHeld(heldMap, scoped);
      const finish = expectedScore(held, max, config.conversion);
      const fieldStats = statsByField(scoped, heldMap, config.fields);
      const fieldFinish = new Map();
      for (const [field, { held: h, max: m }] of fieldStats) {
        fieldFinish.set(field, expectedScore(h, m, config.conversion));
      }
      const fieldCoverage = coverageByField(scoped, history, config.fields);
      return { held, max, finish, fieldFinish, fieldCoverage };
    }
    case "rank": {
      const targetRank = config.ranks.find((r) => r.label === goal.target.rankLabel) ?? null;
      const { effectiveTotal, weakestField } = overallSnap.rankInfo;
      const remaining = targetRank ? Math.max(targetRank.score - effectiveTotal, 0) : 0;
      const achieved = targetRank ? effectiveTotal >= targetRank.score : false;
      return { targetRank, effectiveTotal, weakestField, remaining, achieved };
    }
    case "period": {
      const scope = resolveScope(goal.target.scope, problems);
      const earned = rawPointsInWindow(scope, history, config, goal.createdAt, now);
      const targetPoints = goal.target.targetPoints;
      const progressPct = targetPoints > 0 ? Math.min(100, (earned / targetPoints) * 100) : 0;
      const remainingPoints = Math.max(targetPoints - earned, 0);
      const result = { earned, targetPoints, progressPct, remainingPoints };
      if (goal.target.packageId) {
        result.package = packageProgress(scope, history, goal, config.decay, now);
      }
      return result;
    }
    default:
      return null;
  }
}
