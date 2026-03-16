# TODO Audit — Remaining Items

> Last updated: March 15, 2026

---

## 🔴 CRITICAL (Release Blockers)

### 1. Onboarding Persistence

- [ ] Photo upload from onboarding to Firebase Storage
- [ ] Generate thumbnail/optimized versions
- [ ] Store download URL in user profile
- [ ] Progress persistence (resume incomplete onboarding)

**Location:**
`apps/mobile/src/app/features/auth/pages/onboarding/onboarding.page.ts` Line 747

---

### 2. Wire Toast Service to GlobalErrorHandler

- [ ] Wire `NxtToastService` into `GlobalErrorHandler`

**Location:**
`apps/web/src/app/core/infrastructure/error-handling/global-error-handler.ts`
Line 404

---

### 3. OG Images for Social Sharing

- [ ] Create default OG images (1200x630px)
- [ ] Create `apps/web/public/assets/images/` folder

### 4. Native Auth Device Testing

- [ ] Test Google OAuth on real devices
- [ ] Test Apple Sign-In on real devices
- [ ] Test Microsoft Sign-In on real devices

---

## 🟡 MEDIUM Priority

### 5. Backend Auth Technical Debt

- [ ] Audit all Firestore queries using legacy boolean flags
- [ ] Update queries to use `role` field
- [ ] Test in staging
- [ ] Remove legacy flags from backend
- [ ] Update documentation

**Location:** `nxt1-backend/controllers/auth/authController.js` Line 708

---

## 🟢 LOW Priority

### 6. Analytics & Tracking

- [ ] Analytics integration in auth error handlers
- [ ] Page view tracking (web & mobile)
- [ ] GDPR consent UI

### 7. Mobile Feature TODOs

| Location                                                        | TODO                                                            |
| --------------------------------------------------------------- | --------------------------------------------------------------- |
| `apps/mobile/.../team/team.page.ts` L90                         | Connect to TeamService when backend ready                       |
| `apps/mobile/.../create-post/create-post.component.ts` L136-213 | Confirmation sheet, API create, media/tag/location/poll pickers |
| `apps/mobile/.../auth/auth.page.ts` L643-679                    | Pass team code through Google/Apple/Microsoft OAuth             |
| `apps/mobile/.../agent-x/services/agent-x.service.ts` L219      | Replace stub with actual API call                               |
| `apps/mobile/.../settings/settings.component.ts` L160, L224     | Account deletion with password confirm                          |
| `apps/mobile/.../shell/mobile-shell.component.ts` L369-713      | Pull verified/class year, help modal, referral code             |
| `apps/mobile/.../explore/explore.component.ts` L140             | Open filter modal/bottom sheet                                  |
| `apps/mobile/.../onboarding-congratulations/...` L139           | Track with analytics                                            |
| `apps/mobile/.../home/home.component.ts` L259-292               | XP breakdown, post detail, comment modal                        |

### 8. Legacy Web App TODOs

| Location                                       | TODO                                   |
| ---------------------------------------------- | -------------------------------------- |
| `nxt1/.../firebase-auth.service.ts` L252, L260 | Microsoft/Apple sign-in backend        |
| `nxt1/.../post.service.ts` L1435               | Delete associated media on post delete |
| `nxt1-backend/.../postController.js` L434      | Send email notification                |

### 9. Code Cleanup

| Location                                               | TODO                                     |
| ------------------------------------------------------ | ---------------------------------------- |
| `nxt1/src/app/app.config.ts` L120                      | Remove after services migrated           |
| `packages/ui/.../picker-shell.component.ts` L334       | Remove ModalController if unused         |
| `packages/ui/.../onboarding-sport-entry/...` L80, L980 | Use constants for validation & icons     |
| `nxt1/.../prospect.service.ts` L215                    | DRY violation with template.component.ts |

### 10. Backend

- [ ] Migrate in-memory cache to Redis
      (`nxt1-backend/.../teamsApiController.js`)
- [ ] Define description field (`nxt1-backend/.../ssrTestController.js`)

### 11. Feature Stubs

- [ ] College library browsing/search
- [ ] Video like/share functionality
- [ ] Discover teams route

---

## Release Criteria

### Beta

- [ ] OAuth providers verified on devices
- [ ] Onboarding persistence tested
- [ ] OG images created
- [ ] Toast wired to GlobalErrorHandler

### Production

- [ ] All beta items complete
- [ ] Security hardening checklist completed
- [ ] Performance audit passed
- [ ] SEO on public pages
