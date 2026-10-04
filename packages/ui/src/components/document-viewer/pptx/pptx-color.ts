/**
 * @fileoverview DrawingML color resolution (scheme/sRGB/system/preset colors plus transforms).
 */

import { attr, children, firstOf, numAttr } from './pptx-xml';

export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface ColorContext {
  /** Theme color scheme: dk1, lt1, dk2, lt2, accent1..6, hlink, folHlink → `RRGGBB`. */
  readonly scheme: Readonly<Record<string, string>>;
  /** Master color map: bg1 → lt1, tx1 → dk1, ... */
  readonly clrMap: Readonly<Record<string, string>>;
  /** `phClr` substitute while resolving theme style-matrix entries. */
  readonly phClr?: Rgba | null;
}

const COLOR_ELEMENTS: ReadonlySet<string> = new Set([
  'srgbClr',
  'schemeClr',
  'sysClr',
  'prstClr',
  'scrgbClr',
  'hslClr',
]);

const DEFAULT_CLR_MAP: Readonly<Record<string, string>> = {
  bg1: 'lt1',
  tx1: 'dk1',
  bg2: 'lt2',
  tx2: 'dk2',
};

const PRESET_COLORS: Readonly<Record<string, string>> = {
  black: '000000',
  white: 'FFFFFF',
  red: 'FF0000',
  green: '008000',
  blue: '0000FF',
  yellow: 'FFFF00',
  cyan: '00FFFF',
  magenta: 'FF00FF',
  gray: '808080',
  grey: '808080',
  darkGray: 'A9A9A9',
  dkGray: 'A9A9A9',
  lightGray: 'D3D3D3',
  ltGray: 'D3D3D3',
  silver: 'C0C0C0',
  orange: 'FFA500',
  purple: '800080',
  navy: '000080',
  maroon: '800000',
  olive: '808000',
  teal: '008080',
  lime: '00FF00',
  gold: 'FFD700',
  pink: 'FFC0CB',
  brown: 'A52A2A',
  darkBlue: '00008B',
  dkBlue: '00008B',
  darkRed: '8B0000',
  dkRed: '8B0000',
  darkGreen: '006400',
  dkGreen: '006400',
  lightBlue: 'ADD8E6',
  ltBlue: 'ADD8E6',
};

const SYSTEM_COLORS: Readonly<Record<string, string>> = {
  windowText: '000000',
  window: 'FFFFFF',
  btnFace: 'F0F0F0',
  btnText: '000000',
  highlight: '0078D7',
  highlightText: 'FFFFFF',
  grayText: '6D6D6D',
};

export function parseHex(hex: string | null | undefined): Rgba | null {
  if (!hex) return null;
  const clean = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
    a: 1,
  };
}

export function toCss(color: Rgba): string {
  const r = Math.round(clamp(color.r, 0, 255));
  const g = Math.round(clamp(color.g, 0, 255));
  const b = Math.round(clamp(color.b, 0, 255));
  const a = clamp(color.a, 0, 1);
  if (a >= 0.999) {
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
}

/** Resolves the color element directly inside `parent` (e.g. a `solidFill` or `fillRef`). */
export function resolveColorIn(parent: Element | null | undefined, ctx: ColorContext): Rgba | null {
  return resolveColorElement(firstOf(parent, COLOR_ELEMENTS), ctx);
}

export function resolveColorElement(el: Element | null, ctx: ColorContext): Rgba | null {
  if (!el) return null;
  let base: Rgba | null = null;
  const val = attr(el, 'val') ?? '';

  switch (el.localName) {
    case 'srgbClr':
      base = parseHex(val);
      break;
    case 'schemeClr':
      base = resolveSchemeColor(val, ctx);
      break;
    case 'sysClr':
      base = parseHex(attr(el, 'lastClr')) ?? parseHex(SYSTEM_COLORS[val]);
      break;
    case 'prstClr':
      base = parseHex(PRESET_COLORS[val]);
      break;
    case 'scrgbClr':
      base = {
        r: linearToSrgb((numAttr(el, 'r') ?? 0) / 100000) * 255,
        g: linearToSrgb((numAttr(el, 'g') ?? 0) / 100000) * 255,
        b: linearToSrgb((numAttr(el, 'b') ?? 0) / 100000) * 255,
        a: 1,
      };
      break;
    case 'hslClr': {
      const [r, g, b] = hslToRgb(
        (numAttr(el, 'hue') ?? 0) / 60000 / 360,
        (numAttr(el, 'sat') ?? 0) / 100000,
        (numAttr(el, 'lum') ?? 0) / 100000
      );
      base = { r, g, b, a: 1 };
      break;
    }
  }

  return base ? applyTransforms(base, el) : null;
}

function resolveSchemeColor(val: string, ctx: ColorContext): Rgba | null {
  if (val === 'phClr') return ctx.phClr ?? parseHex(ctx.scheme['dk1']) ?? null;
  const mapped = ctx.clrMap[val] ?? DEFAULT_CLR_MAP[val] ?? val;
  return parseHex(ctx.scheme[mapped]) ?? parseHex(ctx.scheme[val]);
}

function applyTransforms(color: Rgba, el: Element): Rgba {
  let { r, g, b, a } = color;

  for (const mod of children(el)) {
    const v = (numAttr(mod, 'val') ?? 0) / 100000;
    switch (mod.localName) {
      case 'alpha':
        a = v;
        break;
      case 'alphaMod':
        a *= v;
        break;
      case 'alphaOff':
        a += v;
        break;
      case 'tint': {
        // Tint/shade operate on linear light, matching PowerPoint.
        [r, g, b] = [r, g, b].map((c) => {
          const lin = srgbToLinear(c / 255);
          return linearToSrgb(lin * v + (1 - v)) * 255;
        }) as [number, number, number];
        break;
      }
      case 'shade': {
        [r, g, b] = [r, g, b].map((c) => linearToSrgb(srgbToLinear(c / 255) * v) * 255) as [
          number,
          number,
          number,
        ];
        break;
      }
      case 'lumMod':
      case 'lumOff':
      case 'satMod':
      case 'satOff':
      case 'hueMod':
      case 'hueOff': {
        const [h, s, l] = rgbToHsl(r, g, b);
        let nh = h;
        let ns = s;
        let nl = l;
        if (mod.localName === 'lumMod') nl = l * v;
        else if (mod.localName === 'lumOff') nl = l + v;
        else if (mod.localName === 'satMod') ns = s * v;
        else if (mod.localName === 'satOff') ns = s + v;
        else if (mod.localName === 'hueMod') nh = h * v;
        else nh = h + (numAttr(mod, 'val') ?? 0) / 60000 / 360;
        [r, g, b] = hslToRgb(((nh % 1) + 1) % 1, clamp(ns, 0, 1), clamp(nl, 0, 1));
        break;
      }
      case 'comp': {
        const [h, s, l] = rgbToHsl(r, g, b);
        [r, g, b] = hslToRgb((h + 0.5) % 1, s, l);
        break;
      }
      case 'inv':
        [r, g, b] = [255 - r, 255 - g, 255 - b];
        break;
      case 'gray': {
        const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        [r, g, b] = [y, y, y];
        break;
      }
    }
  }

  return {
    r: clamp(r, 0, 255),
    g: clamp(g, 0, 255),
    b: clamp(b, 0, 255),
    a: clamp(a, 0, 1),
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const v = clamp(c, 0, 1);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255];
}
