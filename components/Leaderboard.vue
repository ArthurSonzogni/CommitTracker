<template>
  <div ref="container">
    <div class="form-row">
      <UiField>
        <UiSelect v-model="timeIndexModel">
          <option v-for="(d, i) in date" :key="i" :value="i">{{ d }} </option>
        </UiSelect>
      </UiField>
      <div class="form-row">
        <button type="button" class="button" @click="previous" :disabled="timeIndexModel == date.length - 1">
          Previous
        </button>
        <button type="button" class="button" @click="next" :disabled="timeIndexModel == 0">
          Next
        </button>
      </div>
      <UiField v-if="!is_animating && grouping != 'forever' && timeIndexModel > 0">
        <button type="button" @click="animate(false)" class="button is-success">
          Animate
        </button>
      </UiField>
      <UiField v-if="!is_animating && grouping != 'forever' && timeIndexModel > 0">
        <button type="button" @click="animate(true)" class="button is-warning">
          Animate with accumulation
        </button>
      </UiField>

      <UiField v-if="is_animating">
        <button type="button" @click="stop" class="button is-danger">
          Stop
        </button>
      </UiField>
    </div>

    <svg ref="svg_axis" width="100%" :height="31" class="sticky-top"></svg>
    <svg ref="svg" width="100%" :height="svgHeight"></svg>
    <svg ref="svg_title" width="100%" :height="80" class="sticky-bottom"> </svg>
  </div>
</template>

<script setup lang="ts">

import {axisTop} from "d3-axis";
import {format} from "d3-format";
import {scaleBand, scaleLinear} from "d3-scale";
import {select} from "d3-selection";
import "d3-transition";
import {transition} from "d3-transition";
import {range} from "d3-array";
import {easeCubicOut} from "d3-ease";

const { $usersInfo } = useNuxtApp();
const { $color } = useNuxtApp();

const timeIndexModel = defineModel<number>("timeIndex", { default: 0 });

const props = defineProps({
  type: { type: String, default: "commit" },
  repositories: { type: Array as () => string[], default: () => ["chromium"] },
  grouping: { type: String, default: "yearly" },
  kind: { type: String, default: "author" },
});

const container = ref<HTMLElement | null>(null);
const svg = ref<SVGSVGElement | null>(null);
const svg_axis = ref<SVGSVGElement | null>(null);
const svg_title = ref<SVGSVGElement | null>(null);

const take_n = 100;
const svgHeight = take_n * 50;
let scrollY = 0;
let windowHeight = 900;
let containerTop = 0;

const updateScrollMetrics = () => {
  if (typeof window === "undefined") return;
  scrollY = window.scrollY || window.pageYOffset || 0;
  windowHeight = window.innerHeight || 900;
  if (container.value) {
    const rect = container.value.getBoundingClientRect();
    containerTop = rect.top + scrollY;
  }
};

const getPeriodDuration = () => {
  switch (props.grouping) {
    case "monthly": return 400;
    case "quarterly": return 750;
    case "yearly": return 1400;
    default: return 1800;
  }
};

const STEP_DURATION = 420;    // ms for single-frame transitions
const RANK_OMEGA = 14;        // Critically-damped spring frequency for rank swaps
const OPACITY_OMEGA = 16;     // Critically-damped spring frequency for fade in/out

const date = ref<string[]>([]);
const is_animating = ref<boolean>(false);

let cachedSvgWidth = 800;
const svgWidth = () => cachedSvgWidth;

const yBand = scaleBand<number>()
  .domain(range(take_n + 1))
  .range([0, svgHeight - 60])
  .padding(0.1);
const rowStep = yBand.step();
const rowBandwidth = yBand.bandwidth();
const rowPaddingOffset = yBand(0) || 0;
const rankToY = (rank: number) => rowPaddingOffset + rank * rowStep;

const formatTick = (d: number) => format(".2s")(d).replace("G", "B");
const formatMetric = format(".3s");
const formatValue = (v: number) => {
  const rounded = Math.round(v);
  if (rounded < 100) {
    return String(rounded);
  }
  return formatMetric(rounded);
};

interface FrameData {
  date: string;
  users: [string, number][];
  valueMap: Map<string, number>;
}

