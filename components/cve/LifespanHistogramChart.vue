<template>
  <div ref="wrap" class="svg-box is-compact">
    <svg ref="svgEl" />
    <div v-if="hover" class="floating-tt" :style="ttStyle">
      <div class="tt-title">{{ hover.label }}</div>
      <div class="tt-line">
        <span>Matching CVEs:</span>
        <strong>{{ fmtInt(hover.total) }} ({{ hover.sharePct }}%)</strong>
      </div>
      <div class="tt-line">
        <span>Crit / High:</span>
        <strong>{{ hover.bySeverity.Critical }} / {{ hover.bySeverity.High }}</strong>
      </div>
      <div class="tt-line">
        <span>Med / Low:</span>
        <strong>{{ hover.bySeverity.Medium }} / {{ hover.bySeverity.Low }}</strong>
      </div>
      <div class="tt-line">
        <span>VRP Bounties:</span>
        <strong>{{ fmtUsd(hover.vrpUsd) }}</strong>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { max } from 'd3-array';
import { scaleBand, scaleLinear } from 'd3-scale';
import { axisBottom, axisLeft } from 'd3-axis';
import { select } from 'd3-selection';
import { fmtInt, fmtUsd } from '~/utils/security';
import {
  SEVERITY_ORDER,
  SEV_COLOR,
  styleLifespanAxes,
  type LifespanHistogramBucket,
} from '~/utils/cveLifespan';

const props = defineProps<{
  buckets: LifespanHistogramBucket[];
}>();

const wrap = ref<HTMLElement | null>(null);
const svgEl = ref<SVGSVGElement | null>(null);
const hover = ref<LifespanHistogramBucket | null>(null);
const ttStyle = ref<Record<string, string>>({});

function draw() {
  if (!svgEl.value || !wrap.value) return;
  const buckets = props.buckets;
  const svg = select(svgEl.value);
  svg.selectAll('*').remove();

  const width = Math.max(320, wrap.value.clientWidth);
  const height = 220;
  const margin = { top: 12, right: 14, bottom: 30, left: 46 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = scaleBand<string>()
    .domain(buckets.map((b) => b.key))
    .range([0, innerW])
    .padding(0.24);
  const y = scaleLinear()
    .domain([0, Math.max(5, (max(buckets, (b) => b.total) || 10) * 1.12)])
    .nice()
    .range([innerH, 0]);

  g.append('g')
    .call(axisLeft(y).ticks(4).tickSize(-innerW).tickFormat(() => ''))
    .call((sel) => sel.select('.domain').remove())
    .call((sel) => sel.selectAll('line').attr('stroke', 'var(--line)').attr('stroke-opacity', 0.7));

  for (const b of buckets) {
    let acc = 0;
    const bx = x(b.key) || 0;
    for (const sev of SEVERITY_ORDER) {
      const val = b.bySeverity[sev] || 0;
      if (!val) continue;
      const y0 = y(acc);
      const y1 = y(acc + val);
      g.append('rect')
        .attr('x', bx)
        .attr('y', y1)
        .attr('width', x.bandwidth())
        .attr('height', Math.max(1, y0 - y1))
        .attr('rx', 2)
        .attr('fill', SEV_COLOR[sev])
        .attr('opacity', 0.9);
      acc += val;
    }

    g.append('rect')
      .attr('x', bx)
      .attr('y', 0)
      .attr('width', x.bandwidth())
      .attr('height', innerH)
      .attr('fill', 'transparent')
      .style('cursor', 'pointer')
      .on('mouseenter mousemove', (event: MouseEvent) => {
        const rect = wrap.value!.getBoundingClientRect();
        const relX = event.clientX - rect.left;
        ttStyle.value = {
          left: `${Math.min(Math.max(8, relX + 12), width - 220)}px`,
          top: '8px',
        };
        hover.value = b;
      })
      .on('mouseleave', () => {
        hover.value = null;
      });
  }

  g.append('g').attr('transform', `translate(0,${innerH})`).call(axisBottom(x).tickSizeOuter(0));
  g.append('g').call(axisLeft(y).ticks(4));
  styleLifespanAxes(svg);
}

let resizeObs: ResizeObserver | null = null;
onMounted(() => {
  draw();
  resizeObs = new ResizeObserver(() => draw());
  if (wrap.value) resizeObs.observe(wrap.value);
});
onBeforeUnmount(() => resizeObs?.disconnect());
watch(() => props.buckets, () => nextTick(draw));
</script>

<style scoped>
.svg-box.is-compact {
  position: relative;
  width: 100%;
  min-height: 220px;
}

.floating-tt {
  position: absolute;
  z-index: 20;
  pointer-events: none;
  background: var(--tooltip-bg);
  color: var(--tooltip-ink);
  border-radius: var(--radius);
  padding: 0.55rem 0.75rem;
  font-size: 0.76rem;
  min-width: 215px;
  box-shadow: var(--shadow-lg);
}

.tt-title {
  font-weight: 700;
  margin-bottom: 0.28rem;
  padding-bottom: 0.22rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.14);
}

.tt-line {
  display: flex;
  justify-content: space-between;
  gap: 0.65rem;
  padding: 0.1rem 0;
}
</style>
