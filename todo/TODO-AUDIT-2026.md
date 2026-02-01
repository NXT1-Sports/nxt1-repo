# 📋 TODO Audit Report — NXT1 Monorepo

**Audit Date:** February 1, 2026  
**Previous Audit:** January 24, 2026  
**Focus Areas:** Authentication, Infrastructure, Security  
**Status:** Significant Progress Made ✅

---

## ✅ COMPLETED SINCE LAST AUDIT

### Infrastructure Completions

| Item                 | Status      | Implementation                                             |
| -------------------- | ----------- | ---------------------------------------------------------- |
| Toast Service        | ✅ Complete | `packages/ui/src/services/toast/toast.service.ts`          |
| Auth Guards          | ✅ Complete | `packages/core/src/auth/auth-guards.ts`                    |
| Forgot Password      | ✅ Complete | Web & Mobile implementations                               |
| Firebase Crashlytics | ✅ Complete | `apps/mobile/src/app/core/services/crashlytics.service.ts` |
| CI/CD Workflows      | ✅ Complete | 7 workflows in `.github/workflows/`                        |
| E2E Testing          | ✅ Complete | 86 tests passing with Playwright                           |
| Native Auth Packages | ✅ Complete | Using `@capacitor-firebase/authentication`                 |

---

## 🟡 IN PROGRESS: Remaining Critical Items

### 1. Onboarding Persistence (BLOCKING)

| Location                                                                                       | TODO                                                         | Status         | Priority    |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------- | ----------- |
| `nxt1-monorepo/apps/mobile/src/app/features/auth/pages/onboarding/onboarding.page.ts` Line 747 | Upload to Firebase Storage when backend integration is ready | 🟡 In Progress | 🔴 Critical |

**Implementation Required:**

- Photo upload from onboarding to Firebase Storage
- Generate thumbnail/optimized versions
- Store download URL in user profile
- Progress persistence (resume incomplete onboarding)

---

### 2. Wire Toast Service to Error Handlers

| Location                                                                                             | TODO                             | Status           |
| ---------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------- |
| `nxt1-monorepo/apps/web/src/app/core/infrastructure/error-handling/global-error-handler.ts` Line 404 | Use toast service when available | 🟡 Ready to wire |

**Note:** `NxtToastService` is complete and used across 20+ services. Just needs
to be wired into GlobalErrorHandler.

---

### 3. Backend Auth Technical Debt

| Location                                                   | TODO                                                            | Status            | Priority  |
| ---------------------------------------------------------- | --------------------------------------------------------------- | ----------------- | --------- |
| `nxt1-backend/controllers/auth/authController.js` Line 708 | Remove legacy boolean flags once queries migrated to role field | ⚠️ Technical Debt | 🟡 Medium |

**Migration Steps Required:**

1. ⬜ Audit all Firestore queries to identify which still use boolean flags
2. ⬜ Update queries to use `role` field instead
3. ⬜ Test thoroughly in staging
4. ⬜ Remove legacy flags from backend
5. ⬜ Update documentation

---

## 🟢 LOWER PRIORITY: Feature & Cleanup TODOs

### 4. Analytics Integration

| Location                                                                               | TODO                             | Status          |
| -------------------------------------------------------------------------------------- | -------------------------------- | --------------- |
| `nxt1-monorepo/apps/web/src/app/features/auth/services/auth-error.handler.ts` Line 501 | Integrate with analytics service | 🟢 Low Priority |
| `nxt1-monorepo/packages/ui/src/auth-services/auth-error.handler.ts` Line 572           | Integrate with analytics service | 🟢 Low Priority |

**Note:** Analytics module is **fully built** at `packages/core/src/analytics/`.
Auth tracking already complete. Additional service tracking is optional.

---

### 5. Caching Infrastructure (BACKEND)

| Location                                                     | TODO                                            | Status         | Priority |
| ------------------------------------------------------------ | ----------------------------------------------- | -------------- | -------- |
| `nxt1-backend/controllers/team/teamsApiController.js` Line 9 | Migrate to Redis for multi-instance deployments | ⬜ Not Started | 🟢 Low   |

**Notes:**

- Currently uses in-memory cache
- Only critical if scaling to multiple backend instances
- Consider Cloud Memorystore for Firebase when needed

---

### 6. Feature Implementation (Non-blocking)

