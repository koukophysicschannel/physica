import {
  computeHeldByProblem,
  sumHeld,
  expectedScore,
  statsByField,
  currentRankInfo,
} from "./scoring.js";

// Builds every derived number the UI needs, for a single instant `now`.
// Nothing here is cached/stored — it is recomputed from tap history each call
// so that reload-from-history and continuous decay both fall out for free.
export function computeSnapshot(data, history, examSettings, now = Date.now()) {
  const { config, problems, leadalpha } = data;

  const heldMap = computeHeldByProblem(problems, history, config, now);
  const { held: totalHeld, max: totalMax } = sumHeld(heldMap, problems);
  const overallExpected = expectedScore(totalHeld, totalMax, config.conversion);

  const fieldStats = statsByField(problems, heldMap, config.fields);
  const fieldExpected = new Map();
  for (const [field, { held, max }] of fieldStats) {
    fieldExpected.set(field, expectedScore(held, max, config.conversion));
  }

  const rankInfo = currentRankInfo(totalMax, fieldStats, config.ranks);

  let exam = null;
  if (examSettings && Array.isArray(examSettings.chapters) && examSettings.chapters.length > 0) {
    const chapterSet = new Set(examSettings.chapters);
    const scoped = leadalpha.filter((p) => chapterSet.has(p.chapter));
    const { held, max } = sumHeld(heldMap, scoped);
    exam = {
      date: examSettings.date,
      chapters: examSettings.chapters,
      held,
      max,
      expected: expectedScore(held, max, config.conversion),
    };
  }

  return {
    now,
    heldMap,
    totalHeld,
    totalMax,
    overallExpected,
    fieldStats,
    fieldExpected,
    rankInfo,
    exam,
  };
}
