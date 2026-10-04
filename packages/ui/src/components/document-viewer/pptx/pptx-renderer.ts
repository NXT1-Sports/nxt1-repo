/**
 * @fileoverview Native PowerPoint (.pptx) slide renderer.
 *
 * Renders each slide to a fixed-size DOM tree (absolute-positioned shapes, SVG geometry, HTML
 * text and tables) that the viewer scales to fit, so decks look like they do in PowerPoint:
 * theme colors and fonts, master → layout → slide placeholder inheritance, backgrounds, preset
 * and custom geometry, pictures with cropping, groups, tables (incl. table styles), charts and
 * SmartArt drawings.
 *
 * Security: the DOM is built with createElement/textContent only — no markup from the file is
 * ever parsed as HTML. Images are served exclusively from blob: URLs created from the package's
 * own media; external links, embedded media and OLE payloads are never loaded.
 */

import { renderChart } from './pptx-chart';
import { type ColorContext, type Rgba, parseHex, resolveColorIn, toCss } from './pptx-color';
import {
  type ShapeGeometry,
  customGeometry,
  isLinePreset,
  presetGeometry,
  readAdjustValues,
} from './pptx-geometry';
import { PptxPackage, type PptxPart, type PptxSlideRef, type PptxTheme } from './pptx-package';
import {
  EMU_PER_PX,
  attr,
  boolAttr,
  child,
  children,
  firstOf,
  numAttr,
  parseXml,
  path,
  relAttr,
  textOf,
} from './pptx-xml';

export { PptxPackageError } from './pptx-package';

export interface PptxRenderOptions {
  /** Maps a document font name to a CSS font-family value (e.g. appending a fallback stack). */
  readonly resolveFontFamily?: (family: string) => string;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const FONT_SCALE_VAR = '--pptx-font-scale';
/** Shrink applied on top of the stored autofit scale; also shrinks exact (point) line spacing. */
const FIT_SCALE_VAR = '--pptx-fit-scale';
const PT_TO_PX = 96 / 72;
/** PowerPoint's single line spacing relative to font size. */
const SINGLE_LINE_HEIGHT = 1.2;

const FILL_ELEMENTS: ReadonlySet<string> = new Set([
  'noFill',
  'solidFill',
  'gradFill',
  'blipFill',
  'pattFill',
  'grpFill',
]);
const BULLET_ELEMENTS: ReadonlySet<string> = new Set(['buNone', 'buChar', 'buAutoNum', 'buBlip']);
const BULLET_FONT_ELEMENTS: ReadonlySet<string> = new Set(['buFontTx', 'buFont']);
const BULLET_COLOR_ELEMENTS: ReadonlySet<string> = new Set(['buClrTx', 'buClr']);
const BULLET_SIZE_ELEMENTS: ReadonlySet<string> = new Set(['buSzTx', 'buSzPct', 'buSzPts']);
const AUTOFIT_ELEMENTS: ReadonlySet<string> = new Set(['normAutofit', 'spAutoFit', 'noAutofit']);
const TEXT_FILL_ELEMENTS: ReadonlySet<string> = new Set(['solidFill', 'gradFill', 'noFill']);

const SYMBOL_FONTS: ReadonlySet<string> = new Set([
  'wingdings',
  'wingdings 2',
  'wingdings 3',
  'symbol',
  'webdings',
]);
/** Common Wingdings/Symbol bullet code points mapped to Unicode equivalents. */
const SYMBOL_BULLET_MAP: Readonly<Record<string, string>> = {
  '§': '■',
  Ø: '➢',
  ü: '✓',
  û: '✗',
  q: '❑',
  v: '❖',
  n: '■',
  l: '●',
  m: '○',
  o: '□',
  p: '■',
  w: '◆',
  u: '◆',
  Ÿ: '•',
  à: '➔',
  è: '➔',
  Ü: '➤',
  Þ: '➢',
  '·': '•',
  '¨': '□',
  ª: '▪',
  '¡': '○',
  Ä: '▸',
};

const DASH_PATTERNS: Readonly<Record<string, readonly number[]>> = {
  dash: [4, 3],
  dashDot: [4, 3, 1, 3],
  dot: [1, 3],
  lgDash: [8, 3],
  lgDashDot: [8, 3, 1, 3],
  lgDashDotDot: [8, 3, 1, 3, 1, 3],
  sysDash: [3, 1],
  sysDot: [1, 1],
  sysDashDot: [3, 1, 1, 1],
  sysDashDotDot: [3, 1, 1, 1, 1, 1],
};

/** "Medium Style 2 - Accent 1": PowerPoint's default table style, often referenced but not embedded. */
const DEFAULT_TABLE_STYLE_ID = '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}';
const DEFAULT_TABLE_STYLE_XML = (() => {
  const ln = (w: number): string =>
    `<a:ln w="${w}"><a:solidFill><a:schemeClr val="lt1"/></a:solidFill></a:ln>`;
  const all = ['left', 'right', 'top', 'bottom', 'insideH', 'insideV']
    .map((side) => `<a:${side}>${ln(12700)}</a:${side}>`)
    .join('');
  const fill = (inner: string): string => `<a:fill><a:solidFill>${inner}</a:solidFill></a:fill>`;
  const accent = '<a:schemeClr val="accent1"/>';
  const lightText = '<a:tcTxStyle b="on"><a:schemeClr val="lt1"/></a:tcTxStyle>';
  return (
    `<a:tblStyle xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" styleId="${DEFAULT_TABLE_STYLE_ID}">` +
    `<a:wholeTbl><a:tcTxStyle><a:schemeClr val="dk1"/></a:tcTxStyle><a:tcStyle><a:tcBdr>${all}</a:tcBdr>` +
    `${fill('<a:schemeClr val="accent1"><a:tint val="20000"/></a:schemeClr>')}</a:tcStyle></a:wholeTbl>` +
    `<a:band1H><a:tcStyle>${fill('<a:schemeClr val="accent1"><a:tint val="40000"/></a:schemeClr>')}</a:tcStyle></a:band1H>` +
    `<a:band1V><a:tcStyle>${fill('<a:schemeClr val="accent1"><a:tint val="40000"/></a:schemeClr>')}</a:tcStyle></a:band1V>` +
    `<a:lastCol>${lightText}<a:tcStyle>${fill(accent)}</a:tcStyle></a:lastCol>` +
    `<a:firstCol>${lightText}<a:tcStyle>${fill(accent)}</a:tcStyle></a:firstCol>` +
    `<a:lastRow>${lightText}<a:tcStyle><a:tcBdr><a:top>${ln(38100)}</a:top></a:tcBdr>${fill(accent)}</a:tcStyle></a:lastRow>` +
    `<a:firstRow>${lightText}<a:tcStyle><a:tcBdr><a:bottom>${ln(38100)}</a:bottom></a:tcBdr>${fill(accent)}</a:tcStyle></a:firstRow>` +
    `</a:tblStyle>`
  );
})();

type FillSpec =
  | { readonly kind: 'none' }
  | { readonly kind: 'solid'; readonly color: Rgba }
  | {
      readonly kind: 'gradient';
      readonly stops: readonly { readonly pos: number; readonly color: Rgba }[];
      readonly angle: number;
      readonly radial: boolean;
    }
  | {
      readonly kind: 'image';
      readonly url: string;
      readonly crop: {
        readonly l: number;
        readonly t: number;
        readonly r: number;
        readonly b: number;
      };
      readonly alpha: number;
      readonly tile: boolean;
      readonly grayscale: boolean;
    };

interface ArrowSpec {
  readonly type: string;
  readonly w: number;
  readonly len: number;
}

interface LineSpec {
  readonly color: Rgba;
  readonly width: number;
  readonly dash: readonly number[] | null;
  readonly cap: 'butt' | 'round' | 'square';
  readonly join: 'miter' | 'round' | 'bevel';
  readonly head: ArrowSpec | null;
  readonly tail: ArrowSpec | null;
}

interface ShadowSpec {
  readonly dx: number;
  readonly dy: number;
  readonly blur: number;
  readonly color: Rgba;
}

/** px = emu * sx + ox, relative to the current container. */
interface Xf {
  readonly sx: number;
  readonly sy: number;
  readonly ox: number;
  readonly oy: number;
}

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

type ShapeLevel = 'slide' | 'layout' | 'master';

interface SlideState {
  readonly ref: PptxSlideRef;
  readonly slideNumber: number;
  readonly theme: PptxTheme;
  readonly colorCtx: ColorContext;
  readonly idPrefix: string;
  nextId: number;
}

interface TextSources {
  /** `a:bodyPr` elements, most specific first. */
  readonly bodyPrs: readonly Element[];
  /** `a:lstStyle`-like level containers, most specific first. */
  readonly lstStyles: readonly Element[];
  /** How many leading `lstStyles` outrank the shape-style / table-style text defaults. */
  readonly ownLstCount: number;
  readonly defaultColor: Rgba | null;
  readonly defaultFont: string | null;
  readonly defaultBold: boolean;
}

interface BodyProps {
  readonly insets: readonly [number, number, number, number];
  readonly anchor: 'flex-start' | 'center' | 'flex-end';
  readonly wrap: boolean;
  readonly vert: string | null;
  readonly autofit: 'norm' | 'shape' | 'none';
  readonly fontScale: number;
  readonly lineReduction: number;
}

let renderSequence = 0;
let fontSequence = 0;

export class PptxPresentation {
  private readonly tableStyleCache = new Map<string, Element | null>();
  /** Document font name (lower-case) → private alias of its registered embedded FontFace. */
  private readonly embeddedFontAliases = new Map<string, string>();
  private readonly fontFaces: FontFace[] = [];

