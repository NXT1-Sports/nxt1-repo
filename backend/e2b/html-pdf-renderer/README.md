# NXT1 E2B HTML PDF Renderer Template

This template provides a dedicated E2B runtime for `render_html_pdf`.

It installs:

- Node 22
- system Chromium
- Playwright (without browser download)
- common fonts for operational PDFs

The backend runtime expects `CHROME_EXECUTABLE_PATH=/usr/bin/chromium` and
launches Chromium with Linux-safe headless flags.

## Build

From `backend/`:

```bash
npm run agent:build-html-pdf-template
```

This script:

- builds the E2B template from the Dockerfile
- tags it as `production` and `latest`
- smoke tests HTML-to-PDF rendering in the published template

## Deploy Wiring

After a successful build, set the GitHub repo secret:

```bash
gh secret set E2B_HTML_PDF_TEMPLATE -R NXT1-Sports/nxt1-repo --body "nxt1-html-pdf-renderer:production"
```

The backend deploy workflow will force `HTML_PDF_RENDERER=e2b` when that secret
is present.
