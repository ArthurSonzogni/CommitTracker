<template>
  <div ref="container">
    <div class="form-row controls-row">
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
      <UiField v-if="!is_animating && !is_paused && grouping != 'forever' && timeIndexModel > 0">
        <button type="button" @click="animate(false)" class="button is-success">
          Animate
        </button>
      </UiField>
      <UiField v-if="!is_animating && !is_paused && grouping != 'forever' && timeIndexModel > 0">
        <button type="button" @click="animate(true)" class="button is-warning">
          Animate with accumulation
        </button>
      </UiField>

      <UiField v-if="is_animating">
        <button type="button" @click="pause" class="button">
          Pause
        </button>
      </UiField>
      <UiField v-if="is_paused">
        <button type="button" @click="resume" class="button is-success">
          Resume
        </button>
      </UiField>
      <UiField v-if="is_animating || is_paused">
        <button type="button" @click="stop" class="button is-danger">
          Stop
        </button>
      </UiField>

      <UiField v-if="grouping != 'forever' && date.length > 1">
        <button
          type="button"
          class="button speed-btn"
          title="Playback speed"
          @click="cycleSpeed">
          {{ playbackSpeed }}×
        </button>
      </UiField>

      <UiField class="highlight-field">
        <input
          v-model="highlightQuery"
          type="search"
          class="input highlight-input"
          placeholder="Highlight developer…"
          aria-label="Highlight developer" />
      </UiField>
    </div>

    <div v-if="grouping != 'forever' && date.length > 1" class="scrubber-row">
      <span class="scrubber-label">{{ date[date.length - 1] }}</span>
      <input
        ref="scrubberEl"
        type="range"
        class="scrubber-slider"
        :min="0"
        :max="Math.max(0, date.length - 1)"
        :step="is_animating || is_paused ? 0.01 : 1"
        :value="date.length - 1 - (timeIndexModel || 0)"
        aria-label="Timeline position"
        @input="onScrub" />
      <span class="scrubber-label">{{ date[0] }}</span>
    </div>

    <svg ref="svg_axis" width="100%" :height="31" class="sticky-top"></svg>
    <svg ref="svg" width="100%" :height="dynamicSvgHeight"></svg>
    <svg ref="svg_title" width="100%" :height="80" class="sticky-bottom"> </svg>
  </div>
</template>

<script setup lang="ts">

import { format } from "d3-format";
import { scaleBand, scaleLinear } from "d3-scale";
import { range } from "d3-array";
import { callLeaderboardWorker } from "~/utils/leaderboardWorkerClient";

const { $color } = useNuxtApp();
const router = useRouter();

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
const scrubberEl = ref<HTMLInputElement | null>(null);

const SVG_NS = "http://www.w3.org/2000/svg";
const take_n = 100;
const svgHeight = take_n * 50;
const dynamicSvgHeight = ref<number>(svgHeight);
const BUFFER = 4;

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
  let base: number;
  switch (props.grouping) {
    case "monthly": base = 400; break;
    case "quarterly": base = 750; break;
    case "yearly": base = 1400; break;
    default: base = 1800; break;
  }
  return base / playbackSpeed.value;
};

const STEP_DURATION = 420;            // ms for single-frame transitions
const RANK_TRANSITION_S = 0.30;       // seconds for smooth rank swap
const OPACITY_TRANSITION_S = 0.25;    // seconds for linear fade in/out
const SWAP_LOOKAHEAD_RATIO = 0.4;     // start swap slightly before crossing
const SWAP_HYSTERESIS = 0.005;        // 0.5% margin to prevent near-tie flicker

const smoothstep = (t: number) => t * t * (3 - 2 * t);

const date = ref<string[]>([]);
const is_animating = ref<boolean>(false);
const is_paused = ref<boolean>(false);
const playbackSpeed = ref<number>(1);
const highlightQuery = ref<string>("");
const normalizedHighlight = computed(() => highlightQuery.value.trim().toLowerCase());
const intFmt = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

const SPEED_STEPS = [1, 2, 0.5];
const cycleSpeed = () => {
  const idx = SPEED_STEPS.indexOf(playbackSpeed.value);
  const next = SPEED_STEPS[(idx + 1) % SPEED_STEPS.length];
  if (is_animating.value && animMode === "playback") {
    playbackStartTime = performance.now() - playbackCursor * (getPeriodDuration() * playbackSpeed.value / next);
  }
  playbackSpeed.value = next;
};

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