  private constructor(
    private readonly pkg: PptxPackage,
    private readonly options: PptxRenderOptions
  ) {}

  static async load(data: ArrayBuffer, options: PptxRenderOptions = {}): Promise<PptxPresentation> {
    const pkg = await PptxPackage.load(data);
    const presentation = new PptxPresentation(pkg, options);
    await presentation.registerEmbeddedFonts();
    return presentation;
  }

  /**
   * Registers the deck's embedded fonts so text renders in the typeface it was designed with.
   * Each typeface gets a private alias so a deck can never override the app's own fonts.
   */
  private async registerEmbeddedFonts(): Promise<void> {
    if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts)
      return;
    for (const font of this.pkg.embeddedFonts) {
      const key = font.typeface.toLowerCase();
      const alias = this.embeddedFontAliases.get(key) ?? `nxt1-pptx-font-${++fontSequence}`;
      try {
        const face = new FontFace(alias, font.data, {
          weight: font.weight === 'bold' ? '700' : '400',
          style: font.style,
        });
        await face.load();
        document.fonts.add(face);
        this.fontFaces.push(face);
        this.embeddedFontAliases.set(key, alias);
      } catch {
        // Corrupt or unsupported font data: keep the fallback stack for this typeface.
      }
    }
  }

  get slideCount(): number {
    return this.pkg.slides.length;
  }

  get widthPx(): number {
    return this.pkg.widthEmu / EMU_PER_PX;
  }

  get heightPx(): number {
    return this.pkg.heightEmu / EMU_PER_PX;
  }

  /** Renders slide `index` (0-based) at its native pixel size. */
  renderSlide(index: number): HTMLElement {
    const ref = this.pkg.slides[index];
    const root = document.createElement('div');
    root.className = 'nxt1-pptx-slide';
    root.setAttribute('role', 'img');
    root.setAttribute('aria-label', `Slide ${index + 1}`);
    Object.assign(root.style, {
      position: 'relative',
      width: `${this.widthPx}px`,
      height: `${this.heightPx}px`,
      overflow: 'hidden',
      background: '#FFFFFF',
      color: '#000000',
      textAlign: 'left',
      lineHeight: 'normal',
      letterSpacing: 'normal',
      boxSizing: 'border-box',
    });
    if (!ref) return root;

    const state: SlideState = {
      ref,
      slideNumber: index + 1,
      theme: ref.theme,
      colorCtx: { scheme: ref.theme.colors, clrMap: resolveClrMap(ref) },
      idPrefix: `pptx${++renderSequence}`,
      nextId: 0,
    };

    this.renderBackground(root, state);

    const slideShowsMaster = boolAttr(ref.slide.root, 'showMasterSp') !== false;
    const layoutShowsMaster = boolAttr(ref.layout?.root, 'showMasterSp') !== false;
    const topXf: Xf = { sx: 1 / EMU_PER_PX, sy: 1 / EMU_PER_PX, ox: 0, oy: 0 };

    if (slideShowsMaster && layoutShowsMaster && ref.master) {
      this.renderTree(
        path(ref.master.root, 'cSld', 'spTree'),
        root,
        topXf,
        ref.master,
        state,
        'master',
        null
      );
    }
    if (slideShowsMaster && ref.layout) {
      this.renderTree(
        path(ref.layout.root, 'cSld', 'spTree'),
        root,
        topXf,
        ref.layout,
        state,
        'layout',
        null
      );
    }
    this.renderTree(
      path(ref.slide.root, 'cSld', 'spTree'),
      root,
      topXf,
      ref.slide,
      state,
      'slide',
      null
    );
    return root;
  }

  dispose(): void {
    if (typeof document !== 'undefined' && document.fonts) {
      for (const face of this.fontFaces) document.fonts.delete(face);
    }
    this.fontFaces.length = 0;
    this.pkg.dispose();
  }

  // ─── Background ───────────────────────────────────────────────────────────

  private renderBackground(root: HTMLElement, state: SlideState): void {
    const { ref } = state;
    for (const part of [ref.slide, ref.layout, ref.master]) {
      const bg = path(part?.root, 'cSld', 'bg');
      if (!part || !bg) continue;

      let fill: FillSpec | null;
      const bgPr = child(bg, 'bgPr');
      if (bgPr) {
        fill = this.resolveFill(firstOf(bgPr, FILL_ELEMENTS), part, state.colorCtx, null);
      } else {
        const bgRef = child(bg, 'bgRef');
        const idx = numAttr(bgRef, 'idx') ?? 0;
        const phClr = resolveColorIn(bgRef, state.colorCtx);
        const styleFill =
          idx >= 1001
            ? state.theme.bgFillStyles[idx - 1001]
            : idx > 0
              ? state.theme.fillStyles[idx - 1]
              : undefined;
        fill = styleFill
          ? this.resolveFill(styleFill, part, { ...state.colorCtx, phClr }, null)
          : phClr
            ? { kind: 'solid', color: phClr }
            : null;
      }
      if (fill) {
        applyCssFill(root, fill);
        return;
      }
    }
  }

  // ─── Shape tree ───────────────────────────────────────────────────────────

  private renderTree(
    tree: Element | null,
    container: HTMLElement,
    xf: Xf,
    part: PptxPart,
    state: SlideState,
    level: ShapeLevel,
    groupFill: FillSpec | null
  ): void {
    for (const el of children(tree)) {
      try {
        this.renderElement(el, container, xf, part, state, level, groupFill);
      } catch {
        // One malformed shape must not blank the whole slide.
      }
    }
  }

  private renderElement(
    el: Element,
    container: HTMLElement,
    xf: Xf,
    part: PptxPart,
    state: SlideState,
    level: ShapeLevel,
    groupFill: FillSpec | null
  ): void {
    switch (el.localName) {
      case 'sp':
      case 'cxnSp':
      case 'pic':
        this.renderShape(el, container, xf, part, state, level, groupFill);
        break;
      case 'grpSp':
        this.renderGroup(el, container, xf, part, state, level, groupFill);
        break;
      case 'graphicFrame':
        this.renderGraphicFrame(el, container, xf, part, state, level);
        break;
      case 'AlternateContent': {
        // Prefer the Fallback branch: it only uses the base schema this renderer implements.
        const branch =
          children(el, 'Fallback').find((f) => f.firstElementChild) ??
          children(el, 'Choice')[0] ??
          null;
        this.renderTree(branch, container, xf, part, state, level, groupFill);
        break;
      }
    }
  }

  private renderGroup(
    grp: Element,
    container: HTMLElement,
    xf: Xf,
    part: PptxPart,
    state: SlideState,
    level: ShapeLevel,
    parentGroupFill: FillSpec | null
  ): void {
    if (isHidden(grp)) return;
    const grpSpPr = child(grp, 'grpSpPr');
    const xfrm = child(grpSpPr, 'xfrm');
    const off = child(xfrm, 'off');
    const ext = child(xfrm, 'ext');
    const chOff = child(xfrm, 'chOff');
    const chExt = child(xfrm, 'chExt');

    const rect = toRect(xfrm, xf);
    const div = positionedDiv(rect ?? { x: 0, y: 0, w: 0, h: 0 }, xfrm);
    container.appendChild(div);

    const cx = numAttr(ext, 'cx') ?? 0;
    const cy = numAttr(ext, 'cy') ?? 0;
    const chCx = numAttr(chExt, 'cx') || cx;
    const chCy = numAttr(chExt, 'cy') || cy;
    const sx = xf.sx * (chCx ? cx / chCx : 1);
    const sy = xf.sy * (chCy ? cy / chCy : 1);
    const childXf: Xf = off
      ? { sx, sy, ox: -(numAttr(chOff, 'x') ?? 0) * sx, oy: -(numAttr(chOff, 'y') ?? 0) * sy }
      : xf;

    const ownFill = this.resolveFill(
      firstOf(grpSpPr, FILL_ELEMENTS),
      part,
      state.colorCtx,
      parentGroupFill
    );
    this.renderTree(grp, div, childXf, part, state, level, ownFill ?? parentGroupFill);
  }