interface BarRow {
  user: string;
  el: SVGGElement;
  rectEl: SVGRectElement;
  indexEl: SVGTextElement;
  nameEl: SVGTextElement;
  commitEl: SVGTextElement;
  rank: number;
  rankVel: number;
  targetRank: number;
  opacity: number;
  opacityVel: number;
  targetOpacity: number;
  value: number;
  startValue: number;
  targetValue: number;
  active: boolean;
  lastY: number;
  lastOpacity: number;
  lastWidth: number;
  lastTextX: number;
  lastAnchor: string;
  lastIndexText: string;
  lastCommitText: string;
}

// Frames sorted newest-first (matching `date.value` indices).
let framesDesc: FrameData[] = [];
let fetchGeneration = 0;
let updatingTimeIndexInternally = false;

// DOM groups & active row state.
let barsGroupEl: SVGGElement | null = null;
let axisGroupSel: any = null;
let axisStickyGroupSel: any = null;
const rows = new Map<string, BarRow>();
let hasRenderedOnce = false;
let currentDisplayedDate = "";
let currentMax = 1;

// Animation loop state.
let rafId: number | null = null;
let lastFrameTime = 0;
let animMode: "idle" | "step" | "playback" = "idle";

// State for "step" mode.
let stepStartTime = 0;
let stepFrame: FrameData | null = null;

// State for "playback" mode.
interface PlaybackTrack {
  user: string;
  values: Float64Array;
  tangents: Float64Array;
  currentVal: number;
}
let playbackStartTime = 0;
let playbackCursor = 0;
let playbackFrames: FrameData[] = [];
let playbackDateIndices: number[] = [];
let playbackTracks: PlaybackTrack[] = [];
let currentPlaybackDateIndex: number | null = null;
let contributionsByDate = new Map<string, [string, number][]>();

const mergeDataForRepositories = (repositoriesData: Record<string, Record<string, number>>[]) => {
  const out: Record<string, Record<string, number>> = Object.create(null);
  for (const data of repositoriesData) {
    for (const [developer, timevalue] of Object.entries(data)) {
      let devMap = out[developer];
      if (!devMap) {
        devMap = Object.create(null);
        out[developer] = devMap;
      }
      for (const [time, value] of Object.entries(timevalue)) {
        devMap[time] = (devMap[time] || 0) + value;
      }
    }
  }
  return out;
};

const CANDIDATE_LIMIT = take_n + 50; // Keep top 150 candidates per frame

const buildFramesByDate = (data: Record<string, Record<string, number>>): FrameData[] => {
  const byDate = new Map<string, [string, number][]>();
  for (const [user, timeValues] of Object.entries(data)) {
    for (const [d, val] of Object.entries(timeValues)) {
      if (!val) continue;
      let list = byDate.get(d);
      if (!list) {
        list = [];
        byDate.set(d, list);
      }
      list.push([user, val]);
    }
  }

  contributionsByDate = byDate;

  const sortedDates = Array.from(byDate.keys()).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  date.value = sortedDates;

  if (sortedDates.length === 0) {
    timeIndexModel.value = 0;
    return [];
  }

  const clampedIndex = Math.min(Math.max(timeIndexModel.value || 0, 0), sortedDates.length - 1);
  if (timeIndexModel.value !== clampedIndex) {
    updatingTimeIndexInternally = true;
    timeIndexModel.value = clampedIndex;
    nextTick(() => { updatingTimeIndexInternally = false; });
  }

  const out: FrameData[] = [];
  for (const d of sortedDates) {
    const allUsers = byDate.get(d) || [];
    allUsers.sort((a, b) => b[1] - a[1]);
    const users = allUsers.slice(0, CANDIDATE_LIMIT);
    const valueMap = new Map<string, number>();
    for (let i = 0; i < users.length; i++) {
      valueMap.set(users[i][0], users[i][1]);
    }
    out.push({
      date: d,
      users,
      valueMap,
    });
  }
  return out;
};