interface RowDom {
  el: SVGGElement;
  rectEl: SVGRectElement;
  labelGroupEl: SVGGElement;
  nameText: Text;
  commitText: Text;
  titleText: Text;
  lastUser: string;
  lastY: number;
  lastOpacity: number;
  lastRectOpacity: number;
  lastHighlighted: boolean;
  lastWidth: number;
  lastTextX: number;
  lastAnchor: string;
  lastCommitText: string;
}

interface BarRow {
  user: string;
  dom: RowDom | null;
  rank: number;
  rankVel: number;
  startRank: number;
  startRankVel: number;
  targetRank: number;
  rankProgress: number;
  opacity: number;
  startOpacity: number;
  targetOpacity: number;
  value: number;
  startValue: number;
  targetValue: number;
  active: boolean;
  needsRaise: boolean;
}

const setRowTargets = (
  row: BarRow,
  nextRank: number,
  nextOpacity: number,
  immediate = false
) => {
  if (immediate) {
    row.rank = nextRank;
    row.rankVel = 0;
    row.startRank = nextRank;
    row.startRankVel = 0;
    row.targetRank = nextRank;
    row.rankProgress = 1;
    row.opacity = nextOpacity;
    row.startOpacity = nextOpacity;
    row.targetOpacity = nextOpacity;
    row.needsRaise = false;
    return;
  }
  if (nextRank !== row.targetRank) {
    if (nextRank < row.targetRank && row.rank < take_n) {
      row.needsRaise = true;
    }
    const dist = nextRank - row.rank;
    if (Math.abs(dist) < 0.001) {
      row.rank = nextRank;
      row.rankVel = 0;
      row.startRank = nextRank;
      row.startRankVel = 0;
      row.targetRank = nextRank;
      row.rankProgress = 1;
    } else {
      row.startRank = row.rank;
      row.targetRank = nextRank;
      const rawM0 = row.rankVel * RANK_TRANSITION_S;
      if (rawM0 * dist > 0) {
        const maxM0 = Math.abs(dist) * 1.5;
        row.startRankVel = Math.sign(dist) * Math.min(Math.abs(rawM0), maxM0);
      } else {
        row.startRankVel = 0;
      }
      row.rankProgress = 0;
    }
  }
  row.targetOpacity = nextOpacity;
};

interface StickyTickItem {
  g: SVGGElement;
  textNode: Text;
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
const rankLabelEls: SVGTextElement[] = [];
let lastRankLabelCount = 0;
const rowDomPool: RowDom[] = [];
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
  lookVal: number;
}
let playbackStartTime = 0;
let playbackCursor = 0;
let playbackDates: string[] = [];
let playbackDateIndices: number[] = [];
let playbackTracks: PlaybackTrack[] = [];
let lastPlaybackIdx = -1;
let intervalTracks: PlaybackTrack[] = [];
let currentPlaybackDateIndex: number | null = null;

const createRowDom = (): RowDom => {
  const el = document.createElementNS(SVG_NS, "g");
  el.setAttribute("class", "bar-row");

  const titleEl = document.createElementNS(SVG_NS, "title");
  const titleText = document.createTextNode("");
  titleEl.appendChild(titleText);
  el.appendChild(titleEl);

  const rectEl = document.createElementNS(SVG_NS, "rect");
  rectEl.setAttribute("opacity", "0.5");
  rectEl.setAttribute("rx", "4");
  rectEl.setAttribute("x", "25");
  rectEl.setAttribute("height", String(rowBandwidth));
  rectEl.setAttribute("width", "0");
  el.appendChild(rectEl);

  const labelGroupEl = document.createElementNS(SVG_NS, "g");
  labelGroupEl.setAttribute("class", "labels");

  const nameEl = document.createElementNS(SVG_NS, "text");
  nameEl.setAttribute("class", "name");
  nameEl.setAttribute("dy", "0.35em");
  nameEl.setAttribute("dx", "5");
  nameEl.setAttribute("y", "10");
  const nameText = document.createTextNode("");
  nameEl.appendChild(nameText);
  labelGroupEl.appendChild(nameEl);

  const commitEl = document.createElementNS(SVG_NS, "text");
  commitEl.setAttribute("class", "commit");
  commitEl.setAttribute("dy", "0.35em");
  commitEl.setAttribute("dx", "5");
  commitEl.setAttribute("y", "30");
  const commitText = document.createTextNode("0");
  commitEl.appendChild(commitText);
  labelGroupEl.appendChild(commitEl);

  el.appendChild(labelGroupEl);
  barsGroupEl?.appendChild(el);

  return {
    el,
    rectEl,
    labelGroupEl,
    nameText,
    commitText,
    titleText,
    lastUser: "",
    lastY: NaN,
    lastOpacity: NaN,
    lastRectOpacity: 0.5,
    lastHighlighted: false,
    lastWidth: NaN,
    lastTextX: NaN,
    lastAnchor: "",
    lastCommitText: "0",
  };
};

