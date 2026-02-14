# Billing Module

Production-grade usage-based billing system for NXT1 AI features.

## Overview

This module implements asynchronous, idempotent, and scalable billing for AI
usage (graphics, highlights, video analysis, etc.) using Stripe.

## Architecture

```
API → Firestore → Pub/Sub → Worker → Stripe → Webhook → PaymentLogs
```

## Key Features

- ✅ **Async Processing** - Never blocks HTTP requests
- ✅ **Idempotent** - Duplicate-safe with hash-based keys
- ✅ **Concurrency-Safe** - Firestore transactions prevent race conditions
- ✅ **Retry & Reconciliation** - Automatic retry with exponential backoff
- ✅ **Environment Isolation** - Separate staging and production
- ✅ **Observable** - Comprehensive logging and status tracking

## Directory Structure

```
modules/billing/
├── types/
│   ├── usage-event.types.ts    # Usage event types
│   ├── stripe.types.ts          # Stripe-specific types
│   └── index.ts
├── config.ts                    # Configuration & constants
├── usage.service.ts             # Usage recording & management
├── stripe.service.ts            # Stripe API integration
├── pubsub.service.ts            # Pub/Sub messaging
├── webhook.service.ts           # Webhook event handling
├── __tests__/                   # Unit tests
└── index.ts                     # Module exports
```

## Quick Start

### 1. Record Usage

```typescript
import { recordUsageEvent, UsageFeature } from './modules/billing';

const eventId = await recordUsageEvent(
  db,
  {
    userId: 'user123',
    teamId: 'team456',
    feature: UsageFeature.AI_GRAPHIC,
    quantity: 1,
    jobId: 'unique-job-id', // For idempotency
  },
  'production'
);

// Returns immediately - processing happens async
```

### 2. Check Event Status

```typescript
import { getUsageEvent } from './modules/billing';

const event = await getUsageEvent(db, eventId);
console.log(event.status); // PENDING → PROCESSING → SENT
```

### 3. Handle Webhooks

```typescript
import { verifyWebhookSignature, handleWebhookEvent } from './modules/billing';

const event = verifyWebhookSignature(rawBody, signature, 'production');
await handleWebhookEvent(db, event, 'production');
```

## Usage Event Lifecycle

```
1. PENDING     → Event created, queued for processing
2. PROCESSING  → Worker acquired lock, sending to Stripe
3. SENT        → Successfully sent to Stripe
4. FAILED      → Error occurred, will retry
```

## API Reference

### Usage Service

#### `recordUsageEvent(db, input, environment)`

Records a new usage event (main entry point).

**Parameters:**

- `db: Firestore` - Firestore instance
- `input: CreateUsageEventInput` - Event data
- `environment: 'staging' | 'production'`

**Returns:** `Promise<string>` - Event ID

#### `getUsageEvent(db, eventId)`

Get usage event by ID.

#### `getUserUsageEvents(db, userId, limit)`

Get usage events for a user.

#### `getTeamUsageEvents(db, teamId, limit)`

Get usage events for a team.

#### `getPendingUsageEvents(db, limit)`

Get pending/failed events (for reconciliation).

### Stripe Service

#### `getOrCreateCustomer(db, userId, email, teamId, environment)`

Get or create Stripe customer (with Firestore caching).

#### `createInvoiceItem(customerId, stripePriceId, quantity, idempotencyKey, environment)`

Create Stripe invoice item for usage.

#### `attachPaymentMethod(customerId, paymentMethodId, environment)`

Attach payment method to customer.

#### `generateInvoice(customerId, environment)`

Generate and finalize invoice for customer.

### Webhook Service

#### `verifyWebhookSignature(payload, signature, environment)`

Verify Stripe webhook signature.

#### `handleWebhookEvent(db, event, environment)`

Process Stripe webhook event.

## Configuration

### Environment Variables

```bash
# Stripe Production
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_AI_GRAPHIC=price_...
STRIPE_PRICE_HIGHLIGHT=price_...

# Stripe Staging
STAGING_STRIPE_SECRET_KEY=sk_test_...
STAGING_STRIPE_WEBHOOK_SECRET=whsec_...
STAGING_STRIPE_PRICE_AI_GRAPHIC=price_...
```

### Feature Configuration

Edit `config.ts` to add new billable features:

```typescript
export enum UsageFeature {
  AI_GRAPHIC = 'AI_GRAPHIC',
  HIGHLIGHT = 'HIGHLIGHT',
  MY_NEW_FEATURE = 'MY_NEW_FEATURE', // Add here
}

// Add unit cost
export function getUnitCost(feature: UsageFeature): number {
  const costs = {
    // ...
    [UsageFeature.MY_NEW_FEATURE]: 5.0, // $5.00 per unit
  };
  return costs[feature];
}
```

Then add environment variable:

```bash
STRIPE_PRICE_MY_NEW_FEATURE=price_...
```

## Testing

### Run Tests

```bash
npm test
```

### Manual Testing

```bash
# Test usage recording
curl -X POST http://localhost:3000/api/v1/billing/usage \
  -H "Authorization: Bearer <token>" \
  -d '{"feature":"AI_GRAPHIC","quantity":1}'

# Test webhook
stripe listen --forward-to http://localhost:3000/api/v1/billing/webhook
stripe trigger invoice.payment_succeeded
```

## Worker Deployment

```bash
# Local testing
npm run worker:stripe

# Deploy to Cloud Run
gcloud run deploy stripe-worker \
  --source . \
  --command "npm run worker:stripe"
```

## Reconciliation

```bash
# Dry run
npm run reconcile:usage:dry-run

# Execute
npm run reconcile:usage

# Staging
npm run reconcile:usage:staging
```

## Monitoring

Key metrics to monitor:

1. Event status distribution (PENDING/SENT/FAILED counts)
2. Processing time (PENDING → SENT)
3. Pub/Sub backlog
4. Dead letter queue size
5. Stripe API error rate

## Troubleshooting

### Events stuck in PENDING

- Check: Worker is running
- Check: Pub/Sub subscription exists
- Fix: Run reconciliation script

### Events in FAILED status

- Check: `errorMessage` field in Firestore
- Common causes: Invalid Price ID, Stripe rate limit
- Fix: Correct issue, run reconciliation

### Webhook errors

- Check: `STRIPE_WEBHOOK_SECRET` is correct
- Check: Using raw body for signature verification
- Test: Use Stripe CLI locally

## Performance

**Designed for:**

- 1M+ usage events per month
- Sub-200ms API response time (async)
- Horizontal scaling with Cloud Run
- Automatic retry and recovery

**Optimizations:**

- Firestore transaction locks prevent double-processing
- Exponential backoff for Stripe rate limits
- Idempotency keys prevent duplicate charges
- Optional batch aggregation for high volume

## Security

- ✅ Webhook signature verification
- ✅ Idempotency keys (SHA-256)
- ✅ Environment isolation
- ✅ API authentication required
- ✅ Rate limiting on Stripe calls

## Related Documentation

- [Full Documentation](../../../docs/USAGE-BILLING.md)
- [API Routes](../../routes/billing.routes.ts)
- [Worker](../../workers/stripe-worker.ts)

## License

Proprietary - NXT1 Sports