| Location                                                                                  | TODO                                                | Priority  | Notes                        |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------- | --------- | ---------------------------- |
| `nxt1/src/app/v2/recruiting/features/college-library/college-library.component.ts` Line 7 | Implement college library browsing/search           | 🟢 Low    | Placeholder component exists |
| `nxt1/src/app/search-videos/search-videos.component.ts` Line 1371                         | Implement like functionality                        | 🟢 Low    | Video engagement feature     |
| `nxt1/src/app/search-videos/search-videos.component.ts` Line 1375                         | Implement share functionality                       | 🟢 Low    | Social sharing               |
| `nxt1/src/app/offers/containers/offers-log/log.component.ts` Line 447                     | Add discover teams route                            | 🟢 Low    | Team discovery feature       |
| `nxt1/src/app/shared/post.service.ts` Line 1435                                           | Delete associated media from storage on post delete | 🟡 Medium | Prevent orphaned files       |
| `nxt1-backend/controllers/post/postController.js` Line 434                                | Send email notification                             | 🟡 Medium | User engagement              |

---

### 9. Code Cleanup & Technical Debt

| Location                                                                                                       | TODO                                                       | Action               | Priority |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------- | -------- |
| `nxt1/src/app/app.config.ts` Line 120                                                                          | Remove after all services migrated to infrastructure layer | 🧹 Cleanup           | 🟢 Low   |
| `nxt1/src/app/v2/shared/pipes/index.ts` Line 7                                                                 | Remove this notice once pipes are actively used            | 🧹 Documentation     | 🟢 Low   |
| `nxt1-monorepo/packages/ui/src/shared/picker/picker-shell.component.ts` Line 334                               | Remove ModalController if not needed                       | 🧹 Dead code         | 🟢 Low   |
| `nxt1-monorepo/packages/ui/src/onboarding/onboarding-sport-entry/onboarding-sport-entry.component.ts` Line 80  | Use MIN_TEAM_NAME_LENGTH for validation                    | 🧹 Enable validation | 🟢 Low   |
| `nxt1-monorepo/packages/ui/src/onboarding/onboarding-sport-entry/onboarding-sport-entry.component.ts` Line 980 | Get icon from DEFAULT_SPORTS constant                      | 🧹 Use constants     | 🟢 Low   |
| `nxt1/src/app/shared/prospect.service.ts` Line 215                                                             | Duplicated code in template.component.ts                   | 🧹 DRY violation     | 🟢 Low   |
| `nxt1/src/app/prospect-profile/components/template/template.component.ts` Line 2426                            | Line spacing should correspond to text element             | 🧹 Minor fix         | 🟢 Low   |

---

### 10. Test Placeholders (Legacy V2 Component)

| Location                                                                                    | TODO                       | Notes                                                 |
| ------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------- |
| `nxt1/src/app/v2/auth/features/role-selection/role-selection.component.spec.ts` Lines 82-94 | Multiple test placeholders | Tests marked as TODO - implement when component built |