const acquireRowDom = (user: string): RowDom => {
  const dom = rowDomPool.pop() || createRowDom();
  dom.el.style.display = "";
  if (dom.lastUser !== user) {
    dom.el.setAttribute("data-user", user);
    dom.rectEl.setAttribute("fill", $color(user));
    dom.nameText.data = user;
    dom.lastUser = user;
  }
  return dom;
};

const releaseRowDom = (row: BarRow) => {
  if (!row.dom) return;
  row.dom.el.style.display = "none";
  rowDomPool.push(row.dom);
  row.dom = null;
};

const createRow = (
  user: string,
  initialRank: number,
  initialOpacity: number
): BarRow => ({
  user,
  dom: null,
  rank: initialRank,
  rankVel: 0,
  startRank: initialRank,
  startRankVel: 0,
  targetRank: initialRank,
  rankProgress: 1,
  opacity: initialOpacity,
  startOpacity: initialOpacity,
  targetOpacity: initialOpacity,
  value: 0,
  startValue: 0,
  targetValue: 0,
  active: true,
  needsRaise: false,
});

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
      anim.oncancel = () => prevEl.remove();
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

const renderAxes = (force = false) => {
  const width = svgWidth();
  const domainMax = Math.max(1, currentMax);
  if (
    !force &&
    width === lastRenderedSvgWidth &&
    lastRenderedDomainMax > 0 &&
    Math.abs(domainMax - lastRenderedDomainMax) / lastRenderedDomainMax < 0.002
  ) {
    return;
  }
  lastRenderedSvgWidth = width;
  lastRenderedDomainMax = domainMax;

  const x = scaleLinear()
    .domain([0, domainMax])
    .range([25, width - 10]);

  const tickCount = Math.max(2, width / 100);
  const ticks: number[] = x.ticks(tickCount);
  const fmt = x.tickFormat(tickCount);
  const gridHeightStr = String(Math.max(40, dynamicSvgHeight.value - 20));

  if (axisStickyGroupEl) {
    while (stickyTicks.length < ticks.length) {
      const g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("class", "tick");
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("y2", "-6");
      const text = document.createElementNS(SVG_NS, "text");
      text.setAttribute("y", "-9");
      text.setAttribute("dy", "0em");
      const textNode = document.createTextNode("");
      text.appendChild(textNode);
      g.appendChild(line);
      g.appendChild(text);
      axisStickyGroupEl.appendChild(g);
      stickyTicks.push({ g, textNode, lastX: NaN, lastLabel: "", visible: true });
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
        item.textNode.data = label;
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
const flushDOM = (dt: number, immediate: boolean, skipRowAdvance = false): boolean => {
  const width = svgWidth();
  const domainMax = Math.max(1, currentMax);
  const x0 = 25;
  const xSpan = Math.max(1, width - 35);
  const xScale = xSpan / domainMax;

  let allSettled = true;
  let activeCount = 0;
  const [minVisibleRank, maxVisibleRank] = getVisibleRankBounds();
  const hlQuery = normalizedHighlight.value;

  for (const [user, row] of rows.entries()) {
    if (row.active) activeCount++;
    if (!skipRowAdvance) {
      if (immediate || dt <= 0) {
        row.rank = row.targetRank;
        row.rankVel = 0;
        row.startRank = row.targetRank;
        row.startRankVel = 0;
        row.rankProgress = 1;
        row.opacity = row.targetOpacity;
        row.startOpacity = row.targetOpacity;
      } else {
        if (row.rankProgress < 1) {
          row.rankProgress = Math.min(1, row.rankProgress + dt / RANK_TRANSITION_S);
          const t = row.rankProgress;
          if (t >= 1) {
            row.rank = row.targetRank;
            row.rankVel = 0;
            row.startRankVel = 0;
          } else {
            const t2 = t * t;
            const t3 = t2 * t;
            const p0 = row.startRank;
            const p1 = row.targetRank;
            const m0 = row.startRankVel;
            row.rank = (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1;
            row.rankVel = ((6 * t2 - 6 * t) * (p0 - p1) + (3 * t2 - 4 * t + 1) * m0) / RANK_TRANSITION_S;
            allSettled = false;
          }
        } else {
          row.rank = row.targetRank;
          row.rankVel = 0;
        }

        const opDiff = row.targetOpacity - row.opacity;
        if (Math.abs(opDiff) > 0.001) {
          const opStep = (1 / OPACITY_TRANSITION_S) * dt;
          if (Math.abs(opDiff) <= opStep) {
            row.opacity = row.targetOpacity;
          } else {
            row.opacity = Math.max(0, Math.min(1, row.opacity + Math.sign(opDiff) * opStep));
            allSettled = false;
          }
        } else {
          row.opacity = row.targetOpacity;
        }
      }
    }

    if (!row.active && row.opacity < 0.01 && Math.abs(row.targetOpacity) < 0.01) {
      releaseRowDom(row);
      rows.delete(user);
      continue;
    }

    // Viewport Culling: Only hold a pooled DOM row when within (or near) the viewport.
    const inViewport =
      row.opacity > 0.001 &&
      ((row.rank >= minVisibleRank && row.rank <= maxVisibleRank) ||
        (row.targetRank >= minVisibleRank && row.targetRank <= maxVisibleRank));

    if (!inViewport) {
      row.needsRaise = false;
      releaseRowDom(row);
      continue;
    }

    if (!row.dom) {
      row.dom = acquireRowDom(user);
    }
    const dom = row.dom;

    if (row.needsRaise) {
      row.needsRaise = false;
      barsGroupEl?.appendChild(dom.el);
    }

    const yPos = rankToY(row.rank);
    if (Math.abs(yPos - dom.lastY) > 0.05 || isNaN(dom.lastY)) {
      dom.el.setAttribute("transform", `translate(0, ${yPos.toFixed(2)})`);
      dom.lastY = yPos;
    }

    const isHighlighted = hlQuery.length > 0 && user.toLowerCase().includes(hlQuery);
    const effectiveOpacity = hlQuery.length > 0 && !isHighlighted ? row.opacity * 0.28 : row.opacity;
    if (Math.abs(effectiveOpacity - dom.lastOpacity) > 0.005 || isNaN(dom.lastOpacity)) {
      dom.el.setAttribute("opacity", effectiveOpacity.toFixed(3));
      dom.lastOpacity = effectiveOpacity;
    }

    if (isHighlighted !== dom.lastHighlighted) {
      dom.el.classList.toggle("is-highlighted", isHighlighted);
      dom.lastHighlighted = isHighlighted;
    }

    // Subtle emphasis on rising bars and dimming on falling bars mid-swap.
    const deltaRank = row.targetRank - row.rank;
    const swapIntensity = Math.min(1, Math.abs(deltaRank));
    const rectOpacity = isHighlighted
      ? 0.85
      : swapIntensity > 0.05
        ? deltaRank < 0
          ? 0.5 + 0.18 * swapIntensity
          : 0.5 - 0.14 * swapIntensity
        : 0.5;
    if (Math.abs(rectOpacity - dom.lastRectOpacity) > 0.01) {
      dom.rectEl.setAttribute("opacity", rectOpacity.toFixed(2));
      dom.lastRectOpacity = rectOpacity;
    }

    const barWidth = Math.max(0, row.value * xScale);
    const xVal = x0 + barWidth;
    if (Math.abs(barWidth - dom.lastWidth) > 0.05 || isNaN(dom.lastWidth)) {
      dom.rectEl.setAttribute("width", barWidth.toFixed(2));
      dom.lastWidth = barWidth;
    }

    const commitStr = formatValue(row.value);
    if (commitStr !== dom.lastCommitText) {
      dom.commitText.data = commitStr;
      dom.lastCommitText = commitStr;
    }

    const minInsideWidth = Math.max(70, Math.max(user.length, commitStr.length) * 7.5 + 16);
    const isShort = barWidth < minInsideWidth;
    const textX = xVal + (isShort ? 7 : -7);
    const anchor = isShort ? "start" : "end";

    if (Math.abs(textX - dom.lastTextX) > 0.05 || isNaN(dom.lastTextX)) {
      dom.labelGroupEl.setAttribute("transform", `translate(${textX.toFixed(2)}, 0)`);
      dom.lastTextX = textX;
    }

    if (anchor !== dom.lastAnchor) {
      dom.labelGroupEl.setAttribute("text-anchor", anchor);
      dom.lastAnchor = anchor;
    }
  }

  const visibleRanks = Math.min(take_n, activeCount);
  if (visibleRanks !== lastRankLabelCount) {
    for (let i = Math.min(visibleRanks, lastRankLabelCount); i < Math.max(visibleRanks, lastRankLabelCount); i++) {
      const el = rankLabelEls[i];
      if (el) el.style.display = i < visibleRanks ? "" : "none";
    }
    lastRankLabelCount = visibleRanks;
    const nextHeight = visibleRanks >= take_n
      ? svgHeight
      : Math.max(160, Math.ceil(rankToY(visibleRanks) + 20));
    if (nextHeight !== dynamicSvgHeight.value) {
      dynamicSvgHeight.value = nextHeight;
      const gridHeightStr = String(Math.max(40, nextHeight - 20));
      for (let i = 0; i < gridTicks.length; i++) {
        gridTicks[i].g.firstElementChild?.setAttribute("y2", gridHeightStr);
      }
    }
  }

  renderAxes();
  return allSettled;
};

const assignTargetRanks = (topUsers: [string, number][], enterImmediately: boolean) => {
  for (const row of rows.values()) {
    row.active = false;
  }

  const [, maxVis] = getVisibleRankBounds();
  const count = Math.min(take_n, topUsers.length);
  let maxVal = 0;

  for (let i = 0; i < count; i++) {
    const [user, val] = topUsers[i];
    if (val > maxVal) maxVal = val;

    let row = rows.get(user);
    if (!row) {
      const initialRank = enterImmediately ? i : take_n + 0.5;
      const initialOpacity = enterImmediately ? 1 : 0;
      row = createRow(user, initialRank, initialOpacity);
      rows.set(user, row);
    }
    row.active = true;
    setRowTargets(row, i, 1, enterImmediately);
    row.value = val;
  }

  for (const [user, row] of rows.entries()) {
    if (!row.active) {
      if (enterImmediately || (row.rank > maxVis && row.targetRank > maxVis)) {
        releaseRowDom(row);
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

  const [, maxVis] = getVisibleRankBounds();
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
      row = createRow(user, initialRank, initialOpacity);
      rows.set(user, row);
    }
    row.active = true;
    setRowTargets(row, i, 1, enterImmediately);
    row.value = val;
  }

  for (const [user, row] of rows.entries()) {
    if (!row.active) {
      if (row.rank > maxVis && row.targetRank > maxVis) {
        releaseRowDom(row);
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
    const rankEase = smoothstep(progress);

    let maxVal = 0;
    for (const row of rows.values()) {
      row.value = row.startValue + (row.targetValue - row.startValue) * progress;
      row.rank = row.startRank + (row.targetRank - row.startRank) * rankEase;
      row.opacity = row.startOpacity + (row.targetOpacity - row.startOpacity) * progress;
      if (row.active && row.value > maxVal) {
        maxVal = row.value;
      }
    }
    currentMax = maxVal > 0 ? maxVal : 1;

    flushDOM(0, false, true);
    if (progress >= 1) {
      animMode = "idle";
      rafId = null;
      return;
    }
    rafId = requestAnimationFrame(tick);
    return;
  }

  if (animMode === "playback" && playbackDates.length > 0) {
    const totalIntervals = Math.max(1, playbackDates.length - 1);
    const periodMs = getPeriodDuration();
    if (is_animating.value) {
      const elapsed = now - playbackStartTime;
      playbackCursor = Math.min(totalIntervals, Math.max(0, elapsed / periodMs));
      if (playbackCursor >= totalIntervals) {
        is_animating.value = false;
      }
    }
    const cursor = playbackCursor;
    const finishedTime = !is_animating.value;

    const idx = Math.min(totalIntervals - 1, Math.floor(cursor));
    const alpha = cursor - idx;

    // Slight lookahead so swaps center on the moment two bars' widths cross.
    const lookCursor = finishedTime
      ? cursor
      : Math.min(totalIntervals, cursor + (RANK_TRANSITION_S * SWAP_LOOKAHEAD_RATIO * 1000) / periodMs);
    const lookIdx = Math.min(totalIntervals - 1, Math.floor(lookCursor));
    const lookAlpha = lookCursor - lookIdx;

    if (idx !== lastPlaybackIdx) {
      lastPlaybackIdx = idx;
      intervalTracks = [];
      const maxCheckIdx = Math.min(totalIntervals, idx + 2);
      for (let i = 0; i < playbackTracks.length; i++) {
        const track = playbackTracks[i];
        if (
          track.values[idx] > 0 ||
          track.values[idx + 1] > 0 ||
          track.values[maxCheckIdx] > 0
        ) {
          intervalTracks.push(track);
        }
      }
    }

    const displayIdx = alpha >= 0.5 ? idx + 1 : idx;
    const frameDate = playbackDates[displayIdx];
    updateTitle(frameDate, false);

    currentPlaybackDateIndex = playbackDateIndices[displayIdx] ?? null;

    if (scrubberEl.value && date.value.length > 1) {
      const startDesc = playbackDateIndices[0] ?? (date.value.length - 1);
      const chronoPos = (date.value.length - 1) - startDesc + cursor;
      scrubberEl.value.value = chronoPos.toFixed(2);
    }

    const activeTracks: PlaybackTrack[] = [];
    for (let i = 0; i < intervalTracks.length; i++) {
      const track = intervalTracks[i];
      const v0 = track.values[idx];
      const v1 = track.values[idx + 1];
      const val = v0 + (v1 - v0) * alpha;
      const lv0 = track.values[lookIdx];
      const lv1 = track.values[lookIdx + 1];
      const lookVal = lv0 + (lv1 - lv0) * lookAlpha;
      if (val > 0 || lookVal > 0) {
        track.currentVal = val;
        track.lookVal = lookVal;
        activeTracks.push(track);
      }
    }
    activeTracks.sort((a, b) => {
      const maxV = Math.max(a.lookVal, b.lookVal);
      if (!finishedTime && maxV > 0 && Math.abs(a.lookVal - b.lookVal) <= maxV * SWAP_HYSTERESIS) {
        const ra = rows.get(a.user)?.targetRank ?? Infinity;
        const rb = rows.get(b.user)?.targetRank ?? Infinity;
        if (ra !== rb) return ra - rb;
      }
      return b.lookVal - a.lookVal || b.currentVal - a.currentVal;
    });

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

  const [, maxVis] = getVisibleRankBounds();
  const topSet = new Set<string>();
  for (let i = 0; i < topSlice.length; i++) {
    const [user, val] = topSlice[i];
    topSet.add(user);
    let row = rows.get(user);
    if (!row) {
      row = createRow(user, take_n + 0.5, 0);
      row.value = 0;
      rows.set(user, row);
    }
    row.startValue = row.value;
    row.targetValue = val;
    row.startRank = row.rank;
    row.targetRank = i;
    row.rankVel = 0;
    row.startRankVel = 0;
    row.rankProgress = 1;
    row.startOpacity = row.opacity;
    row.targetOpacity = 1;
    row.active = true;
    row.needsRaise = i < row.rank && row.rank < take_n;
  }

  const valueMap = getFrameValueMap(frame);
  for (const [user, row] of rows.entries()) {
    if (!topSet.has(user)) {
      if (row.rank > maxVis && row.targetRank > maxVis) {
        releaseRowDom(row);
        rows.delete(user);
        continue;
      }
      row.startValue = row.value;
      row.targetValue = valueMap.get(user) || 0;
      row.startRank = row.rank;
      row.targetRank = take_n + 1;
      row.rankVel = 0;
      row.startRankVel = 0;
      row.rankProgress = 1;
      row.startOpacity = row.opacity;
      row.targetOpacity = 0;
      row.active = false;
      row.needsRaise = false;
    }
  }

  stepFrame = frame;
  stepStartTime = performance.now();
  animMode = "step";
  ensureRaf();
};

const loadData = (): Promise<void> => {
  is_animating.value = false;
  is_paused.value = false;
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
  is_paused.value = false;
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
    lookVal: 0,
  }));
  lastPlaybackIdx = -1;
  intervalTracks = [];
  currentPlaybackDateIndex = playbackDateIndices[0] ?? null;
  playbackStartTime = performance.now();
  playbackCursor = 0;
  animMode = "playback";
  ensureRaf();
};

const pause = () => {
  if (!is_animating.value) return;
  is_animating.value = false;
  is_paused.value = true;
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
};

const resume = () => {
  if (!is_paused.value || playbackDates.length < 2) return;
  is_paused.value = false;
  is_animating.value = true;
  playbackStartTime = performance.now() - playbackCursor * getPeriodDuration();
  animMode = "playback";
  ensureRaf();
};

const stop = () => {
  playbackGeneration++;
  is_animating.value = false;
  is_paused.value = false;
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  animMode = "idle";
  if (currentPlaybackDateIndex !== null && timeIndexModel.value !== currentPlaybackDateIndex) {
    updatingTimeIndexInternally = true;
    timeIndexModel.value = currentPlaybackDateIndex;
    nextTick(() => { updatingTimeIndexInternally = false; });
  }
};

const onScrub = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const chronoVal = parseFloat(input.value);
  if (isNaN(chronoVal) || date.value.length < 2) return;

  if ((is_animating.value || is_paused.value) && playbackDates.length >= 2) {
    const startDesc = playbackDateIndices[0] ?? (date.value.length - 1);
    const startChrono = (date.value.length - 1) - startDesc;
    const totalIntervals = playbackDates.length - 1;
    const nextCursor = Math.min(totalIntervals, Math.max(0, chronoVal - startChrono));
    playbackCursor = nextCursor;
    if (is_animating.value) {
      playbackStartTime = performance.now() - playbackCursor * getPeriodDuration();
    } else {
      // Render scrubbed frame immediately while paused.
      const idx = Math.min(totalIntervals - 1, Math.floor(nextCursor));
      const alpha = nextCursor - idx;
      const displayIdx = alpha >= 0.5 ? idx + 1 : idx;
      updateTitle(playbackDates[displayIdx], true);
      currentPlaybackDateIndex = playbackDateIndices[displayIdx] ?? null;
      const activeTracks: PlaybackTrack[] = [];
      for (let i = 0; i < playbackTracks.length; i++) {
        const track = playbackTracks[i];
        const val = track.values[idx] + (track.values[idx + 1] - track.values[idx]) * alpha;
        if (val > 0) {
          track.currentVal = val;
          track.lookVal = val;
          activeTracks.push(track);
        }
      }
      activeTracks.sort((a, b) => b.currentVal - a.currentVal);
      assignTargetRanksFromTracks(activeTracks, true);
      flushDOM(0, true);
    }
    return;
  }

  const nextDescIdx = Math.min(date.value.length - 1, Math.max(0, Math.round(date.value.length - 1 - chronoVal)));
  if (timeIndexModel.value !== nextDescIdx) {
    timeIndexModel.value = nextDescIdx;
  }
};

const previous = () => {
  if (is_animating.value || is_paused.value) stop();
  timeIndexModel.value = Math.min((timeIndexModel.value || 0) + 1, date.value.length - 1);
};

const next = () => {
  if (is_animating.value || is_paused.value) stop();
  timeIndexModel.value = Math.max((timeIndexModel.value || 0) - 1, 0);
};

const onKeydown = (e: KeyboardEvent) => {
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || (e.target as HTMLElement | null)?.isContentEditable) {
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === " " && props.grouping !== "forever") {
    e.preventDefault();
    if (is_animating.value) {
      pause();
    } else if (is_paused.value) {
      resume();
    } else if ((timeIndexModel.value || 0) > 0) {
      animate(false);
    }
  } else if (e.key === "ArrowLeft") {
    if ((timeIndexModel.value || 0) < date.value.length - 1) {
      e.preventDefault();
      previous();
    }
  } else if (e.key === "ArrowRight") {
    if ((timeIndexModel.value || 0) > 0) {
      e.preventDefault();
      next();
    }
  }
};

const onBarsClick = (e: MouseEvent) => {
  const target = (e.target as Element | null)?.closest(".bar-row");
  const user = target?.getAttribute("data-user");
  if (user) {
    router.push(`/developers/${encodeURIComponent(user)}`);
  }
};

const onBarsPointerOver = (e: PointerEvent) => {
  const target = (e.target as Element | null)?.closest(".bar-row");
  const user = target?.getAttribute("data-user");
  if (!user) return;
  const row = rows.get(user);
  if (row?.dom) {
    row.dom.titleText.data = `${user} — ${intFmt.format(Math.round(row.value))}`;
  }
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
  renderAxes(true);
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
  if (is_paused.value) {
    is_paused.value = false;
    animMode = "idle";
  }
  if (framesDesc.length === 0) return;
  const clamped = Math.min(Math.max(newIdx || 0, 0), framesDesc.length - 1);
  transitionToFrame(framesDesc[clamped]);
});

watch(normalizedHighlight, () => {
  if (hasRenderedOnce && animMode === "idle") {
    flushDOM(0, false, true);
  }
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
    const ranksG = document.createElementNS(SVG_NS, "g");
    ranksG.setAttribute("class", "rank-labels");
    for (let i = 0; i < take_n; i++) {
      const indexEl = document.createElementNS(SVG_NS, "text");
      indexEl.setAttribute("class", "index");
      indexEl.setAttribute("x", "0");
      indexEl.setAttribute("y", (rankToY(i) + rowBandwidth / 2).toFixed(2));
      indexEl.setAttribute("dominant-baseline", "central");
      indexEl.style.display = "none";
      indexEl.textContent = String(i + 1);
      ranksG.appendChild(indexEl);
      rankLabelEls.push(indexEl);
    }
    const barsG = document.createElementNS(SVG_NS, "g");
    const gridG = document.createElementNS(SVG_NS, "g");
    gridG.setAttribute("class", "axis-grid");
    gridG.setAttribute("opacity", "0.2");
    svg.value.appendChild(ranksG);
    svg.value.appendChild(barsG);
    svg.value.appendChild(gridG);
    barsG.addEventListener("click", onBarsClick);
    barsG.addEventListener("pointerover", onBarsPointerOver);
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
  window.addEventListener("keydown", onKeydown);
  loadData();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", onResize);
  window.removeEventListener("scroll", onScroll);
  window.removeEventListener("keydown", onKeydown);
  barsGroupEl?.removeEventListener("click", onBarsClick);
  barsGroupEl?.removeEventListener("pointerover", onBarsPointerOver);
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  for (const row of rows.values()) {
    if (row.dom) {
      row.dom.el.remove();
      row.dom = null;
    }
  }
  for (const dom of rowDomPool) {
    dom.el.remove();
  }
  rowDomPool.length = 0;
  rankLabelEls.length = 0;
  lastRankLabelCount = 0;
  rows.clear();
  stickyTicks.length = 0;
  gridTicks.length = 0;
  framesDesc = [];
  playbackDates = [];
  playbackTracks = [];
  intervalTracks = [];
  lastPlaybackIdx = -1;
});

</script>

<style scoped>

.playback-nav {
  align-items: center;
  display: flex;
  gap: 0.5rem;
}

.controls-row {
  align-items: center;
}

.speed-btn {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  min-width: 3rem;
}

.highlight-field {
  margin-left: auto;
}

.highlight-input {
  width: 12rem;
}

.scrubber-row {
  align-items: center;
  display: flex;
  gap: 0.65rem;
  margin: 0.5rem 0 0.25rem;
}

.scrubber-slider {
  accent-color: var(--accent);
  cursor: pointer;
  flex: 1;
}

.scrubber-label {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

svg :deep(.bar-row) {
  cursor: pointer;
}

svg :deep(.bar-row:hover rect) {
  filter: brightness(1.08);
  stroke: var(--ink);
  stroke-opacity: 0.35;
  stroke-width: 1;
}

svg :deep(.bar-row:hover .name) {
  text-decoration: underline;
}

svg :deep(.bar-row.is-highlighted rect) {
  stroke: var(--ink);
  stroke-opacity: 0.65;
  stroke-width: 1.5;
}

svg :deep(.bar-row.is-highlighted .name) {
  font-weight: 600;
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
  stroke: var(--bg);
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
