## Plan: Firecrawl JS Video Extraction

TL;DR - Extract protected video streams (like Hudl .m3u8 / .mp4) by injecting a
robust JavaScript network listener into an authenticated Firecrawl browser
session, bypassing the need for manual downloads or backend Playwright
instances.

**Steps**

1. **Extend Firecrawl API Service**
   - Add a method to `FirecrawlProfileService` (or create a dedicated
     `VideoExtractionService`) that takes a `videoUrl` and an `authProfileName`
     (e.g., the user's Hudl profile).
   - This method will start a Firecrawl `browser` session using the requested
     profile (so it starts fully authenticated).
2. **Inject Network Interceptor** (_depends on 1_)
   - Use `client.browserExecute` with `language: 'javascript'` to navigate to
     the video URL and inject our listener.
   - The script must use `performance.getEntriesByType('resource')` to check for
     already-loaded media (fast paths) AND override `window.fetch` /
     `XMLHttpRequest` to capture `.m3u8`, `.mpd`, or `.mp4` requests dynamically
     loaded after page load.
3. **Player Interaction Script** (_parallel with 2_)
   - Automatically click `.play-button` or `<video>` elements using generic or
     platform-specific selectors (like Hudl's play overlay) to ensure the
     manifest file is requested by the page.
   - Set a deliberate timeout (e.g., 20 seconds) in the script to wait for the
     stream URL, returning it once captured.
4. **Agent X Tool Integration** (_depends on 3_)
   - Create a new backend agent tool (e.g.,
     `extract_authenticated_video_stream`) in `packages/core/src/ai/tools` and
     the backend execution layer.
   - The tool maps the extracted raw media URL directly into your Video Analysis
     pipeline/subagent.
5. **Session Cleanup**
   - Ensure the Firecrawl browser session is terminated (`deleteBrowser`) via
     explicit `finally` blocks to prevent zombie sessions and billing bloat.

**Relevant files**

- `backend/src/modules/agent/tools/scraping/firecrawl-profile.service.ts` — Add
  `extractVideoSource(url, profileName)` method holding the Firecrawl headless
  orchestration.
- `backend/src/modules/agent/tools/scraping/video-extraction-script.ts` (New) —
  Cleanly separate the complex injected JS payload (the fetch/resource listener)
  from the service logic.
- `backend/src/modules/agent/agents/performance-coordinator.agent.ts` — Update
  prompt/instructions to use the new extraction tool specifically for signed-in
  video links (Hudl).

**Verification**

1. Execute a mock unit test or backend script that requests a known private Hudl
   video URL using a valid Firecrawl profile.
2. Validate the JS payload successfully intercepts a valid `https://...m3u8` or
   `mp4` response string instead of an empty or Blob URL.
3. Check Firecrawl dashboard to verify session length is minimized and properly
   closed upon early URL detection.

**Decisions**

- **JavaScript execution over Playwright:** Keeps backend lightweight and relies
  entirely on Firecrawl infrastructure as per Approach 1.
- **Resource polling + Fetch overriding:** Necessary due to some SPA
  architectures prefetching video manifests vs fetching on demand.
- **Scope limitation:** This relies on the target video platform utilizing
  standard XHR/fetch streaming standards (HLS/DASH) rather than custom
  obfuscated websockets, which covers 99% of targets including Hudl.

**Further Considerations**

1. Do you want to standardize video player Play/Interaction selectors for
   specific sites (e.g., pass `{ platform: 'hudl' }` to use Hudl-specific play
   button selectors)?
2. If the user doesn't have an active Firecrawl profile for the requesting site,
   we must gracefully ask them to authenticate via Live View first.
