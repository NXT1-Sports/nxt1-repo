export interface ServerRouteSeoMetadata {
  readonly title?: string;
  readonly description?: string;
  readonly canonicalUrl?: string;
  readonly robots?: string;
  readonly googlebot?: string;
}

export interface ServerRouteSeoProfile {
  readonly athleteName: string;
  readonly position?: string;
  readonly classYear?: number;
  readonly school?: string;
  readonly sport?: string;
  readonly location?: string;
  readonly imageUrl?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly username?: string;
  readonly unicode?: string;
}

import { buildProfileSeoConfig, type ShareableProfile } from '@nxt1/core';

const INDEXABLE_ROBOTS =
  'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
const NOINDEX_ROBOTS =
  'noindex, nofollow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

const ROUTE_SEO = {
  home: {
    title: 'NXT1 Sports - The Sports Intelligence Platform',
    description:
      'NXT1 is the first AI command center for sports organizations to run their entire program from one system.',
  },
  agentX: {
    title: 'NXT1 Agent X | AI Command Center for Sports',
    description:
      'Agent X is the NXT1 AI command center for sports that executes film, creative, communications, and operations for athletes, coaches, directors, and programs.',
  },
  programs: {
    title: 'NXT1 Programs | The Digital Athletic Department for Sports Programs',
    description:
      'NXT1 turns sports programs into autonomous command centers. Agent X coordinates film, rosters, content, outreach, briefings, and recruiting execution for coaches, directors, athletes, and program leaders.',
  },
  helpCenter: {
    title: 'Help Center | NXT1 Sports',
    description:
      'Find answers to common questions, troubleshooting guides, and support resources for NXT1 Sports — the AI-powered sports intelligence platform for athletes, coaches, and programs.',
  },
  terms: {
    title: 'Terms of Service | NXT1 Sports',
    description:
      'Read the Terms of Service for NXT1 Sports. Understand your rights and responsibilities when using our platform.',
  },
  privacy: {
    title: 'Privacy Policy | NXT1 Sports',
    description:
      'Learn how NXT1 Sports collects, uses, and protects your personal information. Review our commitment to data privacy and security.',
  },
} as const;

const NOINDEX_PREFIXES = [
  '/auth',
  '/settings',
  '/activity',
  '/manage-team',
  '/usage',
  '/invite',
  '/add-sport',
  '/google/callback',
  '/microsoft/callback',
  '/yahoo/callback',
  '/pulse',
] as const;

function normalizePath(requestPath: string): string {
  const withoutQuery = requestPath.split('?')[0]?.split('#')[0] ?? '/';
  if (withoutQuery === '/' || withoutQuery.length === 0) {
    return '/';
  }

  return withoutQuery.replace(/\/+$/, '') || '/';
}

function toCanonicalUrl(fullUrl: string): string {
  try {
    const url = new URL(fullUrl);
    url.search = '';
    url.hash = '';
    url.pathname = normalizePath(url.pathname);
    if (url.pathname === '/') {
      url.pathname = '/';
    }
    return url.toString();
  } catch {
    return fullUrl.split('#')[0]?.split('?')[0] ?? fullUrl;
  }
}

