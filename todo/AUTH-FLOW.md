# Auth Flow Implementation

## Status: In Progress

### Tasks

- [ ] **Complete Login page** (email + Google OAuth)
  - Wire up email/password form submission
  - Implement Google OAuth flow (web popup + native)
  - Handle loading states and errors
  - Add "Remember me" functionality
  - Redirect to onboarding or home based on user state

- [ ] **Complete Signup page**
  - Wire up email/password registration
  - Add Google/Apple OAuth signup options
  - Validate password strength
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
