# Pulse AI Cost Estimation

This document tracks the estimated costs associated with the `dailyPulseUpdates`
(Dispatcher/Worker) architecture running on Firebase Functions and OpenRouter.

## Architecture Cost Drivers

The Pulse system costs are driven primarily by **OpenRouter AI API usage**.
Firebase Functions (Compute) and Firestore (Database) costs are negligible
because the tasks are spread out and execute quickly.

Every day at 7:00 AM ET, the system scales based on the number of **unique
sport/state combinations** (called "buckets") present in the onboarded user
base.

For **each bucket** (e.g., "Football in Texas"), the worker performs:

1. **1x Perplexity Sonar call:** Discovers ~15 recent news articles.
2. **Up to 15x DeepSeek Chat calls:** Generates tailored summaries for each
   article.

## OpenRouter Pricing (as of April 2026)

- **Perplexity Sonar (`perplexity/sonar`):**
  - $1.00 / 1M input tokens
  - $1.00 / 1M output tokens
  - Estimated per-bucket search cost: ~$0.0075

- **DeepSeek Chat (`deepseek/deepseek-chat`):**
  - $0.32 / 1M input tokens
  - $0.89 / 1M output tokens
  - Estimated per-article summary cost: ~$0.00066 (assuming ~400 input tokens,
    ~600 output tokens)

## Estimated Monthly Costs

Based on 1 daily run, assuming 30 days per month:

| Active Buckets/Day | Estimated Monthly AI Cost |
| ------------------ | ------------------------: |
| 5 buckets          |               ~$2.61 / mo |
| 10 buckets         |               ~$5.22 / mo |
| 25 buckets         |              ~$13.05 / mo |
| 50 buckets         |              ~$26.10 / mo |
| 100 buckets        |              ~$52.20 / mo |

_Note: A "bucket" is a unique `[sport, state]` combination derived from your
actual users. If 1,000 users are all Texas Football players, that is still only
1 bucket._

## Cost Controls in Place

- **Duplicate Prevention:** Discovered articles are checked against Firestore;
  summaries are only generated for new URLs.
- **Maximum Cap:** The `pulseDispatcher` limits execution to a maximum of `100`
  buckets per day to prevent runaway billing.
- **Worker Concurrency limits:** Max 6 concurrent workers and 2 dispatches per
  second prevent API rate limiting and sudden cost spikes.
