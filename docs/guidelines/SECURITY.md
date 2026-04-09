# Security Policy

At NXT1, we take the security of our athletes, coaches, and platform data
seriously. This document outlines our security policies, reporting procedures,
and best practices.

## 🛡️ Reporting a Vulnerability

If you discover a security vulnerability in NXT1, please report it to us
immediately.

**DO NOT create a public GitHub issue.**

Please create a private report or email our security team directly at **[Insert
Security Email]**.

### Reporting Process

1. **Private Disclosure**: Share details only with the security team.
2. **Triage**: We will acknowledge your report within 48 hours.
3. **Verification**: Our team will verify the vulnerability and assess its
   severity.
4. **Remediation**: We will develop a fix and release a patch.
5. **Acknowledgment**: You will be credited for your responsible disclosure
   (unless you wish to remain anonymous).

---

## Security Architecture

NXT1 utilizes a defense-in-depth strategy leveraging enterprise-grade cloud
security.

### 1. Authentication & Authorization

- **Identity Provider**: Firebase Authentication for robust identity management.
- **Custom Claims**: Role-based access control (RBAC) enforced via Firebase
  custom claims (athlete, coach, parent, scout, admin).
- **Token Handling**:
  - **Web (SSR)**: Firebase ID tokens are stored in HTTP-only cookies
    (`__session`) for authenticated SSR via FirebaseServerApp.
  - **Backend API**: JWT verification via Firebase Admin SDK. All protected
    routes use `appGuard` middleware.
  - **Mobile**: Capacitor Preferences API for secure token storage.
- **Token Expiration**: ID tokens are validated on each request. Tokens older
  than 24 hours are rejected.
- **Session Management**: Firebase handles token refresh automatically on the
  client.

### 2. Data Protection

- **Firestore Rules**: All database access is governed by strict Security Rules.
  - **No Open Access**: No paths should ever be `allow read, write: if true;`.
  - **Owner-Only Write**: Users can only modify their own documents.
- **Encryption**:
  - **At Rest**: Google Cloud automatically encrypts all data stored in
    Firestore and Cloud Storage.
  - **In Transit**: All API communication is forced over HTTPS (TLS 1.2+).

### 3. API Security

- **Environments**: Strict separation of Production (`/api/v1/*`) and Staging
  (`/api/v1/staging/*`) environments.
  - Different Firebase projects and service accounts per environment.
  - Environment detection via request URL path.
- **Authentication Middleware**: `appGuard` verifies Firebase JWT on all
  protected routes.
- **Authorization Headers**: `Authorization: Bearer <firebase-id-token>`
  required for authenticated endpoints.
- **Validation**: All API inputs are validated using schemas defined in
  `@nxt1/core/validation`.
- **Sanitization**: Inputs are sanitized to prevent injection attacks (XSS,
  NoSQL Injection).
- **Rate Limiting**: Implemented at Cloud Run/Firebase App Hosting level.
- **CORS**: Configured to allow only trusted origins.

---

## Development Guidelines

All contributors must adhere to these security practices:

### 🚫 Credential Management

- **Never commit secrets**: API keys, service account JSONs, and private keys
  must **NEVER** be committed to the repository.
- **.env usage**: Use `.env` files for local development secrets, which are
  `.gitignore`d.
- **Secret Scanning**: Our CI pipeline includes automated secret scanning.

### 📦 Dependency Management

- **Regular Updates**: Automated dependency updates via Dependabot (configured
  in `.github/dependabot.yml`).
- **Auditing**:
  - Run `npm audit` regularly to identify security risks.
  - CI pipeline fails on high-severity vulnerabilities.
- **Lockfiles**: `package-lock.json` must always be committed to ensure
  deterministic builds.
- **Monorepo Hoisting**: NPM workspaces hoist common dependencies to root for
  consistency.
- **Turborepo Caching**: Remote caching ensures reproducible builds across
  environments.

### 🔒 Code Patterns

- **SSR Safety**:
  - Always check `isPlatformBrowser()` before accessing browser APIs (`window`,
    `document`, `localStorage`).
  - Use `afterNextRender()` for DOM manipulation.
  - Sanitize user-generated content rendered on the server.
  - Never expose Firebase service account keys on the client.
- **Mobile Security**:
  - Use Capacitor Preferences API, not `localStorage`, for token storage.
  - Implement certificate pinning for production builds.
  - Do not hardcode API keys in mobile app binary.
  - Assume the client is compromised (Zero Trust). Validate everything on the
    backend.
- **API Development**:
  - Always use `appGuard` middleware for protected routes.
  - Never trust client-provided user IDs; extract from verified JWT token.
  - Log authentication failures for security monitoring.

---

## Supported Versions

Only the latest `main` branch and the current production release are supported
with security updates.

| Version | Supported | Notes                      |
| :------ | :-------- | :------------------------- |
| `main`  | ✅ Yes    | Current development branch |
| `v2.x`  | ✅ Yes    | Current Release            |
| `v1.x`  | ❌ No     | Legacy - End of Life       |

---

## Incident Response

In the event of a data breach or critical security incident:

1. The Security Team is notified immediately via PagerDuty.
2. The affected systems are isolated to contain the threat.
3. An audit is performed to assess the impact.
4. Affected users and required regulatory bodies are notified in accordance with
   GDPR/CCPA and local laws.
