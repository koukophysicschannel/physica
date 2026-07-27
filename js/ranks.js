// Shared helpers for the 8-tier university rank system (config.json's "ranks":
// [{ tier, score, universities: [...] }, ...]). A goal's target.rankLabel
// stores a specific university name; its tier/score threshold is looked up
// here rather than stored, so editing config.json (add/move a university,
// retune a tier's score) takes effect immediately without touching goal data.

export function findTierForUniversity(ranks, universityName) {
  return ranks.find((r) => r.universities.includes(universityName)) ?? null;
}

export function universityOptionsHtml(ranks) {
  return [...ranks]
    .sort((a, b) => a.tier - b.tier)
    .map(
      (r) => `
        <optgroup label="Tier${r.tier}(${r.score}点)">
          ${r.universities.map((u) => `<option value="${u}">${u}</option>`).join("")}
        </optgroup>
      `
    )
    .join("");
}
