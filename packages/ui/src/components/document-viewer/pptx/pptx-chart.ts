/**
 * @fileoverview Renders DrawingML charts (`c:chartSpace`) to SVG from the cached series values
 * every Office writer stores alongside the embedded workbook.
 *
 * Supports bar/column (clustered, stacked, percent), line, area, scatter, pie and doughnut —
 * the chart families decks use in practice. Unsupported chart types render their title and an
 * empty plot frame rather than failing the slide.
 */

import { type ColorContext, type Rgba, resolveColorIn, toCss } from './pptx-color';
import { attr, child, children, numAttr, path, textOf } from './pptx-xml';

const SVG_NS = 'http://www.w3.org/2000/svg';
const AXIS_TEXT = '#595959';
const GRID_LINE = '#D9D9D9';

interface ChartSeries {
  readonly name: string;
  readonly categories: readonly string[];
  readonly values: readonly (number | null)[];
  readonly xValues: readonly (number | null)[];
  readonly color: Rgba | null;
  readonly pointColors: ReadonlyMap<number, Rgba>;
  readonly formatCode: string;
}

interface ChartGroup {
  readonly kind: 'bar' | 'line' | 'area' | 'pie' | 'doughnut' | 'scatter' | 'unsupported';
  readonly horizontal: boolean;
  readonly grouping: 'clustered' | 'stacked' | 'percentStacked' | 'standard';
  readonly series: readonly ChartSeries[];
  readonly gapWidth: number;
  readonly holeSize: number;
  readonly varyColors: boolean;
  readonly showValues: boolean;
  readonly showPercent: boolean;
}

export interface ChartRenderOptions {
  readonly width: number;
  readonly height: number;
  readonly colorCtx: ColorContext;
  readonly fontFamily: string;
}

const KIND_BY_ELEMENT: Readonly<Record<string, ChartGroup['kind']>> = {
  barChart: 'bar',
  bar3DChart: 'bar',
  lineChart: 'line',
  line3DChart: 'line',
  stockChart: 'line',
  radarChart: 'line',
  areaChart: 'area',
  area3DChart: 'area',
  pieChart: 'pie',
  pie3DChart: 'pie',
  ofPieChart: 'pie',
  doughnutChart: 'doughnut',
  scatterChart: 'scatter',
  bubbleChart: 'scatter',
};

export function renderChart(chartSpace: Element, opts: ChartRenderOptions): SVGSVGElement {
  const { width, height } = opts;
  const svg = svgEl('svg', {
    width: String(width),
    height: String(height),
    viewBox: `0 0 ${width} ${height}`,
  }) as SVGSVGElement;
  svg.style.position = 'absolute';
  svg.style.inset = '0';
  svg.style.overflow = 'visible';
  svg.style.fontFamily = opts.fontFamily;

  const chart = child(chartSpace, 'chart');
  const plotArea = child(chart, 'plotArea');
  const groups = children(plotArea)
    .filter((el) => el.localName in KIND_BY_ELEMENT)
    .map((el) => readGroup(el, opts.colorCtx));

  const spaceFill = resolveColorIn(path(chartSpace, 'spPr', 'solidFill'), opts.colorCtx);
  if (spaceFill) {
    svg.appendChild(
      svgEl('rect', {
        x: '0',
        y: '0',
        width: String(width),
        height: String(height),
        fill: toCss(spaceFill),
      })
    );
  }

  let top = 8;
  const title = readTitle(chart, groups);
  if (title) {
    const text = svgEl('text', {
      x: String(width / 2),
      y: String(top + 18),
      'text-anchor': 'middle',
      'font-size': '18.7',
      fill: AXIS_TEXT,
    });
    text.textContent = title;
    svg.appendChild(text);
    top += 32;
  }

  const legendEl = child(chart, 'legend');
  const legendPos = attr(child(legendEl, 'legendPos'), 'val') ?? 'r';
  const legendEntries = legendEl ? buildLegendEntries(groups, opts.colorCtx) : [];
  const plot = { x: 12, y: top, w: width - 24, h: height - top - 12 };
  if (legendEntries.length > 0) {
    if (legendPos === 'r') plot.w -= Math.min(width * 0.3, legendWidth(legendEntries) + 12);
    else if (legendPos === 'l') {
      const lw = Math.min(width * 0.3, legendWidth(legendEntries) + 12);
      plot.x += lw;
      plot.w -= lw;
    } else if (legendPos === 't') {
      plot.y += 24;
      plot.h -= 24;
    } else plot.h -= 28;
  }

  const primary = groups.find((g) => g.kind !== 'unsupported');
  if (primary && plot.w > 20 && plot.h > 20) {
    if (primary.kind === 'pie' || primary.kind === 'doughnut') {
      drawPie(svg, primary, plot, opts.colorCtx);
    } else {
      drawCartesian(
        svg,
        groups.filter((g) => g.kind !== 'pie' && g.kind !== 'doughnut' && g.kind !== 'unsupported'),
        plot,
        opts.colorCtx
      );
    }
  }

  if (legendEntries.length > 0) drawLegend(svg, legendEntries, legendPos, plot, width, height);
  return svg;
}

