# SEO Implementation Checklist

## Status: 🟡 In Progress - Auth Pages Done, OG Images Needed

> Last updated: February 1, 2026  
> From: `docs/SEO-IMPLEMENTATION.md`

---

## 🚨 BLOCKING ISSUES (Fix First)

- [ ] **Create OG images** - `index.html` references images that don't exist:
  - [ ] `/assets/images/og-image.jpg` (1200x630px)
  - [ ] `/assets/images/twitter-card.jpg` (1200x630px)
- [ ] **Create public assets folder** - `apps/web/public/assets/images/` doesn't
      exist

---

## Per-Page SEO Checklist

For each new public page, verify:

- [ ] `SeoService.updatePage()` called in component
- [ ] Title includes page-specific content + "| NXT1 Sports"
- [ ] Description is unique and under 160 characters
- [ ] Canonical URL is set correctly
- [ ] Open Graph image is specified (or uses default)
- [ ] Page is in sitemap (if public)

---

## Pages Requiring SEO

### ✅ Completed

- [x] **Auth page** (`/auth`) - Sign in / Sign up
  - [x] `seo.updatePage()` called in component
  - [x] Title: "Sign In or Sign Up | NXT1 Sports"
  - [x] Description with keywords
- [x] **Forgot Password** (`/auth/forgot-password`)
  - [x] `seo.updatePage()` called in component
  - [x] Title: "Reset Password | NXT1 Sports"
  - [x] Description with keywords
- [x] **Homepage** - Has default meta tags in `index.html`

### 🔲 High Priority (Not Created Yet)

- [x] **Public profile pages** (`/profile/:username`)
  - [x] Create page component - ✅ ProfileComponent exists
  - [x] Call `seo.updateForProfile()` in component - ✅ Implemented with full
        SEO data
  - [x] Add route to `app.routes.ts` - ✅ Public route at `/profile/:unicode`
  - [x] Configure SSR in `app.routes.server.ts` - ✅ RenderMode.Server
  - [x] Handle dynamic data loading from ProfileService
  - [x] Error handling with fallback SEO for 404 pages
- [ ] **Team pages** (`/team/:slug`)
  - [ ] Create page component
  - [ ] Call `seo.updateForTeam()` in component
  - [ ] Add route to `app.routes.ts`
- [ ] **Explore / Discovery page**
  - [ ] Create page component
  - [ ] Call `seo.updatePage()` in component
  - [ ] Add route to `app.routes.ts`
- [ ] About page
- [ ] Terms of Service
- [ ] Privacy Policy

### 🔲 Medium Priority

- [ ] Blog posts (if applicable)
- [ ] Help / FAQ pages
- [ ] Sport-specific landing pages

---

## Technical Setup

- [x] **`SeoService` implemented** - ✅
      `apps/web/src/app/core/services/seo.service.ts`
  - Has `updatePage()`, `updateForProfile()`, `updateForTeam()`,
    `updateForVideo()`
  - Supports JSON-LD structured data
  - SSR-safe with platform checks
- [x] **Default meta tags in `index.html`** - ✅ Complete with OG tags and
      Twitter Cards
- [ ] **Open Graph default image created (1200x630)** - ⚠️ Referenced but file
      doesn't exist
- [x] **Twitter Card configured** - ✅ Meta tags present in `index.html`
- [x] **robots.txt configured** - ✅ All pages allowed
- [x] **SSR enabled** - ✅ All routes server-rendered
- [ ] **Structured data (JSON-LD) for profiles** - SeoService supports it, needs
      page implementation
- [ ] **Dynamic sitemap generation** - ❌ Backend endpoint not implemented
  - `robots.txt` references `https://nxt1sports.com/sitemap.xml`
  - Need to create backend route `/sitemap.xml`

---

## Priority Implementation Order

### Phase 1: Immediate (Blocking Social Sharing)

1. [ ] Create default OG images (1200x630px) in design tool
2. [ ] Create folder structure: `apps/web/public/assets/images/`
3. [ ] Add images: `og-image.jpg` and `twitter-card.jpg`

### Phase 2: Core SEO Pages (High Priority)

4. [ ] Implement profile pages with `seo.updateForProfile()` calls
5. [ ] Implement explore page with `seo.updatePage()` calls
6. [ ] Implement team pages with `seo.updateForTeam()` calls

### Phase 3: Additional Pages (Medium Priority)

7. [ ] Create static pages: About, Terms, Privacy
8. [ ] Build dynamic sitemap endpoint in backend

### Phase 4: Enhancement (Nice to Have)

9. [ ] Add JSON-LD structured data to profile/team pages
10. [ ] Set up Google Search Console verification
11. [ ] Test with social media debugger tools

---

## Validation Tools

- [ ] Test with Google Rich Results Test
- [ ] Test with Facebook Sharing Debugger
- [ ] Test with Twitter Card Validator
- [ ] Verify in Google Search Console
- [ ] Check Lighthouse SEO score (target: 100)
