<template>
  <div ref="wrap" class="svg-box">
    <svg ref="svgEl" />
    <div v-if="hover" class="floating-tt" :style="ttStyle">
      <div class="tt-title">{{ hover.bucket }} (n = {{ fmtInt(hover.n) }})</div>
      <template v-if="hover.mode === 'severities'">
        <div v-for="row in hover.sevRows" :key="row.sev" class="tt-line">
          <span>{{ row.sev }} (n={{ row.n }}):</span>
          <strong>{{ row.text }}</strong>
        </div>
      </template>
      <template v-else>
        <div class="tt-line">
          <span>Median (P50):</span>
          <strong>{{ hover.p50Text }}</strong>
        </div>
        <div class="tt-line">
          <span>IQR (P25 – P75):</span>
          <strong>{{ hover.iqrText }}</strong>
        </div>
        <div class="tt-line">
          <span>90th Percentile (P90):</span>
          <strong>{{ hover.p90Text }}</strong>
        </div>
        <div class="tt-line tt-sep">
          <span>Lived ≥1 yr (13+ M):</span>
          <strong>{{ hover.over1YrPct }}%</strong>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { max } from 'd3-array';
import { scaleBand, scaleLinear } from 'd3-scale';
import { axisBottom, axisLeft } from 'd3-axis';
import { select } from 'd3-selection';
import { area as d3Area, line as d3Line, curveMonotoneX } from 'd3-shape';
import { fmtInt } from '~/utils/security';
import {
  SEVERITY_ORDER,
  SEV_COLOR,
  fmtVal,
  sparseLifespanTicks,
  styleLifespanAxes,
  type LifespanTimeSeriesBucket,
} from '~/utils/cveLifespan';