function readGroup(el: Element, colorCtx: ColorContext): ChartGroup {
  const kind = KIND_BY_ELEMENT[el.localName] ?? 'unsupported';
  const groupingVal = attr(child(el, 'grouping'), 'val') ?? 'clustered';
  const grouping: ChartGroup['grouping'] =
    groupingVal === 'stacked' || groupingVal === 'percentStacked' || groupingVal === 'standard'
      ? groupingVal
      : 'clustered';
  const labelFlag = (name: string): boolean =>
    attr(path(el, 'dLbls', name), 'val') === '1' ||
    children(el, 'ser').some((s) => attr(path(s, 'dLbls', name), 'val') === '1');

  return {
    kind,
    horizontal: attr(child(el, 'barDir'), 'val') === 'bar',
    grouping,
    series: children(el, 'ser').map((ser) => readSeries(ser, colorCtx)),
    gapWidth: numAttr(child(el, 'gapWidth'), 'val') ?? 150,
    holeSize: numAttr(child(el, 'holeSize'), 'val') ?? 50,
    varyColors:
      attr(child(el, 'varyColors'), 'val') === '1' || kind === 'pie' || kind === 'doughnut',
    showValues: labelFlag('showVal'),
    showPercent: labelFlag('showPercent'),
  };
}

function readSeries(ser: Element, colorCtx: ColorContext): ChartSeries {
  const nameCache = path(ser, 'tx', 'strRef', 'strCache') ?? child(ser, 'tx');
  const name = cachePoints(nameCache)[0] ?? textOf(path(ser, 'tx', 'v'));
  const catSource = child(ser, 'cat') ?? child(ser, 'xVal');
  const categories = cachePoints(findCache(catSource));
  const valCache = findCache(child(ser, 'val') ?? child(ser, 'yVal'));
  const xCache = findCache(child(ser, 'xVal'));

  const spPr = child(ser, 'spPr');
  const color =
    resolveColorIn(child(spPr, 'solidFill'), colorCtx) ??
    resolveColorIn(path(spPr, 'ln', 'solidFill'), colorCtx) ??
    resolveColorIn(path(spPr, 'gradFill', 'gsLst', 'gs'), colorCtx);

  const pointColors = new Map<number, Rgba>();
  for (const dPt of children(ser, 'dPt')) {
    const idx = numAttr(child(dPt, 'idx'), 'val');
    const c = resolveColorIn(path(dPt, 'spPr', 'solidFill'), colorCtx);
    if (idx !== null && c) pointColors.set(idx, c);
  }

  return {
    name,
    categories,
    values: cachePoints(valCache).map(toNumber),
    xValues: cachePoints(xCache).map(toNumber),
    color,
    pointColors,
    formatCode: textOf(child(valCache, 'formatCode')),
  };
}

function findCache(source: Element | null): Element | null {
  if (!source) return null;
  return (
    path(source, 'strRef', 'strCache') ??
    path(source, 'numRef', 'numCache') ??
    path(source, 'multiLvlStrRef', 'multiLvlStrCache', 'lvl') ??
    child(source, 'strLit') ??
    child(source, 'numLit')
  );
}

function cachePoints(cache: Element | null): string[] {
  if (!cache) return [];
  const count = numAttr(child(cache, 'ptCount'), 'val');
  const pts = children(cache, 'pt');
  const out: string[] = new Array(Math.max(count ?? 0, pts.length)).fill('');
  pts.forEach((pt, i) => {
    const idx = numAttr(pt, 'idx') ?? i;
    if (idx >= 0 && idx < out.length + 1000) out[idx] = textOf(child(pt, 'v'));
  });
  return out;
}