// Compute Fritsch-Carlson monotone cubic spline tangents for smooth C1 interpolation
// without overshooting or undershooting keyframe values.
const computeMonotoneTangents = (values: Float64Array): Float64Array => {
  const n = values.length;
  const tangents = new Float64Array(n);
  if (n <= 1) return tangents;
  if (n === 2) {
    const slope = values[1] - values[0];
    tangents[0] = slope;
    tangents[1] = slope;
    return tangents;
  }

  const deltas = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    deltas[i] = values[i + 1] - values[i];
  }

  tangents[0] = deltas[0];
  tangents[n - 1] = deltas[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (deltas[i - 1] * deltas[i] <= 0) {
      tangents[i] = 0;
    } else {
      tangents[i] = 0.5 * (deltas[i - 1] + deltas[i]);
    }
  }

  for (let i = 0; i < n - 1; i++) {
    const d = deltas[i];
    if (d === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
    } else {
      const a = tangents[i] / d;
      const b = tangents[i + 1] / d;
      const s = a * a + b * b;
      if (s > 9) {
        const tau = 3 / Math.sqrt(s);
        tangents[i] = tau * a * d;
        tangents[i + 1] = tau * b * d;
      }
    }
  }
  return tangents;
};

const evaluateHermite = (
  values: Float64Array,
  tangents: Float64Array,
  idx: number,
  s: number
): number => {
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  const v =
    h00 * values[idx] +
    h10 * tangents[idx] +
    h01 * values[idx + 1] +
    h11 * tangents[idx + 1];
  return v > 0 ? v : 0;
};

// Analytical step for a critically-damped spring:
// x'' + 2 * omega * x' + omega^2 * (x - target) = 0
const stepSpring = (
  pos: number,
  vel: number,
  target: number,
  omega: number,
  dt: number
): [number, number] => {
  const exp = Math.exp(-omega * dt);
  const delta = pos - target;
  const nextPos = target + (delta + (vel + omega * delta) * dt) * exp;
  const nextVel = (vel - (vel + omega * delta) * omega * dt) * exp;
  return [nextPos, nextVel];
};

const createRowElement = (user: string, initialRank: number, initialOpacity: number): BarRow => {
  const ns = "http://www.w3.org/2000/svg";
  const el = document.createElementNS(ns, "g");
  const initialY = rankToY(initialRank);
  el.setAttribute("transform", `translate(0, ${initialY.toFixed(2)})`);
  el.setAttribute("opacity", initialOpacity.toFixed(3));
  if (initialOpacity <= 0) {
    el.style.display = "none";
  }

  const rectEl = document.createElementNS(ns, "rect");
  rectEl.setAttribute("fill", $color(user));
  rectEl.setAttribute("opacity", "0.5");
  rectEl.setAttribute("rx", "4");
  rectEl.setAttribute("x", "25");
  rectEl.setAttribute("height", String(rowBandwidth));
  rectEl.setAttribute("width", "0");
  el.appendChild(rectEl);

  const indexEl = document.createElementNS(ns, "text");
  indexEl.setAttribute("class", "index");
  indexEl.setAttribute("fill", "black");
  indexEl.setAttribute("dx", "0");
  indexEl.setAttribute("dy", String(rowBandwidth / 2));
  indexEl.setAttribute("alignment-baseline", "middle");
  el.appendChild(indexEl);

  const nameEl = document.createElementNS(ns, "text");
  nameEl.setAttribute("class", "name");
  nameEl.setAttribute("fill", "black");
  nameEl.setAttribute("dy", "0.35em");
  nameEl.setAttribute("dx", "5");
  nameEl.setAttribute("y", "10");
  nameEl.textContent = user;
  el.appendChild(nameEl);

  const commitEl = document.createElementNS(ns, "text");
  commitEl.setAttribute("class", "commit");
  commitEl.setAttribute("fill", "gray");
  commitEl.setAttribute("dy", "0.35em");
  commitEl.setAttribute("dx", "5");
  commitEl.setAttribute("y", "30");
  commitEl.textContent = "0";
  el.appendChild(commitEl);

  barsGroupEl?.appendChild(el);

  return {
    user,
    el,
    rectEl,
    indexEl,
    nameEl,
    commitEl,
    rank: initialRank,
    rankVel: 0,
    targetRank: initialRank,
    opacity: initialOpacity,
    opacityVel: 0,
    targetOpacity: 1,
    value: 0,
    startValue: 0,
    targetValue: 0,
    active: true,
    lastY: NaN,
    lastOpacity: NaN,
    lastWidth: NaN,
    lastTextX: NaN,
    lastAnchor: "",
    lastIndexText: "",
    lastCommitText: "0",
  };
};

