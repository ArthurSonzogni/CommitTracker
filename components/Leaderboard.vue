<template>
  <div ref="container">
    <div class="form-row">
      <UiField>
        <UiSelect v-model="timeIndexModel">
          <option v-for="(d, i) in date" :key="i" :value="i">{{ d }} </option>
        </UiSelect>
      </UiField>
      <div class="playback-nav">
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

import { format } from "d3-format";
import { scaleBand, scaleLinear } from "d3-scale";
import { range } from "d3-array";
import { callLeaderboardWorker } from "~/utils/leaderboardWorkerClient";

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

const SVG_NS = "http://www.w3.org/2000/svg";
const take_n = 100;
const svgHeight = take_n * 50;
const BUFFER = 12;

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

const getVisibleRankBounds = (): [number, number] => {
  const viewTop = scrollY - containerTop;
  const viewBottom = viewTop + windowHeight;
  const minRank = Math.max(0, Math.floor(viewTop / rowStep) - BUFFER);
  const maxRank = Math.min(take_n + 1, Math.ceil(viewBottom / rowStep) + BUFFER);
  return [minRank, maxRank];
};

const getPeriodDuration = () => {
  switch (props.grouping) {
    case "monthly": return 400;
    case "quarterly": return 750;
    case "yearly": return 1400;
    default: return 1800;
  }
};

const STEP_DURATION = 420;            // ms for single-frame transitions
const RANK_TRANSITION_S = 0.25;       // seconds for linear rank swap
const OPACITY_TRANSITION_S = 0.25;    // seconds for linear fade in/out

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
  valueMap: Map<string, number> | null;
}

const getFrameValueMap = (frame: FrameData): Map<string, number> => {
  if (!frame.valueMap) {
    const m = new Map<string, number>();
    for (let i = 0; i < frame.users.length; i++) {
      m.set(frame.users[i][0], frame.users[i][1]);
    }
    frame.valueMap = m;
  }
  return frame.valueMap;
};

interface BarRow {
  user: string;
  el: SVGGElement;
  rectEl: SVGRectElement;
  indexEl: SVGTextElement;
  labelGroupEl: SVGGElement;
  nameEl: SVGTextElement;
  commitEl: SVGTextElement;
  rank: number;
  startRank: number;
  targetRank: number;
  rankProgress: number;
  opacity: number;
  startOpacity: number;
  targetOpacity: number;
  opacityProgress: number;
  value: number;
  startValue: number;
  targetValue: number;
  active: boolean;
  visible: boolean;
  lastY: number;
  lastOpacity: number;
  lastWidth: number;
  lastTextX: number;
  lastAnchor: string;
  lastIndexText: string;
  lastCommitText: string;
}

const setRowTargets = (
  row: BarRow,
  nextRank: number,
  nextOpacity: number,
  immediate = false
) => {
  if (immediate) {
    row.rank = nextRank;
    row.startRank = nextRank;
    row.targetRank = nextRank;
    row.rankProgress = 1;
    row.opacity = nextOpacity;
    row.startOpacity = nextOpacity;
    row.targetOpacity = nextOpacity;
    row.opacityProgress = 1;
    return;
  }
  if (nextRank !== row.targetRank) {
    row.startRank = row.rank;
    row.targetRank = nextRank;
    row.rankProgress = Math.abs(nextRank - row.rank) < 0.001 ? 1 : 0;
  }
  if (nextOpacity !== row.targetOpacity) {
    row.startOpacity = row.opacity;
    row.targetOpacity = nextOpacity;
    row.opacityProgress = Math.abs(nextOpacity - row.opacity) < 0.001 ? 1 : 0;
  }
};

interface StickyTickItem {
  g: SVGGElement;
  text: SVGTextElement;
  lastX: number;
  lastLabel: string;
  visible: boolean;
}

interface GridTickItem {
  g: SVGGElement;
  lastX: number;
  visible: boolean;
}

