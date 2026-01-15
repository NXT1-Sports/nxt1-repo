# SEO Implementation Checklist

## Status: Not Started

> From: `docs/SEO-IMPLEMENTATION.md`

---

## Per-Page SEO Checklist

For each new public page, verify:

- [ ] `SeoService` called in component with appropriate method
- [ ] Title includes page-specific content + "| NXT1 Sports"
- [ ] Description is unique and under 160 characters
- [ ] Canonical URL is set correctly
- [ ] Open Graph image is specified (or uses default)
- [ ] SSR render mode is configured in `app.routes.server.ts`
- [ ] Page is not blocked in `robots.txt` (unless intended)
- [ ] Page is in sitemap (if public)

---

## Pages Requiring SEO

### High Priority (Public, Indexable)

- [ ] Homepage / Landing page
- [ ] Public profile pages (`/profile/:username`)
- [ ] Team pages (`/team/:slug`)
- [ ] Explore / Discovery page
- [ ] About page
- [ ] Terms of Service
- [ ] Privacy Policy

### Medium Priority

- [ ] Blog posts (if applicable)
- [ ] Help / FAQ pages
- [ ] Sport-specific landing pages

### No SEO Required (Auth-Protected)

- Home feed
- Settings
- Messages
- Dashboard

---

## Technical Setup

- [ ] `SeoService` implemented in `apps/web/src/app/core/services/`
- [ ] Default meta tags in `index.html`
- [ ] Open Graph default image created (1200x630)
- [ ] Twitter Card configured
- [ ] Structured data (JSON-LD) for profiles
- [ ] Dynamic sitemap generation

---

## SSR Render Mode Configuration

```typescript
// app.routes.server.ts
export const serverRoutes: ServerRoute[] = [
  // SEO pages - Server render
  { path: 'profile/:id', renderMode: RenderMode.Server },
  { path: 'team/:name', renderMode: RenderMode.Server },
  { path: 'explore', renderMode: RenderMode.Server },

  // Auth pages - Client render
  { path: 'home', renderMode: RenderMode.Client },
  { path: 'settings/**', renderMode: RenderMode.Client },
  { path: 'auth/**', renderMode: RenderMode.Client },
];
```

---

## Validation Tools

- [ ] Test with Google Rich Results Test
- [ ] Test with Facebook Sharing Debugger
- [ ] Test with Twitter Card Validator
- [ ] Verify in Google Search Console
- [ ] Check Lighthouse SEO score (target: 100)
