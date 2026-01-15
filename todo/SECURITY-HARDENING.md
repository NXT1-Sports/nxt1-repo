# Security Hardening

## Status: Not Started

> From: `docs/SECURITY.md`

---

## Mobile Security

- [ ] Implement **certificate pinning** for production builds
- [ ] Use Capacitor Preferences API for token storage (not localStorage)
- [ ] Verify no API keys hardcoded in mobile binary
- [ ] Zero Trust: All inputs validated on backend

---

## API Security

- [ ] All protected routes use `appGuard` middleware
- [ ] Never trust client-provided user IDs (extract from JWT)
- [ ] Input validation using `@nxt1/core/validation` schemas
- [ ] Input sanitization (XSS, NoSQL injection prevention)
- [ ] Rate limiting configured at Cloud Run level
- [ ] CORS configured to allow only trusted origins

---

## Authentication

- [ ] Token expiration enforced (24 hour max)
- [ ] HTTP-only cookies for SSR (`__session`)
- [ ] Firebase custom claims for RBAC
- [ ] Authentication failures logged for monitoring

---

## Dependency Security

- [ ] Dependabot configured (`.github/dependabot.yml`)
- [ ] `npm audit` runs in CI pipeline
- [ ] CI fails on high-severity vulnerabilities
- [ ] Package lockfiles committed

---

## Secret Management

- [ ] No secrets committed to repository
- [ ] Secret scanning enabled in CI
- [ ] `.env` files in `.gitignore`
- [ ] Service account keys stored securely

---

## Firestore Security Rules

- [ ] No open access rules (`allow read, write: if true;`)
- [ ] Owner-only write enforced
- [ ] Rules tested before deployment

---

## Incident Response Readiness

- [ ] Security team contact established
- [ ] PagerDuty configured for critical alerts
- [ ] Incident response plan documented
- [ ] GDPR/CCPA compliance reviewed
