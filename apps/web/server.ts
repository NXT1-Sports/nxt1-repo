/**
 * @fileoverview SSR Express Server for NXT1 Web Application
 * @module @nxt1/web/server
 *
 * Production-ready Angular Universal server with:
 * - Server-side rendering using CommonEngine
 * - FirebaseServerApp for authenticated SSR
 * - Static file serving with caching
 * - Compression and security headers
 * - Health check endpoint for load balancers
 * - Graceful error handling
 *
 * Architecture:
 * - Static assets served with long cache headers
 * - Dynamic routes rendered via Angular Universal
 * - Auth token extracted from cookies for FirebaseServerApp
 * - Proper protocol detection behind proxies
 *
 * @see https://firebase.google.com/docs/reference/js/app.firebaseserverapp
 */
import 'zone.js/node';
import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine } from '@angular/ssr/node';
import express, { Request, Response, NextFunction } from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import bootstrap from './src/main.server';

// Import the SSR_AUTH_TOKEN injection token from the dedicated tokens file
// IMPORTANT: Do NOT import from server-auth.service.ts as it has Firebase imports
// that cause module resolution issues in the dev server
import { SSR_AUTH_TOKEN } from './src/app/core/services/auth/ssr-tokens';

// Theme SSR tokens (defined in @nxt1/ui package, safe to import)
import { SSR_INITIAL_THEME, SSR_INITIAL_SPORT_THEME } from '@nxt1/ui/services/theme';

// ============================================
// CONSTANTS
// ============================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DIST_FOLDER = resolve(__dirname, '../browser');
const INDEX_HTML = join(__dirname, 'index.server.html');

/** CSR fallback HTML (served when SSR fails) — Angular generates index.csr.html in browser/ */
const CSR_INDEX = join(DIST_FOLDER, 'index.csr.html');

/** Cookie name for Firebase auth token */
const AUTH_TOKEN_COOKIE = '__session';

/** Cookie name for theme preference */
const THEME_COOKIE = 'nxt1-theme-preference';

/** Cookie name for sport theme */
const SPORT_THEME_COOKIE = 'nxt1-sport-theme';

const COMPRESSIBLE_STATIC_TYPES = new Map<string, string>([
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

/**
 * Extract a cookie value by name from request headers
 */
function extractCookie(req: Request, name: string): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;

  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [cookieName, cookieValue] = cookie.trim().split('=');
    if (cookieName === name && cookieValue) {
      return decodeURIComponent(cookieValue);
    }
  }
  return undefined;
}

/**
 * Extract auth token from request cookies
 */
function extractAuthToken(req: Request): string | undefined {
  return extractCookie(req, AUTH_TOKEN_COOKIE);
}

function isPublicMarketingRoute(req: Request): boolean {
  const normalizedPath = req.path.replace(/\/+$/, '') || '/';
  return normalizedPath === '/' || normalizedPath === '/agent-x' || normalizedPath === '/programs';
}

function optimizePublicMarketingHtml(html: string): string {
  return html
    .replace(/<link rel="modulepreload" href="[^"]+">/g, '')
    .replace(
      /<link rel="preload" href="styles-deferred\.css" as="style"[\s\S]*?<\/noscript>\s*/g,
      ''
    )
    .replace(
      /<script type="text\/javascript" id="ng-event-dispatch-contract">[\s\S]*?<\/script>\s*/g,
      ''
    )
    .replace(/<script>window\.__jsaction_bootstrap[\s\S]*?<\/script>\s*/g, '')
    .replace(/<script src="(?:polyfills|main)-[^"]+\.js" type="module"><\/script>\s*/g, '')
    .replace(
      /<link rel="preconnect" href="https:\/\/firebaseinstallations\.googleapis\.com"(?: crossorigin(?:="")?)?>\s*/g,
      ''
    )
    .replace(
      /<link rel="dns-prefetch" href="https:\/\/(firestore|identitytoolkit)\.googleapis\.com">\s*/g,
      ''
    );
}

