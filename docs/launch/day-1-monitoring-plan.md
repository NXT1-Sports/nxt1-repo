# Day 1 Launch Monitoring & Configuration

When you hit the go-live button, you shouldn't be guessing. You need three tabs
open to monitor the health of the system:

## 1. Google Cloud Run Metrics

**Watch the Container Memory Utilization.** If it stays under 80%, your
`WORKER_CONCURRENCY` limit of 3 is working perfectly and protecting your
containers from Out-Of-Memory (OOMKill) crashes.

## 2. Redis / BullMQ Queue Depth

**Watch the `agent-jobs` queue.** If the queue spikes over 500 pending jobs, it
means your users are submitting heavy requests faster than Cloud Run can
actively spin up new instances to handle them.

## 3. OpenRouter Activity Log

**Watch for 429 (Rate Limit) errors.** With 2,000 Day 1 users, you are likely to
bump into model provider rate limits.

---

## 4. Ensure LLM Fallbacks are Configured

With heavy load, you **will** hit rate limits with your primary LLM. You must
have fallback routing enabled in your OpenRouter API configuration to survive
this.

Configure your routes as follows:

- **Primary:** `anthropic/claude-3.5-sonnet`
- **Fallback 1:** `google/gemini-1.5-pro` _(Handles massive token contexts
  perfectly)_
- **Fallback 2:** `meta-llama/llama-3-70b-instruct` _(Fast and highly reliable)_