**Action:** These will be resolved when role-selection component is implemented
(see #1 above).

---

### 11. Third-Party Assets (Non-actionable)

| Location                                            | TODO                             | Notes                                     |
| --------------------------------------------------- | -------------------------------- | ----------------------------------------- |
| `nxt1/src/assets/ffmpeg/worker.js` Lines 61, 70, 85 | Check if deletion/creation works | Third-party ffmpeg library - not our code |

**Action:** None - third-party dependency

---

## 📑 TODO Documentation Files Status

| File                         | Status         | Blocking Release? | Notes                                                            |
| ---------------------------- | -------------- | ----------------- | ---------------------------------------------------------------- |
| **AUTH-FLOW.md**             | ✅ 90% Done    | Yes (testing)     | Guards, forgot password complete. Onboarding persistence pending |
| **NATIVE-AUTH-TESTING.md**   | 🟡 Ready       | Yes (device test) | All packages installed, needs device verification                |
| **ANALYTICS-INTEGRATION.md** | 🟡 Partial     | No                | Auth tracking done, other services optional                      |
| **SECURITY-HARDENING.md**    | ⬜ Not Started | Yes (Production)  | Pre-production checklist                                         |
| **CI-CD-SETUP.md**           | ✅ Complete    | No                | All 7 workflows created                                          |
| **SEO-CHECKLIST.md**         | 🟡 In Progress | No                | Auth pages done, OG images needed                                |
| **E2E-TESTING.md**           | ✅ Complete    | No                | 86 tests passing with Playwright                                 |

---

## ✅ Resolved Issues (Since January 24, 2026)

### ~~Issue 1: Missing Toast Service~~ ✅ RESOLVED

**Resolution:** `NxtToastService` implemented at
`packages/ui/src/services/toast/toast.service.ts`

- 495 lines, enterprise-grade implementation
- Used across 20+ services in web and mobile apps
- Supports success, error, warning, info variants
- Swipe-to-dismiss with haptic feedback

### ~~Issue 2: Missing Native Auth Package~~ ✅ RESOLVED

**Resolution:** Using different (better) packages:

- `@capacitor-firebase/authentication` for Google Sign-In
- `@capacitor-community/apple-sign-in` for Apple Sign-In
- `@recognizebv/capacitor-plugin-msauth` for Microsoft Sign-In
- Implementation:
  `apps/mobile/src/app/features/auth/services/native-auth.service.ts`

### ~~Issue 3: Missing Crashlytics~~ ✅ RESOLVED

**Resolution:** Full `CrashlyticsService` implemented:

- `apps/mobile/src/app/core/services/crashlytics.service.ts` (454 lines)
- `@capacitor-firebase/crashlytics` package installed
- Adapter pattern in `packages/core/src/crashlytics/`

---

## ⚠️ Remaining Technical Debt

### Legacy Role System Active

**Problem:** Backend maintains both modern `role` field and legacy boolean flags
for backwards compatibility.

**Risk:**

- Increased complexity in queries
- Potential for inconsistent data
- Technical debt accumulation

**Migration Required:**

1. ⬜ Audit all Firestore queries (web app, mobile app, backend, functions)
2. ⬜ Identify which queries still use boolean flags
3. ⬜ Create migration plan with rollback strategy
4. ⬜ Update all queries to use `role` field
5. ⬜ Run migration script to clean up existing data
6. ⬜ Remove legacy flags from backend
7. ⬜ Update TypeScript interfaces

**Estimated Effort:** 2-3 sprints (not blocking initial release)

---

## ✅ Updated Action Plan

### 🔴 Sprint 1: Immediate (Release Blockers)

**Week 1-2:**

1. ⬜ Install `@codetrix-studio/capacitor-google-auth` package
2. ⬜ Implement Microsoft sign-in in `FirebaseAuthService`
   - Add OAuthProvider for Microsoft
   - Wire up to mobile auth flow
3. ⬜ Implement Apple sign-in in `FirebaseAuthService`
   - Add OAuthProvider for Apple
   - Wire up to mobile auth flow
4. ⬜ Pass team code through all OAuth flows
   - Update Google, Apple, Microsoft handlers
   - Test team code pre-fill after OAuth

### 🟡 Current Sprint: Final Release Items

**Remaining Tasks:**

1. ⬜ Wire `NxtToastService` into GlobalErrorHandler (simple fix - service
   exists)
2. ⬜ Test onboarding persistence (resume incomplete flows)
3. ⬜ Verify Firebase Storage upload in onboarding
4. ⬜ Native auth device testing (Google, Apple, Microsoft)
5. ⬜ Create OG images for social sharing (1200x630px)

---

### 🟢 Post-Launch: Enhancement & Technical Debt

**Lower Priority:**

1. ⬜ Page view tracking (analytics)
2. ⬜ GDPR consent UI
3. ⬜ Legacy role flag migration planning
4. ⬜ Video social features (like, share)
5. ⬜ College library feature
6. ⬜ Security hardening checklist

---

## 📊 Summary Statistics (Updated February 1, 2026)

| Category               | Count | Status              |
| ---------------------- | ----- | ------------------- |
| **Completed Items**    | 15+   | ✅ Done             |
| **In Progress**        | 5     | 🟡 Active           |
| **Remaining Critical** | 5     | 🔴 Release blockers |
| **Lower Priority**     | 10+   | 🟢 Post-launch      |
| **Technical Debt**     | 3     | ⚠️ Plan needed      |

### ✅ Major Completions Since Last Audit:

- Toast Service (495 lines, enterprise-grade)
- Auth Guards (4 guards with tests)
- Forgot Password (web & mobile)
- Crashlytics Service (454 lines)
- CI/CD Workflows (7 complete workflows)
- E2E Testing (86 tests passing)
- Native Auth Packages (all installed)

---

## 🎯 Updated Success Criteria

### Ready for Beta Release When:

- ✅ All OAuth providers (Google, Apple, Microsoft) — READY
- ✅ Toast notifications available — COMPLETE
- ✅ Firebase Crashlytics configured — COMPLETE
- ✅ E2E tests passing — COMPLETE (86 tests)
- ✅ CI/CD pipeline operational — COMPLETE
- ⬜ Onboarding persistence tested
- ⬜ Native auth verified on devices
- ⬜ OG images created

### Ready for Production When:

- ⬜ All beta items complete
- ⬜ Security hardening checklist completed
- ⬜ Performance audit passed
- ⬜ SEO implemented on public pages

---

## 📞 Implementation Support

**Questions or Issues?**

- Reference this document's line numbers for specific TODOs
- Check corresponding TODO doc files for detailed context
- All auth-related TODOs have implementation notes in AUTH-FLOW.md
- Security considerations documented in SECURITY-HARDENING.md

**Last Updated:** February 1, 2026  
**Previous Audit:** January 24, 2026  
**Next Audit:** After beta release