  private renderShape(
    sp: Element,
    container: HTMLElement,
    xf: Xf,
    part: PptxPart,
    state: SlideState,
    level: ShapeLevel,
    groupFill: FillSpec | null
  ): void {
    if (isHidden(sp)) return;
    const ph = placeholderOf(sp);
    // Layout/master placeholders are prompts for the slide, never rendered themselves.
    if (ph && level !== 'slide') return;

    const chain = ph ? [sp, ...this.inheritedPlaceholders(ph, state)] : [sp];
    const spPrs = chain.map((e) => child(e, 'spPr'));
    const xfrm = spPrs.map((s) => child(s, 'xfrm')).find((x) => child(x, 'ext')) ?? null;
    const rect = toRect(xfrm, xf);
    if (!rect) return;

    const isPicture = sp.localName === 'pic';
    const isConnector = sp.localName === 'cxnSp';
    const geomEl =
      spPrs.map((s) => child(s, 'prstGeom') ?? child(s, 'custGeom')).find(Boolean) ?? null;
    const prst = geomEl?.localName === 'prstGeom' ? (attr(geomEl, 'prst') ?? 'rect') : null;
    const geometry: ShapeGeometry =
      geomEl?.localName === 'custGeom'
        ? customGeometry(geomEl, rect.w, rect.h)
        : presetGeometry(prst ?? 'rect', rect.w, rect.h, readAdjustValues(geomEl));
    const lineOnly = isConnector || (prst !== null && isLinePreset(prst));

    const style = chain.map((e) => child(e, 'style')).find(Boolean) ?? null;

    // Fill: explicit spPr fill → shape style fillRef. Pictures fill with their own blip.
    let fill: FillSpec | null = null;
    if (isPicture) {
      fill = this.resolveFill(child(sp, 'blipFill'), part, state.colorCtx, groupFill);
    } else if (!lineOnly) {
      const fillEl = spPrs.map((s) => firstOf(s, FILL_ELEMENTS)).find(Boolean) ?? null;
      fill = fillEl
        ? this.resolveFill(fillEl, part, state.colorCtx, groupFill)
        : this.styleFill(style, part, state);
    }

    const line = this.resolveLine(
      spPrs.map((s) => child(s, 'ln')).find(Boolean) ?? null,
      style,
      state,
      isPicture
    );
    const shadow = this.resolveShadow(
      spPrs.map((s) => child(s, 'effectLst')).find(Boolean) ?? null,
      style,
      state
    );

    const div = positionedDiv(rect, xfrm);
    container.appendChild(div);

    const hasFill = fill !== null && fill.kind !== 'none';
    if (hasFill || line) {
      div.appendChild(this.renderGeometrySvg(geometry, rect, fill, line, shadow, xfrm, state));
    }

    if (isPicture) return;
    const txBody = child(sp, 'txBody');
    if (!txBody || !hasRenderableText(txBody)) return;

    // SmartArt drawings carry a separate text rectangle.
    const txXfrm = child(sp, 'txXfrm');
    const textRect = txXfrm ? toRect(txXfrm, xf) : null;
    const box = textRect
      ? { x: textRect.x - rect.x, y: textRect.y - rect.y, w: textRect.w, h: textRect.h }
      : { x: 0, y: 0, w: rect.w, h: rect.h };

    const fontRef = child(style, 'fontRef');
    const sources: TextSources = {
      bodyPrs: chain.map((e) => path(e, 'txBody', 'bodyPr')).filter(isElement),
      lstStyles: [
        ...chain.map((e) => path(e, 'txBody', 'lstStyle')).filter(isElement),
        ...this.masterTextStyles(ph, state),
      ],
      ownLstCount: 1,
      defaultColor: resolveColorIn(fontRef, state.colorCtx),
      defaultFont: fontRef ? themeFontFor(attr(fontRef, 'idx'), state.theme) : null,
      defaultBold: false,
    };
    div.appendChild(this.renderTextBox(txBody, box, sources, state));
  }

  private renderGraphicFrame(
    frame: Element,
    container: HTMLElement,
    xf: Xf,
    part: PptxPart,
    state: SlideState,
    level: ShapeLevel
  ): void {
    if (isHidden(frame)) return;
    const ph = placeholderOf(frame);
    if (ph && level !== 'slide') return;

    const xfrm = child(frame, 'xfrm');
    const rect = toRect(xfrm, xf);
    if (!rect) return;
    const graphicData = path(frame, 'graphic', 'graphicData');
    const uri = attr(graphicData, 'uri') ?? '';

    const tbl = child(graphicData, 'tbl');
    if (tbl) {
      container.appendChild(this.renderTable(tbl, rect, xf, part, state));
      return;
    }

    const div = positionedDiv(rect, xfrm);
    if (uri.endsWith('/chart')) {
      const chartPart = this.pkg.relatedPart(part, relAttr(child(graphicData, 'chart'), 'id'));
      if (chartPart) {
        div.appendChild(
          renderChart(chartPart.root, {
            width: rect.w,
            height: rect.h,
            colorCtx: state.colorCtx,
            fontFamily: this.cssFontFamily(state.theme.minorFont),
          })
        );
        container.appendChild(div);
      }
      return;
    }

    if (uri.endsWith('/diagram')) {
      const drawing = this.diagramDrawing(graphicData, part);
      const tree = child(drawing?.root, 'spTree');
      if (drawing && tree) {
        container.appendChild(div);
        this.renderTree(
          tree,
          div,
          { sx: xf.sx, sy: xf.sy, ox: 0, oy: 0 },
          drawing,
          state,
          'slide',
          null
        );
      }
      return;
    }

    // OLE objects and other embeds: show their preview picture when one is provided.
    const preview = graphicData
      ? Array.from(graphicData.getElementsByTagNameNS('*', 'pic'))[0]
      : undefined;
    const blipFill = child(preview, 'blipFill');
    const fill = blipFill ? this.resolveFill(blipFill, part, state.colorCtx, null) : null;
    if (fill && fill.kind === 'image') {
      div.appendChild(
        this.renderGeometrySvg(
          presetGeometry('rect', rect.w, rect.h, new Map()),
          rect,
          fill,
          null,
          null,
          null,
          state
        )
      );
      container.appendChild(div);
    }
  }

  private diagramDrawing(graphicData: Element | null, part: PptxPart): PptxPart | null {
    const relIds = child(graphicData, 'relIds');
    const dataPart = this.pkg.relatedPart(part, relAttr(relIds, 'dm'));
    // The data model names the drawing part's relationship id in its extension list.
    const ext = dataPart
      ? Array.from(dataPart.root.getElementsByTagNameNS('*', 'dataModelExt'))[0]
      : undefined;
    const viaData = this.pkg.relatedPart(part, attr(ext, 'relId'));
    if (viaData) return viaData;
    const drawings = this.pkg.relatedPartsOfType(part, 'diagramDrawing');
    return drawings.length === 1 ? (drawings[0] ?? null) : null;
  }

  // ─── Placeholder inheritance ──────────────────────────────────────────────

  private inheritedPlaceholders(ph: Element, state: SlideState): Element[] {
    const type = attr(ph, 'type') ?? 'obj';
    const idx = attr(ph, 'idx');
    const out: Element[] = [];

    const layoutTree = path(state.ref.layout?.root, 'cSld', 'spTree');
    const layoutMatch =
      (idx !== null ? findPlaceholder(layoutTree, (_type, i) => i === idx) : null) ??
      findPlaceholder(layoutTree, (t) => normalizePhType(t) === normalizePhType(type));
    if (layoutMatch) out.push(layoutMatch);

    const masterType = masterPhType(attr(placeholderOf(layoutMatch), 'type') ?? type);
    const masterTree = path(state.ref.master?.root, 'cSld', 'spTree');
    const masterMatch = findPlaceholder(masterTree, (t) => masterPhType(t) === masterType);
    if (masterMatch) out.push(masterMatch);
    return out;
  }

  private masterTextStyles(ph: Element | null, state: SlideState): Element[] {
    const txStyles = child(state.ref.master?.root, 'txStyles');
    const defaults = this.pkg.defaultTextStyle;
    if (!ph) {
      return [defaults, child(txStyles, 'otherStyle')].filter(isElement);
    }
    const type = attr(ph, 'type') ?? 'obj';
    const styleName =
      type === 'title' || type === 'ctrTitle'
        ? 'titleStyle'
        : type === 'dt' || type === 'ftr' || type === 'sldNum' || type === 'hdr'
          ? 'otherStyle'
          : 'bodyStyle';
    return [child(txStyles, styleName), defaults].filter(isElement);
  }

  // ─── Fills, lines, effects ────────────────────────────────────────────────

