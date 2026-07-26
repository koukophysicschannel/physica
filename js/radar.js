// Minimal 5-axis radar chart, hand-rolled as inline SVG (no chart library).

// Side labels (text-anchor start/end) grow outward from their anchor point in
// only one direction, not centered like the top/bottom ones — the worst case
// ("電磁気 100") is ~57px wide at this font size, so the gap between the
// label anchor radius and the viewBox edge must be generously larger than
// that, not just a small fixed margin.
const SIZE = 400;
const CENTER = SIZE / 2;
const MAX_R = 115;
const LABEL_R = MAX_R + 15;
const RINGS = [25, 50, 75, 100];

function pointOn(angle, r) {
  return [CENTER + r * Math.sin(angle), CENTER - r * Math.cos(angle)];
}

export function renderRadarSVG(fields, valuesByField) {
  const n = fields.length;
  const angleStep = (Math.PI * 2) / n;

  const ringPolygons = RINGS.map((pct) => {
    const r = (pct / 100) * MAX_R;
    const pts = fields
      .map((_, i) => pointOn(i * angleStep, r).join(","))
      .join(" ");
    return `<polygon points="${pts}" class="radar-ring" />`;
  }).join("");

  const axisLines = fields
    .map((_, i) => {
      const [x, y] = pointOn(i * angleStep, MAX_R);
      return `<line x1="${CENTER}" y1="${CENTER}" x2="${x}" y2="${y}" class="radar-axis" />`;
    })
    .join("");

  const dataPts = fields
    .map((f, i) => {
      const v = Math.max(0, Math.min(100, valuesByField.get(f) ?? 0));
      const r = (v / 100) * MAX_R;
      return pointOn(i * angleStep, r).join(",");
    })
    .join(" ");

  const labels = fields
    .map((f, i) => {
      const [x, y] = pointOn(i * angleStep, LABEL_R);
      const anchor = Math.abs(x - CENTER) < 4 ? "middle" : x > CENTER ? "start" : "end";
      const v = valuesByField.get(f);
      const label = v === undefined ? f : `${f} ${Math.round(v)}`;
      return `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="middle" class="radar-label">${label}</text>`;
    })
    .join("");

  return `
    <svg viewBox="0 0 ${SIZE} ${SIZE}" class="radar-chart" role="img" aria-label="分野別予想得点レーダーチャート">
      ${ringPolygons}
      ${axisLines}
      <polygon points="${dataPts}" class="radar-data" />
      ${labels}
    </svg>
  `;
}
