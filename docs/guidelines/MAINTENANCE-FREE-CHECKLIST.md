# Maintenance-Free Development Checklist

> **The Anti-Maintenance Hell Manifesto** — Principles and practices that keep
> NXT1 running itself so you can focus on building features, not fixing
> infrastructure.

**Status:** Active enforcement as of February 2026  
**Review:** Monthly  
**Owner:** Engineering Team

---

## Core Philosophy

**We built this monorepo to never sit here debugging infrastructure again.**

Three golden rules:

1. **Backend does the work** — Frontend displays results
2. **Catch errors before users do** — Monitoring > manual QA
3. **Automate everything** — No manual deploys, no manual fixes where possible

---

## ✅ Always Do This

### 1. Use Shared Packages (NEVER Copy-Paste)

**Before writing new code, ask:**

> "Does this belong in `@nxt1/core` or `@nxt1/ui`?"

| Code Type      | Location               | Why                           |
| -------------- | ---------------------- | ----------------------------- |
| Business logic | `@nxt1/core`           | Fix once, works everywhere    |
| UI components  | `@nxt1/ui`             | No duplicate components       |
| API calls      | Backend/Functions      | Security, caching, validation |
| Constants      | `@nxt1/core/constants` | Single source of truth        |
| Types          | `@nxt1/core/models`    | Type safety across platforms  |

**Rule:** If you're about to copy code between apps/web and apps/mobile,
**STOP** and put it in a shared package.

### 2. Backend-First Development

**Every new feature checklist:**

- [ ] **Backend API first** — Build endpoint before UI
- [ ] **Validation on backend** — Never trust frontend input
- [ ] **Business logic on backend** — Frontend just displays
- [ ] **Testing on backend** — API tests > E2E tests (faster, cheaper)
- [ ] **Documentation** — OpenAPI/Swagger for all endpoints

**Example:**

```typescript
// ❌ WRONG: Business logic on frontend
const discount = user.isPremium ? price * 0.2 : 0;
const total = price - discount;

// ✅ CORRECT: Backend calculates
const { total, discount } = await api.calculateCheckout({ items, userId });
```

### 3. Use Constants (NEVER Hardcode)

**Before typing a string literal, check if it exists:**

```typescript
// ✅ Import from @nxt1/core
import { USER_ROLES, PLAN_TIERS, CACHE_KEYS, CACHE_CONFIG } from '@nxt1/core';

// ❌ NEVER hardcode
if (role === 'athlete') { ... }        // Use USER_ROLES.ATHLETE
if (tier === 'premium') { ... }        // Use PLAN_TIERS.PREMIUM
cache.set('user:123', data);           // Use CACHE_KEYS.USER_PROFILE + userId
setTimeout(fn, 900000);                // Use CACHE_CONFIG.MEDIUM_TTL
```

**Rule:** If you type a magic number or string, add it to `@nxt1/core/constants`
first.

### 4. Write Tests as You Build

**Don't wait until the end. Test while building:**

- [ ] **Pure functions** — Unit tests (vitest) — 90%+ coverage target
- [ ] **API endpoints** — Integration tests — Test happy + error paths
- [ ] **Critical flows** — E2E tests (Playwright) — Auth, checkout, onboarding
- [ ] **CI fails if coverage drops** — Prevents regression

**Run tests before committing:**

```bash
npm run test              # All tests
npm run test:coverage     # Check coverage
npm run e2e               # Critical flows
```

### 5. Let CI/CD Do the Work

**NEVER manually deploy. Push to branch → CI handles it.**

| Branch      | Action                          | Auto-Deploy? |
| ----------- | ------------------------------- | ------------ |
| `feature/*` | CI tests, no deploy             | No           |
| `develop`   | CI tests + deploy to staging    | Yes          |
| `main`      | CI tests + deploy to production | Yes          |

**Before merging:**

- [ ] CI passes (build, lint, test)
- [ ] AI review suggests no critical issues
- [ ] At least 1 human approval (production)

**Rule:** If you're manually running `firebase deploy` or `npm run build`,
you're doing it wrong.

### 6. Monitor Everything (Catch Errors First)

**We built auto-monitoring so users don't report bugs before we know about
them.**

**Daily checks (automated):**

- [ ] Crashlytics alerts → Slack → Auto-analyzed
- [ ] Error rate < 1% (Cloud Monitoring)
- [ ] Web Vitals green (LCP < 2.5s, FID < 100ms)
- [ ] API response times < 500ms p95

**Manual weekly review:**

- [ ] Check #urgent-alerts Slack channel
- [ ] Review AI-generated fix PRs (success rate)
- [ ] Check Firestore `crashlytics_alerts` collection

**Rule:** Fix bugs before users complain. If users report a bug we didn't catch,
improve monitoring.

### 7. SSR Safety (Always Check Platform)

**Before using browser APIs:**

```typescript
// ✅ CORRECT: Platform guard
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

private readonly platformId = inject(PLATFORM_ID);

doSomething(): void {
  if (isPlatformBrowser(this.platformId)) {
    localStorage.setItem('key', 'value');  // Safe
  }
}

// OR use afterNextRender
constructor() {
  afterNextRender(() => {
    // Safe to use window, document, localStorage here
  });
}
```

