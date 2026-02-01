# Auth Flow Implementation

## Status: ✅ Nearly Complete (90%)

> Last updated: February 1, 2026

### Completed Tasks ✅

- [x] **Email/Password Authentication**
  - ✅ Wire up email/password form submission (web & mobile)
  - ✅ Implement password strength indicator (8 char min, uppercase, lowercase,
    number)
  - ✅ Handle loading states and errors with proper error codes
  - ✅ Added analytics tracking for all auth events (sign in, sign up, sign out,
    errors)
  - ✅ Uses shared `AUTH_ROUTES`, `AUTH_REDIRECTS`, `AUTH_METHODS` constants
  - ✅ Remove name fields from signup (collected during onboarding)

- [x] **Analytics Integration**
  - ✅ Mobile auth analytics (was completely missing)
  - ✅ Error tracking with `getAuthErrorCode()`
  - ✅ Success/failure tracking for password reset
  - ✅ Consistent tracking between web & mobile

- [x] **Route Constants**
  - ✅ Centralized route paths in `@nxt1/core/constants`
  - ✅ No hardcoded routes in auth services
  - ✅ Simplified redirects to `/home` or `/auth/onboarding`

- [x] **Forgot Password** ✅ COMPLETE
  - ✅ Build password reset request form
  - ✅ Send reset email via Firebase
  - ✅ Add success/error feedback UI
  - ✅ Handle rate limiting gracefully
  - Implementation: `apps/web/src/app/features/auth/pages/forgot-password/`
  - Implementation: `apps/mobile/src/app/features/auth/pages/forgot-password/`

- [x] **Auth Guards** ✅ COMPLETE
  - ✅ `requireAuth` - require authenticated user
  - ✅ `requireGuest` - redirect authenticated users away from auth pages
  - ✅ `requireOnboarding` - require completed onboarding
  - ✅ `requireRole` - restrict by user role
  - ✅ SSR-safe guard implementations
  - Implementation: `packages/core/src/auth/auth-guards.ts` (with tests)

- [x] **Signup Page** ✅ COMPLETE
  - ✅ Add Google/Apple OAuth signup options
  - ✅ Handle team code pre-fill from URL params
  - ✅ Create user in backend after Firebase signup

- [x] **Onboarding Wizard** ✅ UI COMPLETE
  - ✅ Role selection step (athlete, coach, parent, etc.)
  - ✅ Profile info step (name, photo)
  - ✅ Sport/position selection
  - ✅ School/organization details (with team logo & colors picker)
  - ✅ Contact preferences
  - ✅ Step order corrected: Sport → Team (matches User model hierarchy)
  - ✅ TeamFormData: Added teamLogo, teamColors, secondTeamLogo,
    secondTeamColors
  - ✅ SportFormData: Migrated to selectedSports[] array
  - ✅ NxtTeamLogoPickerComponent created
  - ✅ NxtColorPickerComponent created (preset colors + custom picker)

### Remaining Tasks

- [ ] **Onboarding Persistence Testing**
  - [ ] Progress persistence (resume incomplete onboarding)
  - [ ] Verify all fields save correctly to backend

- [ ] **Integrate Biometric Authentication (Mobile)**
  - Add Face ID / Touch ID support for mobile apps
  - Use `capacitor-native-biometric` plugin (already installed)
  - Store biometric preference in secure storage
  - Fallback to password if biometric fails
  - Enable biometric unlock after initial login
  - Add settings toggle to enable/disable biometric login

---

## Architecture Reference

```
┌─────────────────────────────────────────────────────────────┐
│                   Components (UI Layer)                      │
│              LoginComponent, SignupComponent                 │
├─────────────────────────────────────────────────────────────┤
│              AuthFlowService (Orchestration)                 │
│           Business logic, state, navigation                  │
├─────────────────────────────────────────────────────────────┤
│              @nxt1/core (100% Portable)                      │
│           createAuthApi(), types, validation                 │
├─────────────────────────────────────────────────────────────┤
│               Infrastructure Layer                           │
│    Firebase Auth (SDK) + AuthApiService (Backend HTTP)       │
└─────────────────────────────────────────────────────────────┘
```

## Key Files

### Web App

- ✅ `apps/web/src/app/features/auth/pages/login/login.component.ts`
- ✅ `apps/web/src/app/features/auth/pages/signup/signup.component.ts`
- ✅
  `apps/web/src/app/features/auth/pages/forgot-password/forgot-password.component.ts`
- ✅ `apps/web/src/app/features/auth/pages/onboarding/onboarding.component.ts`

### Mobile App

- ✅ `apps/mobile/src/app/features/auth/pages/auth/auth.page.ts`
- ✅
  `apps/mobile/src/app/features/auth/pages/forgot-password/forgot-password.page.ts`
- ✅ `apps/mobile/src/app/features/auth/pages/onboarding/onboarding.page.ts`

### Shared Packages (Complete)

- ✅ `packages/core/src/auth/` - Types, guards, state management
- ✅ `packages/core/src/api/auth.api.ts` - API factory
- ✅ `packages/ui/src/auth/` - Shared UI components
