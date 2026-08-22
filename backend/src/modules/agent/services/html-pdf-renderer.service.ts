import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { AgentEngineError } from '../exceptions/agent-engine.error.js';

export type HtmlPdfPageSize = 'LETTER' | 'LEGAL' | 'TABLOID' | 'A4';
export type HtmlPdfOrientation = 'portrait' | 'landscape';

export interface HtmlPdfRenderInput {
  readonly html: string;
  readonly pageSize: HtmlPdfPageSize;
  readonly orientation: HtmlPdfOrientation;
  readonly expectedPageCount?: number;
  readonly signal?: AbortSignal;
}

export interface HtmlPdfRenderMetadata {
  readonly engine: HtmlPdfRenderEngine;
  readonly pageSize: HtmlPdfPageSize;
  readonly orientation: HtmlPdfOrientation;
  readonly expectedPageCount?: number;
  readonly pageCount?: number;
  readonly verified: boolean;
  readonly warnings: readonly string[];
}

export interface HtmlPdfRenderResult {
  readonly buffer: Buffer;
  readonly metadata: HtmlPdfRenderMetadata;
}

export type HtmlPdfRenderEngine = 'e2b-playwright' | 'local-playwright';

export interface HtmlPdfRunner {
  readonly engine?: HtmlPdfRenderEngine;
  render(input: HtmlPdfRenderInput): Promise<Buffer>;
}

export function shouldUseE2bHtmlPdfRunner(
  requestedMode: string | undefined,
  hasConfiguredE2bTemplate: boolean
): boolean {
  const mode = requestedMode?.trim().toLowerCase() ?? 'auto';
  if (mode === 'local') return false;
  if (mode === 'e2b') return true;
  return hasConfiguredE2bTemplate;
}

const MAX_HTML_BYTES = 1_500_000;
const MAX_PDF_BYTES = 25 * 1024 * 1024;

export class HtmlPdfRendererService {
  constructor(private readonly runner: HtmlPdfRunner = new AutoHtmlPdfRunner()) {}

  async render(input: HtmlPdfRenderInput): Promise<HtmlPdfRenderResult> {
    this.validateHtml(input.html);

    const buffer = await this.runner.render(input);
    if (buffer.length < 5 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new AgentEngineError(
        'AGENT_PIPELINE_FAILED',
        'HTML PDF renderer returned invalid PDF bytes.'
      );
    }

    if (buffer.length > MAX_PDF_BYTES) {
      throw new AgentEngineError(
        'AGENT_PIPELINE_FAILED',
        'HTML PDF renderer returned a PDF larger than the configured limit.'
      );
    }

    const pageCount = estimatePdfPageCount(buffer);
    const warnings: string[] = [];
    if (input.expectedPageCount && pageCount && pageCount !== input.expectedPageCount) {
      warnings.push(`Expected ${input.expectedPageCount} page(s), rendered ${pageCount}.`);
    }

    return {
      buffer,
      metadata: {
        engine: this.runner.engine ?? 'e2b-playwright',
        pageSize: input.pageSize,
        orientation: input.orientation,
        ...(input.expectedPageCount ? { expectedPageCount: input.expectedPageCount } : {}),
        ...(pageCount ? { pageCount } : {}),
        verified: warnings.length === 0,
        warnings,
      },
    };
  }

  private validateHtml(html: string): void {
    const sizeBytes = Buffer.byteLength(html, 'utf8');
    if (sizeBytes === 0) {
      throw new AgentEngineError(
        'AGENT_VALIDATION_FAILED',
        'HTML PDF rendering requires non-empty html.'
      );
    }

    if (sizeBytes > MAX_HTML_BYTES) {
      throw new AgentEngineError(
        'AGENT_VALIDATION_FAILED',
        'HTML payload is too large for exact PDF rendering.'
      );
    }

    if (!/<!doctype html>|<html[\s>]/i.test(html)) {
      throw new AgentEngineError(
        'AGENT_VALIDATION_FAILED',
        'HTML PDF rendering requires a complete HTML document.'
      );
    }

    if (/<script\b/i.test(html)) {
      throw new AgentEngineError(
        'AGENT_VALIDATION_FAILED',
        'HTML PDF rendering does not allow script tags.'
      );
    }
  }
}