**Rule:** Never access `window`, `document`, `localStorage`, or `navigator`
without platform check.

### 8. Keep Dependencies Updated

**Dependabot is configured. Review PRs weekly:**

- [ ] Review Dependabot PRs every Monday
- [ ] Merge Angular/Ionic/Firebase updates together (grouped)
- [ ] Run `npm audit` monthly — Fix critical/high vulnerabilities
- [ ] Major version upgrades → Test in staging first

**Rule:** Outdated dependencies = security risks + harder upgrades later.

### 9. Use Signals for State (Not BehaviorSubject)

**2026 Angular pattern:**

```typescript
// ✅ CORRECT: Private signals, public computed
@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly _data = signal<Item[]>([]);
  private readonly _loading = signal(false);

  readonly data = computed(() => this._data());
  readonly loading = computed(() => this._loading());
  readonly isEmpty = computed(() => this._data().length === 0);
}

// ❌ WRONG: Exposed BehaviorSubject
private data$ = new BehaviorSubject<Item[]>([]);
```

**Rule:** Signals are simpler, faster, and integrate better with templates.

### 10. Document as You Build

**If you build a new feature, document it:**

- [ ] Update README if it affects setup
- [ ] Add JSDoc to exported functions
- [ ] Update architecture docs if adding new pattern
- [ ] Screenshot + description for UI components

**Rule:** If you can't explain it in 2 sentences, it's too complex. Simplify or
document thoroughly.

---

## ❌ Never Do This

### 1. Never Duplicate Code Between Apps

**Scenario:** You need same validation logic on web + mobile.

- ❌ Copy-paste between `apps/web` and `apps/mobile`
- ✅ Create in `packages/core/validation` and import

### 2. Never Deploy Manually

**Scenario:** Quick fix needed in production.

- ❌ `firebase deploy` from your laptop
- ✅ Push to `main` → CI deploys automatically

### 3. Never Put Secrets in Code

**Scenario:** Need API key for third-party service.

- ❌ `const API_KEY = 'sk-abc123...'` in code
- ✅ GitHub Secrets → Environment variables

### 4. Never Ignore CI Failures

**Scenario:** CI fails but "it works on my machine."

- ❌ Merge anyway with "CI fix later"
- ✅ Fix the issue — CI is protecting you

### 5. Never Skip Tests for "Small Changes"

**Scenario:** "Just a quick typo fix."

- ❌ Skip writing/running tests
- ✅ Run tests every commit — Catches regressions

### 6. Never Hardcode Environment URLs

**Scenario:** Need to call backend API.

- ❌ `fetch('https://api.nxt1.app/v1/users')`
- ✅ `fetch(`${environment.apiUrl}/users`)`

### 7. Never Put Business Logic on Frontend

**Scenario:** Calculate subscription discount.

- ❌ `const discount = user.tier === 'premium' ? 20 : 0;`
- ✅ `const { discount } = await api.getSubscriptionDetails();`

### 8. Never Use `any` Without Justification

**Scenario:** API response type is complex.

- ❌ `const data: any = await fetch(...)`
- ✅ Create interface in `@nxt1/core/models`

### 9. Never Directly Modify Production Data

**Scenario:** User asks to update their profile manually.

- ❌ Open Firestore console and edit document
- ✅ Build admin UI or use Cloud Functions

### 10. Never Let Errors Go Silent

**Scenario:** API call might fail.

- ❌ `try { await api.call() } catch {}`
- ✅ Log, alert, or display error to user

---

## 📋 Monthly Maintenance Checklist

**First Monday of Every Month:**

### Code Health

- [ ] Review Dependabot PRs — Merge security updates
- [ ] Check test coverage — Should be 70%+ for `@nxt1/core`
- [ ] Run `npm audit` — Fix critical/high vulnerabilities
- [ ] Check bundle size — Main bundle < 200KB gzipped

### Monitoring

- [ ] Review Crashlytics dashboard — Top 5 issues addressed?
- [ ] Check Cloud Monitoring error rate — Increasing trend?
- [ ] Review AI fix success rate — PRs merged vs. closed
- [ ] Check Slack #urgent-alerts — Any recurring issues?

### Performance

- [ ] Run Lighthouse on production — All scores 90+?
- [ ] Check Firebase Performance — API p95 < 500ms?
- [ ] Review largest bundles — Any unnecessary imports?
- [ ] Check CDN cache hit rate — Should be 80%+

### Documentation

- [ ] Update architecture docs if patterns changed
- [ ] Review TODOs in code — Any stale ones?
- [ ] Update README if setup changed
- [ ] Check docs/ folder — Anything outdated?

### Infrastructure

- [ ] Review Firebase quota usage — Approaching limits?
- [ ] Check GitHub Actions minutes — Need optimization?
- [ ] Review n8n workflows — Any failures?
- [ ] Check Turbo remote cache hit rate — 50%+?

---

## 🎯 Quarterly Reviews (Every 3 Months)

### Architecture

