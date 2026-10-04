import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { extractPptxDocumentContent } from '../pptx-text-extractor.js';

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  `xmlns:r="${REL}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"`;

function slide(text: string): string {
  return `<p:sld ${NS}><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
}

async function buildDeck(withPresentationOrder: boolean): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('ppt/slides/slide1.xml', slide('Defensive Keys'));
  zip.file('ppt/slides/slide2.xml', slide('Cover'));
  zip.file('ppt/slides/slide3.xml', slide('Special Teams'));
  if (withPresentationOrder) {
    // The deck was reordered in PowerPoint: slide2.xml is shown first.
    zip.file(
      'ppt/presentation.xml',
      `<p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/><p:sldId id="258" r:id="rId4"/></p:sldIdLst></p:presentation>`
    );
    zip.file(
      'ppt/_rels/presentation.xml.rels',
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="${REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/>` +
        `<Relationship Id="rId2" Type="${REL}/slide" Target="slides/slide1.xml"/>` +
        `<Relationship Id="rId3" Type="${REL}/slide" Target="/ppt/slides/slide2.xml"/>` +
        `<Relationship Id="rId4" Type="${REL}/slide" Target="slides/slide3.xml"/>` +
        `</Relationships>`
    );
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('extractPptxDocumentContent', () => {
  it('orders and numbers slides by the presentation slide list, not file names', async () => {
    const content = await extractPptxDocumentContent(await buildDeck(true));
    expect(content.slides.map((s) => [s.slideNumber, s.slideText])).toEqual([
      [1, 'Cover'],
      [2, 'Defensive Keys'],
      [3, 'Special Teams'],
    ]);
  });

  it('falls back to slide file order when the presentation part is missing', async () => {
    const content = await extractPptxDocumentContent(await buildDeck(false));
    expect(content.slides.map((s) => s.slideText)).toEqual([
      'Defensive Keys',
      'Cover',
      'Special Teams',
    ]);
  });
});