function toNumber(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function readTitle(chart: Element | null, groups: readonly ChartGroup[]): string | null {
  const titleEl = child(chart, 'title');
  if (titleEl) {
    const rich = path(titleEl, 'tx', 'rich');
    if (rich) {
      return (
        children(rich, 'p')
          .map((p) => Array.from(p.getElementsByTagNameNS('*', 't')).map(textOf).join(''))
          .join(' ')
          .trim() || null
      );
    }
    const ref = cachePoints(path(titleEl, 'tx', 'strRef', 'strCache'))[0];
    if (ref) return ref;
  }
  // PowerPoint auto-titles single-series charts with the series name.
  const autoDeleted = attr(child(chart, 'autoTitleDeleted'), 'val') === '1';
  const series = groups.flatMap((g) => g.series);
  if (titleEl && !autoDeleted && series.length === 1) return series[0]?.name || null;
  return null;
}

function seriesColor(series: ChartSeries, index: number, colorCtx: ColorContext): string {
  return toCss(series.color ?? accentColor(index, colorCtx));
}

function accentColor(index: number, colorCtx: ColorContext): Rgba {
  const hex = colorCtx.scheme[`accent${(index % 6) + 1}`] ?? '4472C4';
  const base = {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
    a: 1,
  };
  // Office cycles darker, then lighter variants after the six accents.
  const cycle = Math.floor(index / 6);
  if (cycle === 0) return base;
  const factor = cycle % 2 === 1 ? 0.6 : 1.4;
  return {
    r: Math.min(255, base.r * factor),
    g: Math.min(255, base.g * factor),
    b: Math.min(255, base.b * factor),
    a: 1,
  };
}

interface LegendEntry {
  readonly label: string;
  readonly color: string;
}

function buildLegendEntries(groups: readonly ChartGroup[], colorCtx: ColorContext): LegendEntry[] {
  const pie = groups.find((g) => g.kind === 'pie' || g.kind === 'doughnut');
  if (pie && pie.series[0]) {
    const s = pie.series[0];
    return s.categories.map((label, i) => ({
      label,
      color: toCss(s.pointColors.get(i) ?? accentColor(i, colorCtx)),
    }));
  }
  let index = 0;
  const out: LegendEntry[] = [];
  for (const g of groups) {
    for (const s of g.series) {
      out.push({ label: s.name || `Series ${index + 1}`, color: seriesColor(s, index, colorCtx) });
      index++;
    }
  }
  return out;
}

function legendWidth(entries: readonly LegendEntry[]): number {
  return Math.max(...entries.map((e) => e.label.length * 6.5)) + 20;
}

function drawLegend(
  svg: SVGSVGElement,
  entries: readonly LegendEntry[],
  pos: string,
  plot: { x: number; y: number; w: number; h: number },
  width: number,
  height: number
): void {
  const vertical = pos === 'r' || pos === 'l' || pos === 'tr';
  if (vertical) {
    const x = pos === 'l' ? 12 : plot.x + plot.w + 12;
    let y = plot.y + Math.max(0, (plot.h - entries.length * 20) / 2);
    for (const e of entries) {
      legendItem(svg, x, y, e);
      y += 20;
    }
    return;
  }
  const itemWidths = entries.map((e) => e.label.length * 6.5 + 26);
  const total = itemWidths.reduce((a, b) => a + b, 0);
  let x = Math.max(12, (width - total) / 2);
  const y = pos === 't' ? plot.y - 22 : height - 22;
  entries.forEach((e, i) => {
    legendItem(svg, x, y, e);
    x += itemWidths[i] ?? 0;
  });
}

function legendItem(svg: SVGSVGElement, x: number, y: number, entry: LegendEntry): void {
  svg.appendChild(
    svgEl('rect', { x: String(x), y: String(y + 3), width: '9', height: '9', fill: entry.color })
  );
  const text = svgEl('text', {
    x: String(x + 14),
    y: String(y + 12),
    'font-size': '12',
    fill: AXIS_TEXT,
  });
  text.textContent = entry.label;
  svg.appendChild(text);
}

function drawPie(
  svg: SVGSVGElement,
  group: ChartGroup,
  plot: { x: number; y: number; w: number; h: number },
  colorCtx: ColorContext
): void {
  const series = group.series[0];
  if (!series) return;
  const values = series.values.map((v) => Math.max(0, v ?? 0));
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return;

  const r = Math.min(plot.w, plot.h) / 2 - 4;
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.h / 2;
  const inner = group.kind === 'doughnut' ? (r * group.holeSize) / 100 : 0;
  let angle = -Math.PI / 2;

  values.forEach((v, i) => {
    if (v <= 0) return;
    const sweep = (v / total) * Math.PI * 2;
    const color = toCss(
      series.pointColors.get(i) ??
        (group.varyColors ? accentColor(i, colorCtx) : (series.color ?? accentColor(0, colorCtx)))
    );
    const d =
      sweep >= Math.PI * 2 - 1e-6
        ? fullRing(cx, cy, r, inner)
        : slicePath(cx, cy, r, inner, angle, angle + sweep);
    svg.appendChild(
      svgEl('path', {
        d,
        fill: color,
        stroke: '#FFFFFF',
        'stroke-width': '1',
        'fill-rule': 'evenodd',
      })
    );

    if (group.showValues || group.showPercent) {
      const mid = angle + sweep / 2;
      const lr = inner > 0 ? (r + inner) / 2 : r * 0.65;
      const label = svgEl('text', {
        x: String(cx + lr * Math.cos(mid)),
        y: String(cy + lr * Math.sin(mid) + 4),
        'text-anchor': 'middle',
        'font-size': '12',
        fill: '#FFFFFF',
      });
      label.textContent = group.showPercent
        ? `${Math.round((v / total) * 100)}%`
        : formatValue(v, series.formatCode);
      svg.appendChild(label);
    }
    angle += sweep;
  });
}

function slicePath(
  cx: number,
  cy: number,
  r: number,
  inner: number,
  a0: number,
  a1: number
): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const p = (rad: number, a: number): string =>
    `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`;
  if (inner <= 0) return `M${cx},${cy} L${p(r, a0)} A${r},${r} 0 ${large},1 ${p(r, a1)} Z`;
  return `M${p(r, a0)} A${r},${r} 0 ${large},1 ${p(r, a1)} L${p(inner, a1)} A${inner},${inner} 0 ${large},0 ${p(inner, a0)} Z`;
}