- [ ] Review monorepo structure — Still working well?
- [ ] Evaluate new frameworks/tools — Worth adopting?
- [ ] Check for duplicate code — Refactor to shared packages
- [ ] Review API design — Any breaking changes needed?

### Team Practices

- [ ] Developer survey — What's painful?
- [ ] Review PR velocity — Bottlenecks?
- [ ] Check test flakiness — Fix or remove flaky tests
- [ ] Onboarding feedback — New devs struggling anywhere?

### Business Alignment

- [ ] Review feature usage analytics — What's not used?
- [ ] Check error impact — Which errors affect most users?
- [ ] Evaluate tech debt — Prioritize what to pay down
- [ ] Plan major upgrades — Angular/Node/Firebase versions

---

## 🚨 Red Flags (Act Immediately)

**If you see these, stop and fix before building new features:**

| Red Flag                   | Impact                   | Action                     |
| -------------------------- | ------------------------ | -------------------------- |
| Test coverage < 60%        | Regressions slip through | Write tests, block PRs     |
| Build time > 10 min        | Dev velocity tanks       | Optimize Turborepo config  |
| CI failure rate > 20%      | False alarms ignored     | Fix flaky tests            |
| Error rate > 2%            | Users leaving            | Debug top 3 errors         |
| Bundle size > 300KB        | Slow page loads          | Code split, tree shake     |
| Manual deploys happening   | Bypassing safety         | Enforce CI/CD only         |
| Duplicate code across apps | Fix once → deploy twice  | Refactor to shared package |
| Magic strings appearing    | Hard to refactor         | Move to constants          |

---

## 💡 Success Metrics

**How we know we're winning:**

### Developer Experience

- ✅ **New feature: Idea → Production in 1 week** (not 1 month)
- ✅ **Deploy confidence:** Push to main without fear
- ✅ **CI feedback:** < 5 minutes for test results
- ✅ **Reusability:** 70%+ of code in shared packages

### System Health

- ✅ **Uptime:** 99.9% (< 43 min downtime/month)
- ✅ **Error rate:** < 1% of requests
- ✅ **Response time:** API p95 < 500ms
- ✅ **Build success:** 95%+ CI pass rate

### Business Impact

- ✅ **User-reported bugs:** < 5/week (monitoring catches them first)
- ✅ **Time to fix:** Critical bugs fixed < 2 hours
- ✅ **Infrastructure cost:** Predictable (not spiking randomly)
- ✅ **Team focus:** 80% feature work, 20% maintenance

---

## 🎓 Onboarding: New Developer Checklist

**Before writing code:**

- [ ] Read [GitHub Copilot Instructions](../.github/copilot-instructions.md)
- [ ] Read [Architecture Overview](../architecture/ARCHITECTURE.md)
- [ ] Clone repo, run `npm install`, verify build works
- [ ] Deploy to staging once (via CI, not manually)
- [ ] Review 3 recent PRs to see patterns
- [ ] Set up local Crashlytics alerts in Slack
- [ ] Trigger a test crash, verify monitoring works

**First week goals:**

- [ ] Fix 1 small bug (learn codebase)
- [ ] Build 1 small feature using shared packages
- [ ] Write tests for your changes
- [ ] Deploy via CI successfully

---

## 📚 Reference Docs

| Topic              | Location                                                                 |
| ------------------ | ------------------------------------------------------------------------ |
| Architecture       | [ARCHITECTURE.md](../architecture/ARCHITECTURE.md)                       |
| Caching            | [CACHING-STRATEGY.md](../infrastructure/CACHING-STRATEGY.md)             |
| CI/CD Setup        | [CI-CD-SETUP.md](../infrastructure/CI-CD-SETUP.md)                       |
| Crashlytics        | [CRASHLYTICS-SETUP.md](../testing/CRASHLYTICS-SETUP.md)                  |
| Runtime Monitoring | [RUNTIME-ERROR-MONITORING.md](../testing/RUNTIME-ERROR-MONITORING.md)    |
| E2E Testing        | [E2E-TESTING.md](../testing/E2E-TESTING.md)                              |
| Design System      | [DESIGN-SYSTEM.md](../frontend/DESIGN-SYSTEM.md)                         |
| Copilot Guidelines | [../.github/copilot-instructions.md](../.github/copilot-instructions.md) |

---

## 🔄 How to Update This Doc

**This document should evolve as we learn:**

1. **Monthly:** Review red flags — Adjust thresholds based on reality
2. **Quarterly:** Add new patterns as they emerge
3. **After incidents:** Add preventive measures
4. **Team feedback:** Update checklist based on pain points

**Last Updated:** February 3, 2026  
**Next Review:** March 3, 2026  
**Version:** 1.0.0

---

## Final Word

**The goal isn't zero maintenance — it's predictable, automated maintenance.**

When something breaks:

1. Fix it
2. Add monitoring so it's caught automatically next time
3. Add a test so it can't happen again
4. Update this doc with what you learned

**We built this architecture so you can ship features fast without drowning in
technical debt. Use it.**

---

**Questions?** Check docs or ask in `#engineering` Slack channel.  
**Found a better pattern?** Update this doc and share with the team.  
**Caught a bug users didn't report?** 🎉 The system is working!
