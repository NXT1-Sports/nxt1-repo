# NXT1 Billing System — Production Launch Checklist

The codebase for the new Grade A+ enterprise billing system is complete, fully
typed, and verified (0 compilation errors). To take this fully live in
production, the following dashboard configurations and data seeding steps must
be manually completed by a developer or admin.

## Step 1: Set up Stripe Metered Billing (For B2B Enterprise)

The codebase uses Stripe's real-time usage meters. If the meter is not created
in the Stripe Dashboard, Stripe will block the metered API calls.

1. Log into the **Stripe Dashboard**.
2. Ensure you are in **Live Mode** (or Test Mode if doing staging tests).
3. Navigate to **Billing** → **Meters** (or search "Meters" in the search bar).
4. Click **Create meter**.
5. Set the **Event Name** exactly to: `nxt1_ai_usage` _(this is hardcoded in
   `stripe.service.ts`)_.
6. Set the **Value** mapping to `payload.value` (so Stripe extracts the correct
   cost).

## Step 2: Set up the Helicone Webhook Security (For B2C True-ups)

The system strictly verifies returning webhooks using an HMAC-256 secret key to
prevent fraudulent charge bypasses. If this isn't set, webhooks will be rejected
with a 401 Unauthorized.

1. Log into your **Helicone Dashboard**.
2. Navigate to **Webhooks**.
3. Create a new webhook pointing to the production backend URL:
   `https://<YOUR_BACKEND_DOMAIN>/api/v1/helicone/webhook/usage`.
4. Configure Helicone to send events when a request **"Finishes" /
   "Completes"**.
5. Helicone will generate a **Signing Secret**. Copy this value.
6. Go to your **Google Cloud / Firebase Hosting** environment variables for the
   backend and safely inject it:
   - **Key:** `HELICONE_WEBHOOK_SECRET`
   - **Value:** `[Paste the secret from Helicone]`

## Step 3: Seed your Firestore Price Controls

The backend now automatically reads a remote configuration document in Firestore
to determine profit margins and warning thresholds dynamically. If missing, it
defaults to a 1.0x multiplier (0% profit markup).

1. Go to your **Firebase Console** → **Firestore Database**.
2. Create a new collection called `platformConfig` (if it does not already
   exist).
3. Create a document with the exactly named ID: `billing`.
4. Add the following fields to the `billing` document (Ensure the type is set to
   **Number** for all fields):
   - `aiMarginMultiplier` (Number) : Set it to `1.5` (represents a 1.5x markup).
   - `lowBalanceThresholdCents` (Number) : Set to `100` ($1.00 warning limit).
   - `minCostCents` (Number) : Set to `1` (1 cent minimum).
   - `holdExpiryMs` (Number) : Set to `1800000` (Sweeper job will clear
     abandonded holds after 30 minutes).

## Step 4: Deploy

Once steps 1-3 are completed, run the deployment commands from the root of the
monorepo for both the backend and functions to push the new Sweeper cron job and
webhook logic live:

```bash
npm run deploy:backend
npm run deploy:functions
```
