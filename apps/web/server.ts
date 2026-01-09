/**
 * @fileoverview SSR Express Server for NXT1 Web Application
 * @module @nxt1/web/server
 *
 * Production-ready Angular Universal server with:
 * - Server-side rendering using CommonEngine
 * - Static file serving with caching
 * - Compression and security headers
 * - Health check endpoint for load balancers
 * - Graceful error handling
 *
 * Architecture:
 * - Static assets served with long cache headers
 * - Dynamic routes rendered via Angular Universal
 * - Proper protocol detection behind proxies
 */
import 'zone.js/node';
import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine } from '@angular/ssr/node';
import express, { Request, Response, NextFunction } from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import bootstrap from './src/main.server';

// ============================================
// CONSTANTS
// ============================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DIST_FOLDER = resolve(__dirname, '../browser');
const INDEX_HTML = join(__dirname, 'index.server.html');

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

    commonEngine
      .render({
        bootstrap,
        documentFilePath: INDEX_HTML,
        url: fullUrl,
        publicPath: DIST_FOLDER,
        providers: [{ provide: APP_BASE_HREF, useValue: baseUrl || '/' }],
      })
      .then((html) => {
        // Add security headers
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('X-XSS-Protection', '1; mode=block');

        res.status(200).send(html);
      })
      .catch((err) => {
        console.error('SSR Error:', err);
        next(err);
      });
  });

  // ============================================
  // ERROR HANDLER
  // ============================================

  server.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Server Error:', err);
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
  const server = createServer();
  const port = process.env['PORT'] || 8080;
  const host = '0.0.0.0'; // Required for Cloud Run

  server.listen(Number(port), host, () => {
    console.log(`🚀 NXT1 SSR Server listening on http://${host}:${port}`);
    console.log(`   Environment: ${process.env['NODE_ENV'] || 'development'}`);
    console.log(`   Port: ${port}`);
  });
}

// Run the server
run();

// Export for testing and Firebase
export { createServer as app };