  private resolveFill(
    fillEl: Element | null,
    part: PptxPart,
    colorCtx: ColorContext,
    groupFill: FillSpec | null
  ): FillSpec | null {
    if (!fillEl) return null;
    switch (fillEl.localName) {
      case 'noFill':
        return { kind: 'none' };
      case 'grpFill':
        return groupFill;
      case 'solidFill': {
        const color = resolveColorIn(fillEl, colorCtx);
        return color ? { kind: 'solid', color } : null;
      }
      case 'pattFill': {
        const color =
          resolveColorIn(child(fillEl, 'fgClr'), colorCtx) ??
          resolveColorIn(child(fillEl, 'bgClr'), colorCtx);
        return color ? { kind: 'solid', color } : null;
      }
      case 'gradFill': {
        const stops = children(child(fillEl, 'gsLst'), 'gs')
          .map((gs) => ({
            pos: (numAttr(gs, 'pos') ?? 0) / 100000,
            color: resolveColorIn(gs, colorCtx),
          }))
          .filter((s): s is { pos: number; color: Rgba } => s.color !== null)
          .sort((a, b) => a.pos - b.pos);
        if (stops.length === 0) return null;
        if (stops.length === 1)
          return { kind: 'solid', color: (stops[0] as { color: Rgba }).color };
        return {
          kind: 'gradient',
          stops,
          angle: (numAttr(child(fillEl, 'lin'), 'ang') ?? 0) / 60000,
          radial: child(fillEl, 'path') !== null,
        };
      }
      case 'blipFill': {
        const blip = child(fillEl, 'blip');
        // Prefer the SVG original Office stores alongside its PNG fallback.
        const svgBlip = blip
          ? Array.from(blip.getElementsByTagNameNS('*', 'svgBlip'))[0]
          : undefined;
        const url =
          this.pkg.mediaUrl(part, relAttr(svgBlip, 'embed')) ??
          this.pkg.mediaUrl(part, relAttr(blip, 'embed'));
        if (!url) return null;
        const srcRect = child(fillEl, 'srcRect');
        return {
          kind: 'image',
          url,
          crop: {
            l: (numAttr(srcRect, 'l') ?? 0) / 100000,
            t: (numAttr(srcRect, 't') ?? 0) / 100000,
            r: (numAttr(srcRect, 'r') ?? 0) / 100000,
            b: (numAttr(srcRect, 'b') ?? 0) / 100000,
          },
          alpha: (numAttr(child(blip, 'alphaModFix'), 'amt') ?? 100000) / 100000,
          tile: child(fillEl, 'tile') !== null,
          grayscale: child(blip, 'grayscl') !== null,
        };
      }
    }
    return null;
  }

  private styleFill(style: Element | null, part: PptxPart, state: SlideState): FillSpec | null {
    const fillRef = child(style, 'fillRef');
    const idx = numAttr(fillRef, 'idx') ?? 0;
    if (!fillRef || idx === 0) return null;
    const phClr = resolveColorIn(fillRef, state.colorCtx);
    const styleEl =
      idx >= 1001 ? state.theme.bgFillStyles[idx - 1001] : state.theme.fillStyles[idx - 1];
    if (!styleEl) return phClr ? { kind: 'solid', color: phClr } : null;
    return this.resolveFill(styleEl, part, { ...state.colorCtx, phClr }, null);
  }

  private resolveLine(
    ln: Element | null,
    style: Element | null,
    state: SlideState,
    isPicture: boolean
  ): LineSpec | null {
    const lnRef = child(style, 'lnRef');
    const refIdx = numAttr(lnRef, 'idx') ?? 0;
    const refColor = resolveColorIn(lnRef, state.colorCtx);
    const themeLn = refIdx > 0 ? (state.theme.lineStyles[refIdx - 1] ?? null) : null;
    const themeCtx: ColorContext = { ...state.colorCtx, phClr: refColor };

    if (!ln && (!lnRef || refIdx === 0 || isPicture)) return null;
    if (child(ln, 'noFill')) return null;

    const ownFill = firstOf(ln, TEXT_FILL_ELEMENTS);
    let color: Rgba | null = null;
    if (ownFill?.localName === 'solidFill') color = resolveColorIn(ownFill, state.colorCtx);
    else if (ownFill?.localName === 'gradFill')
      color = resolveColorIn(path(ownFill, 'gsLst', 'gs'), state.colorCtx);
    if (!color && !ownFill) {
      if (child(themeLn, 'noFill')) return null;
      color = resolveColorIn(child(themeLn, 'solidFill'), themeCtx) ?? refColor;
    }
    if (!color) return null;

    const widthEmu = numAttr(ln, 'w') ?? numAttr(themeLn, 'w') ?? 9525;
    const width = Math.max(widthEmu / EMU_PER_PX, 0.75);
    const dashName = attr(child(ln, 'prstDash'), 'val') ?? attr(child(themeLn, 'prstDash'), 'val');
    const dash = dashName ? (DASH_PATTERNS[dashName] ?? null) : null;
    const capAttr = attr(ln, 'cap') ?? attr(themeLn, 'cap');
    const join = child(ln, 'round') ? 'round' : child(ln, 'bevel') ? 'bevel' : 'miter';

    return {
      color,
      width,
      dash: dash ? dash.map((d) => d * width) : null,
      cap: capAttr === 'rnd' ? 'round' : capAttr === 'sq' ? 'square' : 'butt',
      join,
      head: readArrow(child(ln, 'headEnd')),
      tail: readArrow(child(ln, 'tailEnd')),
    };
  }

  private resolveShadow(
    effectLst: Element | null,
    style: Element | null,
    state: SlideState
  ): ShadowSpec | null {
    let lst = effectLst;
    let ctx = state.colorCtx;
    if (!lst) {
      const effectRef = child(style, 'effectRef');
      const idx = numAttr(effectRef, 'idx') ?? 0;
      lst = idx > 0 ? child(state.theme.effectStyles[idx - 1], 'effectLst') : null;
      ctx = { ...ctx, phClr: resolveColorIn(effectRef, ctx) };
    }
    const shdw = child(lst, 'outerShdw');
    if (!shdw) return null;
    const color = resolveColorIn(shdw, ctx);
    if (!color) return null;
    const dist = (numAttr(shdw, 'dist') ?? 0) / EMU_PER_PX;
    const dir = (((numAttr(shdw, 'dir') ?? 0) / 60000) * Math.PI) / 180;
    return {
      dx: dist * Math.cos(dir),
      dy: dist * Math.sin(dir),
      blur: (numAttr(shdw, 'blurRad') ?? 0) / EMU_PER_PX,
      color,
    };
  }

  private renderGeometrySvg(
    geometry: ShapeGeometry,
    rect: Rect,
    fill: FillSpec | null,
    line: LineSpec | null,
    shadow: ShadowSpec | null,
    xfrm: Element | null,
    state: SlideState
  ): SVGSVGElement {
    const svg = svgEl('svg', {
      width: String(Math.max(rect.w, 1)),
      height: String(Math.max(rect.h, 1)),
      'aria-hidden': 'true',
    }) as SVGSVGElement;
    Object.assign(svg.style, { position: 'absolute', left: '0', top: '0', overflow: 'visible' });

    const flips: string[] = [];
    if (boolAttr(xfrm, 'flipH')) flips.push(`translate(${rect.w}px, 0) scaleX(-1)`);
    if (boolAttr(xfrm, 'flipV')) flips.push(`translate(0, ${rect.h}px) scaleY(-1)`);
    if (flips.length) {
      svg.style.transformOrigin = '0 0';
      svg.style.transform = flips.join(' ');
    }
    if (shadow) {
      svg.style.filter = `drop-shadow(${shadow.dx}px ${shadow.dy}px ${shadow.blur / 2}px ${toCss(shadow.color)})`;
    }

    const defs = svgEl('defs', {});
    svg.appendChild(defs);
    const newId = (): string => `${state.idPrefix}-${state.nextId++}`;

    let fillPaint = 'none';
    let fillOpacity: string | null = null;
    if (fill?.kind === 'solid') {
      fillPaint = toCss({ ...fill.color, a: 1 });
      if (fill.color.a < 1) fillOpacity = String(fill.color.a);
    } else if (fill?.kind === 'gradient') {
      const id = newId();
      defs.appendChild(gradientDef(fill, id));
      fillPaint = `url(#${id})`;
    }

    let markerStart: string | null = null;
    let markerEnd: string | null = null;
    if (line?.head) markerStart = this.arrowMarker(defs, line, line.head, newId(), true);
    if (line?.tail) markerEnd = this.arrowMarker(defs, line, line.tail, newId(), false);

    for (const geoPath of geometry.paths) {
      if (fill?.kind === 'image' && geoPath.fill) {
        const clipId = newId();
        const clip = svgEl('clipPath', { id: clipId });
        clip.appendChild(svgEl('path', { d: geoPath.d }));
        defs.appendChild(clip);
        svg.appendChild(imageElement(fill, rect, clipId));
      }

      const p = svgEl('path', {
        d: geoPath.d,
        fill: geoPath.fill && fill?.kind !== 'image' ? fillPaint : 'none',
      });
      if (fillOpacity && geoPath.fill) p.setAttribute('fill-opacity', fillOpacity);
      p.setAttribute('fill-rule', 'evenodd');
      if (line && geoPath.stroke) {
        p.setAttribute('stroke', toCss({ ...line.color, a: 1 }));
        if (line.color.a < 1) p.setAttribute('stroke-opacity', String(line.color.a));
        p.setAttribute('stroke-width', String(line.width));
        p.setAttribute('stroke-linecap', line.cap);
        p.setAttribute('stroke-linejoin', line.join);
        if (line.dash) p.setAttribute('stroke-dasharray', line.dash.join(' '));
        if (markerStart) p.setAttribute('marker-start', `url(#${markerStart})`);
        if (markerEnd) p.setAttribute('marker-end', `url(#${markerEnd})`);
      }
      svg.appendChild(p);
    }
    return svg;
  }

