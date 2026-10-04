/**
 * @fileoverview Namespace-agnostic XML helpers for OOXML (PresentationML / DrawingML) parts.
 *
 * Elements are matched by local name so `p:sp`, `dsp:sp` (SmartArt drawings) and documents
 * written with non-standard prefixes all resolve the same way.
 */

/** English Metric Units per CSS pixel at 96 DPI. */
export const EMU_PER_PX = 9525;

export function parseXml(text: string): Document | null {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return null;
  return doc;
}

export function child(el: Element | null | undefined, name: string): Element | null {
  if (!el) return null;
  for (let node = el.firstElementChild; node; node = node.nextElementSibling) {
    if (node.localName === name) return node;
  }
  return null;
}

export function children(el: Element | null | undefined, name?: string): Element[] {
  const out: Element[] = [];
  if (!el) return out;
  for (let node = el.firstElementChild; node; node = node.nextElementSibling) {
    if (!name || node.localName === name) out.push(node);
  }
  return out;
}

/** Walks a chain of local names (`path(sp, 'nvSpPr', 'nvPr', 'ph')`). */
export function path(el: Element | null | undefined, ...names: string[]): Element | null {
  let current: Element | null = el ?? null;
  for (const name of names) {
    current = child(current, name);
    if (!current) return null;
  }
  return current;
}

/** First child whose local name is in `names`. */
export function firstOf(
  el: Element | null | undefined,
  names: ReadonlySet<string>
): Element | null {
  if (!el) return null;
  for (let node = el.firstElementChild; node; node = node.nextElementSibling) {
    if (names.has(node.localName)) return node;
  }
  return null;
}

/** Reads an attribute by local name, so `r:embed` matches whatever prefix the writer chose. */
export function attr(el: Element | null | undefined, name: string): string | null {
  if (!el) return null;
  const direct = el.getAttribute(name);
  if (direct !== null) return direct;
  for (const a of Array.from(el.attributes)) {
    if (a.localName === name) return a.value;
  }
  return null;
}

const RELATIONSHIPS_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/**
 * Reads a relationship-id attribute (`r:id`, `r:embed`, ...). Needed where the element also has
 * a plain attribute of the same local name, e.g. `<p:sldId id="256" r:id="rId2"/>`.
 */
export function relAttr(el: Element | null | undefined, name: string): string | null {
  if (!el) return null;
  const namespaced = el.getAttributeNS(RELATIONSHIPS_NS, name);
  if (namespaced) return namespaced;
  for (const a of Array.from(el.attributes)) {
    if (a.name.endsWith(`:${name}`)) return a.value;
  }
  return null;
}

export function numAttr(el: Element | null | undefined, name: string): number | null {
  const raw = attr(el, name);
  if (raw === null || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** OOXML booleans are `1`/`true`/`on`. */
export function boolAttr(el: Element | null | undefined, name: string): boolean | null {
  const raw = attr(el, name);
  if (raw === null) return null;
  return raw === '1' || raw === 'true' || raw === 'on';
}

export function textOf(el: Element | null | undefined): string {
  return el?.textContent ?? '';
}
