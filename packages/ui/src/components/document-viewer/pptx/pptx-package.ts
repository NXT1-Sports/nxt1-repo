/**
 * @fileoverview Loads a `.pptx` (Open XML PresentationML) package into parsed parts.
 *
 * Everything a slide render needs (XML parts, relationships, theme, images as blob URLs, chart
 * and SmartArt drawing parts) is resolved up front so rendering itself is synchronous.
 * External relationships (linked images, hyperlinks, media URLs) are never fetched.
 */

import JSZip from 'jszip';
import { attr, child, children, numAttr, parseXml, path, relAttr } from './pptx-xml';

export interface PptxRel {
  readonly id: string;
  /** Last segment of the relationship type URI, e.g. `image`, `slideLayout`, `chart`. */
  readonly type: string;
  /** Package path of the target (resolved against the source part). */
  readonly target: string;
  readonly external: boolean;
}

export interface PptxPart {
  readonly path: string;
  readonly root: Element;
  readonly rels: ReadonlyMap<string, PptxRel>;
}

export interface PptxTheme {
  readonly colors: Readonly<Record<string, string>>;
  readonly majorFont: string;
  readonly minorFont: string;
  readonly fillStyles: readonly Element[];
  readonly lineStyles: readonly Element[];
  readonly effectStyles: readonly Element[];
  readonly bgFillStyles: readonly Element[];
}

/** A font embedded in the deck (`p:embeddedFontLst`), decoded to raw sfnt (TTF/OTF) bytes. */
export interface PptxEmbeddedFont {
  readonly typeface: string;
  readonly weight: 'normal' | 'bold';
  readonly style: 'normal' | 'italic';
  readonly data: ArrayBuffer;
}

export interface PptxSlideRef {
  readonly slide: PptxPart;
  readonly layout: PptxPart | null;
  readonly master: PptxPart | null;
  readonly theme: PptxTheme;
}

const MAX_SLIDES = 500;
const MAX_EMBEDDED_FONT_BYTES = 10 * 1024 * 1024;

const EMBEDDED_FONT_SLOTS: readonly {
  readonly name: string;
  readonly weight: PptxEmbeddedFont['weight'];
  readonly style: PptxEmbeddedFont['style'];
}[] = [
  { name: 'regular', weight: 'normal', style: 'normal' },
  { name: 'bold', weight: 'bold', style: 'normal' },
  { name: 'italic', weight: 'normal', style: 'italic' },
  { name: 'boldItalic', weight: 'bold', style: 'italic' },
];

const IMAGE_MIME_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpe: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
};

/** Parts referenced from slides/layouts/masters that rendering may need. */
const PRELOAD_PART_TYPES: ReadonlySet<string> = new Set(['chart', 'diagramDrawing', 'diagramData']);

const OFFICE_DEFAULT_THEME_COLORS: Readonly<Record<string, string>> = {
  dk1: '000000',
  lt1: 'FFFFFF',
  dk2: '44546A',
  lt2: 'E7E6E6',
  accent1: '4472C4',
  accent2: 'ED7D31',
  accent3: 'A5A5A5',
  accent4: 'FFC000',
  accent5: '5B9BD5',
  accent6: '70AD47',
  hlink: '0563C1',
  folHlink: '954F72',
};

export class PptxPackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PptxPackageError';
  }
}

export class PptxPackage {
  private readonly parts = new Map<string, PptxPart>();
  private readonly themes = new Map<string, PptxTheme>();
  private readonly mediaUrls = new Map<string, string>();
  private readonly pendingMedia = new Map<string, Promise<void>>();

  widthEmu = 12192000;
  heightEmu = 6858000;
  slides: PptxSlideRef[] = [];
  defaultTextStyle: Element | null = null;
  tableStyles = new Map<string, Element>();
  embeddedFonts: PptxEmbeddedFont[] = [];

  private constructor(private readonly zip: JSZip) {}