class AutoHtmlPdfRunner implements HtmlPdfRunner {
  readonly e2bRunner = new E2bHtmlPdfRunner();
  readonly localRunner = new LocalPlaywrightHtmlPdfRunner();
  engine: HtmlPdfRenderEngine = 'e2b-playwright';

  async render(input: HtmlPdfRenderInput): Promise<Buffer> {
    const mode = process.env['HTML_PDF_RENDERER']?.trim().toLowerCase() ?? 'auto';
    const hasConfiguredE2bTemplate = Boolean(process.env['E2B_HTML_PDF_TEMPLATE']?.trim());
    if (mode === 'local') {
      this.engine = 'local-playwright';
      return this.localRunner.render(input);
    }

    if (!shouldUseE2bHtmlPdfRunner(mode, hasConfiguredE2bTemplate)) {
      this.engine = 'local-playwright';
      return this.localRunner.render(input);
    }

    try {
      this.engine = 'e2b-playwright';
      return await this.e2bRunner.render(input);
    } catch (error) {
      if (mode === 'e2b') {
        throw error;
      }

      try {
        this.engine = 'local-playwright';
        return await this.localRunner.render(input);
      } catch (fallbackError) {
        throw new AgentEngineError(
          'AGENT_PIPELINE_FAILED',
          `HTML PDF rendering failed in E2B and local Playwright fallback. E2B error: ${getErrorMessage(error)}. Local error: ${getErrorMessage(fallbackError)}`,
          { cause: fallbackError }
        );
      }
    }
  }
}

class E2bHtmlPdfRunner implements HtmlPdfRunner {
  async render(input: HtmlPdfRenderInput): Promise<Buffer> {
    const template = process.env['E2B_HTML_PDF_TEMPLATE']?.trim() || 'nxt1-html-pdf-renderer';
    const moduleLoader = new Function('specifier', 'return import(specifier)') as (
      specifier: string
    ) => Promise<{ Sandbox: { create: (...args: unknown[]) => Promise<E2bSandboxLike> } }>;

    let sandbox: E2bSandboxLike | undefined;
    try {
      const { Sandbox } = await moduleLoader('e2b');
      sandbox = await Sandbox.create(template, { timeoutMs: 180_000, signal: input.signal });
      const workdir = `/home/user/html-pdf-${randomUUID()}`;
      await sandbox.files.makeDir(workdir);
      await sandbox.files.write(`${workdir}/input.html`, input.html);
      await sandbox.files.write(`${workdir}/render.mjs`, buildPlaywrightRenderScript(input));
      const result = await sandbox.commands.run('node render.mjs', {
        cwd: workdir,
        timeoutMs: 120_000,
        signal: input.signal,
      });

      if (result.exitCode && result.exitCode !== 0) {
        throw new AgentEngineError('AGENT_PIPELINE_FAILED', 'E2B HTML PDF render command failed.', {
          metadata: { stderr: result.stderr, stdout: result.stdout },
        });
      }

      const content = await sandbox.files.read(`${workdir}/output.pdf`, { format: 'bytes' });
      return Buffer.from(content);
    } catch (error) {
      if (error instanceof AgentEngineError) throw error;
      throw new AgentEngineError(
        'AGENT_PIPELINE_FAILED',
        `E2B HTML PDF rendering failed: ${getErrorMessage(error)}. Ensure the e2b package is installed, E2B_API_KEY is configured, and E2B_HTML_PDF_TEMPLATE is built with Playwright/Chromium.`,
        { cause: error }
      );
    } finally {
      await sandbox?.kill().catch(() => undefined);
    }
  }
}

class LocalPlaywrightHtmlPdfRunner implements HtmlPdfRunner {
  readonly engine = 'local-playwright' as const;

