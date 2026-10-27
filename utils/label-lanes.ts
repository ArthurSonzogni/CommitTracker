// Places the labels of vertical marker lines in horizontal lanes, so that they
// don't overlap, without stacking them needlessly: from left to right, each
// label takes the first lane where it fits, on the right of its line, or else
// on its left. A label avoids crossing the other lines when it can.
export function labelLanes(
  markers: { x: number; width: number }[],
  chartWidth: number,
  gap = 4,
): { lane: number; anchor: "start" | "end" }[] {
  const order = markers.map((_, i) => i).sort((a, b) => markers[a].x - markers[b].x);
  const lanes: [number, number][][] = [];
  const result = new Array(markers.length);

  const candidates = (marker: { x: number; width: number }) => [
    { anchor: "start" as const, from: marker.x + gap, to: marker.x + gap + marker.width },
    { anchor: "end" as const, from: marker.x - gap - marker.width, to: marker.x - gap },
  ].filter(c => c.from >= 0 && c.to <= chartWidth);

  const crossesLine = (i: number, from: number, to: number) =>
    markers.some((other, j) => j !== i && other.x > from - gap && other.x < to + gap);

  const free = (lane: number, from: number, to: number) =>
    (lanes[lane] || []).every(([a, b]) => to + gap <= a || from >= b + gap);

  for (const i of order) {
    let placed = false;
    for (const strict of [true, false]) {
      for (let lane = 0; lane <= lanes.length && !placed; lane++) {
        for (const c of candidates(markers[i])) {
          if (strict && crossesLine(i, c.from, c.to)) continue;
          if (!free(lane, c.from, c.to)) continue;
          (lanes[lane] ||= []).push([c.from, c.to]);
          result[i] = { lane, anchor: c.anchor };
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
    // Wider than the chart: on its own lane.
    if (!placed) {
      lanes.push([[0, chartWidth]]);
      result[i] = { lane: lanes.length - 1, anchor: markers[i].x > chartWidth / 2 ? "end" : "start" };
    }
  }
  return result;
}