  private arrowMarker(
    defs: SVGElement,
    line: LineSpec,
    arrow: ArrowSpec,
    id: string,
    atStart: boolean
  ): string {
    const w = arrow.w;
    const l = arrow.len;
    const marker = svgEl('marker', {
      id,
      viewBox: `0 0 ${l} ${w}`,
      refX: String(atStart ? 0 : l),
      refY: String(w / 2),
      markerWidth: String(l),
      markerHeight: String(w),
      markerUnits: 'strokeWidth',
      orient: atStart ? 'auto-start-reverse' : 'auto',
    });
    const color = toCss(line.color);
    let shape: SVGElement;
    switch (arrow.type) {
      case 'oval':
        shape = svgEl('ellipse', {
          cx: String(l / 2),
          cy: String(w / 2),
          rx: String(l / 2),
          ry: String(w / 2),
          fill: color,
        });
        break;
      case 'diamond':
        shape = svgEl('path', {
          d: `M0,${w / 2} L${l / 2},0 L${l},${w / 2} L${l / 2},${w} Z`,
          fill: color,
        });
        break;
      case 'arrow':
        shape = svgEl('path', {
          d: `M0,0 L${l},${w / 2} L0,${w}`,
          fill: 'none',
          stroke: color,
          'stroke-width': '1',
        });
        break;
      case 'stealth':
        shape = svgEl('path', {
          d: `M0,0 L${l},${w / 2} L0,${w} L${l / 3},${w / 2} Z`,
          fill: color,
        });
        break;
      default:
        shape = svgEl('path', { d: `M0,0 L${l},${w / 2} L0,${w} Z`, fill: color });
    }
    marker.appendChild(shape);
    defs.appendChild(marker);
    return id;
  }

  // ─── Text ─────────────────────────────────────────────────────────────────

  private renderTextBox(
    txBody: Element,
    box: Rect,
    sources: TextSources,
    state: SlideState
  ): HTMLElement {
    const props = readBodyProps(sources.bodyPrs);
    const el = document.createElement('div');
    const [l, t, r, b] = props.insets;
    Object.assign(el.style, {
      position: 'absolute',
      left: `${box.x}px`,
      top: `${box.y}px`,
      width: `${box.w}px`,
      height: `${box.h}px`,
      padding: `${t}px ${r}px ${b}px ${l}px`,
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: props.anchor,
      overflow: 'visible',
    });
    el.style.setProperty(FONT_SCALE_VAR, String(props.fontScale));
    if (props.autofit === 'norm') el.dataset['pptxAutofit'] = '1';

    if (props.vert === 'vert' || props.vert === 'eaVert' || props.vert === 'vert270') {
      el.style.writingMode = 'vertical-rl';
      if (props.vert === 'vert270') el.style.transform = 'rotate(180deg)';
    }

    const content = this.renderParagraphs(txBody, sources, props, state);
    content.style.whiteSpace = props.wrap ? 'pre-wrap' : 'pre';
    if (!props.wrap) {
      // Unwrapped text grows from its anchor instead of being squeezed into the box.
      const algn = attr(path(txBody, 'p', 'pPr'), 'algn');
      el.style.alignItems = algn === 'ctr' ? 'center' : algn === 'r' ? 'flex-end' : 'flex-start';
    }
    el.appendChild(content);
    return el;
  }

  private renderParagraphs(
    txBody: Element,
    sources: TextSources,
    props: BodyProps,
    state: SlideState
  ): HTMLElement {
    const content = document.createElement('div');
    content.style.overflowWrap = 'break-word';
    const counters = new Map<number, number>();

    children(txBody, 'p').forEach((p, index) => {
      const pPr = child(p, 'pPr');
      const lvl = Math.min(8, Math.max(0, numAttr(pPr, 'lvl') ?? 0));
      const levelName = `lvl${lvl + 1}pPr`;
      const levels = sources.lstStyles.map((ls) => child(ls, levelName) ?? child(ls, 'defPPr'));
      const pChain = [pPr, ...levels].filter(isElement);
      const ownLevels = levels.slice(0, sources.ownLstCount).filter(isElement);
      const inheritedLevels = levels.slice(sources.ownLstCount).filter(isElement);
      const pAttr = (name: string): string | null => {
        for (const el of pChain) {
          const v = attr(el, name);
          if (v !== null) return v;
        }
        return null;
      };
      const pChild = (names: ReadonlySet<string>): Element | null => {
        for (const el of pChain) {
          const found = firstOf(el, names);
          if (found) return found;
        }
        return null;
      };
      const pSingle = (name: string): Element | null => {
        for (const el of pChain) {
          const found = child(el, name);
          if (found) return found;
        }
        return null;
      };

      const runStyle = (rPr: Element | null): RunStyle =>
        this.resolveRunStyle(rPr, ownLevels, inheritedLevels, sources, state);

      const runs = children(p).filter(
        (n) => n.localName === 'r' || n.localName === 'fld' || n.localName === 'br'
      );
      const firstRun = runs.find((n) => n.localName !== 'br');
      const firstStyle = runStyle(child(firstRun, 'rPr') ?? child(p, 'endParaRPr'));
      const hasText = runs.some((n) => n.localName !== 'br' && textOf(child(n, 't')).length > 0);

      const para = document.createElement('div');
      const algn = pAttr('algn');
      para.style.textAlign =
        algn === 'ctr'
          ? 'center'
          : algn === 'r'
            ? 'right'
            : algn === 'just' || algn === 'dist'
              ? 'justify'
              : 'left';
      const marL = (Number(pAttr('marL')) || 0) / EMU_PER_PX;
      const indent = (Number(pAttr('indent')) || 0) / EMU_PER_PX;
      para.style.paddingLeft = `${marL}px`;
      para.style.textIndent = `${indent}px`;

      const lnSpc = pSingle('lnSpc');
      const lnPct = numAttr(child(lnSpc, 'spcPct'), 'val');
      const lnPts = numAttr(child(lnSpc, 'spcPts'), 'val');
      if (lnPts !== null) {
        const linePx = Math.round((lnPts / 100) * PT_TO_PX * 100) / 100;
        para.style.lineHeight = `calc(${linePx}px * var(${FIT_SCALE_VAR}, 1))`;
      } else {
        const pct = Math.max(0.5, (lnPct ?? 100000) / 100000 - props.lineReduction);
        para.style.lineHeight = String(Math.round(pct * SINGLE_LINE_HEIGHT * 1000) / 1000);
      }

      // PowerPoint ignores space-before on a text box's first paragraph.
      if (index > 0) para.style.marginTop = spacingCss(pSingle('spcBef'), firstStyle.sizePx);
      para.style.marginBottom = spacingCss(pSingle('spcAft'), firstStyle.sizePx);

      // Bullets
      const bullet = pChild(BULLET_ELEMENTS);
      if (bullet?.localName === 'buAutoNum') {
        const startAt = numAttr(bullet, 'startAt') ?? 1;
        const n = hasText
          ? (counters.get(lvl) ?? startAt - 1) + 1
          : (counters.get(lvl) ?? startAt - 1);
        counters.set(lvl, n);
        for (const key of Array.from(counters.keys())) if (key > lvl) counters.delete(key);
        if (hasText)
          para.appendChild(
            this.bulletSpan(
              formatAutoNumber(attr(bullet, 'type') ?? 'arabicPeriod', n),
              pChild,
              firstStyle,
              indent,
              state,
              null
            )
          );
      } else {
        for (const key of Array.from(counters.keys())) if (key >= lvl) counters.delete(key);
        if (bullet?.localName === 'buChar' && hasText) {
          para.appendChild(
            this.bulletSpan(
              attr(bullet, 'char') ?? '•',
              pChild,
              firstStyle,
              indent,
              state,
              pChild(BULLET_FONT_ELEMENTS)
            )
          );
        }
      }

      let lastWasBreak = false;
      for (const run of runs) {
        if (run.localName === 'br') {
          para.appendChild(document.createElement('br'));
          lastWasBreak = true;
          continue;
        }
        let text = textOf(child(run, 't'));
        if (run.localName === 'fld' && attr(run, 'type') === 'slidenum')
          text = String(state.slideNumber);
        if (!text) continue;
        const span = document.createElement('span');
        applyRunStyle(span, runStyle(child(run, 'rPr')), this.cssFontFamily.bind(this));
        span.textContent = text;
        para.appendChild(span);
        lastWasBreak = false;
      }

      if (!hasText || lastWasBreak) {
        // Empty lines still take the height of their (end-of-paragraph) font size.
        const spacer = document.createElement('span');
        const endStyle = runStyle(child(p, 'endParaRPr') ?? child(firstRun, 'rPr'));
        applyRunStyle(spacer, endStyle, this.cssFontFamily.bind(this));
        spacer.textContent = '\u200B';
        para.appendChild(spacer);
      }
      content.appendChild(para);
    });

    return content;
  }