function getAcceptedEncoding(req: Request): 'br' | 'gzip' | null {
  const acceptEncoding = req.headers['accept-encoding'] ?? '';
  if (acceptEncoding.includes('br')) return 'br';
  if (acceptEncoding.includes('gzip')) return 'gzip';
  return null;
}

function compressBody(body: Buffer, encoding: 'br' | 'gzip'): Buffer {
  return encoding === 'br'
    ? brotliCompressSync(body, { params: { 1: 5 } })
    : gzipSync(body, { level: 6 });
}

function sendCompressedBody(
  req: Request,
  res: Response,
  status: number,
  body: string | Buffer,
  contentType: string
): void {
  const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const encoding = getAcceptedEncoding(req);

  res.status(status);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Vary', 'Accept-Encoding');

  if (!encoding || rawBody.byteLength < 1024) {
    res.setHeader('Content-Length', rawBody.byteLength);
    res.send(rawBody);
    return;
  }

  const compressedBody = compressBody(rawBody, encoding);
  res.setHeader('Content-Encoding', encoding);
  res.setHeader('Content-Length', compressedBody.byteLength);
  res.send(compressedBody);
}

function tryServeCompressedStatic(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    next();
    return;
  }

  const extension = extname(req.path);
  const contentType = COMPRESSIBLE_STATIC_TYPES.get(extension);
  const encoding = getAcceptedEncoding(req);
  if (!contentType || !encoding) {
    next();
    return;
  }

  let filePath: string;
  try {
    filePath = resolve(DIST_FOLDER, `.${decodeURIComponent(req.path)}`);
  } catch {
    next();
    return;
  }

  if (!filePath.startsWith(`${DIST_FOLDER}${sep}`) || !existsSync(filePath)) {
    next();
    return;
  }

  const rawBody = readFileSync(filePath);
  const compressedBody = compressBody(rawBody, encoding);
  res.status(200);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Encoding', encoding);
  res.setHeader('Content-Length', compressedBody.byteLength);
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('Cache-Control', 'public, max-age=31536000');

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  res.end(compressedBody);
}

// ============================================
// EXPRESS SERVER FACTORY
// ============================================

/**
 * Create and configure Express application
 */
