import { describe, expect, it } from 'vitest';
import { PptxPackageError, PptxPresentation } from './pptx-renderer';
import { buildDeck, slideXml, textShape } from './pptx-test-fixtures';

function spansWithText(root: HTMLElement, text: string): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('span')).filter(
    (s) => s.textContent === text
  );
}

describe('PptxPresentation', () => {
  // p:sldIdLst ordering (`<p:sldId id r:id>`) is not asserted here: happy-dom's XML parser drops
  // an `r:id` attribute that shares its local name with `id`. Real browsers keep both.
  it('reports slide count and size', async () => {
    const deck = await PptxPresentation.load(
      await buildDeck([slideXml(textShape(2, 'First')), slideXml(textShape(2, 'Second'))])
    );
    expect(deck.slideCount).toBe(2);
    expect(deck.widthPx).toBe(1280);
    expect(deck.heightPx).toBe(720);
    const rendered = [deck.renderSlide(0).textContent, deck.renderSlide(1).textContent].join('|');
    expect(rendered).toContain('First');
    expect(rendered).toContain('Second');
    deck.dispose();
  });

  it('inherits placeholder position and text style from layout and master', async () => {
    const title = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>Game Plan</a:t></a:r></a:p></p:txBody></p:sp>`;
    const deck = await PptxPresentation.load(await buildDeck([slideXml(title)]));
    const root = deck.renderSlide(0);

    // Prompt text from the layout/master placeholders is never rendered.
    expect(root.textContent).not.toContain('prompt');
    const [span] = spansWithText(root, 'Game Plan');
    expect(span).toBeDefined();
    expect(span?.style.color).toMatch(/#222222|rgb\(34, 34, 34\)/); // tx2 → dk2
    expect(span?.style.fontFamily).toContain('Georgia'); // +mj-lt
    const shape = span?.closest('div[style*="position: absolute"]')?.parentElement as HTMLElement;
    expect(shape.style.left).toBe('100px'); // master xfrm 952500 EMU
    expect((span?.closest('div') as HTMLElement).style.textAlign).toBe('center'); // layout lstStyle
  });

  it('renders master graphics, theme background and body bullets', async () => {
    const body = `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr/>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Run the ball</a:t></a:r></a:p><a:p><a:pPr><a:buNone/></a:pPr><a:r><a:t>No bullet</a:t></a:r></a:p></p:txBody></p:sp>`;
    const deck = await PptxPresentation.load(await buildDeck([slideXml(body)]));
    const root = deck.renderSlide(0);

    expect(root.style.background).toMatch(/#eeeeee|rgb\(238, 238, 238\)/i);
    expect(root.querySelector('path[fill="#ff0000"]')).not.toBeNull(); // master brand bar
    const bullets = spansWithText(root, '•');
    expect(bullets).toHaveLength(1);
    expect(spansWithText(root, 'Run the ball')[0]?.style.fontFamily).toContain('Verdana');
  });

  it('never interprets slide text as markup', async () => {
    const payload = '&lt;img src=x onerror="alert(1)"&gt;';
    const deck = await PptxPresentation.load(await buildDeck([slideXml(textShape(2, payload))]));
    const root = deck.renderSlide(0);
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain('<img src=x onerror="alert(1)">');
  });

  it('renders tables with spans, fills and text', async () => {
    const table = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="5" name="Table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
      <p:xfrm><a:off x="0" y="0"/><a:ext cx="1905000" cy="952500"/></p:xfrm>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl>
        <a:tblPr firstRow="1"/><a:tblGrid><a:gridCol w="952500"/><a:gridCol w="952500"/></a:tblGrid>
        <a:tr h="476250"><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>Player</a:t></a:r></a:p></a:txBody><a:tcPr><a:solidFill><a:srgbClr val="1F3864"/></a:solidFill></a:tcPr></a:tc>
          <a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>Yds</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc></a:tr>
        <a:tr h="476250"><a:tc gridSpan="2"><a:txBody><a:bodyPr/><a:p><a:r><a:t>Totals</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc><a:tc hMerge="1"><a:txBody><a:bodyPr/><a:p/></a:txBody><a:tcPr/></a:tc></a:tr>
      </a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
    const deck = await PptxPresentation.load(await buildDeck([slideXml(table)]));
    const root = deck.renderSlide(0);
    const cells = Array.from(root.querySelectorAll('td'));
    expect(cells.map((c) => c.textContent)).toEqual(['Player', 'Yds', 'Totals']);
    expect(cells[2]?.colSpan).toBe(2);
    expect(cells[0]?.style.background).toMatch(/#1f3864|rgb\(31, 56, 100\)/i);
  });

  it('positions group children through the group transform', async () => {
    const group = `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="6" name="G"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="952500" y="952500"/><a:ext cx="1905000" cy="1905000"/><a:chOff x="0" y="0"/><a:chExt cx="952500" cy="952500"/></a:xfrm></p:grpSpPr>
      ${textShape(7, 'Grouped', '<a:solidFill><a:srgbClr val="00AA00"/></a:solidFill>')}</p:grpSp>`;
    const deck = await PptxPresentation.load(await buildDeck([slideXml(group)]));
    const root = deck.renderSlide(0);
    const groupDiv = root.children[root.children.length - 1] as HTMLElement;
    expect(groupDiv.style.left).toBe('100px');
    const child = groupDiv.firstElementChild as HTMLElement;
    expect(child.style.width).toBe('200px'); // child extent scaled 2x by ext/chExt
    // Fonts are not scaled with the group (18pt default = 24px).
    expect(spansWithText(root, 'Grouped')[0]?.getAttribute('style') ?? '').not.toContain('48px');
  });

  it('rejects files that are not pptx packages', async () => {
    await expect(
      PptxPresentation.load(new TextEncoder().encode('not a zip').buffer as ArrayBuffer)
    ).rejects.toBeInstanceOf(PptxPackageError);
  });
});