  static async load(data: ArrayBuffer): Promise<PptxPackage> {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(data);
    } catch {
      throw new PptxPackageError('File is not a valid .pptx package.');
    }

    const pkg = new PptxPackage(zip);
    await pkg.init();
    return pkg;
  }

  /** Blob URL of an image relationship, or null when it is external / unsupported. */
  mediaUrl(part: PptxPart, relId: string | null): string | null {
    if (!relId) return null;
    const rel = part.rels.get(relId);
    if (!rel || rel.external) return null;
    return this.mediaUrls.get(rel.target) ?? null;
  }

  relatedPart(part: PptxPart, relId: string | null): PptxPart | null {
    if (!relId) return null;
    const rel = part.rels.get(relId);
    if (!rel || rel.external) return null;
    return this.parts.get(rel.target) ?? null;
  }

  relatedPartsOfType(part: PptxPart, type: string): PptxPart[] {
    const out: PptxPart[] = [];
    for (const rel of part.rels.values()) {
      if (rel.type !== type || rel.external) continue;
      const target = this.parts.get(rel.target);
      if (target) out.push(target);
    }
    return out;
  }

  dispose(): void {
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      for (const url of this.mediaUrls.values()) URL.revokeObjectURL(url);
    }
    this.mediaUrls.clear();
  }

  private async init(): Promise<void> {
    const presentationPath = await this.resolvePresentationPath();
    const presentation = await this.loadPart(presentationPath);
    if (!presentation) throw new PptxPackageError('Presentation part is missing.');

    const sldSz = child(presentation.root, 'sldSz');
    const cx = numAttr(sldSz, 'cx');
    const cy = numAttr(sldSz, 'cy');
    if (cx && cy && cx > 0 && cy > 0) {
      this.widthEmu = cx;
      this.heightEmu = cy;
    }
    this.defaultTextStyle = child(presentation.root, 'defaultTextStyle');
    await this.loadEmbeddedFonts(presentation);

    for (const rel of presentation.rels.values()) {
      if (rel.type === 'tableStyles') {
        const tableStylesPart = await this.loadPart(rel.target);
        for (const style of children(tableStylesPart?.root, 'tblStyle')) {
          const id = attr(style, 'styleId');
          if (id) this.tableStyles.set(id.toUpperCase(), style);
        }
      }
    }

    const slidePaths = this.orderedSlidePaths(presentation);
    for (const slidePath of slidePaths.slice(0, MAX_SLIDES)) {
      const slide = await this.loadPart(slidePath);
      if (!slide) continue;

      const layout = await this.loadFirstRelated(slide, 'slideLayout');
      const master = layout ? await this.loadFirstRelated(layout, 'slideMaster') : null;
      const themePart = master ? await this.loadFirstRelated(master, 'theme') : null;
      this.slides.push({ slide, layout, master, theme: this.readTheme(themePart) });
    }

    if (this.slides.length === 0) throw new PptxPackageError('Presentation contains no slides.');
    await Promise.all(this.pendingMedia.values());
  }

  private async loadEmbeddedFonts(presentation: PptxPart): Promise<void> {
    for (const embedded of children(child(presentation.root, 'embeddedFontLst'), 'embeddedFont')) {
      const typeface = attr(child(embedded, 'font'), 'typeface')?.trim();
      if (!typeface) continue;
      for (const slot of EMBEDDED_FONT_SLOTS) {
        const rel = presentation.rels.get(relAttr(child(embedded, slot.name), 'id') ?? '');
        const file = rel && !rel.external ? this.zip.file(rel.target) : null;
        if (!file) continue;
        try {
          const bytes = await file.async('uint8array');
          const data =
            bytes.byteLength <= MAX_EMBEDDED_FONT_BYTES ? decodeEmbeddedFont(bytes) : null;
          if (data)
            this.embeddedFonts.push({ typeface, weight: slot.weight, style: slot.style, data });
        } catch {
          // An unreadable font only costs fidelity; the fallback stack still renders the text.
        }
      }
    }
  }

  private async resolvePresentationPath(): Promise<string> {
    const rootRels = await this.readRels('_rels/.rels', '');
    for (const rel of rootRels.values()) {
      if (rel.type === 'officeDocument' && this.zip.file(rel.target)) return rel.target;
    }
    return 'ppt/presentation.xml';
  }

  /** Slide order comes from `p:sldIdLst`; file names are not guaranteed to match it. */
  private orderedSlidePaths(presentation: PptxPart): string[] {
    const ordered: string[] = [];
    for (const sldId of children(child(presentation.root, 'sldIdLst'), 'sldId')) {
      const rel = presentation.rels.get(relAttr(sldId, 'id') ?? '');
      if (rel && !rel.external && rel.type === 'slide' && this.zip.file(rel.target)) {
        ordered.push(rel.target);
      }
    }
    if (ordered.length > 0) return ordered;

    return Object.keys(this.zip.files)
      .filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
      .sort((a, b) => slideFileNumber(a) - slideFileNumber(b));
  }

  private async loadFirstRelated(part: PptxPart, type: string): Promise<PptxPart | null> {
    for (const rel of part.rels.values()) {
      if (rel.type === type && !rel.external) {
        const loaded = await this.loadPart(rel.target);
        if (loaded) return loaded;
      }
    }
    return null;
  }

  private async loadPart(partPath: string): Promise<PptxPart | null> {
    const cached = this.parts.get(partPath);
    if (cached) return cached;

    const file = this.zip.file(partPath);
    if (!file) return null;
    const doc = parseXml(await file.async('string'));
    const root = doc?.documentElement;
    if (!root) return null;

    const dir = partPath.includes('/') ? partPath.slice(0, partPath.lastIndexOf('/')) : '';
    const name = partPath.slice(partPath.lastIndexOf('/') + 1);
    const rels = await this.readRels(`${dir ? `${dir}/` : ''}_rels/${name}.rels`, dir);
    const part: PptxPart = { path: partPath, root, rels };
    this.parts.set(partPath, part);

    for (const rel of rels.values()) {
      if (rel.external) continue;
      if (rel.type === 'image') this.queueMedia(rel.target);
      else if (PRELOAD_PART_TYPES.has(rel.type)) await this.loadPart(rel.target);
    }
    return part;
  }

  private async readRels(relsPath: string, baseDir: string): Promise<Map<string, PptxRel>> {
    const rels = new Map<string, PptxRel>();
    const file = this.zip.file(relsPath);
    if (!file) return rels;
    const doc = parseXml(await file.async('string'));
    for (const rel of children(doc?.documentElement, 'Relationship')) {
      const id = attr(rel, 'Id');
      const rawTarget = attr(rel, 'Target');
      if (!id || !rawTarget) continue;
      const external = attr(rel, 'TargetMode') === 'External';
      const typeUri = attr(rel, 'Type') ?? '';
      rels.set(id, {
        id,
        type: typeUri.slice(typeUri.lastIndexOf('/') + 1),
        target: external ? rawTarget : resolvePartPath(baseDir, rawTarget),
        external,
      });
    }
    return rels;
  }

  private queueMedia(target: string): void {
    if (this.mediaUrls.has(target) || this.pendingMedia.has(target)) return;
    const ext = target.slice(target.lastIndexOf('.') + 1).toLowerCase();
    const mime = IMAGE_MIME_TYPES[ext];
    const file = this.zip.file(target);
    // EMF/WMF and other formats browsers cannot decode are skipped rather than shown broken.
    if (!mime || !file || typeof URL === 'undefined' || !URL.createObjectURL) return;

    this.pendingMedia.set(
      target,
      file
        .async('blob')
        .then((blob) => {
          this.mediaUrls.set(target, URL.createObjectURL(new Blob([blob], { type: mime })));
        })
        .catch(() => undefined)
    );
  }

  private readTheme(themePart: PptxPart | null): PptxTheme {
    const key = themePart?.path ?? '';
    const cached = this.themes.get(key);
    if (cached) return cached;

    const themeElements = child(themePart?.root, 'themeElements');
    const colors: Record<string, string> = { ...OFFICE_DEFAULT_THEME_COLORS };
    for (const entry of children(child(themeElements, 'clrScheme'))) {
      const srgb = child(entry, 'srgbClr');
      const sys = child(entry, 'sysClr');
      const value = attr(srgb, 'val') ?? attr(sys, 'lastClr');
      if (value) colors[entry.localName] = value;
    }

    const fontScheme = child(themeElements, 'fontScheme');
    const fmtScheme = child(themeElements, 'fmtScheme');
    const theme: PptxTheme = {
      colors,
      majorFont: attr(path(fontScheme, 'majorFont', 'latin'), 'typeface') || 'Calibri Light',
      minorFont: attr(path(fontScheme, 'minorFont', 'latin'), 'typeface') || 'Calibri',
      fillStyles: children(child(fmtScheme, 'fillStyleLst')),
      lineStyles: children(child(fmtScheme, 'lnStyleLst')),
      effectStyles: children(child(fmtScheme, 'effectStyleLst')),
      bgFillStyles: children(child(fmtScheme, 'bgFillStyleLst')),
    };
    this.themes.set(key, theme);
    return theme;
  }
}

