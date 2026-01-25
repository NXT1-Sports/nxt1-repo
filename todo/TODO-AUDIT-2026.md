# 📋 TODO Audit Report — NXT1 Monorepo

**Audit Date:** January 24, 2026  
**Total Unique TODOs Identified:** 45+  
**Focus Areas:** Authentication, Infrastructure, Security  
**Status:** Ready for Implementation

---

## 🔴 HIGH PRIORITY: Authentication & Infrastructure TODOs

These TODOs are **blocking release** or critical to core platform functionality:

### 1. Authentication Flow (BLOCKING)

| Location                                                                           | TODO                                       | Status         | Priority    |
| ---------------------------------------------------------------------------------- | ------------------------------------------ | -------------- | ----------- |
| `nxt1/src/app/v2/core/infrastructure/firebase/firebase-auth.service.ts` Line 252   | Implement Microsoft sign-in                | ❌ Not Started | 🔴 Critical |
| `nxt1/src/app/v2/core/infrastructure/firebase/firebase-auth.service.ts` Line 260   | Implement Apple sign-in                    | ❌ Not Started | 🔴 Critical |
| `nxt1-monorepo/apps/mobile/src/app/features/auth/pages/auth/auth.page.ts` Line 640 | Pass team code to Google sign-in flow      | ❌ Incomplete  | 🔴 Critical |
| `nxt1-monorepo/apps/mobile/src/app/features/auth/pages/auth/auth.page.ts` Line 658 | Pass team code to Apple sign-in flow       | ❌ Incomplete  | 🔴 Critical |
| `nxt1-monorepo/apps/mobile/src/app/features/auth/pages/auth/auth.page.ts` Line 676 | Pass team code to Microsoft sign-in flow   | ❌ Incomplete  | 🔴 Critical |
| `nxt1/src/app/v2/auth/features/role-selection/role-selection.component.ts` Line 7  | Implement role selection / team code entry | ❌ Not Started | 🔴 Critical |
| `nxt1/src/app/auth/containers/sign-in/sign-in.component.ts` Line 193               | Handle media role navigation               | ❌ Not Started | 🟡 Medium   |

**Implementation Notes:**

- Microsoft sign-in requires OAuthProvider setup in Firebase
- Apple sign-in requires OAuthProvider with `apple.com` providerId
- Team code needs to be passed as custom parameter through OAuth flows
- Role selection component exists but is a placeholder - full implementation
  needed

---

### 2. Backend Auth (BLOCKING - TECHNICAL DEBT)

| Location                                                   | TODO                                                            | Status            | Priority    |
| ---------------------------------------------------------- | --------------------------------------------------------------- | ----------------- | ----------- |
| `nxt1-backend/controllers/auth/authController.js` Line 708 | Remove legacy boolean flags once queries migrated to role field | ⚠️ Technical Debt | 🔴 Critical |

**Context:** The backend maintains both `role` field (modern) and legacy boolean
flags (`isRecruit`, `isCollegeCoach`, `isFan`, `isMedia`, `isService`,
`isParent`, `isScout`) for backwards compatibility.

**Migration Steps Required:**

1. ⬜ Audit all Firestore queries to identify which still use boolean flags
2. ⬜ Update queries to use `role` field instead
3. ⬜ Test thoroughly in staging
4. ⬜ Remove legacy flags from backend
5. ⬜ Update documentation

---

### 3. Firebase Storage Integration (BLOCKING)

| Location                                                                                       | TODO                                                         | Status         | Priority    |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------- | ----------- |
| `nxt1-monorepo/apps/mobile/src/app/features/auth/pages/onboarding/onboarding.page.ts` Line 747 | Upload to Firebase Storage when backend integration is ready | ❌ Not Started | 🔴 Critical |

**Implementation Required:**

- Photo upload from onboarding to Firebase Storage
- Generate thumbnail/optimized versions
- Store download URL in user profile
- Handle upload progress & errors

---

## 🟡 MEDIUM PRIORITY: Infrastructure & Observability TODOs

These TODOs affect error handling, monitoring, and developer experience:

### 4. Toast/Notification Service (CONSOLIDATE - 3 LOCATIONS)

**Note:** Multiple files reference the same missing toast service. These should
be consolidated into a single task:

| Location                                                                                             | TODO                             | Status         |
| ---------------------------------------------------------------------------------------------------- | -------------------------------- | -------------- |
| `nxt1-monorepo/apps/web/src/app/core/infrastructure/error-handling/global-error-handler.ts` Line 404 | Use toast service when available | ❌ Not Started |
| `nxt1-monorepo/apps/web/src/app/core/infrastructure/interceptors/error.interceptor.ts` Line 192      | Integrate with toast service     | ❌ Not Started |
| `nxt1-monorepo/apps/web/src/app/core/infrastructure/interceptors/error.interceptor.ts` Line 211      | Use toast service                | ❌ Not Started |

**Recommendation:**

1. Create `ToastService` in `packages/ui/src/services/toast.service.ts`
2. Implement with Ionic's ToastController for consistency
3. Wire up all three locations
4. Add toast variants: success, error, warning, info

---

### 5. Analytics Integration (CONSOLIDATE - 2 LOCATIONS)

| Location                                                                               | TODO                             | Status         |
| -------------------------------------------------------------------------------------- | -------------------------------- | -------------- |
| `nxt1-monorepo/apps/web/src/app/features/auth/services/auth-error.handler.ts` Line 501 | Integrate with analytics service | ❌ Not Started |
| `nxt1-monorepo/packages/ui/src/auth-services/auth-error.handler.ts` Line 572           | Integrate with analytics service | ❌ Not Started |

**Implementation Notes:**

- Analytics module is **fully built** at `packages/core/src/analytics/`
- Just needs wiring to existing error handlers
- Use `createFirebaseAnalyticsAdapterSync` for web
- Use `createMobileAnalyticsAdapterSync` for mobile
- Track error codes, recovery attempts, and user impact

---

### 6. Error Monitoring Integration (CONSOLIDATE - 3 LOCATIONS)

| Location                                                                                       | TODO                                       | Status         | Priority |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------- | -------- |
| `nxt1-monorepo/packages/ui/src/infrastructure/error-handling/global-error-handler.ts` Line 379 | Integrate with Sentry, Datadog, or similar | 🟡 In Progress | 🟡 High  |
| `nxt1-monorepo/packages/ui/src/infrastructure/error-handling/global-error-handler.ts` Line 385 | Integrate with error monitoring service    | 🟡 In Progress | 🟡 High  |
| `nxt1-monorepo/apps/web/src/environments/environment.prod.ts` Line 19                          | Add Sentry DSN when configured             | 🟡 In Progress | 🟡 High  |

**Current Status:** Firebase Crashlytics integration in progress

**Next Steps:**

1. 🟡 Complete Firebase Crashlytics setup (Web & Mobile)
2. ⬜ Add `crashlytics()` calls in GlobalErrorHandler
3. ⬜ Set custom keys for error context
4. ⬜ Test crash reporting in staging
5. ⬜ Configure alerts in Firebase Console

---

### 7. Caching Infrastructure (BACKEND)

| Location                                                     | TODO                                            | Status         | Priority |
| ------------------------------------------------------------ | ----------------------------------------------- | -------------- | -------- |
| `nxt1-backend/controllers/team/teamsApiController.js` Line 9 | Migrate to Redis for multi-instance deployments | ⬜ Not Started | 🟢 Low   |

**Notes:**

- Currently uses in-memory cache
- Only critical if scaling to multiple backend instances
- Consider Cloud Memorystore for Firebase when needed

---

## 🟢 LOWER PRIORITY: Feature & Cleanup TODOs

### 8. Feature Implementation (Non-blocking)

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

The `/todo/` directory contains well-maintained task tracking documents:

| File                         | Status         | Blocking Release? | Link                                                     |
| ---------------------------- | -------------- | ----------------- | -------------------------------------------------------- |
| **AUTH-FLOW.md**             | 🟡 In Progress | **Yes**           | Complete authentication system                           |
| **NATIVE-AUTH-TESTING.md**   | ⬜ Blocked     | **Yes (Mobile)**  | Need to install `@codetrix-studio/capacitor-google-auth` |
| **ANALYTICS-INTEGRATION.md** | 🟡 Partial     | **Yes**           | Auth tracking done, other services pending               |
| **SECURITY-HARDENING.md**    | ⬜ Not Started | No                | Pre-production checklist                                 |
| **CI-CD-SETUP.md**           | ⬜ Not Started | No                | GitHub Actions workflows                                 |
| **SEO-CHECKLIST.md**         | 🟡 Partial     | No                | Auth pages done, core pages needed                       |
| **E2E-TESTING.md**           | ⬜ Not Started | No                | Playwright setup                                         |

---

## 🚨 Conflicts & Issues Identified

### Issue 1: Duplicate Auth Error Handlers

**Files:**

- `apps/web/src/app/features/auth/services/auth-error.handler.ts`
- `packages/ui/src/auth-services/auth-error.handler.ts`

