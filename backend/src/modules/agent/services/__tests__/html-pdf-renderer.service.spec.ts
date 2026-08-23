import { describe, expect, it, vi } from 'vitest';
import { AgentEngineError } from '../../exceptions/agent-engine.error.js';
import {
  buildPlaywrightPdfOptions,
  getLocalChromiumLaunchArgs,
  HtmlPdfRendererService,
  type HtmlPdfRunner,
} from '../html-pdf-renderer.service.js';

const VALID_HTML =
  '<!doctype html><html><head><style>body{margin:0}</style></head><body>Calls</body></html>';

function pdfBytes(pageCount = 1): Buffer {
  return Buffer.from(`%PDF-1.7\n${'/Type /Page\n'.repeat(pageCount)}%%EOF`);
}

describe('HtmlPdfRendererService', () => {
  it('uses custom page dimensions when provided', () => {
    expect(
      buildPlaywrightPdfOptions({
        html: VALID_HTML,
        pageSize: 'LETTER',
        orientation: 'landscape',
        pageWidth: 4.75,
        pageHeight: 2.5,
        pageUnit: 'in',
      })
    ).toMatchObject({
      width: '4.75in',
      height: '2.5in',
      preferCSSPageSize: true,
    });
  });

  it('uses hardened Chromium launch args on linux only', () => {
    expect(getLocalChromiumLaunchArgs('linux')).toEqual(
      expect.arrayContaining([
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ])
    );
    expect(getLocalChromiumLaunchArgs('darwin')).toEqual([]);
  });

  it('renders a valid complete HTML document and returns metadata', async () => {
    const runner: HtmlPdfRunner = { render: vi.fn().mockResolvedValue(pdfBytes(1)) };
    const service = new HtmlPdfRendererService(runner);

    const result = await service.render({
      html: VALID_HTML,
      pageSize: 'LETTER',
      orientation: 'landscape',
      expectedPageCount: 1,
    });

    expect(result.buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(result.metadata).toMatchObject({
      engine: 'e2b-playwright',
      pageSize: 'LETTER',
      orientation: 'landscape',
      expectedPageCount: 1,
      pageCount: 1,
      verified: true,
      warnings: [],
    });
  });

  it('rejects partial HTML snippets', async () => {
    const service = new HtmlPdfRendererService({ render: vi.fn() });

    await expect(
      service.render({
        html: '<div>Not a document</div>',
        pageSize: 'LETTER',
        orientation: 'portrait',
      })
    ).rejects.toMatchObject({
      code: 'AGENT_VALIDATION_FAILED',
    } satisfies Partial<AgentEngineError>);
  });

  it('rejects script tags for deterministic static rendering', async () => {
    const service = new HtmlPdfRendererService({ render: vi.fn() });

    await expect(
      service.render({
        html: '<!doctype html><html><body><script>alert(1)</script></body></html>',
        pageSize: 'LETTER',
        orientation: 'portrait',
      })
    ).rejects.toMatchObject({
      code: 'AGENT_VALIDATION_FAILED',
    } satisfies Partial<AgentEngineError>);
  });

  it('marks render metadata unverified when page count differs', async () => {
    const service = new HtmlPdfRendererService({ render: vi.fn().mockResolvedValue(pdfBytes(2)) });

    const result = await service.render({
      html: VALID_HTML,
      pageSize: 'A4',
      orientation: 'portrait',
      expectedPageCount: 1,
    });

    expect(result.metadata.verified).toBe(false);
    expect(result.metadata.warnings).toEqual(['Expected 1 page(s), rendered 2.']);
  });

  it('rejects invalid PDF bytes from the runner', async () => {
    const service = new HtmlPdfRendererService({
      render: vi.fn().mockResolvedValue(Buffer.from('nope')),
    });

    await expect(
      service.render({ html: VALID_HTML, pageSize: 'LETTER', orientation: 'portrait' })
    ).rejects.toMatchObject({
      code: 'AGENT_PIPELINE_FAILED',
    } satisfies Partial<AgentEngineError>);
  });
});
