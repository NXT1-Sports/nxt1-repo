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
import { createProxyMiddleware } from 'http-proxy-middleware';
import {
  buildCanonicalProfilePath,
  getActiveSport,
  isTeamRole,
  type HelpArticle,
  type HelpArticleResponse,
  type User,
} from '@nxt1/core';
import type { ApiResponse } from '@nxt1/core/profile';
import bootstrap from './src/main.server';
import {
  applyServerRouteSeo,
  buildMissingHelpArticleRouteSeo,
  buildNoindexRouteSeo,
  buildNotFoundRouteSeo,
  buildMissingProfileRouteSeo,
  buildServerHelpArticleRouteSeo,
  buildServerProfileRouteSeo,
  extractLegacyExplorePulseArticleId,
  resolveServerRouteSeo,
} from './src/app/core/services/web/ssr-route-seo';
import {
  buildPreferredHostRedirectUrl,
  extractLegacyProfileLookupParam,
  isRetiredLegacyRoute,
} from './src/app/core/services/web/legacy-route-handling';

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

/**
 * SSR template file - Angular CommonEngine uses this to render the application shell
 * This is the generated index.csr.html from the browser build, used as the template
 * for server-side rendering. CommonEngine will inject rendered component tree into <app-root>.
 */
const INDEX_HTML = join(DIST_FOLDER, 'index.csr.html');

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

const KNOWN_APP_ROUTE_PATTERNS = [
  /^\/$/,
  /^\/programs\/?$/,
  /^\/agent-x(?:\/.*)?$/,
  /^\/auth(?:\/(?:forgot-password|verify-email|onboarding(?:\/congratulations)?)?)?\/?$/,
  /^\/add-sport\/?$/,
  /^\/join\/[^/]+\/?$/,
  /^\/(?:google|microsoft|yahoo)\/callback\/?$/,
  /^\/oauth\/success\/?$/,
  /^\/activity\/?$/,
  /^\/profile(?:\/[^/]+\/[^/]+\/[^/]+|\/[^/]+)?\/?$/,
  /^\/settings(?:\/(?:account-information|connected-accounts|notification-preferences))?\/?$/,
  /^\/help-center(?:\/(?:category\/[^/]+|article\/[^/]+|video\/[^/]+|search|contact))?\/?$/,
  /^\/manage-team\/?$/,
  /^\/invite(?:\/team\/[^/]+)?\/?$/,
  /^\/usage\/?$/,
  /^\/pulse\/?$/,
  /^\/terms\/?$/,
  /^\/privacy\/?$/,
  /^\/post\/[^/]+\/?$/,
] as const;

function isKnownAppRoute(requestPath: string): boolean {
  return KNOWN_APP_ROUTE_PATTERNS.some((pattern) => pattern.test(requestPath));
}

function isNumericProfileRouteParam(value: string): boolean {
  return /^\d+$/.test(value);
}

function isUserIdProfileRouteParam(value: string): boolean {
  return /^[a-zA-Z0-9]{20,32}$/.test(value) && /[a-zA-Z]/.test(value) && /\d/.test(value);
}

function resolveProfileApiBaseUrl(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  if (/\/api\/v1(?:\/staging)?$/.test(normalizedBaseUrl)) {
    return normalizedBaseUrl;
  }

  return `${normalizedBaseUrl}/api/v1`;
}

function buildCanonicalProfileRedirectPath(profile: User): string | null {
  if (!profile.unicode || isTeamRole(profile.role)) {
    return null;
  }

  const activeSport = getActiveSport(profile);
  const athleteName =
    `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim() ||
    profile.displayName ||
    'NXT1 Athlete';

  return buildCanonicalProfilePath({
    athleteName,
    sport: activeSport?.sport,
    unicode: profile.unicode,
  });
}

async function fetchProfileForCanonicalRedirect(
  routeParam: string,
  profileApiBaseUrl: string
): Promise<User | null> {
  const lookupPath = isNumericProfileRouteParam(routeParam)
    ? `/auth/profile/unicode/${encodeURIComponent(routeParam)}`
    : isUserIdProfileRouteParam(routeParam)
      ? `/auth/profile/${encodeURIComponent(routeParam)}`
      : null;

  if (!lookupPath) {
    return null;
  }

  try {
    const response = await fetch(`${profileApiBaseUrl}${lookupPath}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as ApiResponse<User>;
    return payload.success && payload.data ? payload.data : null;
  } catch (error) {
    console.warn('Canonical profile redirect lookup failed:', error);
    return null;
  }
}