  private bulletSpan(
    rawChar: string,
    pChild: (names: ReadonlySet<string>) => Element | null,
    firstStyle: RunStyle,
    indent: number,
    state: SlideState,
    fontEl: Element | null
  ): HTMLElement {
    const span = document.createElement('span');
    let char = rawChar;
    let fontFamily = firstStyle.font;
    if (fontEl?.localName === 'buFont') {
      const typeface = attr(fontEl, 'typeface') ?? '';
      const code = char.codePointAt(0) ?? 0;
      if (code >= 0xf000 && code <= 0xf0ff) char = String.fromCodePoint(code - 0xf000);
      if (SYMBOL_FONTS.has(typeface.toLowerCase())) {
        char = SYMBOL_BULLET_MAP[char] ?? '•';
      } else if (typeface) {
        fontFamily = resolveThemeFont(typeface, state.theme);
      }
    }

    const colorEl = pChild(BULLET_COLOR_ELEMENTS);
    const color = colorEl?.localName === 'buClr' ? resolveColorIn(colorEl, state.colorCtx) : null;
    const sizeEl = pChild(BULLET_SIZE_ELEMENTS);
    let sizePx = firstStyle.sizePx;
    if (sizeEl?.localName === 'buSzPct') sizePx *= (numAttr(sizeEl, 'val') ?? 100000) / 100000;
    else if (sizeEl?.localName === 'buSzPts')
      sizePx = ((numAttr(sizeEl, 'val') ?? 1800) / 100) * PT_TO_PX;

    span.textContent = char;
    Object.assign(span.style, {
      display: 'inline-block',
      textIndent: '0',
      whiteSpace: 'pre',
      fontFamily: this.cssFontFamily(fontFamily),
      fontSize: scaledPx(sizePx),
      color: toCss(color ?? firstStyle.color),
      fontWeight: firstStyle.bold ? '700' : '400',
    });
    if (indent < 0) span.style.minWidth = `${-indent}px`;
    else span.style.marginRight = '0.5em';
    return span;
  }

  private resolveRunStyle(
    rPr: Element | null,
    ownLevels: readonly Element[],
    inheritedLevels: readonly Element[],
    sources: TextSources,
    state: SlideState
  ): RunStyle {
    const own = [rPr, ...ownLevels.map((l) => child(l, 'defRPr'))].filter(isElement);
    const inherited = inheritedLevels.map((l) => child(l, 'defRPr')).filter(isElement);
    const all = [...own, ...inherited];
    const a = (name: string): string | null => {
      for (const el of all) {
        const v = attr(el, name);
        if (v !== null) return v;
      }
      return null;
    };
    const fillIn = (list: readonly Element[]): Element | null => {
      for (const el of list) {
        const found = firstOf(el, TEXT_FILL_ELEMENTS);
        if (found) return found;
      }
      return null;
    };

    const sizePx = ((Number(a('sz')) || 1800) / 100) * PT_TO_PX;
    const boldAttr = a('b');
    const italic = a('i');
    const underline = a('u');
    const strike = a('strike');

    // Color: run / shape's own list style → shape-style fontRef or table-style text → inherited levels.
    const hlink = child(rPr, 'hlinkClick') !== null;
    const ownFill = fillIn(own);
    let transparent = false;
    const fromFill = (fill: Element | null): Rgba | null => {
      if (!fill) return null;
      if (fill.localName === 'noFill') {
        transparent = true;
        return null;
      }
      if (fill.localName === 'gradFill')
        return resolveColorIn(path(fill, 'gsLst', 'gs'), state.colorCtx);
      return resolveColorIn(fill, state.colorCtx);
    };
    let color = fromFill(ownFill);
    if (!color && !transparent && hlink) color = parseHex(state.theme.colors['hlink']);
    if (!color && !transparent) color = sources.defaultColor;
    if (!color && !transparent) color = fromFill(fillIn(inherited));
    if (!color && !transparent) {
      color = parseHex(state.colorCtx.scheme[state.colorCtx.clrMap['tx1'] ?? 'dk1']);
    }

    let font: string | null = null;
    for (const el of all) {
      const typeface = attr(child(el, 'latin'), 'typeface');
      if (typeface) {
        font = typeface;
        break;
      }
    }
    if (!font && sources.defaultFont) font = sources.defaultFont;

    const baseline = Number(a('baseline')) || 0;
    const highlight = resolveColorIn(
      all.map((el) => child(el, 'highlight')).find(Boolean) ?? null,
      state.colorCtx
    );

    return {
      sizePx,
      bold: boldAttr !== null ? boldAttr === '1' || boldAttr === 'true' : sources.defaultBold,
      italic: italic === '1' || italic === 'true',
      underline: (underline !== null && underline !== 'none') || (hlink && underline === null),
      strike: strike !== null && strike !== 'noStrike',
      caps: a('cap') ?? 'none',
      spacingPx: ((Number(a('spc')) || 0) / 100) * PT_TO_PX,
      baseline,
      color: transparent ? { r: 0, g: 0, b: 0, a: 0 } : (color ?? { r: 0, g: 0, b: 0, a: 1 }),
      font: resolveThemeFont(font ?? '+mn-lt', state.theme),
      highlight,
    };
  }