const updateTitle = (dateStr: string, immediate = false) => {
  if (!svg_title.value) return;
  const width = svgWidth();
  const titleSvg = select(svg_title.value);

  if (dateStr === currentDisplayedDate) {
    titleSvg.selectAll("text").attr("x", width - 10);
    return;
  }
  currentDisplayedDate = dateStr;

  const t = transition().duration(immediate ? 0 : 320).ease(easeCubicOut);

  titleSvg
    .selectAll("text")
    .data(dateStr ? [dateStr] : [], (d: any) => d)
    .join(
      enter => {
        const text = enter
          .append("text")
          .text(d => d)
          .attr("text-anchor", "end")
          .attr("x", width - 10)
          .attr("y", 80 - 32)
          .attr("transform", immediate ? "translate(0, 0)" : "translate(0, 28)")
          .attr("opacity", immediate ? 1 : 0)
          .attr("font-size", "2em");

        if (!immediate) {
          text
            .transition(t as any)
            .attr("transform", "translate(0, 0)")
            .attr("opacity", 1);
        }
        return text;
      },
      update => {
        return update
          .attr("x", width - 10)
          .attr("y", 80 - 32);
      },
      exit => {
        if (immediate) {
          return exit.remove();
        }
        return exit
          .transition(t as any)
          .attr("transform", "translate(0, -28)")
          .attr("opacity", 0)
          .remove();
      }
    );
};

let lastRenderedDomainMax = 0;
let lastRenderedSvgWidth = 0;

const renderAxes = (x: any, force = false) => {
  const width = svgWidth();
  const domainMax = Math.max(1, currentMax);
  if (
    !force &&
    width === lastRenderedSvgWidth &&
    lastRenderedDomainMax > 0 &&
    Math.abs(domainMax - lastRenderedDomainMax) / lastRenderedDomainMax < 0.005
  ) {
    return;
  }
  lastRenderedSvgWidth = width;
  lastRenderedDomainMax = domainMax;

  const tickCount = Math.max(2, width / 100);

  if (axisGroupSel) {
    const gridAxis = axisTop(x)
      .ticks(tickCount)
      .tickSizeOuter(0)
      .tickSizeInner(-svgHeight + 100)
      .tickFormat(formatTick as any);

    axisGroupSel.call(gridAxis);
    axisGroupSel.attr("opacity", 0.2);
  }

  if (axisStickyGroupSel) {
    const topAxis = axisTop(x).ticks(tickCount);
    axisStickyGroupSel.call(topAxis);
  }
};

