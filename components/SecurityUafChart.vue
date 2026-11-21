<template>
  <div ref="chartWrap" class="roi-svg-wrap">
    <svg ref="svgEl" />
    <div v-if="hover" class="roi-tooltip" :style="tooltipStyle">
      <div class="roi-tt-head">{{ hover.period }}</div>
      <div class="roi-tt-row">
        <span style="color: var(--series-8)">Browser / Non-Renderer UAF:</span>
        <strong style="color: var(--series-8)">{{ hover.browserText }}</strong>
      </div>
      <div class="roi-tt-row">
        <span style="color: var(--series-2)">Blink / V8 / Renderer UAF:</span>
        <strong style="color: var(--series-2)">{{ hover.rendererText }}</strong>
      </div>
      <div class="roi-tt-row">
        <span>Combined UAF share:</span>
        <strong>{{ hover.totalUafShare }}</strong>
      </div>
      <hr class="roi-tt-sep" />
      <div class="roi-tt-row">
        <span style="color: var(--series-1)">raw_ptr + raw_ref:</span>
        <strong style="color: var(--series-1)">{{ fmtInt(hover.rawPtrTotal) }}</strong>
      </div>
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
import { fmtCompact, fmtInt, fmtUsd, type UafRow } from '~/utils/security';

const props = defineProps<{
  rows: UafRow[];
  metric: 'vrp_share' | 'count' | 'usd' | 'all_share';
  granularity: 'yearly' | 'quarterly';
}>();

const chartWrap = ref<HTMLElement | null>(null);
const svgEl = ref<SVGSVGElement | null>(null);
const hover = ref<any>(null);
const tooltipPos = ref({ x: 0, y: 0 });
const tooltipStyle = computed(() => ({
  left: `${tooltipPos.value.x}px`,
  top: `${tooltipPos.value.y}px`,
}));

