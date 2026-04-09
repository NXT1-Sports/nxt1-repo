# Backend Performance Monitoring - Quick Reference

> **Quick access guide for NXT1 Backend Performance Monitoring**

---

## ⚡ Quick Start

```bash
# View all performance stats
curl http://localhost:3000/api/v1/debug/performance | jq

# View total requests
curl -s http://localhost:3000/api/v1/debug/performance | jq '.data.stats.totalRequests'

# View specific endpoint stats
curl -s http://localhost:3000/api/v1/debug/performance | jq '.data.stats.byTrace.backend_teams_get_all'
```

---

## 📊 Key Metrics

| Metric         | What It Means                    | Good Value |
| -------------- | -------------------------------- | ---------- |
| `avgDuration`  | Average response time            | < 200ms    |
| `p95Duration`  | 95% of requests faster than this | < 500ms    |
| `successRate`  | % of successful requests         | > 95%      |
| `cacheHitRate` | % of requests served from cache  | > 50%      |

---

## 🔍 Common Tasks

### Check System Health

```bash
curl -s http://localhost:3000/api/v1/debug/performance | jq '{
  totalRequests: .data.stats.totalRequests,
  avgDuration: .data.stats.averageDuration,
  successRate: .data.stats.successRate
}'
```

### Find Slow Endpoints

```bash
curl -s http://localhost:3000/api/v1/debug/performance | jq '
  .data.stats.byTrace |
  to_entries |
  sort_by(.value.p95Duration) |
  reverse |
  .[0:5] |
  map({endpoint: .key, p95: .value.p95Duration})
'
```

### Check Cache Effectiveness

```bash
curl -s http://localhost:3000/api/v1/debug/performance | jq '
  .data.stats.byTrace |
  to_entries |
  map({endpoint: .key, cacheHitRate: .value.cacheHitRate}) |
  sort_by(.cacheHitRate)
'
```

---

## 🧪 Testing

### Generate Test Traffic

```bash
# Hit multiple endpoints
for i in {1..10}; do
  curl -s http://localhost:3000/api/v1/teams?limit=5 > /dev/null
  curl -s http://localhost:3000/api/v1/feed > /dev/null
  curl -s http://localhost:3000/api/v1/athletes > /dev/null
done

# Check results
curl -s http://localhost:3000/api/v1/debug/performance | jq '.data.stats'
```

### Compare Cache Performance

```bash
# First request (no cache)
time curl -s http://localhost:3000/api/v1/teams/mhrflxu5w5uaszf3gbts > /dev/null

# Second request (cached)
time curl -s http://localhost:3000/api/v1/teams/mhrflxu5w5uaszf3gbts > /dev/null

# View stats
curl -s http://localhost:3000/api/v1/debug/performance | jq '.data.stats.byTrace.backend_teams_get_by_id'
```

---

## 🚨 Alerts

### Set up monitoring alerts when:

- **P95 Duration > 500ms** → Endpoint is slow
- **Success Rate < 95%** → High error rate
- **Cache Hit Rate < 50%** → Cache ineffective

### Example Alert Script

```bash
#!/bin/bash
STATS=$(curl -s http://localhost:3000/api/v1/debug/performance)
P95=$(echo $STATS | jq '.data.stats.byTrace.backend_teams_get_all.p95Duration')

if [ $P95 -gt 500 ]; then
  echo "⚠️ High latency detected: ${P95}ms"
  # Send alert to Slack/Email
fi
```

---

## 📁 Files

| File                                       | Description                     |
| ------------------------------------------ | ------------------------------- |
| `BACKEND-PERFORMANCE-MONITORING.md`        | Full documentation (English)    |
| `BACKEND-PERFORMANCE-MONITORING-VI.md`     | Full documentation (Vietnamese) |
| `BACKEND-PERFORMANCE-QUICK-REFERENCE.md`   | This quick reference            |
| `src/middleware/performance.middleware.ts` | Implementation code             |

---

## 🔗 Links

- Full docs (EN):
  [BACKEND-PERFORMANCE-MONITORING.md](./BACKEND-PERFORMANCE-MONITORING.md)
- Middleware code:
  [performance.middleware.ts](./src/middleware/performance.middleware.ts)

---

## ✅ Quick Health Check

```bash
# One-liner to verify everything works
curl -s http://localhost:3000/api/v1/debug/performance | jq '.success' && echo "✅ Performance monitoring is active"
```

---

**Last Updated:** February 16, 2026  
**Status:** ✅ Active on all 30+ routes