function isPathOrDescendant(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function replaceOrInsertTag(html: string, pattern: RegExp, tag: string): string {
  if (pattern.test(html)) {
    return html.replace(pattern, tag);
  }

  return html.replace('</head>', `  ${tag}\n</head>`);
}

function replaceTitleTag(html: string, title: string): string {
  return replaceOrInsertTag(
    html,
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(title)}</title>`
  );
}

function replaceMetaTag(
  html: string,
  attribute: 'name' | 'property',
  key: string,
  content: string
): string {
  const escapedContent = escapeHtml(content);
  const pattern = new RegExp(`<meta[^>]+${attribute}=["']${key}["'][^>]*>`, 'i');
  return replaceOrInsertTag(
    html,
    pattern,
    `<meta ${attribute}="${key}" content="${escapedContent}" />`
  );
}

function replaceLinkTag(html: string, rel: string, href: string): string {
  const escapedHref = escapeHtml(href);
  const pattern = new RegExp(`<link[^>]+rel=["']${rel}["'][^>]*>`, 'i');
  return replaceOrInsertTag(html, pattern, `<link rel="${rel}" href="${escapedHref}" />`);
}

export function resolveServerRouteSeo(
  requestPath: string,
  fullUrl: string
): ServerRouteSeoMetadata | null {
  const path = normalizePath(requestPath);
  const canonicalUrl = toCanonicalUrl(fullUrl);

  if (path === '/') {
    return {
      ...ROUTE_SEO.home,
      canonicalUrl,
      robots: INDEXABLE_ROBOTS,
      googlebot: INDEXABLE_ROBOTS,
    };
  }

  if (isPathOrDescendant(path, '/agent-x')) {
    return {
      ...ROUTE_SEO.agentX,
      canonicalUrl,
      robots: INDEXABLE_ROBOTS,
      googlebot: INDEXABLE_ROBOTS,
    };
  }

  if (isPathOrDescendant(path, '/programs')) {
    return {
      ...ROUTE_SEO.programs,
      canonicalUrl,
      robots: INDEXABLE_ROBOTS,
      googlebot: INDEXABLE_ROBOTS,
    };
  }

  if (isPathOrDescendant(path, '/help-center')) {
    return {
      ...ROUTE_SEO.helpCenter,
      canonicalUrl,
      robots: INDEXABLE_ROBOTS,
      googlebot: INDEXABLE_ROBOTS,
    };
  }

  if (path === '/terms') {
    return {
      ...ROUTE_SEO.terms,
      canonicalUrl,
      robots: INDEXABLE_ROBOTS,
      googlebot: INDEXABLE_ROBOTS,
    };
  }

  if (path === '/privacy') {
    return {
      ...ROUTE_SEO.privacy,
      canonicalUrl,
      robots: INDEXABLE_ROBOTS,
      googlebot: INDEXABLE_ROBOTS,
    };
  }

  if (path === '/profile') {
    return {
      canonicalUrl,
      robots: NOINDEX_ROBOTS,
      googlebot: NOINDEX_ROBOTS,
    };
  }

  if (isPathOrDescendant(path, '/profile') || isPathOrDescendant(path, '/post')) {
    return {
      canonicalUrl,
      robots: INDEXABLE_ROBOTS,
      googlebot: INDEXABLE_ROBOTS,
    };
  }

  if (NOINDEX_PREFIXES.some((prefix) => isPathOrDescendant(path, prefix))) {
    return {
      canonicalUrl,
      robots: NOINDEX_ROBOTS,
      googlebot: NOINDEX_ROBOTS,
    };
  }

  return null;
}

export function buildServerProfileRouteSeo(
  profile: ServerRouteSeoProfile
): ServerRouteSeoMetadata | null {
  if (!profile.athleteName.trim() || !profile.unicode?.trim()) {
    return null;
  }

  const shareableProfile: ShareableProfile = {
    type: 'profile',
    id: profile.unicode,
    unicode: profile.unicode,
    title: profile.athleteName,
    description: '',
    athleteName: profile.athleteName,
    position: profile.position,
    classYear: profile.classYear,
    school: profile.school,
    sport: profile.sport,
    location: profile.location,
    imageUrl: profile.imageUrl,
    firstName: profile.firstName,
    lastName: profile.lastName,
    username: profile.username,
  };

  const seoConfig = buildProfileSeoConfig(shareableProfile);

  return {
    title: seoConfig.page.title,
    description: seoConfig.page.description,
    canonicalUrl: seoConfig.page.canonicalUrl,
  };
}

export function applyServerRouteSeo(html: string, metadata: ServerRouteSeoMetadata | null): string {
  if (!metadata) {
    return html;
  }

  let updatedHtml = html;

  if (metadata.title) {
    updatedHtml = replaceTitleTag(updatedHtml, metadata.title);
    updatedHtml = replaceMetaTag(updatedHtml, 'property', 'og:title', metadata.title);
    updatedHtml = replaceMetaTag(updatedHtml, 'name', 'twitter:title', metadata.title);
  }

  if (metadata.description) {
    updatedHtml = replaceMetaTag(updatedHtml, 'name', 'description', metadata.description);
    updatedHtml = replaceMetaTag(updatedHtml, 'property', 'og:description', metadata.description);
    updatedHtml = replaceMetaTag(updatedHtml, 'name', 'twitter:description', metadata.description);
  }

  if (metadata.canonicalUrl) {
    updatedHtml = replaceLinkTag(updatedHtml, 'canonical', metadata.canonicalUrl);
    updatedHtml = replaceMetaTag(updatedHtml, 'property', 'og:url', metadata.canonicalUrl);
  }

  if (metadata.robots) {
    updatedHtml = replaceMetaTag(updatedHtml, 'name', 'robots', metadata.robots);
  }

  if (metadata.googlebot) {
    updatedHtml = replaceMetaTag(updatedHtml, 'name', 'googlebot', metadata.googlebot);
  }

  return updatedHtml;
}
