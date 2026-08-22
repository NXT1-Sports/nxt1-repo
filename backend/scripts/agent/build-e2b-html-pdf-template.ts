import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { E2B, Sandbox, Template } from 'e2b';
import { config as loadDotenv } from 'dotenv';

loadDotenv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const backendRoot = join(__dirname, '..', '..');
const dockerfilePath = join(backendRoot, 'e2b', 'html-pdf-renderer', 'Dockerfile');
const templateName = process.env['E2B_HTML_PDF_TEMPLATE_NAME']?.trim() || 'nxt1-html-pdf-renderer';
const templateTag = process.env['E2B_HTML_PDF_TEMPLATE_TAG']?.trim() || 'build';
const targetName = `${templateName}:${templateTag}`;
const stableTemplateRef = `${templateName}:production`;
const latestTemplateRef = `${templateName}:latest`;
const apiKey = process.env['E2B_API_KEY']?.trim();

if (!apiKey) {
  throw new Error('E2B_API_KEY is required to build the HTML PDF template.');
}

async function main(): Promise<void> {
  const client = new E2B({ apiKey });
  const dockerfile = readFileSync(dockerfilePath, 'utf8');
  const template = Template().fromDockerfile(dockerfile);

  console.log(`Building E2B template ${targetName}...`);
  const build = await Template.build(template, targetName, {
    tags: ['production', 'latest'],
    apiKey,
  });

  console.log('Build completed:', build);

  await smokeTestTemplate(stableTemplateRef, client);

  console.log('Template is ready. Use this secret value:');
  console.log(stableTemplateRef);
}

async function smokeTestTemplate(templateRef: string, client: E2B): Promise<void> {
  console.log(`Smoke testing ${templateRef}...`);
  const sandbox = await client.Sandbox.create(templateRef, { timeoutMs: 180_000 });
  try {
    const html =
      '<!doctype html><html><head><style>@page{size:Letter landscape;margin:0}body{margin:0;font-family:sans-serif}.sheet{width:11in;height:8.5in;display:flex;align-items:center;justify-content:center;background:#0d1117;color:#fff;font-size:28px}</style></head><body><div class="sheet">NXT1 E2B HTML PDF OK</div></body></html>';
    await sandbox.files.makeDir('/home/user/html-pdf-smoke');
    await sandbox.files.write('/home/user/html-pdf-smoke/input.html', html);
    await sandbox.files.write(
      '/home/user/html-pdf-smoke/render.mjs',
      [
        "import { chromium } from 'playwright';",
        "const executablePath = process.env.CHROME_EXECUTABLE_PATH || '/usr/bin/chromium';",
        'const browser = await chromium.launch({',
        '  headless: true,',
        "  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],",
        '  ...(executablePath ? { executablePath } : {}),',
        '});',
        'try {',
        '  const page = await browser.newPage();',
        "  await page.goto('file:///home/user/html-pdf-smoke/input.html', { waitUntil: 'networkidle' });",
        "  await page.pdf({ path: '/home/user/html-pdf-smoke/output.pdf', format: 'Letter', landscape: true, printBackground: true });",
        "  console.log('PDF rendered successfully');",
        '} finally {',
        '  await browser.close();',
        '}',
      ].join('\n')
    );

    const result = await sandbox.commands.run('node render.mjs', {
      cwd: '/home/user/html-pdf-smoke',
      timeoutMs: 60_000,
    });

    if (result.exitCode && result.exitCode !== 0) {
      throw new Error(
        `Smoke render failed with exit ${result.exitCode}. stdout=${result.stdout ?? ''} stderr=${result.stderr ?? ''}`
      );
    }

    const pdf = await sandbox.files.read('/home/user/html-pdf-smoke/output.pdf', {
      format: 'bytes',
    });
    const header = Buffer.from(pdf).subarray(0, 5).toString('ascii');
    if (header !== '%PDF-') {
      throw new Error(`Smoke render produced invalid PDF header: ${header}`);
    }

    console.log(`Smoke test passed. PDF bytes=${pdf.length}`);
  } finally {
    await sandbox.kill().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