  private cssFontFamily(font: string): string {
    const clean = font.replace(/["'\\;{}<>]/g, '').trim();
    if (!clean) return 'sans-serif';
    const quoted = `"${clean}"`;
    const stack = this.options.resolveFontFamily
      ? this.options.resolveFontFamily(quoted)
      : `${quoted}, sans-serif`;
    const alias = this.embeddedFontAliases.get(clean.toLowerCase());
    return alias ? `"${alias}", ${stack}` : stack;
  }

  // ─── Tables ───────────────────────────────────────────────────────────────

  private renderTable(
    tbl: Element,
    rect: Rect,
    xf: Xf,
    part: PptxPart,
    state: SlideState
  ): HTMLElement {
    const table = document.createElement('table');
    Object.assign(table.style, {
      position: 'absolute',
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      borderCollapse: 'collapse',
      tableLayout: 'fixed',
      borderSpacing: '0',
    });

    const cols = children(child(tbl, 'tblGrid'), 'gridCol').map(
      (c) => (numAttr(c, 'w') ?? 0) * xf.sx
    );
    table.style.width = `${cols.reduce((sum, w) => sum + w, 0)}px`;
    const colgroup = document.createElement('colgroup');
    for (const w of cols) {
      const col = document.createElement('col');
      col.style.width = `${w}px`;
      colgroup.appendChild(col);
    }
    table.appendChild(colgroup);

    const tblPr = child(tbl, 'tblPr');
    const flags = {
      firstRow: boolAttr(tblPr, 'firstRow') === true,
      lastRow: boolAttr(tblPr, 'lastRow') === true,
      firstCol: boolAttr(tblPr, 'firstCol') === true,
      lastCol: boolAttr(tblPr, 'lastCol') === true,
      bandRow: boolAttr(tblPr, 'bandRow') === true,
      bandCol: boolAttr(tblPr, 'bandCol') === true,
    };
    const styleId = textOf(child(tblPr, 'tableStyleId')).trim();
    const tableStyle = styleId ? this.tableStyle(styleId) : null;
    const tableFill = this.resolveFill(firstOf(tblPr, FILL_ELEMENTS), part, state.colorCtx, null);
    if (tableFill) applyCssFill(table, tableFill);

    const rows = children(tbl, 'tr');
    const tbody = document.createElement('tbody');
    rows.forEach((tr, r) => {
      const row = document.createElement('tr');
      row.style.height = `${(numAttr(tr, 'h') ?? 0) * xf.sy}px`;
      children(tr, 'tc').forEach((tc, c) => {
        if (boolAttr(tc, 'hMerge') || boolAttr(tc, 'vMerge')) return;
        row.appendChild(
          this.renderTableCell(tc, r, c, rows.length, cols.length, flags, tableStyle, part, state)
        );
      });
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    return table;
  }

  private tableStyle(styleId: string): Element | null {
    const key = styleId.toUpperCase();
    if (this.tableStyleCache.has(key)) return this.tableStyleCache.get(key) ?? null;
    let style = this.pkg.tableStyles.get(key) ?? null;
    if (!style && key === DEFAULT_TABLE_STYLE_ID) {
      style = parseXml(DEFAULT_TABLE_STYLE_XML)?.documentElement ?? null;
    }
    this.tableStyleCache.set(key, style);
    return style;
  }

  private renderTableCell(
    tc: Element,
    r: number,
    c: number,
    rowCount: number,
    colCount: number,
    flags: Readonly<
      Record<'firstRow' | 'lastRow' | 'firstCol' | 'lastCol' | 'bandRow' | 'bandCol', boolean>
    >,
    tableStyle: Element | null,
    part: PptxPart,
    state: SlideState
  ): HTMLTableCellElement {
    const td = document.createElement('td');
    const rowSpan = numAttr(tc, 'rowSpan') ?? 1;
    const gridSpan = numAttr(tc, 'gridSpan') ?? 1;
    if (rowSpan > 1) td.rowSpan = rowSpan;
    if (gridSpan > 1) td.colSpan = gridSpan;
    const lastR = r + rowSpan - 1 >= rowCount - 1;
    const lastC = c + gridSpan - 1 >= colCount - 1;

    // Table style parts, lowest precedence first.
    const parts: Element[] = [];
    if (tableStyle) {
      const add = (name: string): void => {
        const el = child(tableStyle, name);
        if (el) parts.push(el);
      };
      add('wholeTbl');
      if (flags.bandCol) add((c - (flags.firstCol ? 1 : 0)) % 2 === 0 ? 'band1V' : 'band2V');
      if (flags.bandRow) add((r - (flags.firstRow ? 1 : 0)) % 2 === 0 ? 'band1H' : 'band2H');
      if (flags.lastCol && lastC) add('lastCol');
      if (flags.firstCol && c === 0) add('firstCol');
      if (flags.lastRow && lastR) add('lastRow');
      if (flags.firstRow && r === 0) add('firstRow');
    }

    let fill: FillSpec | null = null;
    let textColor: Rgba | null = null;
    let bold = false;
    const borders: Record<'left' | 'right' | 'top' | 'bottom', Element | null> = {
      left: null,
      right: null,
      top: null,
      bottom: null,
    };
    for (const p of parts) {
      const tcStyle = child(p, 'tcStyle');
      const fillHolder = child(tcStyle, 'fill');
      const styleFill = this.resolveFill(
        firstOf(fillHolder, FILL_ELEMENTS),
        part,
        state.colorCtx,
        null
      );
      if (styleFill) fill = styleFill;
      const fillRef = child(tcStyle, 'fillRef');
      if (fillRef) {
        const refColor = resolveColorIn(fillRef, state.colorCtx);
        if (refColor) fill = { kind: 'solid', color: refColor };
      }
      const bdr = child(tcStyle, 'tcBdr');
      const side = (
        outer: 'left' | 'right' | 'top' | 'bottom',
        isOuter: boolean,
        inner: string
      ): void => {
        const el = child(bdr, isOuter ? outer : inner);
        if (el) borders[outer] = child(el, 'ln') ?? el;
      };
      side('left', c === 0, 'insideV');
      side('right', lastC, 'insideV');
      side('top', r === 0, 'insideH');
      side('bottom', lastR, 'insideH');

      const txStyle = child(p, 'tcTxStyle');
      if (txStyle) {
        textColor =
          resolveColorIn(txStyle, state.colorCtx) ??
          resolveColorIn(child(txStyle, 'fontRef'), state.colorCtx) ??
          textColor;
        const b = attr(txStyle, 'b');
        if (b !== null) bold = b === 'on';
      }
    }

    const tcPr = child(tc, 'tcPr');
    const ownFill = this.resolveFill(firstOf(tcPr, FILL_ELEMENTS), part, state.colorCtx, null);
    if (ownFill) fill = ownFill;
    if (fill) applyCssFill(td, fill);

    const ownBorders: Record<'left' | 'right' | 'top' | 'bottom', string> = {
      left: 'lnL',
      right: 'lnR',
      top: 'lnT',
      bottom: 'lnB',
    };
    for (const sideName of ['left', 'right', 'top', 'bottom'] as const) {
      const ln = child(tcPr, ownBorders[sideName]) ?? borders[sideName];
      td.style.setProperty(`border-${sideName}`, this.cssBorder(ln, state));
    }

    const marL = (numAttr(tcPr, 'marL') ?? 91440) / EMU_PER_PX;
    const marR = (numAttr(tcPr, 'marR') ?? 91440) / EMU_PER_PX;
    const marT = (numAttr(tcPr, 'marT') ?? 45720) / EMU_PER_PX;
    const marB = (numAttr(tcPr, 'marB') ?? 45720) / EMU_PER_PX;
    const anchor = attr(tcPr, 'anchor');
    Object.assign(td.style, {
      padding: `${marT}px ${marR}px ${marB}px ${marL}px`,
      verticalAlign: anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : 'top',
      overflow: 'hidden',
      boxSizing: 'border-box',
    });

    const txBody = child(tc, 'txBody');
    if (txBody) {
      const sources: TextSources = {
        bodyPrs: [child(txBody, 'bodyPr')].filter(isElement),
        lstStyles: [child(txBody, 'lstStyle'), this.pkg.defaultTextStyle].filter(isElement),
        ownLstCount: 1,
        defaultColor: textColor,
        defaultFont: null,
        defaultBold: bold,
      };
      const content = this.renderParagraphs(txBody, sources, readBodyProps(sources.bodyPrs), state);
      content.style.whiteSpace = 'pre-wrap';
      td.appendChild(content);
    }
    return td;
  }

  private cssBorder(ln: Element | null, state: SlideState): string {
    if (!ln || child(ln, 'noFill')) return 'none';
    const color =
      resolveColorIn(child(ln, 'solidFill'), state.colorCtx) ??
      resolveColorIn(child(ln, 'lnRef') ?? ln, state.colorCtx);
    if (!color) return 'none';
    const width = Math.max(0.75, (numAttr(ln, 'w') ?? 12700) / EMU_PER_PX);
    const dash = attr(child(ln, 'prstDash'), 'val');
    const styleName =
      dash && dash !== 'solid'
        ? dash.toLowerCase().includes('dot')
          ? 'dotted'
          : 'dashed'
        : 'solid';
    return `${width}px ${styleName} ${toCss(color)}`;
  }
}

// ─── Text autofit ───────────────────────────────────────────────────────────

/**
 * Shrinks "shrink text on overflow" boxes whose text overflows, the way PowerPoint does when it
 * opens a deck. Must run after the slide is attached to the document (it measures layout).
 */
export function autofitPptxText(root: HTMLElement): void {
  for (const box of Array.from(root.querySelectorAll<HTMLElement>('[data-pptx-autofit]'))) {
    const content = box.firstElementChild as HTMLElement | null;
    if (!content) continue;
    const styles = getComputedStyle(box);
    const available =
      box.clientHeight -
      (parseFloat(styles.paddingTop) || 0) -
      (parseFloat(styles.paddingBottom) || 0);
    if (available <= 0 || content.offsetHeight <= available + 1) continue;

    let lo = 0.25;
    let hi = 1;
    for (let i = 0; i < 7; i++) {
      const mid = (lo + hi) / 2;
      box.style.setProperty(FIT_SCALE_VAR, String(mid));
      if (content.offsetHeight <= available + 1) lo = mid;
      else hi = mid;
    }
    box.style.setProperty(FIT_SCALE_VAR, String(lo));
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface RunStyle {
  readonly sizePx: number;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly strike: boolean;
  readonly caps: string;
  readonly spacingPx: number;
  readonly baseline: number;
  readonly color: Rgba;
  readonly font: string;
  readonly highlight: Rgba | null;
}

function applyRunStyle(
  span: HTMLElement,
  style: RunStyle,
  fontFamily: (font: string) => string
): void {
  const size = style.baseline !== 0 ? style.sizePx * 0.66 : style.sizePx;
  span.style.fontSize = scaledPx(size);
  span.style.fontFamily = fontFamily(style.font);
  span.style.color = toCss(style.color);
  if (style.bold) span.style.fontWeight = '700';
  if (style.italic) span.style.fontStyle = 'italic';
  const decorations = [
    style.underline ? 'underline' : '',
    style.strike ? 'line-through' : '',
  ].filter(Boolean);
  if (decorations.length) span.style.textDecoration = decorations.join(' ');
  if (style.caps === 'all') span.style.textTransform = 'uppercase';
  else if (style.caps === 'small') span.style.fontVariant = 'small-caps';
  if (style.spacingPx) span.style.letterSpacing = `${style.spacingPx}px`;
  if (style.baseline !== 0) {
    // Shift with relative positioning so super/subscripts never grow the line box.
    span.style.position = 'relative';
    span.style.top = scaledPx((-style.baseline / 100000) * style.sizePx);
  }
  if (style.highlight) span.style.backgroundColor = toCss(style.highlight);
}

function scaledPx(px: number): string {
  return `calc(${Math.round(px * 100) / 100}px * var(${FONT_SCALE_VAR}, 1) * var(${FIT_SCALE_VAR}, 1))`;
}

function spacingCss(spc: Element | null, fontPx: number): string {
  const pts = numAttr(child(spc, 'spcPts'), 'val');
  if (pts !== null) return `${(pts / 100) * PT_TO_PX}px`;
  const pct = numAttr(child(spc, 'spcPct'), 'val');
  if (pct !== null) return scaledPx((pct / 100000) * fontPx * SINGLE_LINE_HEIGHT);
  return '0';
}

function readBodyProps(bodyPrs: readonly Element[]): BodyProps {
  const a = (name: string): number | null => {
    for (const el of bodyPrs) {
      const v = numAttr(el, name);
      if (v !== null) return v;
    }
    return null;
  };
  const s = (name: string): string | null => {
    for (const el of bodyPrs) {
      const v = attr(el, name);
      if (v !== null) return v;
    }
    return null;
  };
  const autofitEl = bodyPrs.map((b) => firstOf(b, AUTOFIT_ELEMENTS)).find(Boolean) ?? null;
  const anchor = s('anchor');
  return {
    insets: [
      (a('lIns') ?? 91440) / EMU_PER_PX,
      (a('tIns') ?? 45720) / EMU_PER_PX,
      (a('rIns') ?? 91440) / EMU_PER_PX,
      (a('bIns') ?? 45720) / EMU_PER_PX,
    ],
    anchor: anchor === 'ctr' ? 'center' : anchor === 'b' ? 'flex-end' : 'flex-start',
    wrap: s('wrap') !== 'none',
    vert: s('vert'),
    autofit:
      autofitEl?.localName === 'normAutofit'
        ? 'norm'
        : autofitEl?.localName === 'spAutoFit'
          ? 'shape'
          : 'none',
    fontScale:
      autofitEl?.localName === 'normAutofit'
        ? (numAttr(autofitEl, 'fontScale') ?? 100000) / 100000
        : 1,
    lineReduction:
      autofitEl?.localName === 'normAutofit'
        ? (numAttr(autofitEl, 'lnSpcReduction') ?? 0) / 100000
        : 0,
  };
}

function applyCssFill(el: HTMLElement, fill: FillSpec): void {
  switch (fill.kind) {
    case 'none':
      el.style.background = 'transparent';
      break;
    case 'solid':
      el.style.background = toCss(fill.color);
      break;
    case 'gradient': {
      const stops = fill.stops
        .map((s) => `${toCss(s.color)} ${Math.round(s.pos * 1000) / 10}%`)
        .join(', ');
      el.style.background = fill.radial
        ? `radial-gradient(circle, ${stops})`
        : `linear-gradient(${fill.angle + 90}deg, ${stops})`;
      break;
    }
    case 'image':
      el.style.backgroundImage = `url("${fill.url}")`;
      el.style.backgroundSize = fill.tile ? 'auto' : '100% 100%';
      el.style.backgroundRepeat = fill.tile ? 'repeat' : 'no-repeat';
      el.style.backgroundPosition = 'center';
      break;
  }
}

function gradientDef(fill: Extract<FillSpec, { kind: 'gradient' }>, id: string): SVGElement {
  let grad: SVGElement;
  if (fill.radial) {
    grad = svgEl('radialGradient', { id, cx: '0.5', cy: '0.5', r: '0.5' });
  } else {
    const rad = (fill.angle * Math.PI) / 180;
    const dx = Math.cos(rad) / 2;
    const dy = Math.sin(rad) / 2;
    grad = svgEl('linearGradient', {
      id,
      x1: String(0.5 - dx),
      y1: String(0.5 - dy),
      x2: String(0.5 + dx),
      y2: String(0.5 + dy),
    });
  }
  for (const stop of fill.stops) {
    grad.appendChild(
      svgEl('stop', {
        offset: String(stop.pos),
        'stop-color': toCss({ ...stop.color, a: 1 }),
        'stop-opacity': String(stop.color.a),
      })
    );
  }
  return grad;
}

function imageElement(
  fill: Extract<FillSpec, { kind: 'image' }>,
  rect: Rect,
  clipId: string
): SVGElement {
  const visibleW = 1 - fill.crop.l - fill.crop.r;
  const visibleH = 1 - fill.crop.t - fill.crop.b;
  const fullW = visibleW > 0 ? rect.w / visibleW : rect.w;
  const fullH = visibleH > 0 ? rect.h / visibleH : rect.h;
  const image = svgEl('image', {
    x: String(-fullW * fill.crop.l),
    y: String(-fullH * fill.crop.t),
    width: String(fullW),
    height: String(fullH),
    preserveAspectRatio: 'none',
    'clip-path': `url(#${clipId})`,
  });
  image.setAttribute('href', fill.url);
  if (fill.alpha < 1) image.setAttribute('opacity', String(fill.alpha));
  if (fill.grayscale) image.setAttribute('style', 'filter: grayscale(1)');
  return image;
}

function readArrow(el: Element | null): ArrowSpec | null {
  const type = attr(el, 'type');
  if (!type || type === 'none') return null;
  const size = (v: string | null): number => (v === 'sm' ? 2 : v === 'lg' ? 5 : 3);
  return { type, w: size(attr(el, 'w')), len: size(attr(el, 'len')) };
}

function positionedDiv(rect: Rect, xfrm: Element | null): HTMLElement {
  const div = document.createElement('div');
  Object.assign(div.style, {
    position: 'absolute',
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.w}px`,
    height: `${rect.h}px`,
  });
  const rot = (numAttr(xfrm, 'rot') ?? 0) / 60000;
  if (rot) div.style.transform = `rotate(${rot}deg)`;
  return div;
}

function toRect(xfrm: Element | null, xf: Xf): Rect | null {
  const off = child(xfrm, 'off');
  const ext = child(xfrm, 'ext');
  if (!ext) return null;
  return {
    x: (numAttr(off, 'x') ?? 0) * xf.sx + xf.ox,
    y: (numAttr(off, 'y') ?? 0) * xf.sy + xf.oy,
    w: Math.max(0, (numAttr(ext, 'cx') ?? 0) * xf.sx),
    h: Math.max(0, (numAttr(ext, 'cy') ?? 0) * xf.sy),
  };
}

function nvProps(el: Element | null): Element | null {
  for (let node = el?.firstElementChild ?? null; node; node = node.nextElementSibling) {
    if (node.localName.startsWith('nv')) return node;
  }
  return null;
}

function isHidden(el: Element): boolean {
  return boolAttr(child(nvProps(el), 'cNvPr'), 'hidden') === true;
}

function placeholderOf(el: Element | null): Element | null {
  return path(nvProps(el), 'nvPr', 'ph');
}

function normalizePhType(type: string): string {
  if (type === 'ctrTitle') return 'title';
  if (type === 'obj' || type === 'subTitle') return 'body';
  return type;
}

function masterPhType(type: string): string {
  if (type === 'title' || type === 'ctrTitle') return 'title';
  if (type === 'dt' || type === 'ftr' || type === 'sldNum' || type === 'hdr') return type;
  return 'body';
}

function findPlaceholder(
  tree: Element | null,
  match: (type: string, idx: string | null) => boolean
): Element | null {
  for (const el of children(tree)) {
    if (el.localName === 'grpSp') {
      const nested = findPlaceholder(el, match);
      if (nested) return nested;
      continue;
    }
    const ph = placeholderOf(el);
    if (ph && match(attr(ph, 'type') ?? 'obj', attr(ph, 'idx'))) return el;
  }
  return null;
}

function hasRenderableText(txBody: Element): boolean {
  return children(txBody, 'p').length > 0;
}

function themeFontFor(idx: string | null, theme: PptxTheme): string | null {
  if (idx === 'major') return theme.majorFont;
  if (idx === 'minor') return theme.minorFont;
  return null;
}

function resolveThemeFont(font: string, theme: PptxTheme): string {
  if (font.startsWith('+mj')) return theme.majorFont;
  if (font.startsWith('+mn')) return theme.minorFont;
  return font;
}

function resolveClrMap(ref: PptxSlideRef): Record<string, string> {
  const fromAttrs = (el: Element | null): Record<string, string> | null => {
    if (!el || el.attributes.length === 0) return null;
    const out: Record<string, string> = {};
    for (const a of Array.from(el.attributes)) out[a.localName] = a.value;
    return out;
  };
  return (
    fromAttrs(path(ref.slide.root, 'clrMapOvr', 'overrideClrMapping')) ??
    fromAttrs(path(ref.layout?.root, 'clrMapOvr', 'overrideClrMapping')) ??
    fromAttrs(child(ref.master?.root, 'clrMap')) ?? {
      bg1: 'lt1',
      tx1: 'dk1',
      bg2: 'lt2',
      tx2: 'dk2',
      accent1: 'accent1',
      accent2: 'accent2',
      accent3: 'accent3',
      accent4: 'accent4',
      accent5: 'accent5',
      accent6: 'accent6',
      hlink: 'hlink',
      folHlink: 'folHlink',
    }
  );
}

function formatAutoNumber(type: string, n: number): string {
  const alpha = (v: number): string => {
    let out = '';
    let x = v;
    while (x > 0) {
      const rem = (x - 1) % 26;
      out = String.fromCharCode(97 + rem) + out;
      x = Math.floor((x - 1) / 26);
    }
    return out;
  };
  const roman = (v: number): string => {
    const table: [number, string][] = [
      [1000, 'm'],
      [900, 'cm'],
      [500, 'd'],
      [400, 'cd'],
      [100, 'c'],
      [90, 'xc'],
      [50, 'l'],
      [40, 'xl'],
      [10, 'x'],
      [9, 'ix'],
      [5, 'v'],
      [4, 'iv'],
      [1, 'i'],
    ];
    let x = v;
    let out = '';
    for (const [value, sym] of table) {
      while (x >= value) {
        out += sym;
        x -= value;
      }
    }
    return out;
  };

  let core: string;
  if (type.startsWith('alphaLc')) core = alpha(n);
  else if (type.startsWith('alphaUc')) core = alpha(n).toUpperCase();
  else if (type.startsWith('romanLc')) core = roman(n);
  else if (type.startsWith('romanUc')) core = roman(n).toUpperCase();
  else core = String(n);

  if (type.endsWith('ParenBoth')) return `(${core})`;
  if (type.endsWith('ParenR')) return `${core})`;
  if (type.endsWith('Plain')) return core;
  return `${core}.`;
}

function isElement(el: Element | null | undefined): el is Element {
  return !!el;
}

function svgEl(name: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}
