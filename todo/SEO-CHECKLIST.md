# SEO — Remaining Tasks

> Last updated: March 15, 2026

---

## 🚨 BLOCKING (Fix First)

- [ ] **Create OG images** (1200x630px):
  - [ ] `/assets/images/og-image.jpg`
  - [ ] `/assets/images/twitter-card.jpg`
- [ ] **Create public assets folder**: `apps/web/public/assets/images/`

## Pages Still Needing SEO

- [ ] **Team pages** (`/team/:slug`) — create component, call
      `seo.updateForTeam()`
- [x] **Explore / Discovery page** — `seo.updatePage()` wired in
      `explore.component.ts` ✅
- [ ] **About page**
- [ ] **Terms of Service**
- [ ] **Privacy Policy**
- [ ] Blog posts (if applicable)
- [ ] Help / FAQ pages
- [ ] Sport-specific landing pages

## Technical

- [ ] JSON-LD structured data for profile/team pages
- [ ] Dynamic sitemap endpoint in backend (`/sitemap.xml`)

## Validation

- [ ] Test with Google Rich Results Test
- [ ] Test with Facebook Sharing Debugger
- [ ] Test with Twitter Card Validator
- [ ] Verify in Google Search Console
- [ ] Check Lighthouse SEO score (target: 100)