// Frames sorted newest-first (matching `date.value` indices).
let framesDesc: FrameData[] = [];
let fetchGeneration = 0;
let activeLoadPromise: Promise<void> | null = null;
let updatingTimeIndexInternally = false;

// DOM groups & active row state.
let barsGroupEl: SVGGElement | null = null;
let axisGridGroupEl: SVGGElement | null = null;
let axisStickyGroupEl: SVGGElement | null = null;
const stickyTicks: StickyTickItem[] = [];
const gridTicks: GridTickItem[] = [];
const rows = new Map<string, BarRow>();
let hasRenderedOnce = false;
let currentDisplayedDate = "";
let activeTitleEl: SVGTextElement | null = null;
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
  currentVal: number;
}
let playbackStartTime = 0;
let playbackCursor = 0;
let playbackDates: string[] = [];
let playbackDateIndices: number[] = [];
let playbackTracks: PlaybackTrack[] = [];
let currentPlaybackDateIndex: number | null = null;

const createRowElement = (
  user: string,
  initialRank: number,
  initialOpacity: number,
  minVisibleRank: number,
  maxVisibleRank: number
): BarRow => {
  const el = document.createElementNS(SVG_NS, "g");
  const initialY = rankToY(initialRank);
  el.setAttribute("transform", `translate(0, ${initialY.toFixed(2)})`);
  el.setAttribute("opacity", initialOpacity.toFixed(3));

  const initiallyVisible =
    initialOpacity > 0 && initialRank >= minVisibleRank && initialRank <= maxVisibleRank;
  if (!initiallyVisible) {
    el.style.display = "none";
  }

  const rectEl = document.createElementNS(SVG_NS, "rect");
  rectEl.setAttribute("fill", $color(user));
  rectEl.setAttribute("opacity", "0.5");
  rectEl.setAttribute("rx", "4");
  rectEl.setAttribute("x", "25");
  rectEl.setAttribute("height", String(rowBandwidth));
  rectEl.setAttribute("width", "0");
  el.appendChild(rectEl);

  const indexEl = document.createElementNS(SVG_NS, "text");
  indexEl.setAttribute("class", "index");
  indexEl.setAttribute("dx", "0");
  indexEl.setAttribute("dy", String(rowBandwidth / 2));
  indexEl.setAttribute("alignment-baseline", "middle");
  el.appendChild(indexEl);

  const labelGroupEl = document.createElementNS(SVG_NS, "g");
  labelGroupEl.setAttribute("class", "labels");

  const nameEl = document.createElementNS(SVG_NS, "text");
  nameEl.setAttribute("class", "name");
  nameEl.setAttribute("dy", "0.35em");
  nameEl.setAttribute("dx", "5");
  nameEl.setAttribute("y", "10");
  nameEl.textContent = user;
  labelGroupEl.appendChild(nameEl);

  const commitEl = document.createElementNS(SVG_NS, "text");
  commitEl.setAttribute("class", "commit");
  commitEl.setAttribute("dy", "0.35em");
  commitEl.setAttribute("dx", "5");
  commitEl.setAttribute("y", "30");
  commitEl.textContent = "0";
  labelGroupEl.appendChild(commitEl);

  el.appendChild(labelGroupEl);
  barsGroupEl?.appendChild(el);

  return {
    user,
    el,
    rectEl,
    indexEl,
    labelGroupEl,
    nameEl,
    commitEl,
    rank: initialRank,
    startRank: initialRank,
    targetRank: initialRank,
    rankProgress: 1,
    opacity: initialOpacity,
    startOpacity: initialOpacity,
    targetOpacity: initialOpacity,
    opacityProgress: 1,
    value: 0,
    startValue: 0,
    targetValue: 0,
    active: true,
    visible: initiallyVisible,
    lastY: initialY,
    lastOpacity: initialOpacity,
    lastWidth: 0,
    lastTextX: NaN,
    lastAnchor: "",
    lastIndexText: "",
    lastCommitText: "0",
  };
};