// Update DOM attributes for all active and exiting rows for the current frame.
const flushDOM = (dt: number, immediate: boolean): boolean => {
  const width = svgWidth();
  const domainMax = Math.max(1, currentMax);
  const x = scaleLinear()
    .domain([0, domainMax])
    .range([25, width - 10]);

  const x0 = x(0);
  let allSettled = true;

  const BUFFER = 12;
  const viewTop = scrollY - containerTop;
  const viewBottom = viewTop + windowHeight;
  const minVisibleRank = Math.max(0, Math.floor(viewTop / rowStep) - BUFFER);
  const maxVisibleRank = Math.min(take_n + 1, Math.ceil(viewBottom / rowStep) + BUFFER);

  for (const [user, row] of rows.entries()) {
    if (immediate || dt <= 0) {
      row.rank = row.targetRank;
      row.rankVel = 0;
      row.opacity = row.targetOpacity;
      row.opacityVel = 0;
    } else {
      const [nextRank, nextRankVel] = stepSpring(
        row.rank,
        row.rankVel,
        row.targetRank,
        RANK_OMEGA,
        dt
      );
      row.rank = nextRank;
      row.rankVel = nextRankVel;

      const [nextOpacity, nextOpacityVel] = stepSpring(
        row.opacity,
        row.opacityVel,
        row.targetOpacity,
        OPACITY_OMEGA,
        dt
      );
      row.opacity = Math.max(0, Math.min(1, nextOpacity));
      row.opacityVel = nextOpacityVel;
    }

    if (!row.active && row.opacity < 0.01 && Math.abs(row.targetOpacity) < 0.01) {
      row.el.remove();
      rows.delete(user);
      continue;
    }

    const rankError = Math.abs(row.rank - row.targetRank);
    const opacityError = Math.abs(row.opacity - row.targetOpacity);
    if (rankError > 0.002 || opacityError > 0.005 || Math.abs(row.rankVel) > 0.01) {
      allSettled = false;
    } else {
      row.rank = row.targetRank;
      row.rankVel = 0;
      row.opacity = row.targetOpacity;
      row.opacityVel = 0;
    }

    // Viewport Culling: Only update DOM attributes if the row is within (or near) the visible viewport.
    const inViewport = immediate ||
      (row.rank >= minVisibleRank && row.rank <= maxVisibleRank) ||
      (row.targetRank >= minVisibleRank && row.targetRank <= maxVisibleRank);

    if (inViewport) {
      if (row.el.style.display === "none") {
        row.el.style.display = "";
      }
    } else {
      if (row.el.style.display !== "none") {
        row.el.style.display = "none";
      }
      continue;
    }

    const yPos = rankToY(row.rank);
    if (Math.abs(yPos - row.lastY) > 0.05 || isNaN(row.lastY)) {
      row.el.setAttribute("transform", `translate(0, ${yPos.toFixed(2)})`);
      row.lastY = yPos;
    }

    if (Math.abs(row.opacity - row.lastOpacity) > 0.005 || isNaN(row.lastOpacity)) {
      row.el.setAttribute("opacity", row.opacity.toFixed(3));
      row.lastOpacity = row.opacity;
    }

    const xVal = x(Math.max(0, row.value));
    const barWidth = Math.max(0, xVal - x0);
    if (Math.abs(barWidth - row.lastWidth) > 0.05 || isNaN(row.lastWidth)) {
      row.rectEl.setAttribute("width", barWidth.toFixed(2));
      row.lastWidth = barWidth;
    }

    const isShort = xVal < 80;
    const textX = xVal + (isShort ? 7 : -7);
    const anchor = isShort ? "start" : "end";

    if (Math.abs(textX - row.lastTextX) > 0.05 || isNaN(row.lastTextX)) {
      const textXStr = textX.toFixed(2);
      row.nameEl.setAttribute("x", textXStr);
      row.commitEl.setAttribute("x", textXStr);
      row.lastTextX = textX;
    }

    if (anchor !== row.lastAnchor) {
      row.nameEl.setAttribute("text-anchor", anchor);
      row.commitEl.setAttribute("text-anchor", anchor);
      row.lastAnchor = anchor;
    }

    const displayIndex = String(Math.max(1, Math.round(row.rank) + 1));
    if (displayIndex !== row.lastIndexText) {
      row.indexEl.textContent = displayIndex;
      row.lastIndexText = displayIndex;
    }

    const commitStr = formatValue(row.value);
    if (commitStr !== row.lastCommitText) {
      row.commitEl.textContent = commitStr;
      row.lastCommitText = commitStr;
    }
  }

  renderAxes(x);
  return allSettled;
};

const assignTargetRanks = (topUsers: [string, number][], enterImmediately: boolean) => {
  for (const row of rows.values()) {
    row.active = false;
  }

  const count = Math.min(take_n, topUsers.length);
  let maxVal = 0;

  for (let i = 0; i < count; i++) {
    const [user, val] = topUsers[i];
    if (val > maxVal) maxVal = val;

    let row = rows.get(user);
    if (!row) {
      const initialRank = enterImmediately ? i : take_n + 0.5;
      const initialOpacity = enterImmediately ? 1 : 0;
      row = createRowElement(user, initialRank, initialOpacity);
      rows.set(user, row);
    }
    row.active = true;
    row.targetRank = i;
    row.targetOpacity = 1;
    row.value = val;
  }

  for (const row of rows.values()) {
    if (!row.active) {
      row.targetRank = take_n + 1;
      row.targetOpacity = 0;
    }
  }

  currentMax = maxVal > 0 ? maxVal : 1;
};