**Problem:** Both files have identical TODO for analytics integration. This
suggests the web app has its own copy instead of importing from `@nxt1/ui`.

**Resolution Required:**

1. ⬜ Audit if web is using local copy or shared package
2. ⬜ If local copy exists, remove and import from `@nxt1/ui`
3. ⬜ Consolidate analytics integration into shared handler

---

### Issue 2: Missing Native Auth Package (CRITICAL BLOCKER)

**Problem:** `@codetrix-studio/capacitor-google-auth` is not installed

**Blocked Files:**

- `apps/mobile/src/main.ts` (commented out initialization)
- `apps/mobile/src/app/features/auth/services/native-auth.service.ts` (commented
  out imports)

**Resolution Steps:**

```bash
cd apps/mobile
npm install @codetrix-studio/capacitor-google-auth
npx cap sync
```

Then uncomment the TODOs in the files above.

---

### Issue 3: Legacy Role System Active (MIGRATION PLANNING)

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

**Estimated Effort:** 2-3 sprints

---

## ✅ Recommended Action Plan

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
5. ⬜ Create `ToastService` in `@nxt1/ui`
   - Implement with IonicToastController
   - Wire up error handlers (3 locations)
6. ⬜ Complete Firebase Crashlytics setup
   - Wire into GlobalErrorHandler
   - Test on web and mobile

---

### 🟡 Sprint 2: High Priority Infrastructure

**Week 3-4:** 7. ⬜ Implement role selection component

- Build UI matching design system
- Handle team code entry
- Wire to onboarding flow

8. ⬜ Integrate analytics into auth error tracking
   - Wire auth error handlers to analytics
   - Track error codes and recovery attempts
9. ⬜ Implement Firebase Storage upload in onboarding
   - Photo upload flow
   - Thumbnail generation
   - Progress indicators
10. ⬜ Complete mobile auth analytics parity
    - Page view tracking
    - User action tracking
    - Error tracking

---

### 🟢 Sprint 3-4: Feature Completion

**Week 5-8:** 11. ⬜ Media role navigation handling 12. ⬜ Post media cleanup on
deletion 13. ⬜ Email notifications for posts 14. ⬜ Complete analytics
integration (all services) 15. ⬜ SEO for core public pages 16. ⬜ CI/CD
pipeline setup

---

### 📋 Backlog: Technical Debt & Cleanup

**Future Sprints:** 17. ⬜ Plan legacy role flag migration 18. ⬜ Audit and
migrate all queries to use `role` field 19. ⬜ Execute role field migration 20.
⬜ Remove legacy boolean flags 21. ⬜ Implement college library feature 22. ⬜
Video social features (like, share) 23. ⬜ Code cleanup tasks (9 items) 24. ⬜
E2E testing setup 25. ⬜ Security hardening checklist

---

## 📊 Summary Statistics

| Category                       | Count | Status                        |
| ------------------------------ | ----- | ----------------------------- |
| **Auth-related TODOs**         | 12    | 🔴 Critical                   |
| **Infrastructure TODOs**       | 8     | 🟡 High Priority              |
| **Feature TODOs**              | 6     | 🟢 Medium/Low                 |
| **Cleanup TODOs**              | 10    | 🟢 Low                        |
| **Third-party/Non-actionable** | 4     | N/A                           |
| **Documentation TODO files**   | 7     | Tracked separately            |
| **🚨 Release Blockers**        | **6** | **Immediate action required** |

---

## 🎯 Success Criteria

### Sprint 1 Complete When:

- ✅ All OAuth providers (Google, Apple, Microsoft) working on mobile
- ✅ Team code flows through OAuth correctly
- ✅ Toast notifications working in error handlers
- ✅ Firebase Crashlytics receiving errors

### Sprint 2 Complete When:

- ✅ Users can select role and enter team code
- ✅ Auth errors tracked in Firebase Analytics
- ✅ Profile photos upload from onboarding
- ✅ Analytics parity between web and mobile

### Ready for Production When:

- ✅ All release blockers resolved
- ✅ Native auth tested on real devices
- ✅ Error monitoring confirmed working
- ✅ SEO implemented on public pages
- ✅ Security hardening checklist completed

---

## 📞 Implementation Support

**Questions or Issues?**

- Reference this document's line numbers for specific TODOs
- Check corresponding TODO doc files for detailed context
- All auth-related TODOs have implementation notes in AUTH-FLOW.md
- Security considerations documented in SECURITY-HARDENING.md

**Last Updated:** January 24, 2026  
**Next Audit:** After Sprint 1 completion