function extractProfileRouteLookupParam(requestPath: string): string | null {
  const canonicalMatch = requestPath.match(/^\/profile\/[^/]+\/[^/]+\/([^/]+)\/?$/);
  if (canonicalMatch?.[1]) {
    return canonicalMatch[1];
  }

  const directMatch = requestPath.match(/^\/profile\/([^/]+)\/?$/);
  if (directMatch?.[1] && directMatch[1] !== 'profile') {
    return directMatch[1];
  }

  return null;
}

function buildProfileRouteSeoMetadata(profile: User) {
  if (!profile.unicode || isTeamRole(profile.role)) {
    return null;
  }

  const primarySport = getActiveSport(profile) ?? profile.sports?.[profile.activeSportIndex || 0];
  const city = profile.location?.city || '';
  const state = profile.location?.state || '';
  const location = [city, state].filter(Boolean).join(', ');
  const athleteName =
    `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim() ||
    profile.displayName ||
    'NXT1 Athlete';

  return buildServerProfileRouteSeo({
    athleteName,
    firstName: profile.firstName || undefined,
    lastName: profile.lastName || undefined,
    username: profile.unicode,
    unicode: profile.unicode,
    position: primarySport?.positions?.[0] || undefined,
    classYear: profile.classOf || undefined,
    school: primarySport?.team?.name || undefined,
    sport: primarySport?.sport || undefined,
    location: location || undefined,
    imageUrl: profile.profileImgs?.[0] || undefined,
  });
}

function extractHelpCenterArticleSlug(requestPath: string): string | null {
  const match = requestPath.match(/^\/help-center\/article\/([^/]+)\/?$/);
  return match?.[1] ?? null;
}

async function fetchHelpArticleForSsr(
  slug: string,
  apiBaseUrl: string
): Promise<HelpArticle | null> {
  try {
    const response = await fetch(`${apiBaseUrl}/help-center/articles/${encodeURIComponent(slug)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as HelpArticleResponse;
    return payload.success && payload.data ? payload.data : null;
  } catch (error) {
    console.warn('Help article lookup failed during SSR route resolution:', error);
    return null;
  }
}

async function resolveDynamicProfileRouteSeo(requestPath: string, profileApiBaseUrl: string) {
  const routeParam = extractProfileRouteLookupParam(requestPath);
  if (!routeParam) {
    return null;
  }

  const profile = await fetchProfileForCanonicalRedirect(routeParam, profileApiBaseUrl);
  return profile;
}

async function resolveProfileRequestOutcome(
  requestPath: string,
  profileApiBaseUrl: string,
  fullUrl: string
) {
  const profile = await resolveDynamicProfileRouteSeo(requestPath, profileApiBaseUrl);
  if (profile) {
    return buildProfileRouteSeoMetadata(profile);
  }

  return extractProfileRouteLookupParam(requestPath) ? buildMissingProfileRouteSeo(fullUrl) : null;
}

async function resolveHelpCenterArticleRouteSeo(
  requestPath: string,
  fullUrl: string,
  apiBaseUrl: string
) {
  const slug = extractHelpCenterArticleSlug(requestPath);
  if (!slug) {
    return null;
  }

  const article = await fetchHelpArticleForSsr(slug, apiBaseUrl);
  return article
    ? buildServerHelpArticleRouteSeo(article)
    : buildMissingHelpArticleRouteSeo(fullUrl);
}

async function resolveRequestRouteSeo(
  requestPath: string,
  fullUrl: string,
  profileApiBaseUrl: string
) {
  const staticRouteSeo = resolveServerRouteSeo(requestPath, fullUrl);
  const dynamicProfileSeo = await resolveProfileRequestOutcome(
    requestPath,
    profileApiBaseUrl,
    fullUrl
  );
  const dynamicHelpArticleSeo = await resolveHelpCenterArticleRouteSeo(
    requestPath,
    fullUrl,
    profileApiBaseUrl
  );

  if (dynamicHelpArticleSeo) {
    return staticRouteSeo ? { ...staticRouteSeo, ...dynamicHelpArticleSeo } : dynamicHelpArticleSeo;
  }

  if (dynamicProfileSeo) {
    return staticRouteSeo ? { ...staticRouteSeo, ...dynamicProfileSeo } : dynamicProfileSeo;
  }

  if (staticRouteSeo) {
    return staticRouteSeo;
  }

  return isKnownAppRoute(requestPath)
    ? buildNoindexRouteSeo(fullUrl)
    : buildNotFoundRouteSeo(fullUrl);
}

const STATIC_ASSET_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.css',
  '.map',
  '.json',
  '.webmanifest',
  '.wasm',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
]);

