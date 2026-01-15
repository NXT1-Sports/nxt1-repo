# Auth Flow Implementation

## Status: In Progress

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

### Remaining Tasks

- [ ] **Complete Signup page**
  - Add Google/Apple OAuth signup options
  - Handle team code pre-fill from URL params
  - Create user in backend after Firebase signup

- [ ] **Implement Forgot Password**
  - Build password reset request form
  - Send reset email via Firebase
  - Add success/error feedback UI
  - Handle rate limiting gracefully

- [ ] **Build Onboarding wizard**
  - Role selection step (athlete, coach, parent, etc.)
  - Profile info step (name, photo)
  - Sport/position selection
  - School/organization details
  - Contact preferences
  - Progress persistence (resume incomplete onboarding)

- [ ] **Add auth guards for protected routes**
  - `authGuard` - require authenticated user
  - `guestGuard` - redirect authenticated users away from auth pages
  - `onboardingGuard` - require completed onboarding
  - `roleGuard` - restrict by user role
  - SSR-safe guard implementations

- [ ] **Integrate Biometric Authentication (Mobile)**
  - Add Face ID / Touch ID support for mobile apps
  - Use `@capacitor/biometric-auth` plugin
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

## Files to Modify

### Web App

- `apps/web/src/app/features/auth/pages/login/login.component.ts`
- `apps/web/src/app/features/auth/pages/signup/signup.component.ts`
- `apps/web/src/app/features/auth/pages/forgot-password/forgot-password.component.ts`
- `apps/web/src/app/features/auth/pages/onboarding/onboarding.component.ts`
- `apps/web/src/app/features/auth/guards/`

### Mobile App

- `apps/mobile/src/app/features/auth/pages/login/`
- `apps/mobile/src/app/features/auth/pages/signup/`
- `apps/mobile/src/app/features/auth/pages/forgot-password/`
- `apps/mobile/src/app/features/auth/pages/onboarding/`
- `apps/mobile/src/app/features/auth/guards/`

### Shared (already complete)

- `packages/core/src/auth/` ✅
- `packages/core/src/api/auth.api.ts` ✅
- `packages/ui/src/auth/` ✅
