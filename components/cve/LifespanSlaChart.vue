<template>
  <div ref="wrap" class="svg-box">
    <svg ref="svgEl" />
    <div v-if="hover" class="floating-tt" :style="ttStyle">
      <div class="tt-title">{{ hover.bucket }} ({{ fmtInt(hover.n) }} CVEs)</div>
      <template v-if="hover.mode === 'severities'">
        <div v-for="row in hover.sevRows" :key="row.sev" class="tt-line">
          <span>{{ row.sev }} (n={{ row.n }}):</span>
          <strong>{{ row.val !== null ? `${row.val.toFixed(1)}%` : '—' }}</strong>
        </div>
      </template>
      <template v-else>
        <div class="tt-line">
          <span>Deadline-Exceeded:</span>
          <strong>{{ hover.slaPct }}% ({{ hover.slaCount }})</strong>
        </div>
        <div class="tt-line">
          <span>Fix CL Reverted:</span>
          <strong>{{ hover.revPct }}% ({{ hover.revCount }})</strong>
        </div>
        <div class="tt-line">
          <span>LTS Backported:</span>
          <strong>{{ hover.ltsCount }} CVEs</strong>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { format } from 'd3-format';
import { max } from 'd3-array';
import { scaleBand, scaleLinear } from 'd3-scale';
import { axisBottom, axisLeft, axisRight } from 'd3-axis';
import { select } from 'd3-selection';
import { line as d3Line, curveMonotoneX } from 'd3-shape';
import { fmtInt } from '~/utils/security';
import {
  SEVERITY_ORDER,
  SEV_COLOR,
  sparseLifespanTicks,
  styleLifespanAxes,
  type LifespanTimeSeriesBucket,
} from '~/utils/cveLifespan';

const props = defineProps<{
  buckets: LifespanTimeSeriesBucket[];
  granularity: 'year' | 'quarter';
  compareMode: 'cohort' | 'severities';
}>();

const wrap = ref<HTMLElement | null>(null);
const svgEl = ref<SVGSVGElement | null>(null);
const hover = ref<any>(null);
const ttStyle = ref<Record<string, string>>({});