function fullRing(cx: number, cy: number, r: number, inner: number): string {
  const circle = (rad: number): string =>
    `M${cx - rad},${cy} A${rad},${rad} 0 1,0 ${cx + rad},${cy} A${rad},${rad} 0 1,0 ${cx - rad},${cy} Z`;
  return inner > 0 ? `${circle(r)} ${circle(inner)}` : circle(r);
}

function drawCartesian(
  svg: SVGSVGElement,
  groups: readonly ChartGroup[],
  plot: { x: number; y: number; w: number; h: number },
  colorCtx: ColorContext
): void {
  if (groups.length === 0) return;
  const horizontal = groups[0]?.kind === 'bar' && groups[0].horizontal;
  const scatter = groups.every((g) => g.kind === 'scatter');
  const categories = groups
    .flatMap((g) => g.series)
    .reduce<
      readonly string[]
    >((longest, s) => (s.categories.length > longest.length ? s.categories : longest), []);
  const catCount = Math.max(
    1,
    categories.length,
    ...groups.flatMap((g) => g.series.map((s) => s.values.length))
  );

  // Value range across all groups (stacked groups contribute their stack totals).
  let min = 0;
  let max = 0;
  for (const g of groups) {
    if (g.grouping === 'percentStacked') {
      max = Math.max(max, 1);
      continue;
    }
    if (g.grouping === 'stacked') {
      for (let i = 0; i < catCount; i++) {
        let pos = 0;
        let neg = 0;
        for (const s of g.series) {
          const v = s.values[i] ?? 0;
          if (v >= 0) pos += v;
          else neg += v;
        }
        max = Math.max(max, pos);
        min = Math.min(min, neg);
      }
    } else {
      for (const s of g.series) {
        for (const v of s.values) {
          if (v === null) continue;
          max = Math.max(max, v);
          min = Math.min(min, v);
        }
      }
    }
  }
  const ticks = niceTicks(min, max === min ? min + 1 : max);
  const lo = ticks[0] ?? 0;
  const hi = ticks[ticks.length - 1] ?? 1;
  const percentAxis = groups.some((g) => g.grouping === 'percentStacked');
  const formatCode = groups[0]?.series[0]?.formatCode ?? '';

  // Reserve room for axis labels.
  const labelWidth =
    Math.max(...ticks.map((t) => formatAxis(t, formatCode, percentAxis).length * 7)) + 8;
  const area = horizontal
    ? {
        x:
          plot.x + Math.min(plot.w * 0.3, Math.max(...categories.map((c) => c.length * 7), 20) + 8),
        y: plot.y,
        w: 0,
        h: plot.h - 20,
      }
    : { x: plot.x + labelWidth, y: plot.y + 4, w: 0, h: plot.h - 26 };
  area.w = plot.x + plot.w - area.x - 4;
  if (area.w <= 10 || area.h <= 10) return;

  const valueToPos = (v: number): number =>
    horizontal
      ? area.x + ((v - lo) / (hi - lo)) * area.w
      : area.y + area.h - ((v - lo) / (hi - lo)) * area.h;

  // Gridlines + value labels.
  for (const t of ticks) {
    const p = valueToPos(t);
    svg.appendChild(
      horizontal
        ? svgEl('line', {
            x1: String(p),
            y1: String(area.y),
            x2: String(p),
            y2: String(area.y + area.h),
            stroke: GRID_LINE,
            'stroke-width': '1',
          })
        : svgEl('line', {
            x1: String(area.x),
            y1: String(p),
            x2: String(area.x + area.w),
            y2: String(p),
            stroke: GRID_LINE,
            'stroke-width': '1',
          })
    );
    const label = svgEl('text', {
      x: String(horizontal ? p : area.x - 6),
      y: String(horizontal ? area.y + area.h + 15 : p + 4),
      'text-anchor': horizontal ? 'middle' : 'end',
      'font-size': '12',
      fill: AXIS_TEXT,
    });
    label.textContent = formatAxis(t, formatCode, percentAxis);
    svg.appendChild(label);
  }

  const band = (horizontal ? area.h : area.w) / catCount;
  const catCenter = (i: number): number =>
    horizontal ? area.y + band * (i + 0.5) : area.x + band * (i + 0.5);

  // Category axis line + labels.
  const zero = valueToPos(Math.max(lo, Math.min(hi, 0)));
  svg.appendChild(
    horizontal
      ? svgEl('line', {
          x1: String(zero),
          y1: String(area.y),
          x2: String(zero),
          y2: String(area.y + area.h),
          stroke: '#BFBFBF',
          'stroke-width': '1',
        })
      : svgEl('line', {
          x1: String(area.x),
          y1: String(zero),
          x2: String(area.x + area.w),
          y2: String(zero),
          stroke: '#BFBFBF',
          'stroke-width': '1',
        })
  );
  if (!scatter) {
    const stride = Math.max(
      1,
      Math.ceil((catCount * 7 * 6) / Math.max(1, horizontal ? area.h * 6 : area.w))
    );
    categories.forEach((cat, i) => {
      if (i % stride !== 0) return;
      const c = catCenter(i);
      const label = svgEl('text', {
        x: String(horizontal ? area.x - 6 : c),
        y: String(horizontal ? c + 4 : area.y + area.h + 16),
        'text-anchor': horizontal ? 'end' : 'middle',
        'font-size': '12',
        fill: AXIS_TEXT,
      });
      label.textContent = cat;
      svg.appendChild(label);
    });
  }

  let seriesIndex = 0;
  for (const g of groups) {
    const startIndex = seriesIndex;
    seriesIndex += g.series.length;

    if (g.kind === 'bar') {
      const gap = g.gapWidth / 100;
      const stacked = g.grouping === 'stacked' || g.grouping === 'percentStacked';
      const slots = stacked ? 1 : Math.max(1, g.series.length);
      const barSize = band / (slots + gap);
      for (let i = 0; i < catCount; i++) {
        let posAcc = 0;
        let negAcc = 0;
        const total =
          g.grouping === 'percentStacked'
            ? g.series.reduce((sum, s) => sum + Math.abs(s.values[i] ?? 0), 0) || 1
            : 1;
        g.series.forEach((s, si) => {
          const raw = s.values[i];
          if (raw === null || raw === undefined) return;
          const v = raw / total;
          let from = 0;
          let to = v;
          if (stacked) {
            if (v >= 0) {
              from = posAcc;
              to = posAcc + v;
              posAcc = to;
            } else {
              from = negAcc;
              to = negAcc + v;
              negAcc = to;
            }
          }
          const bandStart = (horizontal ? area.y : area.x) + band * i + (barSize * gap) / 2;
          const offset = stacked ? 0 : barSize * si;
          const p0 = valueToPos(from);
          const p1 = valueToPos(to);
          const color = toCss(
            s.pointColors.get(i) ??
              (g.varyColors && g.series.length === 1
                ? accentColor(i, colorCtx)
                : (s.color ?? accentColor(startIndex + si, colorCtx)))
          );
          const rect = horizontal
            ? { x: Math.min(p0, p1), y: bandStart + offset, w: Math.abs(p1 - p0), h: barSize }
            : { x: bandStart + offset, y: Math.min(p0, p1), w: barSize, h: Math.abs(p1 - p0) };
          svg.appendChild(
            svgEl('rect', {
              x: String(rect.x),
              y: String(rect.y),
              width: String(rect.w),
              height: String(rect.h),
              fill: color,
            })
          );
          if (g.showValues) {
            const label = svgEl('text', {
              x: String(horizontal ? rect.x + rect.w + 4 : rect.x + rect.w / 2),
              y: String(horizontal ? rect.y + rect.h / 2 + 4 : rect.y - 4),
              'text-anchor': horizontal ? 'start' : 'middle',
              'font-size': '11',
              fill: AXIS_TEXT,
            });
            label.textContent = formatValue(raw, s.formatCode);
            svg.appendChild(label);
          }
        });
      }
    } else if (g.kind === 'line' || g.kind === 'area' || g.kind === 'scatter') {
      const xs = g.series[0]?.xValues ?? [];
      const xMin = Math.min(...xs.filter((x): x is number => x !== null), 0);
      const xMax = Math.max(...xs.filter((x): x is number => x !== null), 1);
      const stackAcc = new Array<number>(catCount).fill(0);
      g.series.forEach((s, si) => {
        const color = seriesColor(s, startIndex + si, colorCtx);
        const pts: [number, number][] = [];
        s.values.forEach((raw, i) => {
          if (raw === null) return;
          let v = raw;
          if (g.grouping === 'stacked') {
            stackAcc[i] = (stackAcc[i] ?? 0) + raw;
            v = stackAcc[i] ?? raw;
          }
          const x =
            g.kind === 'scatter' && s.xValues[i] !== null && s.xValues[i] !== undefined
              ? area.x + (((s.xValues[i] as number) - xMin) / (xMax - xMin || 1)) * area.w
              : catCenter(i);
          pts.push([x, valueToPos(v)]);
        });
        if (pts.length === 0) return;
        const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
        if (g.kind === 'area') {
          const first = pts[0] as [number, number];
          const last = pts[pts.length - 1] as [number, number];
          svg.appendChild(
            svgEl('path', {
              d: `${line} L${last[0]},${zero} L${first[0]},${zero} Z`,
              fill: color,
              'fill-opacity': '0.85',
            })
          );
        } else {
          svg.appendChild(
            svgEl('path', {
              d: line,
              fill: 'none',
              stroke: color,
              'stroke-width': '2.25',
              'stroke-linejoin': 'round',
            })
          );
          for (const [x, y] of pts) {
            svg.appendChild(svgEl('circle', { cx: String(x), cy: String(y), r: '3', fill: color }));
          }
        }
      });
    }
  }
}

function niceTicks(min: number, max: number): number[] {
  const span = max - min;
  const rawStep = span / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = start; v <= end + step / 2 && out.length < 50; v += step) {
    out.push(Math.round(v / step) * step);
  }
  return out;
}

function formatAxis(v: number, formatCode: string, percent: boolean): string {
  if (percent) return `${Math.round(v * 100)}%`;
  return formatValue(v, formatCode);
}

function formatValue(v: number, formatCode: string): string {
  if (formatCode.includes('%')) {
    const decimals = /\.(0+)%/.exec(formatCode)?.[1]?.length ?? 0;
    return `${(v * 100).toFixed(decimals)}%`;
  }
  const decimals = /\.(0+)/.exec(formatCode)?.[1]?.length;
  const prefix = /^"?\$/.test(formatCode) || formatCode.includes('[$$') ? '$' : '';
  const formatted = v.toLocaleString('en-US', {
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? 2,
  });
  return `${prefix}${formatted}`;
}

function svgEl(name: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}