const renderChart = () => {
  if (!props.rows.length || !svgEl.value || !chartWrap.value) return;
  const rows = props.rows;

  const width = chartWrap.value.clientWidth || 900;
  const height = 320;
  const margin = { top: 20, right: 68, bottom: 38, left: 56 };
  const innerW = Math.max(100, width - margin.left - margin.right);
  const innerH = Math.max(100, height - margin.top - margin.bottom);

  const svg = select(svgEl.value);
  svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
  svg.selectAll('*').remove();

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const periods = rows.map((r) => r.period);
  const x = scaleBand<string>().domain(periods).range([0, innerW]).padding(0.26);

  const isShare = props.metric === 'vrp_share' || props.metric === 'all_share';

  const extractSegments = (r: UafRow) => {
    const src = props.metric === 'all_share' ? r.all : r.vrp;
    if (isShare) {
      const tot = src.total || 1;
      return [
        { key: 'browser', val: (src.uafBrowser / tot) * 100, color: 'var(--series-8)' },
        { key: 'renderer', val: (src.uafRenderer / tot) * 100, color: 'var(--series-2)' },
      ];
    }
    if (props.metric === 'usd') {
      const nonUafUsd = Math.max(0, src.vrpUsd - src.uafUsd);
      return [
        { key: 'browser', val: src.uafBrowserUsd, color: 'var(--series-8)' },
        { key: 'renderer', val: src.uafRendererUsd, color: 'var(--series-2)' },
        { key: 'other', val: nonUafUsd, color: 'var(--line-strong)' },
      ];
    }
    const nonUaf = Math.max(0, src.total - src.uaf);
    return [
      { key: 'browser', val: src.uafBrowser, color: 'var(--series-8)' },
      { key: 'renderer', val: src.uafRenderer, color: 'var(--series-2)' },
      { key: 'other', val: nonUaf, color: 'var(--line-strong)' },
    ];
  };

  const stackedData = rows.map((r) => {
    const segs = extractSegments(r);
    let y0 = 0;
    const rects = segs.map((s) => {
      const item = { ...s, y0, y1: y0 + s.val };
      y0 += s.val;
      return item;
    });
    return { period: r.period, row: r, total: y0, rects };
  });

  const maxLeft = isShare
    ? Math.min(100, Math.max(50, (max(stackedData, (d) => d.total) || 50) * 1.15))
    : (max(stackedData, (d) => d.total) || 10) * 1.08;
  const yLeft = scaleLinear().domain([0, maxLeft]).range([innerH, 0]);

  const maxRight = (max(rows, (r) => r.rawPtrTotal) || 1000) * 1.1;
  const yRight = scaleLinear().domain([0, maxRight]).range([innerH, 0]);

  g.append('g')
    .selectAll('line')
    .data(yLeft.ticks(5))
    .join('line')
    .attr('x1', 0)
    .attr('x2', innerW)
    .attr('y1', (d) => yLeft(d))
    .attr('y2', (d) => yLeft(d))
    .attr('stroke', 'var(--line)')
    .attr('stroke-dasharray', '2 3');

  const barGroups = g
    .selectAll('.bar-col')
    .data(stackedData)
    .join('g')
    .attr('class', 'bar-col')
    .attr('transform', (d) => `translate(${x(d.period) || 0},0)`);

  barGroups
    .selectAll('rect')
    .data((d) => d.rects)
    .join('rect')
    .attr('x', 0)
    .attr('width', x.bandwidth())
    .attr('y', (s) => yLeft(s.y1))
    .attr('height', (s) => Math.max(0, yLeft(s.y0) - yLeft(s.y1)))
    .attr('fill', (s) => s.color)
    .attr('rx', 1.5);

  barGroups
    .append('rect')
    .attr('x', -x.step() * 0.1)
    .attr('width', x.step())
    .attr('y', 0)
    .attr('height', innerH)
    .attr('fill', 'transparent')
    .style('cursor', 'crosshair')
    .on('pointerenter pointermove', (event, d) => {
      const src = props.metric === 'all_share' ? d.row.all : d.row.vrp;
      const tot = src.total || 1;
      const fmtEntry = (cnt: number, usd: number) => {
        if (props.metric === 'usd') return `${fmtUsd(usd)} (${cnt})`;
        const pct = ((cnt / tot) * 100).toFixed(1);
        return `${pct}% (${fmtInt(cnt)})`;
      };
      hover.value = {
        period: d.period,
        browserText: fmtEntry(src.uafBrowser, src.uafBrowserUsd),
        rendererText: fmtEntry(src.uafRenderer, src.uafRendererUsd),
        totalUafShare: `${((src.uaf / tot) * 100).toFixed(1)}% (${fmtInt(src.uaf)} / ${fmtInt(src.total)})`,
        rawPtrTotal: d.row.rawPtrTotal,
      };
      const [px, py] = [event.offsetX, event.offsetY];
      tooltipPos.value = {
        x: Math.min(width - 250, Math.max(12, px + 14)),
        y: Math.max(10, py - 24),
      };
    })
    .on('pointerleave', () => {
      hover.value = null;
    });

  const centerX = (period: string) => (x(period) || 0) + x.bandwidth() / 2;
  const rawPtrLine = d3Line<UafRow>()
    .x((r) => centerX(r.period))
    .y((r) => yRight(r.rawPtrTotal))
    .curve(curveMonotoneX);

  g.append('path')
    .datum(rows)
    .attr('fill', 'none')
    .attr('stroke', 'var(--series-1)')
    .attr('stroke-width', 2.4)
    .attr('d', rawPtrLine);

  const lastRow = rows[rows.length - 1];
  const lastX = centerX(lastRow.period);
  const lastY = yRight(lastRow.rawPtrTotal);
  g.append('circle')
    .attr('cx', lastX)
    .attr('cy', lastY)
    .attr('r', 3.5)
    .style('fill', 'var(--series-1)');
  g.append('text')
    .attr('x', lastX - 7)
    .attr('y', Math.max(12, lastY - 6))
    .attr('text-anchor', 'end')
    .attr('font-size', '11px')
    .attr('font-weight', '650')
    .style('fill', 'var(--series-1)')
    .style('paint-order', 'stroke')
    .style('stroke', 'var(--surface)')
    .style('stroke-width', '3px')
    .text(`raw_ptr + raw_ref: ${fmtCompact(lastRow.rawPtrTotal)}`);

  const xTickValues =
    props.granularity === 'quarterly'
      ? periods.filter((p) => p.endsWith('Q1') || p === periods[periods.length - 1])
      : periods;

  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(axisBottom(x).tickValues(xTickValues))
    .call((ax) => ax.selectAll('text').style('fill', 'var(--muted)').attr('font-size', '11px'))
    .call((ax) => ax.selectAll('line,path').style('stroke', 'var(--line-strong)'));

  const leftFmt =
    props.metric === 'usd'
      ? (v: any) => '$' + format('.2~s')(Number(v))
      : isShare
        ? (v: any) => `${v}%`
        : format(',d');

  g.append('g')
    .call(axisLeft(yLeft).ticks(5).tickFormat(leftFmt as any))
    .call((ax) => ax.selectAll('text').style('fill', 'var(--muted)').attr('font-size', '11px'))
    .call((ax) => ax.selectAll('line,path').style('stroke', 'var(--line-strong)'));

  g.append('g')
    .attr('transform', `translate(${innerW},0)`)
    .call(axisRight(yRight).ticks(5).tickFormat(format('.2~s') as any))
    .call((ax) => ax.selectAll('text').style('fill', 'var(--series-1)').attr('font-size', '11px'))
    .call((ax) => ax.selectAll('line,path').style('stroke', 'var(--line-strong)'));
};

let observer: ResizeObserver | null = null;

onMounted(() => {
  nextTick(renderChart);
  if (chartWrap.value) {
    observer = new ResizeObserver(() => renderChart());
    observer.observe(chartWrap.value);
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
});

watch([() => props.rows, () => props.metric, () => props.granularity], () => {
  nextTick(renderChart);
});
</script>

<style scoped>
.roi-svg-wrap {
  min-height: 320px;
  position: relative;
  width: 100%;
}

.roi-tooltip {
  background: var(--tooltip-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  color: var(--tooltip-ink);
  font-size: 0.76rem;
  min-width: 225px;
  padding: 0.55rem 0.7rem;
  pointer-events: none;
  position: absolute;
  z-index: 20;
}

.roi-tt-head {
  font-family: var(--font-mono);
  font-weight: 700;
  margin-bottom: 0.25rem;
}

.roi-tt-row {
  display: flex;
  gap: 0.65rem;
  justify-content: space-between;
  line-height: 1.45;
}

.roi-tt-sep {
  background: rgba(255, 255, 255, 0.16);
  border: 0;
  height: 1px;
  margin: 0.3rem 0;
}
</style>