function draw() {
  if (!svgEl.value || !wrap.value) return;
  const buckets = props.buckets;
  const svg = select(svgEl.value);
  svg.selectAll('*').remove();
  if (!buckets.length) return;

  const width = Math.max(320, wrap.value.clientWidth);
  const height = 250;
  const margin = { top: 14, right: 38, bottom: 32, left: 44 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const keys = buckets.map((b) => b.key);
  const x = scaleBand<string>().domain(keys).range([0, innerW]).padding(0.26);
  const cx = (k: string) => (x(k) || 0) + x.bandwidth() / 2;

  const yMaxPct =
    props.compareMode === 'severities'
      ? max(buckets, (b) => max(SEVERITY_ORDER, (s) => b.perSeverity[s].slaPct ?? 0)) || 15
      : max(buckets, (b) => Math.max(b.slaPct ?? 0, b.revPct ?? 0)) || 15;

  const y = scaleLinear()
    .domain([0, Math.max(10, yMaxPct * 1.18)])
    .nice()
    .range([innerH, 0]);

  const yVol = scaleLinear()
    .domain([0, (max(buckets, (b) => b.n) || 100) * 1.2])
    .nice()
    .range([innerH, 0]);

  g.append('g')
    .call(axisLeft(y).ticks(5).tickSize(-innerW).tickFormat(() => ''))
    .call((sel) => sel.select('.domain').remove())
    .call((sel) => sel.selectAll('line').attr('stroke', 'var(--line)').attr('stroke-opacity', 0.7));

  if (props.compareMode === 'cohort') {
    g.selectAll('.vol-bar')
      .data(buckets)
      .join('rect')
      .attr('x', (d) => x(d.key) || 0)
      .attr('y', (d) => yVol(d.n))
      .attr('width', x.bandwidth())
      .attr('height', (d) => innerH - yVol(d.n))
      .attr('rx', 2)
      .attr('fill', 'var(--line-strong)')
      .attr('opacity', 0.35);

    const revPts = buckets.filter((b) => b.revPct !== null);
    const revLine = d3Line<(typeof revPts)[number]>()
      .x((d) => cx(d.key))
      .y((d) => y(d.revPct!))
      .curve(curveMonotoneX);
    g.append('path')
      .datum(revPts)
      .attr('fill', 'none')
      .attr('stroke', 'var(--series-4)')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,3')
      .attr('d', revLine);

    const slaPts = buckets.filter((b) => b.slaPct !== null);
    const slaLine = d3Line<(typeof slaPts)[number]>()
      .x((d) => cx(d.key))
      .y((d) => y(d.slaPct!))
      .curve(curveMonotoneX);
    g.append('path')
      .datum(slaPts)
      .attr('fill', 'none')
      .attr('stroke', 'var(--series-8)')
      .attr('stroke-width', 2.4)
      .attr('d', slaLine);

    g.selectAll('.sla-dot')
      .data(slaPts)
      .join('circle')
      .attr('cx', (d) => cx(d.key))
      .attr('cy', (d) => y(d.slaPct!))
      .attr('r', props.granularity === 'year' ? 3.5 : 2.3)
      .attr('fill', 'var(--series-8)');

    g.append('g')
      .attr('transform', `translate(${innerW},0)`)
      .call(axisRight(yVol).ticks(4).tickFormat(format('~s')));
  } else {
    for (const sev of SEVERITY_ORDER) {
      const pts = buckets.filter((b) => b.perSeverity[sev].slaPct !== null);
      if (!pts.length) continue;
      const lineGen = d3Line<(typeof pts)[number]>()
        .x((d) => cx(d.key))
        .y((d) => y(d.perSeverity[sev].slaPct!))
        .curve(curveMonotoneX);
      g.append('path')
        .datum(pts)
        .attr('fill', 'none')
        .attr('stroke', SEV_COLOR[sev])
        .attr('stroke-width', 2.2)
        .attr('d', lineGen);
    }
  }

  const step = innerW / Math.max(1, buckets.length);
  g.selectAll('.hit-sla')
    .data(buckets)
    .join('rect')
    .attr('x', (d) => cx(d.key) - step / 2)
    .attr('y', 0)
    .attr('width', step)
    .attr('height', innerH)
    .attr('fill', 'transparent')
    .style('cursor', 'crosshair')
    .on('mouseenter mousemove', (event: MouseEvent, b) => {
      const rect = wrap.value!.getBoundingClientRect();
      const relX = event.clientX - rect.left;
      ttStyle.value = {
        left: `${Math.min(Math.max(8, relX + 12), width - 220)}px`,
        top: '10px',
      };
      if (props.compareMode === 'severities') {
        hover.value = {
          mode: 'severities',
          bucket: b.key,
          n: b.allN,
          sevRows: SEVERITY_ORDER.map((s) => ({
            sev: s,
            n: b.perSeverity[s].n,
            val: b.perSeverity[s].slaPct,
          })),
        };
      } else {
        hover.value = {
          mode: 'cohort',
          bucket: b.key,
          n: b.n,
          slaPct: b.slaPct ?? 0,
          slaCount: b.slaCount,
          revPct: b.revPct ?? 0,
          revCount: b.revCount,
          ltsCount: b.ltsCount,
        };
      }
    })
    .on('mouseleave', () => {
      hover.value = null;
    });

  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(axisBottom(x).tickValues(sparseLifespanTicks(keys)).tickSizeOuter(0));
  g.append('g').call(axisLeft(y).ticks(5).tickFormat((d) => `${d}%`));
  styleLifespanAxes(svg);
}

let resizeObs: ResizeObserver | null = null;
onMounted(() => {
  draw();
  resizeObs = new ResizeObserver(() => draw());
  if (wrap.value) resizeObs.observe(wrap.value);
});
onBeforeUnmount(() => resizeObs?.disconnect());
watch(() => [props.buckets, props.granularity, props.compareMode], () => nextTick(draw));
</script>

<style scoped>
.svg-box {
  position: relative;
  width: 100%;
  min-height: 250px;
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