  async render(input: HtmlPdfRenderInput): Promise<Buffer> {
    const moduleLoader = new Function('specifier', 'return import(specifier)') as (
      specifier: string
    ) => Promise<{ chromium: LocalChromiumLike }>;

    let browser: LocalBrowserLike | undefined;
    try {
      const { chromium } = await moduleLoader('playwright');
      browser = await chromium.launch({
        headless: true,
        ...resolveLocalChromiumExecutablePath(),
      });
      const page = await browser.newPage();
      await page.emulateMedia({ media: 'print' });
      await page.setContent(input.html, { waitUntil: 'networkidle' });
      const pdf = await page.pdf({
        format: toPlaywrightFormat(input.pageSize),
        landscape: input.orientation === 'landscape',
        printBackground: true,
        margin: { top: '0in', right: '0in', bottom: '0in', left: '0in' },
      });
      return Buffer.from(pdf);
    } catch (error) {
      throw new AgentEngineError(
        'AGENT_PIPELINE_FAILED',
        'Local Playwright HTML PDF rendering failed. Ensure playwright is installed and Chrome/Chromium is available, or set HTML_PDF_RENDERER=e2b with a valid E2B template.',
        { cause: error }
      );
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }
}

interface LocalChromiumLike {
  launch(options: { headless: boolean; executablePath?: string }): Promise<LocalBrowserLike>;
}

interface LocalBrowserLike {
  newPage(): Promise<LocalPageLike>;
  close(): Promise<void>;
}

interface LocalPageLike {
  emulateMedia(options: { media: 'print' }): Promise<void>;
  setContent(html: string, options?: { waitUntil?: 'networkidle' }): Promise<void>;
  pdf(options: {
    format: string;
    landscape: boolean;
    printBackground: boolean;
    margin: { top: string; right: string; bottom: string; left: string };
  }): Promise<Uint8Array>;
}

interface E2bSandboxLike {
  readonly files: {
    makeDir(path: string): Promise<boolean>;
    write(path: string, data: string | ArrayBuffer): Promise<unknown>;
    read(path: string, opts?: { format?: 'bytes' }): Promise<Uint8Array>;
  };
  readonly commands: {
    run(
      command: string,
      opts?: { cwd?: string; timeoutMs?: number; signal?: AbortSignal }
    ): Promise<{ stdout?: string; stderr?: string; exitCode?: number }>;
  };
  kill(): Promise<boolean>;
}

function buildPlaywrightRenderScript(input: HtmlPdfRenderInput): string {
  const format = toPlaywrightFormat(input.pageSize);
  const landscape = input.orientation === 'landscape';
  return `import { chromium } from 'playwright';
import { resolve } from 'node:path';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto('file://' + resolve(process.cwd(), 'input.html'), { waitUntil: 'networkidle' });
  await page.pdf({
    path: resolve(process.cwd(), 'output.pdf'),
    format: ${JSON.stringify(format)},
    landscape: ${JSON.stringify(landscape)},
    printBackground: true,
    margin: { top: '0in', right: '0in', bottom: '0in', left: '0in' },
  });
} finally {
  await browser.close();
}
`;
}

function toPlaywrightFormat(pageSize: HtmlPdfPageSize): string {
  if (pageSize === 'A4') return 'A4';
  if (pageSize === 'LEGAL') return 'Legal';
  if (pageSize === 'TABLOID') return 'Tabloid';
  return 'Letter';
}

function resolveLocalChromiumExecutablePath(): { readonly executablePath?: string } {
  const configured = process.env['CHROME_EXECUTABLE_PATH']?.trim();
  if (configured && existsSync(configured)) {
    return { executablePath: configured };
  }

  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];

  const executablePath = candidates.find((candidate) => existsSync(candidate));
  return executablePath ? { executablePath } : {};
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function estimatePdfPageCount(buffer: Buffer): number | undefined {
  const text = buffer.toString('latin1');
  const matches = text.match(/\/Type\s*\/Page\b/g);
  return matches?.length;
}