const updateTitle = (dateStr: string, immediate = false) => {
  const titleSvg = svg_title.value;
  if (!titleSvg) return;
  const xPos = String(svgWidth() - 10);

  if (dateStr === currentDisplayedDate) {
    if (activeTitleEl) {
      activeTitleEl.setAttribute("x", xPos);
    }
    return;
  }
  currentDisplayedDate = dateStr;

  const prevEl = activeTitleEl;
  activeTitleEl = null;

  if (prevEl) {
    if (immediate || typeof prevEl.animate !== "function") {
      prevEl.remove();
    } else {
      const anim = prevEl.animate(
        [
          { transform: "translateY(0px)", opacity: 1 },
          { transform: "translateY(-28px)", opacity: 0 },
        ],
        { duration: 320, easing: "linear", fill: "forwards" }
      );
      anim.onfinish = () => prevEl.remove();
    }
  }

  if (!dateStr) return;

  const nextEl = document.createElementNS(SVG_NS, "text");
  nextEl.textContent = dateStr;
  nextEl.setAttribute("text-anchor", "end");
  nextEl.setAttribute("x", xPos);
  nextEl.setAttribute("y", String(80 - 32));
  nextEl.setAttribute("font-size", "2em");
  titleSvg.appendChild(nextEl);
  activeTitleEl = nextEl;

  if (!immediate && typeof nextEl.animate === "function") {
    nextEl.animate(
      [
        { transform: "translateY(28px)", opacity: 0 },
        { transform: "translateY(0px)", opacity: 1 },
      ],
      { duration: 320, easing: "linear" }
    );
  }
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
    Math.abs(domainMax - lastRenderedDomainMax) / lastRenderedDomainMax < 0.008
  ) {
    return;
  }
  lastRenderedSvgWidth = width;
  lastRenderedDomainMax = domainMax;

  const tickCount = Math.max(2, width / 100);
  const ticks: number[] = x.ticks(tickCount);
  const fmt = x.tickFormat(tickCount);
  const gridHeightStr = String(svgHeight - 100);

  if (axisStickyGroupEl) {
    while (stickyTicks.length < ticks.length) {
      const g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("class", "tick");
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("y2", "-6");
      const text = document.createElementNS(SVG_NS, "text");
      text.setAttribute("y", "-9");
      text.setAttribute("dy", "0em");
      g.appendChild(line);
      g.appendChild(text);
      axisStickyGroupEl.appendChild(g);
      stickyTicks.push({ g, text, lastX: NaN, lastLabel: "", visible: true });
    }

    for (let i = 0; i < stickyTicks.length; i++) {
      const item = stickyTicks[i];
      if (i >= ticks.length) {
        if (item.visible) {
          item.g.style.display = "none";
          item.visible = false;
        }
        continue;
      }
      if (!item.visible) {
        item.g.style.display = "";
        item.visible = true;
      }
      const tickVal = ticks[i];
      const tx = x(tickVal) + 0.5;
      if (Math.abs(tx - item.lastX) > 0.25 || isNaN(item.lastX)) {
        item.g.setAttribute("transform", `translate(${tx.toFixed(2)}, 0)`);
        item.lastX = tx;
      }
      const label = fmt(tickVal);
      if (label !== item.lastLabel) {
        item.text.textContent = label;
        item.lastLabel = label;
      }
    }
  }

  if (axisGridGroupEl) {
    while (gridTicks.length < ticks.length) {
      const g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("class", "tick");
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("y2", gridHeightStr);
      g.appendChild(line);
      axisGridGroupEl.appendChild(g);
      gridTicks.push({ g, lastX: NaN, visible: true });
    }

    for (let i = 0; i < gridTicks.length; i++) {
      const item = gridTicks[i];
      if (i >= ticks.length) {
        if (item.visible) {
          item.g.style.display = "none";
          item.visible = false;
        }
        continue;
      }
      if (!item.visible) {
        item.g.style.display = "";
        item.visible = true;
      }
      const tx = x(ticks[i]) + 0.5;
      if (Math.abs(tx - item.lastX) > 0.25 || isNaN(item.lastX)) {
        item.g.setAttribute("transform", `translate(${tx.toFixed(2)}, 0)`);
        item.lastX = tx;
      }
    }
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
  const [minVisibleRank, maxVisibleRank] = getVisibleRankBounds();

  for (const [user, row] of rows.entries()) {
    if (immediate || dt <= 0) {
      row.rank = row.targetRank;
      row.startRank = row.targetRank;
      row.rankProgress = 1;
      row.opacity = row.targetOpacity;
      row.startOpacity = row.targetOpacity;
      row.opacityProgress = 1;
    } else {
      if (row.rankProgress < 1) {
        row.rankProgress = Math.min(1, row.rankProgress + dt / RANK_TRANSITION_S);
        row.rank = row.startRank + (row.targetRank - row.startRank) * row.rankProgress;
      } else {
        row.rank = row.targetRank;
      }

      if (row.opacityProgress < 1) {
        row.opacityProgress = Math.min(1, row.opacityProgress + dt / OPACITY_TRANSITION_S);
        row.opacity = Math.max(
          0,
          Math.min(1, row.startOpacity + (row.targetOpacity - row.startOpacity) * row.opacityProgress)
        );
      } else {
        row.opacity = row.targetOpacity;
      }
    }

    if (!row.active && row.opacity < 0.01 && Math.abs(row.targetOpacity) < 0.01) {
      row.el.remove();
      rows.delete(user);
      continue;
    }

    if (row.rankProgress < 1 || row.opacityProgress < 1) {
      allSettled = false;
    }

    // Viewport Culling: Only keep rows in the layout tree when within (or near) the viewport.
    const inViewport =
      (row.rank >= minVisibleRank && row.rank <= maxVisibleRank) ||
      (row.targetRank >= minVisibleRank && row.targetRank <= maxVisibleRank);

    if (inViewport) {
      if (!row.visible) {
        row.el.style.display = "";
        row.visible = true;
      }
    } else {
      if (row.visible) {
        row.el.style.display = "none";
        row.visible = false;
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
      row.labelGroupEl.setAttribute("transform", `translate(${textX.toFixed(2)}, 0)`);
      row.lastTextX = textX;
    }

    if (anchor !== row.lastAnchor) {
      row.labelGroupEl.setAttribute("text-anchor", anchor);
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

  const [minVis, maxVis] = getVisibleRankBounds();
  const count = Math.min(take_n, topUsers.length);
  let maxVal = 0;

  for (let i = 0; i < count; i++) {
    const [user, val] = topUsers[i];
    if (val > maxVal) maxVal = val;

    let row = rows.get(user);
    if (!row) {
      const initialRank = enterImmediately ? i : take_n + 0.5;
      const initialOpacity = enterImmediately ? 1 : 0;
      row = createRowElement(user, initialRank, initialOpacity, minVis, maxVis);
      rows.set(user, row);
    }
    row.active = true;
    setRowTargets(row, i, 1, enterImmediately);
    row.value = val;
  }

  for (const [user, row] of rows.entries()) {
    if (!row.active) {
      if (enterImmediately || (row.rank > maxVis && row.targetRank > maxVis)) {
        row.el.remove();
        rows.delete(user);
      } else {
        setRowTargets(row, take_n + 1, 0, false);
      }
    }
  }

  currentMax = maxVal > 0 ? maxVal : 1;
};

const assignTargetRanksFromTracks = (topTracks: PlaybackTrack[], enterImmediately: boolean) => {
  for (const row of rows.values()) {
    row.active = false;
  }

  const [minVis, maxVis] = getVisibleRankBounds();
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
      row = createRowElement(user, initialRank, initialOpacity, minVis, maxVis);
      rows.set(user, row);
    }
    row.active = true;
    setRowTargets(row, i, 1, enterImmediately);
    row.value = val;
  }

  for (const [user, row] of rows.entries()) {
    if (!row.active) {
      if (row.rank > maxVis && row.targetRank > maxVis) {
        row.el.remove();
        rows.delete(user);
      } else {
        setRowTargets(row, take_n + 1, 0, false);
      }
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

    const activeUsers: [string, number][] = [];
    for (const row of rows.values()) {
      row.value = row.startValue + (row.targetValue - row.startValue) * progress;
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
        setRowTargets(row, i, 1, false);
        if (val > maxVal) maxVal = val;
      } else {
        row.active = false;
        setRowTargets(row, take_n + 1, 0, false);
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

  if (animMode === "playback" && playbackDates.length > 0) {
    const totalIntervals = Math.max(1, playbackDates.length - 1);
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
    const frameDate = playbackDates[displayIdx];
    updateTitle(frameDate, false);

    currentPlaybackDateIndex = playbackDateIndices[displayIdx] ?? null;

    const activeTracks: PlaybackTrack[] = [];
    for (let i = 0; i < playbackTracks.length; i++) {
      const track = playbackTracks[i];
      const v0 = track.values[idx];
      const v1 = track.values[idx + 1];
      const val = v0 + (v1 - v0) * alpha;
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

  updateScrollMetrics();
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

  const [minVis, maxVis] = getVisibleRankBounds();
  const topSet = new Set<string>();
  for (let i = 0; i < topSlice.length; i++) {
    const [user, val] = topSlice[i];
    topSet.add(user);
    let row = rows.get(user);
    if (!row) {
      row = createRowElement(user, take_n + 0.5, 0, minVis, maxVis);
      row.value = 0;
      rows.set(user, row);
    }
    row.startValue = row.value;
    row.targetValue = val;
    row.active = true;
    setRowTargets(row, i, 1, false);
  }

  const valueMap = getFrameValueMap(frame);
  for (const [user, row] of rows.entries()) {
    if (!topSet.has(user)) {
      if (row.rank > maxVis && row.targetRank > maxVis) {
        row.el.remove();
        rows.delete(user);
        continue;
      }
      row.startValue = row.value;
      row.targetValue = valueMap.get(user) || 0;
      row.active = false;
      setRowTargets(row, take_n + 1, 0, false);
    }
  }

  stepFrame = frame;
  stepStartTime = performance.now();
  animMode = "step";
  ensureRaf();
};

const loadData = (): Promise<void> => {
  is_animating.value = false;
  if (animMode === "playback") {
    animMode = "idle";
  }
  const gen = ++fetchGeneration;
  const repositories = Array.from(props.repositories);
  const promise = (async () => {
    const res = await callLeaderboardWorker<{
      dates: string[];
      framesUsers: [string, number][][];
    }>({
      action: "load",
      repositories,
      type: props.type,
      grouping: props.grouping,
      kind: props.kind,
    });
    if (gen !== fetchGeneration) return;

    const sortedDates = res.dates;
    date.value = sortedDates;

    if (sortedDates.length === 0) {
      framesDesc = [];
      timeIndexModel.value = 0;
      return;
    }

    const clampedIndex = Math.min(Math.max(timeIndexModel.value || 0, 0), sortedDates.length - 1);
    if (timeIndexModel.value !== clampedIndex) {
      updatingTimeIndexInternally = true;
      timeIndexModel.value = clampedIndex;
      nextTick(() => { updatingTimeIndexInternally = false; });
    }

    framesDesc = sortedDates.map((d, i) => ({
      date: d,
      users: res.framesUsers[i],
      valueMap: null,
    }));

    transitionToFrame(framesDesc[clampedIndex]);
  })();

  activeLoadPromise = promise;
  return promise;
};

let playbackGeneration = 0;

const animate = async (should_accumulate = false) => {
  if (is_animating.value) {
    stop();
    return;
  }

  const pGen = ++playbackGeneration;
  is_animating.value = true;

  if (activeLoadPromise) {
    await activeLoadPromise;
  } else if (framesDesc.length === 0) {
    await loadData();
  }

  if (pGen !== playbackGeneration || !is_animating.value) return;
  if (framesDesc.length < 2) {
    is_animating.value = false;
    return;
  }

  const startDescIdx = Math.min(
    framesDesc.length - 1,
    Math.max(1, timeIndexModel.value || 0)
  );

  const res = await callLeaderboardWorker<{
    dates: string[];
    dateIndices: number[];
    firstFrameUsers: [string, number][];
    tracks: { user: string; values: Float64Array }[];
  }>({
    action: "preparePlayback",
    startDescIdx,
    shouldAccumulate: should_accumulate,
    existingUsers: Array.from(rows.keys()),
  });

  if (pGen !== playbackGeneration || !is_animating.value) return;
  if (res.dates.length < 2) {
    is_animating.value = false;
    return;
  }

  assignTargetRanks(res.firstFrameUsers.slice(0, take_n), false);
  updateTitle(res.dates[0], false);

  playbackDates = res.dates;
  playbackDateIndices = res.dateIndices;
  playbackTracks = res.tracks.map(t => ({
    user: t.user,
    values: t.values,
    currentVal: 0,
  }));
  currentPlaybackDateIndex = playbackDateIndices[0] ?? null;
  playbackStartTime = performance.now();
  playbackCursor = 0;
  animMode = "playback";
  ensureRaf();
};

const stop = () => {
  playbackGeneration++;
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
let scrollRafPending = false;

const onScroll = () => {
  updateScrollMetrics();
  if (hasRenderedOnce && animMode === "idle" && !scrollRafPending) {
    scrollRafPending = true;
    requestAnimationFrame(() => {
      scrollRafPending = false;
      if (animMode === "idle") {
        flushDOM(0, false);
      }
    });
  }
};

const onResize = () => {
  cachedSvgWidth = container.value?.clientWidth || 800;
  updateScrollMetrics();
  if (!hasRenderedOnce) return;
  if (currentDisplayedDate) {
    updateTitle(currentDisplayedDate, true);
  }
  const width = svgWidth();
  const x = scaleLinear()
    .domain([0, Math.max(1, currentMax)])
    .range([25, width - 10]);
  renderAxes(x, true);
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
  window.addEventListener("scroll", onScroll, { passive: true });
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
    const barsG = document.createElementNS(SVG_NS, "g");
    const gridG = document.createElementNS(SVG_NS, "g");
    gridG.setAttribute("class", "axis-grid");
    gridG.setAttribute("opacity", "0.2");
    svg.value.appendChild(barsG);
    svg.value.appendChild(gridG);
    barsGroupEl = barsG;
    axisGridGroupEl = gridG;
  }
  if (svg_axis.value) {
    const stickyG = document.createElementNS(SVG_NS, "g");
    stickyG.setAttribute("transform", "translate(0, 30)");
    stickyG.setAttribute("fill", "none");
    stickyG.setAttribute("font-size", "10");
    stickyG.setAttribute("text-anchor", "middle");
    svg_axis.value.appendChild(stickyG);
    axisStickyGroupEl = stickyG;
  }
  window.addEventListener("resize", onResize);
  loadData();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", onResize);
  window.removeEventListener("scroll", onScroll);
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
  stickyTicks.length = 0;
  gridTicks.length = 0;
  framesDesc = [];
  playbackDates = [];
  playbackTracks = [];
});

</script>

<style scoped>

.playback-nav {
  align-items: center;
  display: flex;
  gap: 0.5rem;
}

.svg {
  padding: 0;
  margin: 0;
}

svg :deep(.index),
svg :deep(.name) {
  fill: var(--ink);
}

svg :deep(.commit) {
  fill: var(--muted);
}

svg :deep(.index),
svg :deep(.commit) {
  font-variant-numeric: tabular-nums;
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
