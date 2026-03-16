# Firebase Analytics Integration — Remaining Tasks

> Last updated: March 15, 2026

---

## 1. Create Analytics Service Wrapper

- [ ] Create `apps/web/src/app/core/services/analytics.service.ts`
- [ ] Create `apps/mobile/src/app/core/services/analytics.service.ts`
- [ ] Provide as singleton, inject where needed

## 2. Add Page View Tracking

- [ ] Web: Add to router events subscription
- [ ] Mobile: Add to Ionic route changes

## 3. Track Key User Actions

| Feature      | Events to Track                                                           |
| ------------ | ------------------------------------------------------------------------- |
| Onboarding   | `onboarding_started`, `onboarding_step_completed`, `onboarding_completed` |
| Profile      | `profile_viewed`, `profile_edited`, `profile_shared`                      |
| Video        | `video_viewed`, `video_played`, `video_completed`, `video_uploaded`       |
| Subscription | `subscription_started`, `credits_purchased`                               |
| Search       | `search_performed`, `search_result_clicked`                               |
| Social       | `user_followed`, `comment_added`, `reaction_added`                        |

## 4. Firebase Console Setup

- [ ] Enable Google Analytics in Firebase Console
- [ ] Configure Data Streams (web, iOS, Android)
- [ ] Create custom audiences
- [ ] Set up conversion events
- [ ] Create dashboards for key metrics

## 5. Testing

- [ ] Events appear in Firebase DebugView
- [ ] User properties set correctly
- [ ] Page views tracking
- [ ] No PII in event parameters
- [ ] SSR doesn't throw errors