const props = defineProps<{
  buckets: LifespanTimeSeriesBucket[];
  granularity: 'year' | 'quarter';
  compareMode: 'cohort' | 'severities';
  dwellUnit: 'milestones' | 'days';
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

  const isM = props.dwellUnit === 'milestones';
  const unitSuffix = isM ? ' M' : 'd';

  const width = Math.max(320, wrap.value.clientWidth);
  const height = 250;
  const margin = { top: 14, right: 16, bottom: 32, left: 46 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const keys = buckets.map((b) => b.key);
  const x = scaleBand<string>().domain(keys).range([0, innerW]).padding(0.24);
  const cx = (k: string) => (x(k) || 0) + x.bandwidth() / 2;

  const yMax =
    props.compareMode === 'severities'
      ? max(buckets, (b) => max(SEVERITY_ORDER, (s) => b.perSeverity[s].dwellP50 ?? 0)) || 10
      : max(buckets, (b) => b.dwellQ.p90 ?? b.dwellQ.p50 ?? 0) || 12;

  const y = scaleLinear()
    .domain([0, Math.max(4, yMax * 1.14)])
    .nice()
    .range([innerH, 0]);

  g.append('g')
    .call(axisLeft(y).ticks(5).tickSize(-innerW).tickFormat(() => ''))
    .call((sel) => sel.select('.domain').remove())
    .call((sel) => sel.selectAll('line').attr('stroke', 'var(--line)').attr('stroke-opacity', 0.7));

  if (props.compareMode === 'severities') {
    for (const sev of SEVERITY_ORDER) {
      const pts = buckets.filter((b) => b.perSeverity[sev].dwellP50 !== null);
      if (!pts.length) continue;
      const lineGen = d3Line<(typeof pts)[number]>()
        .x((d) => cx(d.key))
        .y((d) => y(d.perSeverity[sev].dwellP50!))
        .curve(curveMonotoneX);
      g.append('path')
        .datum(pts)
        .attr('fill', 'none')
        .attr('stroke', SEV_COLOR[sev])
        .attr('stroke-width', 2.2)
        .attr('d', lineGen);
      g.selectAll(`.ddot-${sev}`)
        .data(pts)
        .join('circle')
        .attr('cx', (d) => cx(d.key))
        .attr('cy', (d) => y(d.perSeverity[sev].dwellP50!))
        .attr('r', props.granularity === 'year' ? 3.2 : 2.2)
        .attr('fill', SEV_COLOR[sev]);
    }
  } else {
    const valid = buckets.filter((b) => b.dwellQ.p50 !== null);
    const iqrValid = valid.filter((b) => b.dwellQ.p25 !== null && b.dwellQ.p75 !== null);
    const p90Valid = valid.filter((b) => b.dwellQ.p90 !== null);

    const areaIqr = d3Area<(typeof iqrValid)[number]>()
      .x((d) => cx(d.key))
      .y0((d) => y(d.dwellQ.p25!))
      .y1((d) => y(d.dwellQ.p75!))
      .curve(curveMonotoneX);
    g.append('path')
      .datum(iqrValid)
      .attr('fill', 'var(--series-7)')
      .attr('opacity', 0.14)
      .attr('d', areaIqr);

    const lineP90 = d3Line<(typeof p90Valid)[number]>()
      .x((d) => cx(d.key))
      .y((d) => y(d.dwellQ.p90!))
      .curve(curveMonotoneX);
    g.append('path')
      .datum(p90Valid)
      .attr('fill', 'none')
      .attr('stroke', 'var(--series-2)')
      .attr('stroke-width', 1.9)
      .attr('stroke-dasharray', '5,4')
      .attr('d', lineP90);

    const lineP50 = d3Line<(typeof valid)[number]>()
      .x((d) => cx(d.key))
      .y((d) => y(d.dwellQ.p50!))
      .curve(curveMonotoneX);
    g.append('path')
      .datum(valid)
      .attr('fill', 'none')
      .attr('stroke', 'var(--series-7)')
      .attr('stroke-width', 2.4)
      .attr('d', lineP50);

    g.selectAll('.dw-dot')
      .data(valid)
      .join('circle')
      .attr('cx', (d) => cx(d.key))
      .attr('cy', (d) => y(d.dwellQ.p50!))
      .attr('r', props.granularity === 'year' ? 3.5 : 2.3)
      .attr('fill', 'var(--series-7)');
  }

  const step = innerW / Math.max(1, buckets.length);
  g.selectAll('.hit-dw')
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
        left: `${Math.min(Math.max(8, relX + 12), width - 225)}px`,
        top: '10px',
      };
      if (props.compareMode === 'severities') {
        hover.value = {
          mode: 'severities',
          bucket: b.key,
          n: b.allN,
          sevRows: SEVERITY_ORDER.map((s) => ({
            sev: s,
            n: b.perSeverity[s].dwellN,
            text: fmtVal(b.perSeverity[s].dwellP50, unitSuffix, isM ? 1 : 0),
          })),
        };
      } else {
        hover.value = {
          mode: 'cohort',
          bucket: b.key,
          n: b.dwellQ.n,
          p50Text: fmtVal(b.dwellQ.p50, unitSuffix, isM ? 1 : 0),
          iqrText: `${fmtVal(b.dwellQ.p25, '', isM ? 1 : 0)} – ${fmtVal(b.dwellQ.p75, unitSuffix, isM ? 1 : 0)}`,
          p90Text: fmtVal(b.dwellQ.p90, unitSuffix, isM ? 1 : 0),
          over1YrPct: b.over1YrPct,
        };
      }
    })
    .on('mouseleave', () => {
      hover.value = null;
    });

  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(axisBottom(x).tickValues(sparseLifespanTicks(keys)).tickSizeOuter(0));
  g.append('g').call(
    axisLeft(y)
      .ticks(5)
      .tickFormat((d) => (isM ? `${d}M` : `${d}d`)),
  );
  styleLifespanAxes(svg);
}

let resizeObs: ResizeObserver | null = null;
onMounted(() => {
  draw();
  resizeObs = new ResizeObserver(() => draw());
  if (wrap.value) resizeObs.observe(wrap.value);
});
onBeforeUnmount(() => resizeObs?.disconnect());
watch(() => [props.buckets, props.granularity, props.compareMode, props.dwellUnit], () => nextTick(draw));
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

.tt-line.tt-sep {
  margin-top: 0.2rem;
  padding-top: 0.22rem;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}
</style>
