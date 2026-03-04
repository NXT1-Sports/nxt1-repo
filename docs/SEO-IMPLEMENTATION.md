# SEO Implementation Guide

> **Comprehensive documentation for NXT1's SEO architecture**
>
> Last Updated: January 2026 | Angular 21.x | Full SSR

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Package (@nxt1/core/seo)](#core-package-nxt1coreseo)
4. [Frontend Implementation](#frontend-implementation)
5. [Backend SEO APIs](#backend-seo-apis)
6. [Sitemap Generation](#sitemap-generation)
7. [robots.txt Configuration](#robotstxt-configuration)
8. [Adding SEO to a New Page](#adding-seo-to-a-new-page)
9. [Testing & Validation](#testing--validation)

---

## Overview

NXT1 uses a **full SSR (Server-Side Rendering)** architecture where all pages
are server-rendered for optimal SEO. The SEO system is built with:

- **Portable types** in `@nxt1/core/seo` (works on web, mobile, backend)
- **Angular SeoService** for dynamic meta tag updates
- **Dynamic sitemaps** generated from Firestore data
- **Structured data (JSON-LD)** for rich search results

### SEO Features

| Feature             | Implementation                          | Status |
| ------------------- | --------------------------------------- | ------ |
| Dynamic Page Titles | `SeoService.updateForProfile()`         | ✅     |
| Meta Descriptions   | Auto-generated from content             | ✅     |
| Open Graph Tags     | Full support (og:title, og:image, etc.) | ✅     |
| Twitter Cards       | summary_large_image, player cards       | ✅     |
| JSON-LD Schema      | Person, SportsTeam, VideoObject         | ✅     |
| Canonical URLs      | Automatic per-route                     | ✅     |
| Dynamic Sitemaps    | Profiles, teams, static pages           | ✅     |
| robots.txt          | Allow/Disallow rules                    | ✅     |
| SSR for All Pages   | Full server-side rendering              | ✅     |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SEO DATA FLOW                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────────┐      ┌──────────────────┐      ┌─────────────────┐   │
│   │  @nxt1/core/seo  │      │   Angular SSR    │      │    Backend      │   │
│   │                  │      │                  │      │                 │   │
│   │  • Types         │─────▶│  • SeoService    │◀─────│  • Sitemap API  │   │
│   │  • Builders      │      │  • Meta tags     │      │  • SSR data API │   │
│   │  • Schema        │      │  • JSON-LD       │      │                 │   │
│   └──────────────────┘      └──────────────────┘      └─────────────────┘   │
│           │                         │                         │             │
│           │    100% Portable        │    SSR-Safe             │   REST API  │
│           ▼                         ▼                         ▼             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         SEARCH ENGINES                               │   │
│   │                                                                      │   │
│   │   • Fully rendered HTML with meta tags                               │   │
│   │   • JSON-LD structured data in <head>                                │   │
│   │   • Dynamic sitemaps at /sitemap.xml                                 │   │
│   │   • Social preview cards for sharing                                 │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### File Locations

```
nxt1-monorepo/
├── packages/core/src/seo/
│   └── index.ts                    # Pure TypeScript types & builders (625 lines)
├── apps/web/src/
│   ├── app/core/services/
│   │   └── seo.service.ts          # Angular SeoService (464 lines)
│   └── robots.txt                  # Crawler directives
└── docs/
    └── SEO-IMPLEMENTATION.md       # This file

nxt1-backend/
├── controllers/sitemap/
│   └── sitemapController.js        # Dynamic sitemap generation
├── controllers/ssr/
│   └── ssrController.js            # SEO data APIs for SSR
└── routes/sitemap/
    └── sitemapRouter.js            # Sitemap routes
```

---

## Core Package (@nxt1/core/seo)

The `@nxt1/core/seo` module contains **pure TypeScript** types and builder
functions that work across all platforms (web, mobile, backend).

### Import

```typescript
import {
  // Types
  type SeoConfig,
  type PageMetadata,
  type OpenGraphMetadata,
  type TwitterMetadata,
  type ShareableProfile,
  type ShareableTeam,
  type ShareableVideo,

  // Builder functions
  buildProfileSeoConfig,
  buildTeamSeoConfig,
  buildVideoSeoConfig,
  buildShareUrl,

  // Utilities
  truncateDescription,
  sanitizeMetaText,
} from '@nxt1/core/seo';
```

### Types

#### SeoConfig

Complete SEO configuration for a page:

```typescript
interface SeoConfig {
  page: PageMetadata; // Core page metadata
  openGraph?: Partial<OpenGraphMetadata>; // Open Graph (Facebook, LinkedIn)
  twitter?: Partial<TwitterMetadata>; // Twitter Cards
  structuredData?: Record<string, unknown>; // JSON-LD schema
}
```

#### PageMetadata

Core metadata for any page:

```typescript
interface PageMetadata {
  title: string; // Browser tab, search results
  description: string; // Search snippet, social preview
  canonicalUrl?: string; // Canonical URL for this page
  image?: string; // Primary image for sharing
  imageAlt?: string; // Image alt text
  keywords?: string[]; // SEO keywords
  noIndex?: boolean; // Prevent indexing
  noFollow?: boolean; // Prevent following links
}
```

#### Shareable Content Types

```typescript
// Athlete profiles
interface ShareableProfile {
  type: 'profile';
  id: string;
  athleteName: string;
  position?: string;
  classYear?: number;
  school?: string;
  sport?: string;
  location?: string;
  imageUrl?: string;
}

// Teams
interface ShareableTeam {
  type: 'team';
  id: string;
  teamName: string;
  sport?: string;
  location?: string;
  logoUrl?: string;
  record?: string;
}

// Videos/Highlights
interface ShareableVideo {
  type: 'video' | 'highlight';
  id: string;
  videoTitle: string;
  athleteName?: string;
  duration?: number; // Seconds
  thumbnailUrl?: string;
  views?: number;
}
```

### Builder Functions

Generate complete SEO configurations from content data:

```typescript
// Build full SEO config for a profile page
const config = buildProfileSeoConfig({
  type: 'profile',
  id: 'john-smith',
  athleteName: 'John Smith',
  position: 'Quarterback',
  classYear: 2027,
  school: 'Lincoln High School',
  sport: 'Football',
  location: 'Austin, TX',
  imageUrl: 'https://storage.googleapis.com/...',
});

// Result includes:
// - page.title: "John Smith | Quarterback | Class of 2027 | NXT1 Sports"
// - page.description: "John Smith is a Quarterback in Football at Lincoln High School..."
// - openGraph: Full OG tags with type: 'profile'
// - twitter: Twitter card configuration
// - structuredData: JSON-LD Person schema
```

### Utility Functions

```typescript
// Truncate descriptions to SEO-friendly length (default 160 chars)
truncateDescription("Very long description...", 160);

// Sanitize text for meta tags (removes HTML, newlines, quotes)
sanitizeMetaText("<p>Raw HTML content</p>");

// Build shareable URL for any content type
buildShareUrl({ type: 'profile', id: 'john-smith', ... });
// Returns: 'https://nxt1sports.com/profile/john-smith'
```

---

## Frontend Implementation

### SeoService

The `SeoService` is an Angular injectable service that manages dynamic meta
tags. It's **SSR-safe** and works on both server and client.

**Location:** `apps/web/src/app/core/services/seo.service.ts`

#### High-Level API (Recommended)

Use these methods in components - they handle all meta tags automatically:

```typescript
@Component({ ... })
export class ProfileComponent implements OnInit {
  private readonly seo = inject(SeoService);
  private readonly profileService = inject(ProfileService);

  ngOnInit() {
    // Load profile data and update SEO
    this.profileService.getProfile(this.id).subscribe(profile => {
      this.seo.updateForProfile({
        id: profile.unicode,
        athleteName: `${profile.firstName} ${profile.lastName}`,
        position: profile.primaryPosition,
        classYear: profile.graduationYear,
        school: profile.school,
        sport: profile.primarySport,
        location: `${profile.city}, ${profile.state}`,
        imageUrl: profile.avatarUrl,
      });
    });
  }
}
```

#### Available High-Level Methods

```typescript
// Athlete profile pages
seo.updateForProfile({
  id: string;
  athleteName: string;
  position?: string;
  classYear?: number;
  school?: string;
  sport?: string;
  location?: string;
  imageUrl?: string;
});

// Team pages
seo.updateForTeam({
  id: string;
  teamName: string;
  sport?: string;
  location?: string;
  logoUrl?: string;
  record?: string;
});

// Video pages
seo.updateForVideo({
  id: string;
  videoTitle: string;
  athleteName?: string;
  duration?: number;
  thumbnailUrl?: string;
  views?: number;
});

// Generic pages
seo.updatePage({
  title: string;
  description: string;
  keywords?: string[];
  image?: string;
  noIndex?: boolean;
});

// Reset to homepage defaults
seo.resetToDefaults();
```

#### Low-Level API

For custom configurations:

```typescript
seo.applySeoConfig({
  page: {
    title: 'Custom Page Title',
    description: 'Custom description',
    canonicalUrl: 'https://nxt1sports.com/custom-page',
    image: 'https://storage.googleapis.com/custom-image.jpg',
    keywords: ['custom', 'keywords'],
  },
  openGraph: {
    type: 'article',
    // ... custom OG tags
  },
  twitter: {
    card: 'summary_large_image',
    // ... custom Twitter tags
  },
  structuredData: {
    '@context': 'https://schema.org',
    '@type': 'Article',
    // ... custom JSON-LD
  },
});
```

### SSR Render Modes

All pages use server-side rendering. Configure render modes in
`app.routes.server.ts`:

```typescript
import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // All public pages use Server rendering for SEO
  { path: '', renderMode: RenderMode.Server },
  { path: 'explore', renderMode: RenderMode.Server },
  { path: 'profile/:unicode', renderMode: RenderMode.Server },
  { path: 'team/:teamName', renderMode: RenderMode.Server },
  { path: 'post/:userUnicode/:postId', renderMode: RenderMode.Server },

  // Auth pages can be client-rendered (no SEO value)
  { path: 'auth/**', renderMode: RenderMode.Client },

  // Default fallback
  { path: '**', renderMode: RenderMode.Server },
];
```

---

## Backend SEO APIs

The backend provides SEO data endpoints for SSR and external services.

### SSR Data Endpoints

**Location:** `nxt1-backend/controllers/ssr/ssrController.js`

| Endpoint                       | Purpose                    |
| ------------------------------ | -------------------------- |
| `GET /v1/ssr/api/profile/:id`  | Profile SEO data           |
| `GET /v1/ssr/api/team/:id`     | Team SEO data              |
| `GET /v1/ssr/api/prospect/:id` | Prospect/live profile data |
| `GET /v1/ssr/api/post/:id`     | Post SEO data              |

These endpoints return minimal, public data needed for meta tags:

```json
{
  "firstName": "John",
  "lastName": "Smith",
  "position": "Quarterback",
  "sport": "Football",
  "school": "Lincoln High School",
  "graduationYear": 2027,
  "description": "John Smith is a Quarterback...",
  "imageUrl": "https://storage.googleapis.com/...",
  "websiteUrl": "https://nxt1sports.com/profile/john-smith"
}
```

---

## Sitemap Generation

Dynamic sitemaps are generated from Firestore data with 24-hour caching.

**Location:** `nxt1-backend/controllers/sitemap/sitemapController.js`

### Sitemap Structure

```
https://nxt1sports.com/sitemap.xml (Index)
├── /sitemap-static.xml     # Static pages (explore, auth, etc.)
├── /sitemap-profiles.xml   # All athlete profiles
└── /sitemap-teams.xml      # All team pages
```

### Endpoints

| Endpoint                | Content                             |
| ----------------------- | ----------------------------------- |
| `/sitemap.xml`          | Sitemap index pointing to sub-maps  |
| `/sitemap-static.xml`   | Static pages with priorities        |
| `/sitemap-profiles.xml` | All athlete profiles from Firestore |
| `/sitemap-teams.xml`    | All teams from TeamCodes collection |
| `POST /sitemap/refresh` | Admin endpoint to clear cache       |

### Static Pages Configuration

```javascript
const staticPages = [
  { loc: '/', priority: '1.0', changefreq: 'daily' },
  { loc: '/explore', priority: '0.95', changefreq: 'daily' },
  { loc: '/discover-athletes', priority: '0.95', changefreq: 'daily' },
  { loc: '/discover-teams', priority: '0.95', changefreq: 'daily' },
  { loc: '/search-videos', priority: '0.8', changefreq: 'daily' },
  { loc: '/leaderboards', priority: '0.8', changefreq: 'daily' },
  { loc: '/ai-scout', priority: '0.8', changefreq: 'weekly' },
  { loc: '/team-platform', priority: '0.9', changefreq: 'weekly' },
  // ...
];
```

### Profile Sitemap Generation

```javascript
// Queries Firestore for all athlete profiles
const snapshot = await usersRef
  .where('isRecruit', '==', true)
  .select('unicode', 'updatedAt', 'createdAt')
  .get();

// Generates XML entries with lastmod dates
snapshot.forEach((doc) => {
  const data = doc.data();
  if (data.unicode) {
    urls.push({
      loc: `${baseUrl}/profile/${data.unicode}`,
      lastmod: data.updatedAt || data.createdAt,
      priority: '0.7',
      changefreq: 'weekly',
    });
  }
});
```

---

## robots.txt Configuration

**Location:** `apps/web/src/robots.txt`

```txt
User-agent: *
Allow: /
Allow: /discover-athletes
Allow: /discover-teams
Allow: /search-videos
Allow: /ai-scout
Allow: /leaderboards
Allow: /team-platform
Allow: /auth
Allow: /start

# Disallow auth-protected pages from being crawled
Disallow: /home
Disallow: /create-post
Disallow: /settings
Disallow: /edit-profile
Disallow: /analytics
Disallow: /drafts
# ... other protected routes

Sitemap: https://nxt1sports.com/sitemap.xml
```

### Rules

- **Allow public pages** - Discovery, explore, auth (for sign-up)
- **Disallow protected pages** - User dashboard, settings, create flows
- **Reference sitemap** - Points to dynamic sitemap index

---

## Adding SEO to a New Page

### Step 1: Update the Component

```typescript
import { Component, OnInit, inject } from '@angular/core';
import { SeoService } from '@core/services/seo.service';

@Component({
  selector: 'app-new-page',
  standalone: true,
  // ...
})
export class NewPageComponent implements OnInit {
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    // Option 1: Simple page
    this.seo.updatePage({
      title: 'New Feature',
      description: 'Description of this feature for search results.',
      keywords: ['feature', 'nxt1', 'sports'],
    });

    // Option 2: Dynamic content (profile, team, video)
    this.seo.updateForProfile({ ... });
    this.seo.updateForTeam({ ... });
    this.seo.updateForVideo({ ... });
  }
}
```

### Step 2: Configure SSR Render Mode

In `app.routes.server.ts`:

```typescript
export const serverRoutes: ServerRoute[] = [
  // ... existing routes

  // Add your new page (use Server for SEO)
  { path: 'new-page', renderMode: RenderMode.Server },
];
```

### Step 3: Update Sitemap (if applicable)

For static pages, add to `sitemapController.js`:

```javascript
const staticPages = [
  // ... existing pages
  { loc: '/new-page', priority: '0.7', changefreq: 'weekly' },
];
```

### Step 4: Update robots.txt (if needed)

If the page should be crawled, ensure it's not in the Disallow list.

---

## Testing & Validation

### Local Testing

```bash
# Build and serve SSR locally
cd apps/web
npm run build
npm run serve:ssr:nxt1-web

# Test meta tags
curl -s http://localhost:4000/profile/test-user | grep -E '<title>|og:|twitter:'
```

### Online Tools

| Tool                      | URL                                 | Purpose                  |
| ------------------------- | ----------------------------------- | ------------------------ |
| Google Rich Results Test  | search.google.com/test/rich-results | Validate structured data |
| Facebook Sharing Debugger | developers.facebook.com/tools/debug | Test Open Graph tags     |
| Twitter Card Validator    | cards-dev.twitter.com/validator     | Test Twitter cards       |
| Google Search Console     | search.google.com/search-console    | Monitor indexing status  |

### Checklist for New Pages

- [ ] `SeoService` called in component with appropriate method
- [ ] Title includes page-specific content + "| NXT1 Sports"
- [ ] Description is unique and under 160 characters
- [ ] Canonical URL is set correctly
- [ ] Open Graph image is specified (or uses default)
- [ ] SSR render mode is configured
- [ ] Page is not blocked in robots.txt (unless intended)
- [ ] Page is in sitemap (if public)

### Verify Meta Tags in Production

```bash
# Check a profile page
curl -s "https://nxt1sports.com/profile/john-smith" | head -100

# Look for:
# - <title>John Smith | ... | NXT1 Sports</title>
# - <meta property="og:title" content="...">
# - <meta property="og:image" content="...">
# - <meta name="twitter:card" content="summary_large_image">
# - <script type="application/ld+json">...</script>
```

---

## Quick Reference

### Import Cheatsheet

```typescript
// Types and builders (pure TypeScript)
import {
  SeoConfig,
  ShareableProfile,
  buildProfileSeoConfig,
} from '@nxt1/core/seo';

// Angular service
import { SeoService } from '@core/services/seo.service';
```

### Common Patterns

```typescript
// Profile page
this.seo.updateForProfile({
  id,
  athleteName,
  position,
  classYear,
  school,
  sport,
  imageUrl,
});

// Team page
this.seo.updateForTeam({ id, teamName, sport, location, logoUrl });

// Video page
this.seo.updateForVideo({
  id,
  videoTitle,
  athleteName,
  duration,
  thumbnailUrl,
});

// Generic page
this.seo.updatePage({ title, description, keywords });

// Reset on navigation away
this.seo.resetToDefaults();
```

### JSON-LD Schema Types

| Content Type | Schema.org Type | Used For              |
| ------------ | --------------- | --------------------- |
| Profile      | Person          | Athlete profile pages |
| Team         | SportsTeam      | Team pages            |
| Video        | VideoObject     | Highlight/video pages |

---

## Related Documentation

- [SSR-FIREBASE-APP-HOSTING.md](./SSR-FIREBASE-APP-HOSTING.md) - Full SSR
  architecture guide
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall monorepo structure
