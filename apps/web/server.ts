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
import { dirname, join, resolve } from 'node:path';
import bootstrap from './src/main.server';

// Import the SSR_AUTH_TOKEN injection token from the dedicated tokens file
// IMPORTANT: Do NOT import from server-auth.service.ts as it has Firebase imports
// that cause module resolution issues in the dev server
import { SSR_AUTH_TOKEN } from './src/app/features/auth/services/ssr-tokens';

// ============================================
// CONSTANTS
// ============================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DIST_FOLDER = resolve(__dirname, '../browser');
const INDEX_HTML = join(__dirname, 'index.server.html');

/** Cookie name for Firebase auth token */
const AUTH_TOKEN_COOKIE = '__session';

/**
 * Extract auth token from request cookies
 */
function extractAuthToken(req: Request): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;

  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === AUTH_TOKEN_COOKIE && value) {
      return decodeURIComponent(value);
    }
  }
  return undefined;
}

// ============================================
// EXPRESS SERVER FACTORY
// ============================================

/**
 * Create and configure Express application
 */
export function createServer(): express.Express {
  const server = express();
  const commonEngine = new CommonEngine();

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

  // ============================================
  // ANGULAR UNIVERSAL SSR
  // ============================================

  // All routes (except static files) go through Angular
  // Express 5 uses new path-to-regexp syntax - use {*path} instead of *
  server.get('/{*path}', (req: Request, res: Response, next: NextFunction) => {
    const { protocol, originalUrl, baseUrl, headers } = req;

    // Construct the full URL
    const fullUrl = `${protocol}://${headers.host}${originalUrl}`;

    // Extract auth token from cookies for FirebaseServerApp
    const authToken = extractAuthToken(req);

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
        ],
      })
      .then((html) => {
        // Add security headers
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('X-XSS-Protection', '1; mode=block');

        res.status(200).send(html);
      })
      .catch((err) => {
        console.error('=== SSR RENDER ERROR ===');
        console.error('URL:', fullUrl);
        console.error('Error Name:', err?.name);
        console.error('Error Message:', err?.message);
        console.error('Error Stack:', err?.stack);
        console.error('Full Error:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
        console.error('========================');
        next(err);
      });
  });

  // ============================================
  // ERROR HANDLER
  // ============================================

  server.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('=== SERVER ERROR HANDLER ===');
    console.error('Error Name:', err?.name);
    console.error('Error Message:', err?.message);
    console.error('Error Stack:', err?.stack);
    console.error('============================');
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Server Error</title></head>
        <body>
          <h1>Something went wrong</h1>
          <p>Please try again later.</p>
        </body>
      </html>
    `);
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
