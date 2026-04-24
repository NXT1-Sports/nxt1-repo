# Pulse AI Cost Reduction TODOs

Before scaling up the `dailyPulseUpdates` (Dispatcher/Worker) system to cover
all sports and states, we need to implement cost-saving measures. If deployed
as-is across all 15 sports and 50 states (750 combinations), the OpenRouter AI
costs could exceed $390/month.

Please review and implement the following optimizations to bring the cost down
to under $40/month at full scale:

## 1. Group by Region Instead of State (High Priority)

- **Current State:** The system discovers buckets at the State level (e.g.,
  Texas, California). For 15 sports across 50 states = 750 daily searches.
- **Action:** Modify the `discoverBucketsFromUsers()` query mapping to group the
  50 US states into 5-6 geographic regions (e.g., Northeast, Southeast, Midwest,
  West Coast).
- **Impact:** Cuts the total number of searches from 750 down to ~75-90. Lowers
  cost by ~90% while still delivering relevant regional news.

## 2. Decrease Target Article Count per Search

- **Current State:** `TARGET_ARTICLE_COUNT` is set to `15` in
  `dailyPulseUpdates.ts`. The worker summarizes all 15 articles via DeepSeek.
- **Action:** Decrease `TARGET_ARTICLE_COUNT` from `15` to `5` or `7`.
- **Impact:** Drops the DeepSeek token usage per bucket by 50-66%.

## 3. Limit News Generation to Active Users Only

- **Current State:** The Dispatcher pulls buckets for anyone who has
  `onboardingCompleted == true`.
- **Action:** Add a filter or logic to only extract `[sport, state]`
  combinations from users who have logged in within the last 14 to 30 days.
- **Impact:** Avoids paying OpenRouter to generate content for combinations
  entirely composed of inactive users.

## 4. Implement Staggered "Round-Robin" Scheduling

- **Current State:** Everything is scheduled to run every day at 7:00 AM ET.
- **Action:** Adjust the Dispatcher to update major sports (Football,
  Basketball, Baseball) daily, but minor/niche sports only twice a week.
- **Impact:** Reduces overall monthly API calls by 30-40%.

## Summary

Combining **#1 (Regions)** and **#2 (Reduce Article Count)** is the recommended
path and will immediately cap the full-scale platform cost at around $30/month.
