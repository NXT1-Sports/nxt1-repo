# Day 1 Go-Live: Pre-Flight Checklist

Before you announce the app is live to 2,000+ users, you must verify the
following critical checkpoints. A single misconfiguration here will cascade into
a severe outage on Day 1.

## 1. Secrets & Environment Variables Check

- [ ] **OpenRouter Key:** Ensure the production key is injected (not a dev key
      with a $5 spend limit).
- [ ] **Stripe Live Keys:** Verify `STRIPE_SECRET_KEY` and
      `STRIPE_WEBHOOK_SECRET` are set to **Live mode** in GCP Secret Manager /
      your backend `.env`.
- [ ] **Cloudflare Stream:** API tokens added (if you executed the video pivot).
- [ ] **Firebase Admin JSON:** Double-check your production service accounts are
      fully active and not expired.

## 2. Stripe Production Readiness

- [ ] **Webhooks Configured:** Go to the Stripe Developer Dashboard and point
      the webhook to your production Cloud Run URL (e.g.,
      `https://api.nxt1.app/api/webhooks/stripe`).
- [ ] **Pricing IDs Sync:** Verify the Stripe Price IDs in your backend
      constants perfectly match your _LIVE_ Stripe Dashboard (Test Mode IDs will
      crash all live purchases).

## 3. Firebase Security & Identity

- [ ] **Authorized Domains:** Add `nxt1.app` (or your chosen prod domain) to the
      Firebase Authentication Authorized Domains list. If you miss this,
      Google/Apple social logins will instantly fail for everyone.
- [ ] **Firestore Rules & Indexes:** Run `firebase deploy --only firestore`.
      Complex `Agent X` queries will throw GRPC errors and crash if the
      `firestore.indexes.json` isn't fully propagated globally.

## 4. The Panic Plan (Outage Responses)

_Keep this section open in your primary monitor during launch._

- **If OpenRouter drops completely or rate limits you hard:** Instantly switch
  your primary in the backend variables to Gemini 1.5 Pro and restart Cloud Run.
- **If Cloud Run hits 100% memory (OOMKill):** Deploy a new revision raising the
  memory limit from 1GB to 2GB per container. Leave `WORKER_CONCURRENCY` at 3.
- **If Firestore DB locks up or UI hangs on reads:** Your `BullMQ` heavy queue
  is hammering the database. Deploy an update lowering your `WORKER_CONCURRENCY`
  environment variable to `1`.
- **If Redis starts evicting keys (OOM):** Upgrade the Memorystore/Upstash
  instance size immediately. Do not wait for it to crash entirely.

---

_Remember: On Day 1, stability is a feature. Do not deploy new code on launch
day. If something non-critical breaks, write it down and fix it on Week 2._