const assignTargetRanksFromTracks = (topTracks: PlaybackTrack[], enterImmediately: boolean) => {
  for (const row of rows.values()) {
    row.active = false;
  }

  const count = Math.min(take_n, topTracks.length);
  let maxVal = 0;

  for (let i = 0; i < count; i++) {
    const track = topTracks[i];
    const user = track.user;
    const val = track.currentVal;
    if (val > maxVal) maxVal = val;

    let row = rows.get(user);
    if (!row) {
      const initialRank = enterImmediately ? i : take_n + 0.5;
      const initialOpacity = enterImmediately ? 1 : 0;
      row = createRowElement(user, initialRank, initialOpacity);
      rows.set(user, row);
    }
    row.active = true;
    row.targetRank = i;
    row.targetOpacity = 1;
    row.value = val;
  }

  for (const row of rows.values()) {
    if (!row.active) {
      row.targetRank = take_n + 1;
      row.targetOpacity = 0;
    }
  }

  currentMax = maxVal > 0 ? maxVal : 1;
};

const tick = (now: number) => {
  const rawDt = lastFrameTime ? (now - lastFrameTime) / 1000 : 1 / 60;
  const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
  lastFrameTime = now;

  if (animMode === "step" && stepFrame) {
    const elapsed = now - stepStartTime;
    const progress = Math.min(1, elapsed / STEP_DURATION);
    const eased = easeCubicOut(progress);

    const activeUsers: [string, number][] = [];
    for (const row of rows.values()) {
      row.value = row.startValue + (row.targetValue - row.startValue) * eased;
      if (row.active || row.value > 0.5) {
        activeUsers.push([row.user, row.value]);
      }
    }

    activeUsers.sort((a, b) => b[1] - a[1]);
    let maxVal = 0;
    for (let i = 0; i < activeUsers.length; i++) {
      const [user, val] = activeUsers[i];
      const row = rows.get(user)!;
      if (i < take_n && (row.targetValue > 0 || progress < 1)) {
        row.active = true;
        row.targetRank = i;
        row.targetOpacity = 1;
        if (val > maxVal) maxVal = val;
      } else {
        row.active = false;
        row.targetRank = take_n + 1;
        row.targetOpacity = 0;
      }
    }
    currentMax = maxVal > 0 ? maxVal : 1;

    const settled = flushDOM(dt, false);
    if (progress >= 1 && settled) {
      animMode = "idle";
      rafId = null;
      return;
    }
    rafId = requestAnimationFrame(tick);
    return;
  }

  if (animMode === "playback" && playbackFrames.length > 0) {
    const totalIntervals = Math.max(1, playbackFrames.length - 1);
    if (is_animating.value) {
      const elapsed = now - playbackStartTime;
      playbackCursor = Math.min(totalIntervals, Math.max(0, elapsed / getPeriodDuration()));
      if (playbackCursor >= totalIntervals) {
        is_animating.value = false;
      }
    }
    const cursor = playbackCursor;
    const finishedTime = !is_animating.value;

    const idx = Math.min(totalIntervals - 1, Math.floor(cursor));
    const alpha = cursor - idx;

    const displayIdx = alpha >= 0.5 ? idx + 1 : idx;
    const frameDate = playbackFrames[displayIdx].date;
    updateTitle(frameDate, false);

    currentPlaybackDateIndex = playbackDateIndices[displayIdx] ?? null;

    const activeTracks: PlaybackTrack[] = [];
    for (let i = 0; i < playbackTracks.length; i++) {
      const track = playbackTracks[i];
      const val = evaluateHermite(track.values, track.tangents, idx, alpha);
      if (val > 0) {
        track.currentVal = val;
        activeTracks.push(track);
      }
    }
    activeTracks.sort((a, b) => b.currentVal - a.currentVal);

    assignTargetRanksFromTracks(activeTracks, false);
    const settled = flushDOM(dt, false);

    if (finishedTime && settled) {
      animMode = "idle";
      rafId = null;
      if (currentPlaybackDateIndex !== null && timeIndexModel.value !== currentPlaybackDateIndex) {
        updatingTimeIndexInternally = true;
        timeIndexModel.value = currentPlaybackDateIndex;
        nextTick(() => { updatingTimeIndexInternally = false; });
      }
      return;
    }
    rafId = requestAnimationFrame(tick);
    return;
  }

  animMode = "idle";
  rafId = null;
};

const ensureRaf = () => {
  if (rafId === null) {
    lastFrameTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }
};