const EOT_MAGIC = 0x504c;
const EOT_FLAG_COMPRESSED = 0x4;
const EOT_FLAG_XOR_ENCRYPTED = 0x10000000;

function isSfnt(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 4) return false;
  const tag =
    ((bytes[0] ?? 0) << 24) | ((bytes[1] ?? 0) << 16) | ((bytes[2] ?? 0) << 8) | (bytes[3] ?? 0);
  // TrueType, OpenType/CFF, Apple 'true', WOFF, WOFF2.
  return [0x00010000, 0x4f54544f, 0x74727565, 0x774f4646, 0x774f4632].includes(tag >>> 0);
}

/**
 * Decodes a `.fntdata` part. PowerPoint stores Embedded OpenType (EOT) — a header followed by the
 * sfnt data, optionally XOR-obfuscated; Google Slides/Gamma exports may store plain TTF. MicroType
 * Express-compressed EOT is not supported and returns null (the text falls back to system fonts).
 */
export function decodeEmbeddedFont(bytes: Uint8Array): ArrayBuffer | null {
  if (isSfnt(bytes)) return bytes.slice().buffer;
  if (bytes.byteLength < 82) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eotSize = view.getUint32(0, true);
  const fontDataSize = view.getUint32(4, true);
  const flags = view.getUint32(12, true);
  if (view.getUint16(34, true) !== EOT_MAGIC) return null;
  if (eotSize > bytes.byteLength || fontDataSize === 0 || fontDataSize > eotSize) return null;
  if (flags & EOT_FLAG_COMPRESSED) return null;

  const font = bytes.slice(eotSize - fontDataSize, eotSize);
  if (flags & EOT_FLAG_XOR_ENCRYPTED) {
    for (let i = 0; i < font.length; i++) font[i] = (font[i] ?? 0) ^ 0x50;
  }
  return isSfnt(font) ? font.buffer : null;
}

function slideFileNumber(p: string): number {
  return Number.parseInt(/slide(\d+)\.xml$/i.exec(p)?.[1] ?? '0', 10);
}

/** Resolves a relationship target (relative, or absolute from the package root). */
export function resolvePartPath(baseDir: string, target: string): string {
  const raw = target.startsWith('/') ? target.slice(1) : `${baseDir ? `${baseDir}/` : ''}${target}`;
  const out: string[] = [];
  for (const segment of raw.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') out.pop();
    else out.push(segment);
  }
  return out.join('/');
}