export function createServer(): express.Express {
  const server = express();
  const allowedHosts =
    process.env['ALLOWED_HOSTS']
      ?.split(',')
      .map((host) => host.trim())
      .filter((host) => host.length > 0) ?? [];
  const commonEngine = new CommonEngine({ allowedHosts });

  // Trust proxy for proper protocol detection behind load balancers
  server.set('trust proxy', true);

  // Disable x-powered-by header for security
  server.disable('x-powered-by');

  // ============================================
  // HEALTH CHECK (for load balancers/k8s)
  // ============================================
  server.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // ============================================
  // STATIC FILE SERVING
  // ============================================

  // Serve static files from browser dist folder
  // Files with hashes get long cache, others get short cache
  server.use(tryServeCompressedStatic);

  server.use(
    express.static(DIST_FOLDER, {
      maxAge: '1y',
      index: false, // Don't serve index.html for directory requests
      setHeaders: (res, path) => {
        // Service worker should not be cached
        if (path.endsWith('ngsw-worker.js') || path.endsWith('ngsw.json')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    })
  );

  // Legacy team profile URLs are intentionally retired from the public web surface.
  // Use an HTTP redirect so crawlers and social bots update canonical indexing quickly.
  server.get(/^\/team\/[^/]+\/[^/]+\/?$/, (req: Request, res: Response) => {
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    res.redirect(308, `/agent-x${query}`);
  });

  // ============================================
  // ANGULAR UNIVERSAL SSR
  // ============================================

  // All routes (except static files) go through Angular
  // Express 4 wildcard syntax - matches root / and all sub-paths
  server.get('*', (req: Request, res: Response, next: NextFunction) => {
    const { protocol, originalUrl, baseUrl, headers } = req;

    // Construct the full URL
    const fullUrl = `${protocol}://${headers.host}${originalUrl}`;

    // Extract auth token from cookies for FirebaseServerApp
    const authToken = extractAuthToken(req);

    // Extract theme preferences from cookies for flash-free SSR
    const themePreference = extractCookie(req, THEME_COOKIE);
    const sportTheme = extractCookie(req, SPORT_THEME_COOKIE);

    commonEngine
      .render({
        bootstrap,
        documentFilePath: INDEX_HTML,
        url: fullUrl,
        publicPath: DIST_FOLDER,
        providers: [
          { provide: APP_BASE_HREF, useValue: baseUrl || '/' },
          // Provide auth token for FirebaseServerApp initialization
          // ServerAuthService uses this to initialize authenticated SSR
          {
            provide: SSR_AUTH_TOKEN,
            useValue: authToken,
          },
          // Provide theme preferences so NxtThemeService renders correct theme on server
          {
            provide: SSR_INITIAL_THEME,
            useValue: themePreference,
          },
          {
            provide: SSR_INITIAL_SPORT_THEME,
            useValue: sportTheme,
          },
        ],
      })
      .then((html) => {
        // Add security headers
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('X-XSS-Protection', '1; mode=block');

        // Allow OAuth popups without COOP blocking window.closed
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

        const responseHtml = isPublicMarketingRoute(req) ? optimizePublicMarketingHtml(html) : html;

        sendCompressedBody(req, res, 200, responseHtml, 'text/html; charset=utf-8');
      })
      .catch((err) => {
        // Log the SSR error for debugging in Cloud Run logs
        console.error('=== SSR RENDER ERROR — falling back to CSR ===');
        console.error('URL:', fullUrl);
        console.error('Error Name:', err?.name);
        console.error('Error Message:', err?.message);
        console.error('Error Stack:', err?.stack);
        console.error('=============================================');

        // Serve index.html for client-side rendering fallback
        // This ensures users see the app instead of a blank 500 error
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
        res.setHeader('X-SSR-Fallback', 'true');
        res.status(200).sendFile(CSR_INDEX, (sendErr) => {
          if (sendErr) {
            console.error('CSR fallback failed:', sendErr?.message);
            next(err); // Only use error handler as last resort
          }
        });
      });
  });

  // ============================================
  // ERROR HANDLER (last resort — CSR fallback failed)
  // ============================================

  server.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('=== SERVER ERROR HANDLER ===');
    console.error('Error Name:', err?.name);
    console.error('Error Message:', err?.message);
    console.error('Error Stack:', err?.stack);
    console.error('============================');
    // Last-resort: try sending CSR index.csr.html, fall back to plain 500
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(CSR_INDEX, (sendErr) => {
      if (sendErr) {
        res.status(500).send('Internal Server Error');
      }
    });
  });

  return server;
}

// ============================================
// SERVER STARTUP
// ============================================

/**
 * Start the Express server
 * Firebase App Hosting / Cloud Run inject PORT environment variable
 * Must bind to 0.0.0.0 (all interfaces) for Cloud Run
 */
function run(): void {
  try {
    console.log('Starting NXT1 SSR Server...');
    console.log(`  __dirname: ${__dirname}`);
    console.log(`  DIST_FOLDER: ${DIST_FOLDER}`);
    console.log(`  INDEX_HTML: ${INDEX_HTML}`);

    // Verify critical files exist at startup
    const distExists = existsSync(DIST_FOLDER);
    const indexExists = existsSync(INDEX_HTML);
    const csrExists = existsSync(CSR_INDEX);
    console.log(`  DIST_FOLDER exists: ${distExists}`);
    console.log(`  INDEX_HTML exists: ${indexExists}`);
    console.log(`  CSR index.csr.html exists: ${csrExists} (${CSR_INDEX})`);
    if (!distExists || !indexExists) {
      console.error('CRITICAL: Required files missing! Check build output.');
    }

    const server = createServer();
    const port = Number(process.env['PORT']) || 8080;
    const host = '0.0.0.0'; // Required for Cloud Run

    server.listen(port, host, () => {
      console.log(`🚀 NXT1 SSR Server listening on http://${host}:${port}`);
      console.log(`   Environment: ${process.env['NODE_ENV'] || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Run the server
run();

// Export for testing and Firebase
export { createServer as app };
