import { describe, expect, it } from 'vitest';
import { decodeEmbeddedFont } from './pptx-package';

/** A fake TrueType payload: sfnt version tag 0x00010000 followed by filler. */
const TTF = new Uint8Array([0x00, 0x01, 0x00, 0x00, 1, 2, 3, 4, 5, 6, 7, 8]);

function eot(font: Uint8Array, flags = 0): Uint8Array {
  const header = 120;
  const out = new Uint8Array(header + font.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, out.length, true); // EOTSize
  view.setUint32(4, font.length, true); // FontDataSize
  view.setUint32(8, 0x00020001, true); // Version
  view.setUint32(12, flags, true); // Flags
  view.setUint16(34, 0x504c, true); // MagicNumber
  out.set(font, header);
  return out;
}

describe('decodeEmbeddedFont', () => {
  it('passes plain TrueType data through', () => {
    expect(new Uint8Array(decodeEmbeddedFont(TTF) ?? new ArrayBuffer(0))).toEqual(TTF);
  });

  it('extracts the font data from an Embedded OpenType wrapper', () => {
    expect(new Uint8Array(decodeEmbeddedFont(eot(TTF)) ?? new ArrayBuffer(0))).toEqual(TTF);
  });

  it('removes EOT XOR obfuscation', () => {
    const obfuscated = TTF.map((b) => b ^ 0x50);
    const decoded = decodeEmbeddedFont(eot(obfuscated, 0x10000000));
    expect(new Uint8Array(decoded ?? new ArrayBuffer(0))).toEqual(TTF);
  });

  it('rejects MicroType Express-compressed and non-font data', () => {
    expect(decodeEmbeddedFont(eot(TTF, 0x4))).toBeNull();
    expect(
      decodeEmbeddedFont(new TextEncoder().encode('definitely not a font, just some text'))
    ).toBeNull();
  });
});