function isStaticAssetRequest(req: Request): boolean {
  const extension = extname(req.path).toLowerCase();
  return extension.length > 0 && STATIC_ASSET_EXTENSIONS.has(extension);
}

function optimizePublicMarketingHtml(html: string): string {
  return (
    html
      // Strip eager module preloads from SSR HTML so above-the-fold marketing pages
      // only hydrate what they need on first paint.
      .replace(/<link\b[^>]*rel=["']modulepreload["'][^>]*>\s*/gi, '')
      .replace(
        /<script\b[^>]*id=["']ng-event-dispatch-contract["'][^>]*>[\s\S]*?<\/script>\s*/gi,
        ''
      )
      .replace(/<script\b[^>]*>\s*window\.__jsaction_bootstrap[\s\S]*?<\/script>\s*/gi, '')
      .replace(
        /<link\b[^>]*href=["']https:\/\/(?:storage\.googleapis\.com|firebaseinstallations\.googleapis\.com|firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|a\.espncdn\.com|firebasestorage\.googleapis\.com|nxt1sports\.firebasestorage\.app)["'][^>]*>\s*/gi,
        ''
      )
      .replace(/\n{3,}/g, '\n\n')
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
  const publicBaseUrl = (process.env['PUBLIC_URL'] || 'https://nxt1sports.com').replace(/\/+$/, '');
  const publicHostname = (() => {
    try {
      return new URL(publicBaseUrl).hostname;
    } catch {
      return 'nxt1sports.com';
    }
  })();
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

  server.use((req: Request, res: Response, next: NextFunction) => {
    const fullUrl = `${req.protocol}://${req.headers.host ?? req.hostname}${req.originalUrl}`;
    const preferredHostUrl = buildPreferredHostRedirectUrl(fullUrl, publicHostname);
    if (!preferredHostUrl) {
      next();
      return;
    }

    res.redirect(308, preferredHostUrl);
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

  // The web app no longer exposes /messages or /ai-scout.
  // Return a 410 so crawlers and caches drop these legacy paths instead of indexing the shell.
  server.get(/^\/(?:messages|ai-scout)(?:\/.*)?$/, (_req: Request, res: Response) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.status(410).type('text/plain; charset=utf-8').send('Gone');
  });

  // /blog is retired and should return a hard 410 (not a soft-404 HTML shell).
  server.get(/^\/blog(?:\/.*)?$/, (_req: Request, res: Response) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.status(410).type('text/plain; charset=utf-8').send('Gone');
  });

  server.get(/^(?:\/saved-scouting-report(?:\/.*)?|\/search-videos(?:\/.*)?)$/, (req, res) => {
    if (!isRetiredLegacyRoute(req.path)) {
      res.status(404).type('text/plain; charset=utf-8').send('Not found');
      return;
    }

    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.status(410).type('text/plain; charset=utf-8').send('Gone');
  });

  // Legacy pulse article detail URLs were indexed under /explore/pulse/:id.
  // Redirect them to the current /pulse/:id entry point so old search results stay alive.
  server.get(/^\/explore\/pulse\/[^/]+\/?$/, (req: Request, res: Response) => {
    const articleId = extractLegacyExplorePulseArticleId(req.path);
    if (!articleId) {
      res.status(404).type('text/plain; charset=utf-8').send('Not found');
      return;
    }

    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    res.redirect(308, `/pulse/${encodeURIComponent(articleId)}${query}`);
  });

  // The legacy Explore surface is retired.
  // Return 410 for the remaining prefix so crawlers and users stop treating it as active.
  server.get(/^\/explore(?:\/.*)?$/, (_req: Request, res: Response) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.status(410).type('text/plain; charset=utf-8').send('Gone');
  });

  const backendTarget = process.env['BACKEND_URL'] || 'https://api.nxt1sports.com';
  const profileApiBaseUrl = resolveProfileApiBaseUrl(
    process.env['BACKEND_API_URL'] || backendTarget
  );

  // Redirect short profile URLs to the slugged canonical route before SSR.
  // Client-side replaceUrl is not strong enough for crawler canonicalization.
  server.get(/^\/profile\/[^/]+\/?$/, async (req: Request, res: Response, next: NextFunction) => {
    const routeParam = req.path.match(/^\/profile\/([^/]+)\/?$/)?.[1] ?? '';
    if (!routeParam) {
      next();
      return;
    }

    const profile = await fetchProfileForCanonicalRedirect(routeParam, profileApiBaseUrl);
    const canonicalPath = profile ? buildCanonicalProfileRedirectPath(profile) : null;
    const currentPath = req.path.replace(/\/+$/, '') || req.path;

    if (canonicalPath && canonicalPath !== currentPath) {
      const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      res.redirect(308, `${canonicalPath}${query}`);
      return;
    }

    next();
  });

  server.get(
    /^(?:\/prospect-profile\/[^/]+|\/profile\/athlete\/[^/]+\/[^/]+)\/?$/,
    async (req: Request, res: Response) => {
      const routeParam = extractLegacyProfileLookupParam(req.path);
      if (!routeParam) {
        res.status(404).type('text/plain; charset=utf-8').send('Not found');
        return;
      }

      const profile = await fetchProfileForCanonicalRedirect(routeParam, profileApiBaseUrl);
      const canonicalPath = profile ? buildCanonicalProfileRedirectPath(profile) : null;
      if (canonicalPath) {
        res.redirect(308, `${publicBaseUrl}${canonicalPath}`);
        return;
      }

      if (req.path.startsWith('/prospect-profile/')) {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        res.status(410).type('text/plain; charset=utf-8').send('Gone');
        return;
      }

      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.status(404).type('text/plain; charset=utf-8').send('Not found');
    }
  );

  // ============================================
  // BACKEND API PROXY (Sitemap, XML, and API routes)
  // ============================================

  // Proxy XML sitemap endpoints to backend before SSR so crawlers never receive HTML fallback.
  const sitemapProxy = createProxyMiddleware({
    target: backendTarget,
    changeOrigin: true,
    pathRewrite: (path: string) => path,
    onError: (err: Error, _req: Request, res: Response) => {
      console.error('Sitemap proxy error:', err.message);
      res
        .status(503)
        .type('application/xml; charset=utf-8')
        .send('<?xml version="1.0" encoding="UTF-8"?><error>Sitemap service unavailable</error>');
    },
  } as Parameters<typeof createProxyMiddleware>[0]);

  server.get('/sitemap.xml', sitemapProxy);
  server.get('/sitemaps/core.xml', sitemapProxy);
  server.get('/sitemaps/profiles-:page.xml', sitemapProxy);

  // ============================================
  // ANGULAR UNIVERSAL SSR
  // ============================================

  // All routes (except static files) go through Angular
  // Express 4 wildcard syntax - matches root / and all sub-paths
  server.get(/.*/, (req: Request, res: Response, next: NextFunction) => {
    // Never SSR-fallback missing hashed assets (JS/CSS/etc.), otherwise
    // browsers receive HTML for module requests and throw MIME type errors.
    if (isStaticAssetRequest(req)) {
      res.status(404).type('text/plain; charset=utf-8').send('Not found');
      return;
    }

    const { protocol, originalUrl, baseUrl, headers } = req;

    // Construct the full URL
    const fullUrl = `${protocol}://${headers.host}${originalUrl}`;

    // Extract auth token from cookies for FirebaseServerApp
    const authToken = extractAuthToken(req);

    // Extract theme preferences from cookies for flash-free SSR
    const themePreference = extractCookie(req, THEME_COOKIE);
    const sportTheme = extractCookie(req, SPORT_THEME_COOKIE);
    let resolvedRouteSeo: ReturnType<typeof resolveServerRouteSeo> = null;

    Promise.resolve(resolveRequestRouteSeo(req.path, fullUrl, profileApiBaseUrl))
      .then((routeSeo) => {
        resolvedRouteSeo = routeSeo;

        return commonEngine
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
          .then((html) => ({ html, routeSeo }));
      })
      .then(({ html, routeSeo }) => {
        // Add security headers
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('X-XSS-Protection', '1; mode=block');

        // Allow OAuth popups without COOP blocking window.closed
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

        if (routeSeo?.robots) {
          res.setHeader('X-Robots-Tag', routeSeo.robots);
        }

        const renderedHtml = isPublicMarketingRoute(req) ? optimizePublicMarketingHtml(html) : html;
        const responseHtml = applyServerRouteSeo(renderedHtml, routeSeo);

        sendCompressedBody(
          req,
          res,
          routeSeo?.statusCode ?? 200,
          responseHtml,
          'text/html; charset=utf-8'
        );
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

        try {
          const routeSeo = resolvedRouteSeo;
          if (routeSeo?.robots) {
            res.setHeader('X-Robots-Tag', routeSeo.robots);
          }

          const fallbackHtml = readFileSync(CSR_INDEX, 'utf-8');
          const responseHtml = applyServerRouteSeo(fallbackHtml, routeSeo);
          sendCompressedBody(
            req,
            res,
            routeSeo?.statusCode ?? 200,
            responseHtml,
            'text/html; charset=utf-8'
          );
        } catch (fallbackError) {
          console.error('CSR fallback failed:', fallbackError);
          next(err); // Only use error handler as last resort
        }
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