const transitionToFrame = (frame: FrameData | undefined) => {
  if (!frame) return;

  const isFirstRender = !hasRenderedOnce;
  hasRenderedOnce = true;

  updateTitle(frame.date, isFirstRender);

  const topSlice = frame.users.slice(0, take_n);

  if (isFirstRender) {
    assignTargetRanks(topSlice, true);
    for (const [user, val] of topSlice) {
      const row = rows.get(user);
      if (row) {
        row.value = val;
        row.startValue = val;
        row.targetValue = val;
      }
    }
    flushDOM(0, true);
    return;
  }

  // Mark existing rows with their start and target values.
  const topSet = new Set<string>();
  for (let i = 0; i < topSlice.length; i++) {
    const [user, val] = topSlice[i];
    topSet.add(user);
    let row = rows.get(user);
    if (!row) {
      row = createRowElement(user, take_n + 0.5, 0);
      row.value = 0;
      rows.set(user, row);
    }
    row.startValue = row.value;
    row.targetValue = val;
    row.active = true;
    row.targetRank = i;
    row.targetOpacity = 1;
  }

  for (const [user, row] of rows.entries()) {
    if (row.targetRank > 30 && row.rank > 30) {
      continue;
    }
    if (!topSet.has(user)) {
      row.startValue = row.value;
      row.targetValue = frame.valueMap.get(user) || 0;
      row.active = false;
      row.targetRank = take_n + 1;
      row.targetOpacity = 0;
    }
  }

  stepFrame = frame;
  stepStartTime = performance.now();
  animMode = "step";
  ensureRaf();
};

const loadData = async () => {
  is_animating.value = false;
  if ( animMode === "playback") {
    animMode = "idle";
  }
  const gen = ++fetchGeneration;
  const repoData = await Promise.all(
    props.repositories.map(repo =>
      $usersInfo(repo, props.type, props.grouping, props.kind)
    )
  );
  if (gen !== fetchGeneration) return;

  const merged = mergeDataForRepositories(repoData);
  framesDesc = buildFramesByDate(merged);

  if (framesDesc.length === 0) return;

  const idx = Math.min(Math.max(timeIndexModel.value || 0, 0), framesDesc.length - 1);
  transitionToFrame(framesDesc[idx]);
};

const animate = async (should_accumulate = false) => {
  if (is_animating.value) {
    stop();
    return;
  }

  if (framesDesc.length === 0) {
    await loadData();
  }
  if (framesDesc.length < 2) return;

  const startDescIdx = Math.min(
    framesDesc.length - 1,
    Math.max(1, timeIndexModel.value || 0)
  );

  // Build chronological sequence from startDescIdx down to 0 (newest).
  const chronoFrames: FrameData[] = [];
  const chronoDateIndices: number[] = [];

  if (should_accumulate) {
    const accu = new Map<string, number>();
    for (let dIdx = startDescIdx; dIdx >= 0; dIdx--) {
      const src = framesDesc[dIdx];
      const contribs = contributionsByDate.get(src.date) || src.users;
      for (let uIdx = 0; uIdx < contribs.length; uIdx++) {
        const [user, val] = contribs[uIdx];
        accu.set(user, (accu.get(user) || 0) + val);
      }
      const users: [string, number][] = Array.from(accu.entries());
      users.sort((a, b) => b[1] - a[1]);
      const topUsers = users.slice(0, CANDIDATE_LIMIT);
      const valueMap = new Map<string, number>(topUsers);
      chronoFrames.push({
        date: src.date,
        users: topUsers,
        valueMap,
      });
      chronoDateIndices.push(dIdx);
    }
  } else {
    for (let dIdx = startDescIdx; dIdx >= 0; dIdx--) {
      chronoFrames.push(framesDesc[dIdx]);
      chronoDateIndices.push(dIdx);
    }
  }

  // Collect candidate users: anyone in the top (take_n + 50) of any frame
  // in the sequence, plus any currently displayed users.
  const candidateLimit = CANDIDATE_LIMIT;
  const candidateSet = new Set<string>(rows.keys());
  for (let f = 0; f < chronoFrames.length; f++) {
    const uList = chronoFrames[f].users;
    const lim = Math.min(candidateLimit, uList.length);
    for (let i = 0; i < lim; i++) {
      candidateSet.add(uList[i][0]);
    }
  }

  const numFrames = chronoFrames.length;
  const tracks: PlaybackTrack[] = [];
  for (const user of candidateSet) {
    const values = new Float64Array(numFrames);
    let hasNonZero = false;
    for (let f = 0; f < numFrames; f++) {
      const v = chronoFrames[f].valueMap.get(user) || 0;
      values[f] = v;
      if (v > 0) hasNonZero = true;
    }
    if (!hasNonZero) continue;
    const tangents = computeMonotoneTangents(values);
    tracks.push({ user, values, tangents, currentVal: 0 });
  }

  // Initialize rows to the starting frame of the animation.
  const firstFrame = chronoFrames[0];
  assignTargetRanks(firstFrame.users.slice(0, take_n), false);
  updateTitle(firstFrame.date, false);

  currentPlaybackDateIndex = playbackDateIndices[0] ?? null;
  playbackFrames = chronoFrames;
  playbackDateIndices = chronoDateIndices;
  playbackTracks = tracks;
  playbackStartTime = performance.now();
  playbackCursor = 0;
  is_animating.value = true;
  animMode = "playback";
  ensureRaf();
};

