# Share Next Steps

## Priority 1 (This Week)

- Verify Firebase Analytics share events on real iOS and Android devices. ✅
- Deep linking setup:
  - Confirm production domain(s). ✅
  - Confirm iOS Team ID + bundle ID. ✅
  - Confirm Android package name + SHA-256 cert fingerprint(s). ✅
  - Add Apple App Site Association (AASA) and Android Asset Links files. ✅
  - Wire app link routing in mobile deep link service. ✅

## Priority 2 (Next Sprint)

- Add NxtShareButtonComponent to remaining share entry points (team, video,
  post, scout report, news).
- Validate SSR meta tags for all shareable content types using
  scripts/test-ssr.sh.

## Optional / Future

- Add BigQuery export and dashboards for share analytics.
- Add A/B test for share CTA.
