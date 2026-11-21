<template>
  <div ref="wrap" class="hero-svg-box">
    <svg ref="svgEl" />
    <div v-if="hover" class="floating-tt" :style="ttStyle">
      <div class="tt-title">{{ hover.bucket }} ({{ fmtInt(hover.n) }} CVEs)</div>
      <template v-if="hover.mode === 'severities'">
        <div v-for="row in hover.sevRows" :key="row.sev" class="tt-line">
          <span>{{ row.sev }} (n={{ row.n }}):</span>
          <strong>{{ row.val !== null ? `${row.val.toFixed(1)}d` : '—' }}</strong>
        </div>
      </template>
      <template v-else-if="hover.mode === 'stacked'">
        <div class="tt-line">
          <span>1. Bug → Trunk Fix P50:</span>
          <strong>{{ fmtVal(hover.eng, 'd') }}</strong>
        </div>
        <div class="tt-line">
          <span>2. Branch Merge P50:</span>
          <strong>{{ fmtVal(hover.merge, 'd') }}</strong>
        </div>
        <div class="tt-line">
          <span>3. Final Fix → Stable P50:</span>
          <strong>{{ fmtVal(hover.rollout, 'd') }}</strong>
        </div>
        <div class="tt-line tt-sep">
          <span>Overall Bug → Stable P50 / P90:</span>
          <strong>{{ fmtVal(hover.totalP50, 'd') }} / {{ fmtVal(hover.totalP90, 'd') }}</strong>
        </div>
      </template>
      <template v-else>
        <div class="tt-line">
          <span>Median (P50):</span>
          <strong>{{ fmtVal(hover.p50, 'd') }}</strong>
        </div>
        <div class="tt-line">
          <span>IQR (P25 – P75):</span>
          <strong>{{ fmtVal(hover.p25, '') }} – {{ fmtVal(hover.p75, 'd') }}</strong>
        </div>
        <div class="tt-line">
          <span>90th Percentile (P90):</span>
          <strong>{{ fmtVal(hover.p90, 'd') }}</strong>
        </div>
        <div class="tt-line tt-sep">
          <span>Eng Fix P50 / Soak P50:</span>
          <strong>{{ fmtVal(hover.engP50, 'd') }} / {{ fmtVal(hover.soakP50, 'd') }}</strong>
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
  turnaroundStyle: 'band' | 'stacked';
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

  const width = Math.max(360, wrap.value.clientWidth);
  const height = 300;
  const margin = { top: 22, right: 24, bottom: 34, left: 48 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const keys = buckets.map((b) => b.key);
  const x = scaleBand<string>().domain(keys).range([0, innerW]).padding(0.24);
  const cx = (k: string) => (x(k) || 0) + x.bandwidth() / 2;

  let yMax = 60;
  if (props.compareMode === 'severities') {
    yMax =
      max(buckets, (b) =>
        max(SEVERITY_ORDER, (s) => b.perSeverity[s].turnP50 ?? 0),
      ) || 80;
  } else if (props.turnaroundStyle === 'stacked') {
    yMax =
      max(buckets, (b) => {
        const sum = (b.engP50 || 0) + (b.mergeP50 || 0) + (b.rolloutP50 || 0);
        return Math.max(sum, b.btsP50 || 0);
      }) || 60;
  } else {
    yMax = max(buckets, (b) => b.metricQ.p90 ?? b.metricQ.p50 ?? 0) || 80;
  }

  const y = scaleLinear()
    .domain([0, yMax * 1.14])
    .nice()
    .range([innerH, 0]);

  g.append('g')
    .call(axisLeft(y).ticks(5).tickSize(-innerW).tickFormat(() => ''))
    .call((sel) => sel.select('.domain').remove())
    .call((sel) => sel.selectAll('line').attr('stroke', 'var(--line)').attr('stroke-opacity', 0.75));

  const annotations =
    props.granularity === 'year'
      ? [
          { key: '2021', label: 'M94: 4-wk Stable' },
          { key: '2023', label: 'M116: Weekly security updates' },
          { key: '2026', label: 'CNA expansion' },
        ]
      : [
          { key: '2021Q3', label: 'M94: 4-wk Stable' },
          { key: '2023Q3', label: 'M116: Weekly updates' },
          { key: '2026Q1', label: 'CNA expansion' },
        ];

  for (const ann of annotations) {
    if (!keys.includes(ann.key)) continue;
    const ax = cx(ann.key);
    g.append('line')
      .attr('x1', ax)
      .attr('x2', ax)
      .attr('y1', 0)
      .attr('y2', innerH)
      .attr('stroke', 'var(--line-strong)')
      .attr('stroke-dasharray', '3,3');
    g.append('text')
      .attr('x', Math.min(innerW - 4, ax + 4))
      .attr('y', 10)
      .attr('text-anchor', ax > innerW - 110 ? 'end' : 'start')
      .attr('fill', 'var(--muted)')
      .style('font-size', '10px')
      .text(ann.label);
  }

  if (props.compareMode === 'severities') {
    for (const sev of SEVERITY_ORDER) {
      const pts = buckets.filter((b) => b.perSeverity[sev].turnP50 !== null);
      if (!pts.length) continue;
      const lineGen = d3Line<(typeof pts)[number]>()
        .x((d) => cx(d.key))
        .y((d) => y(d.perSeverity[sev].turnP50!))
        .curve(curveMonotoneX);
      g.append('path')
        .datum(pts)
        .attr('fill', 'none')
        .attr('stroke', SEV_COLOR[sev])
        .attr('stroke-width', 2.4)
        .attr('d', lineGen);
      g.selectAll(`.dot-${sev}`)
        .data(pts)
        .join('circle')
        .attr('cx', (d) => cx(d.key))
        .attr('cy', (d) => y(d.perSeverity[sev].turnP50!))
        .attr('r', props.granularity === 'year' ? 3.5 : 2.5)
        .attr('fill', SEV_COLOR[sev]);
    }
  } else if (props.turnaroundStyle === 'stacked') {
    const stages = [
      { key: 'engP50', color: 'var(--series-1)' },
      { key: 'mergeP50', color: 'var(--series-4)' },
      { key: 'rolloutP50', color: 'var(--series-3)' },
    ] as const;

    for (const b of buckets) {
      let acc = 0;
      const bx = x(b.key) || 0;
      for (const st of stages) {
        const v = b[st.key] || 0;
        if (v <= 0) continue;
        const y0 = y(acc);
        const y1 = y(acc + v);
        g.append('rect')
          .attr('x', bx)
          .attr('y', y1)
          .attr('width', x.bandwidth())
          .attr('height', Math.max(1, y0 - y1))
          .attr('rx', 2)
          .attr('fill', st.color)
          .attr('opacity', 0.9);
        acc += v;
      }
    }

    const totalPts = buckets.filter((b) => b.btsP50 !== null);
    const totalLine = d3Line<(typeof totalPts)[number]>()
      .x((d) => cx(d.key))
      .y((d) => y(d.btsP50!))
      .curve(curveMonotoneX);
    g.append('path')
      .datum(totalPts)
      .attr('fill', 'none')
      .attr('stroke', 'var(--severity-critical)')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,3')
      .attr('d', totalLine);
  } else {
    const valid = buckets.filter((b) => b.metricQ.p50 !== null);
    const iqrValid = valid.filter((b) => b.metricQ.p25 !== null && b.metricQ.p75 !== null);
    const p90Valid = valid.filter((b) => b.metricQ.p90 !== null);

    const areaIqr = d3Area<(typeof iqrValid)[number]>()
      .x((d) => cx(d.key))
      .y0((d) => y(d.metricQ.p25!))
      .y1((d) => y(d.metricQ.p75!))
      .curve(curveMonotoneX);
    g.append('path')
      .datum(iqrValid)
      .attr('fill', 'var(--series-1)')
      .attr('opacity', 0.14)
      .attr('d', areaIqr);

    const lineP90 = d3Line<(typeof p90Valid)[number]>()
      .x((d) => cx(d.key))
      .y((d) => y(d.metricQ.p90!))
      .curve(curveMonotoneX);
    g.append('path')
      .datum(p90Valid)
      .attr('fill', 'none')
      .attr('stroke', 'var(--series-2)')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,4')
      .attr('d', lineP90);

    const lineP50 = d3Line<(typeof valid)[number]>()
      .x((d) => cx(d.key))
      .y((d) => y(d.metricQ.p50!))
      .curve(curveMonotoneX);
    g.append('path')
      .datum(valid)
      .attr('fill', 'none')
      .attr('stroke', 'var(--series-1)')
      .attr('stroke-width', 2.6)
      .attr('d', lineP50);

    g.selectAll('.p50-dot')
      .data(valid)
      .join('circle')
      .attr('cx', (d) => cx(d.key))
      .attr('cy', (d) => y(d.metricQ.p50!))
      .attr('r', props.granularity === 'year' ? 3.8 : 2.6)
      .attr('fill', 'var(--series-1)');
  }

  const step = innerW / Math.max(1, buckets.length);
  g.selectAll('.hit-col')
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
        left: `${Math.min(Math.max(12, relX + 14), width - 255)}px`,
        top: '14px',
      };
      if (props.compareMode === 'severities') {
        hover.value = {
          mode: 'severities',
          bucket: b.key,
          n: b.allN,
          sevRows: SEVERITY_ORDER.map((s) => ({
            sev: s,
            n: b.perSeverity[s].n,
            val: b.perSeverity[s].turnP50,
          })),
        };
      } else if (props.turnaroundStyle === 'stacked') {
        hover.value = {
          mode: 'stacked',
          bucket: b.key,
          n: b.n,
          eng: b.engP50,
          merge: b.mergeP50,
          rollout: b.rolloutP50,
          totalP50: b.btsP50,
          totalP90: b.btsP90,
        };
      } else {
        hover.value = {
          mode: 'band',
          bucket: b.key,
          n: b.metricQ.n,
          p25: b.metricQ.p25,
          p50: b.metricQ.p50,
          p75: b.metricQ.p75,
          p90: b.metricQ.p90,
          engP50: b.engP50,
          soakP50: b.rolloutP50,
        };
      }
    })
    .on('mouseleave', () => {
      hover.value = null;
    });

  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(axisBottom(x).tickValues(sparseLifespanTicks(keys)).tickSizeOuter(0));
  g.append('g').call(axisLeft(y).ticks(5).tickFormat((d) => `${d}d`));
  styleLifespanAxes(svg);
}

let resizeObs: ResizeObserver | null = null;
onMounted(() => {
  draw();
  resizeObs = new ResizeObserver(() => draw());
  if (wrap.value) resizeObs.observe(wrap.value);
});
onBeforeUnmount(() => resizeObs?.disconnect());
watch(() => [props.buckets, props.granularity, props.compareMode, props.turnaroundStyle], () => nextTick(draw));
</script>

<style scoped>
.hero-svg-box {
  position: relative;
  width: 100%;
  min-height: 300px;
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