const stop = () => {
  is_animating.value = false;
  if (currentPlaybackDateIndex !== null && timeIndexModel.value !== currentPlaybackDateIndex) {
    updatingTimeIndexInternally = true;
    timeIndexModel.value = currentPlaybackDateIndex;
    nextTick(() => { updatingTimeIndexInternally = false; });
  }
};

const previous = () => {
  if (is_animating.value) stop();
  timeIndexModel.value = Math.min((timeIndexModel.value || 0) + 1, date.value.length - 1);
};

const next = () => {
  if (is_animating.value) stop();
  timeIndexModel.value = Math.max((timeIndexModel.value || 0) - 1, 0);
};

let resizeObserver: ResizeObserver | null = null;

const onResize = () => {
  cachedSvgWidth = container.value?.clientWidth || 800;
  updateScrollMetrics();
  if (!hasRenderedOnce) return;
  if (currentDisplayedDate) {
    updateTitle(currentDisplayedDate, true);
  }
  flushDOM(0, false);
};

watch(
  [() => props.repositories, () => props.type, () => props.grouping, () => props.kind],
  () => {
    loadData();
  },
  { deep: true }
);

watch(timeIndexModel, (newIdx) => {
  if (updatingTimeIndexInternally || is_animating.value) return;
  if (framesDesc.length === 0) return;
  const clamped = Math.min(Math.max(newIdx || 0, 0), framesDesc.length - 1);
  transitionToFrame(framesDesc[clamped]);
});

onMounted(() => {
  updateScrollMetrics();
  window.addEventListener("scroll", updateScrollMetrics, { passive: true });
  if (container.value) {
    cachedSvgWidth = container.value.clientWidth || 800;
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0 && Math.abs(w - cachedSvgWidth) > 1) {
          cachedSvgWidth = w;
          onResize();
        }
      }
    });
    resizeObserver.observe(container.value);
  }
  if (svg.value) {
    barsGroupEl = select(svg.value).append("g").node();
    axisGroupSel = select(svg.value).append("g").classed("axis-grid", true);
  }
  if (svg_axis.value) {
    axisStickyGroupSel = select(svg_axis.value)
      .append("g")
      .attr("transform", "translate(0, 30)");
  }
  window.addEventListener("resize", onResize);
  loadData();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", onResize);
  window.removeEventListener("scroll", updateScrollMetrics);
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  for (const row of rows.values()) {
    row.el.remove();
  }
  rows.clear();
  framesDesc = [];
  playbackFrames = [];
  playbackTracks = [];
  contributionsByDate.clear();
});

</script>

<style scoped>

.svg {
  padding: 0;
  margin: 0;
}

svg :deep(.index),
svg :deep(.commit) {
  font-variant-numeric: tabular-nums;
}

svg :deep(.axis-grid .domain),
svg :deep(.axis-grid .tick:first-of-type text),
.sticky-top :deep(.domain) {
  display: none;
}

svg :deep(.axis-grid .tick line) {
  stroke: white;
}

.sticky-top {
  position: sticky;
  top: 0;
  background: var(--bg);
  z-index: 1;
}

.sticky-bottom {
  position: sticky;
  bottom: 0;
  pointer-events: none;
}

/* The year, shown while animating. */
.sticky-bottom :deep(text) {
  fill: var(--faint);
  font-family: var(--font-mono);
  font-weight: 500;
}
</style>
