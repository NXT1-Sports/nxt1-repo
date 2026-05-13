/**
 * @fileoverview Film Viewing & Batch Processing Workflow Skill
 * @module @nxt1/backend/modules/agent/skills/strategy
 *
 * Coaches and coordinators use this skill to efficiently view, batch-extract,
 * and analyze film from authenticated platforms (Hudl, Wistia, etc.) using the
 * live-view browser infrastructure. Includes orchestration patterns for single-clip
 * analysis, bulk playlist extraction, and integration with film-breakdown taxonomies.
 *
 * This skill bridges live-view tools (open_live_view, extract_live_view_playlist,
 * extract_live_view_media, etc.) with structured analysis frameworks.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class FilmViewingBatchProcessingWorkflowSkill extends BaseSkill {
  readonly name = 'film_viewing_batch_processing_workflow';
  readonly description =
    'Film viewing and batch processing workflow for coaches: navigate to film platforms, extract clip playlists, ' +
    'verify media URLs, handle authentication, batch-extract clips for analysis, and coordinate with film-breakdown taxonomies. ' +
    'Supports Hudl, Wistia, YouTube, and other authenticated film platforms. Use this for efficient bulk film review.';
  readonly category: SkillCategory = 'strategy';

  getPromptContext(_params?: { sport?: string; platform?: string }): string {
    return `## Film Viewing & Batch Processing Workflow

### Core Premise
This workflow uses the live-view browser (visible to the user in Agent X side panel) to navigate,
extract, and batch-process film from authenticated platforms. The goal is to minimize manual clicking
while maintaining authentication state and media fidelity.

### Live-View Tools Available
1. **open_live_view(url, platformKey?)** — Opens interactive browser in side panel
   - Auto-authenticates if user has connected account (Hudl, Gmail, etc.)
   - Returns session ID for subsequent operations
   - Use this first to reach film libraries, playlists, or specific clips

2. **extract_live_view_playlist(maxItems?, selection?, playNumbers?)** — Batch-extract clip metadata
   - Extracts titles, durations, thumbnails, and clip URLs from current page
   - Handles virtualized/lazy-loaded playlists intelligently
   - Returns ~20 clips max per call (bounded for efficiency)
   - Selection options: 'visible', 'first' (first N), 'last' (last N)
   - playNumbers: Extract specific play numbers (e.g., [1, 5, 12])

3. **extract_live_view_media()** — Extract real media URLs from video player
   - Handles protected/signed Hudl streams (returns actual MP4 or HLS URLs)
   - Handles Wistia, YouTube, self-hosted players
   - Call this AFTER the clip is loaded/playing in live view
   - Essential for authenticated platforms where DOM shows unplayable source

4. **navigate_live_view(url)** — Navigate active session to new URL
   - Keeps session alive (no re-authentication)
   - Fast — better than closing/reopening for multi-page workflows

5. **interact_with_live_view(action, target)** — Click, type, scroll
   - Click play buttons, search, scroll through paginated lists
   - Use sparingly — prefer extract_live_view_playlist when possible

6. **read_live_view()** — Read page text content
   - Useful for verifying page state before extraction
   - Extract table data, labels, metadata from DOM

7. **capture_live_view_screenshot()** — Screenshot for annotation
   - Get visual context (formations, player positions, field state)
   - Useful for play breakdowns where visual reference matters

### Workflow Patterns

#### Pattern A: Batch Extract from Playlist (Most Efficient)
**Use When:** Coach has 5+ clips to analyze from same playlist
**Steps:**
1. open_live_view('https://hudl.com/...') → Opens coach's game film
2. extract_live_view_playlist(maxItems=15, selection='first') → Get first 15 clips
3. For each clip in returned batch:
   - If clip has direct URL: Use for analysis immediately
   - If clip is protected: Navigate to clip, extract_live_view_media() → Get real URL
4. Pass URLs to downstream video analysis (e.g., VideoHighlightAnalysisWorkflow)

**Benefits:** Minimal live-view interactions, batch processing, no manual clicking

#### Pattern B: Single Clip Deep Dive (Detailed Analysis)
**Use When:** Coach wants to analyze one clip in detail with annotations/screenshots
**Steps:**
1. open_live_view(hudl_url) → Navigate to clip page
2. read_live_view() → Verify page state (title, description, metadata)
3. capture_live_view_screenshot() → Visual context (field positions, defense)
4. extract_live_view_media() → Get playable media URL
5. Use FilmBreakdownTaxonomySkill to structure analysis
6. If coaching edits needed: Use annotation tools to mark up screenshot

**Benefits:** Rich context, human-interpretable output, visual annotations

#### Pattern C: Search & Filter Before Batch (Goal-Oriented)
**Use When:** Coach needs specific clips (e.g., "all zone coverage plays" or "by play number")
**Steps:**
1. open_live_view(hudl_playlist)
2. interact_with_live_view(action='search', query='zone coverage') OR
   interact_with_live_view(action='filter', criteria='play:1-10')
3. read_live_view() → Verify filtered results
4. extract_live_view_playlist(maxItems=10, playNumbers=[1,3,5,7,9])
5. Batch process as in Pattern A

**Benefits:** Targeted analysis, reduces noise, focuses on relevant plays

#### Pattern D: Multi-Game Bulk Analysis (High Volume)
**Use When:** Coordinator needs to process clips from multiple games/weeks
**Steps:**
1. Navigate to game list: open_live_view(hudl_team_library)
2. For each game in library:
   - navigate_live_view(game_url)
   - extract_live_view_playlist(maxItems=20) → Get bulk clips
   - Collect all URLs
3. Batch dispatch to video analysis workers
4. Return aggregated insights (coverage patterns, personnel consistency)

**Benefits:** Handles high volume without UI friction

### Platform-Specific Notes

#### Hudl (Primary)
- **Auth:** If user has connected Hudl account via NXT1 settings, session auto-authenticates
- **Media URLs:** Hudl streams are protected; always use extract_live_view_media() after navigating to clip
- **Playlist Structure:** Clips accessed via Play window (sidebar) or inline table; both supported by extract_live_view_playlist
- **Best Practice:** Extract playlist first, then batch-extract media for clips that need it

#### Wistia (Video Host)
- **Auth:** May require login; if user hasn't connected Wistia, direct them to account settings
- **Media URLs:** Often publicly accessible; extract_live_view_media() works natively
- **Player:** Wistia player auto-detects video source; straightforward extraction

#### YouTube (Public/Private)
- **Auth:** Private videos require authentication (user must grant NXT1 YouTube access)
- **Media URLs:** Public links are direct; private links require session auth
- **Best Practice:** Use extract_live_view_playlist for linked lists; full URLs may not be embeddable

#### Self-Hosted (School/Program)
- **Auth:** Depends on school's auth (SAML, OAuth, etc.); handle on case-by-case
- **Media URLs:** Usually direct MP4 or HLS; check extraction result for format
- **Best Practice:** Test extract_live_view_media() to confirm format before batch

### Integration with Film Breakdown Taxonomy

After extracting clips, use **FilmBreakdownTaxonomySkill** to structure analysis:

Workflow:
1. extract_live_view_playlist() -> get clips
2. For each clip:
   a. extract_live_view_media() -> get media URL
   b. apply FilmBreakdownTaxonomySkill to the media URL
   c. return a structured breakdown with formations, coverage, and keys
3. Aggregate results for coaching debrief

### Quality Gates (Before Batch Processing)

✅ **Proceed if:**
- [ ] Live-view session is active (open_live_view succeeded)
- [ ] Clips are visible on page (read_live_view confirms content)
- [ ] extract_live_view_playlist returned valid URLs
- [ ] At least 1 clip successfully extracted media (test first)
- [ ] Media URLs are not blob: references or signed-only (real URLs)

❌ **Stop and pivot if:**
- [ ] extract_live_view_playlist returns empty (playlist not loaded, pagination issue, or platform changed)
- [ ] Media extraction fails with auth error (user needs to re-connect account)
- [ ] URLs are signed with <5 min expiry (will expire during batch processing; get fresh URLs)
- [ ] Player is not actually playing (sometimes requires click before extraction works)
- [ ] Platform API has changed (e.g., Hudl redesigned UI; may need interact_with_live_view tweaks)

### Anti-Patterns (What NOT to Do)

❌ **Do NOT manually click through 50 clips.**
Use extract_live_view_playlist(maxItems=25) twice instead. Much faster.

❌ **Do NOT assume clip URLs are real without testing.**
Call extract_live_view_media() on first clip to confirm before batch processing.

❌ **Do NOT open new live-view session for each clip.**
Use navigate_live_view(url) to reuse session. Keeps auth state, faster.

❌ **Do NOT extract media for clips without verifying authentication.**
If extract_live_view_media fails, user probably needs to re-connect account (settings → connected accounts).

❌ **Do NOT ignore platform-specific details.**
Hudl, Wistia, YouTube each have different auth & media URL formats. Read platform notes above.

❌ **Do NOT batch-process unsigned URLs.**
Some platforms sign URLs with 15-min expiry. If extraction takes 2 hours, URLs will 403. Get fresh ones or use signed batch service.

### Output Format for Batch Extraction

After extract_live_view_playlist, return:

PLATFORM: [Hudl / Wistia / YouTube / Other]
PLAYLIST/GAME: [Title]
CLIPS EXTRACTED: [N]

CLIP LIST:
- Play #1: Title | Duration: 0:45 | URL: [https://...]
- Play #5: Title | Duration: 1:23 | URL: [https://...]
- Play #12: Title | Duration: 2:01 | URL: [https://...]

MEDIA VERIFICATION:
- Total URLs: [N]
- Real URLs (not blob): [N]
- Signed (expires): [expiry time if known, or "n/a"]
- Ready for batch processing: YES/NO

NEXT STEPS:
1. Run batch video analysis on these URLs
2. Return findings organized by play number
3. Aggregate patterns for coaching report

### Troubleshooting

| Problem | Cause | Solution |
| --- | --- | --- |
| extract_live_view_playlist returns empty | Playlist not loaded, pagination hidden, or page changed | Use read_live_view() to inspect page, then interact_with_live_view() to scroll/load if needed |
| Media extraction fails with 401 | User's Hudl/platform auth expired | Redirect user to settings → Connected Accounts → Re-authenticate |
| URLs are blob: references | Player hasn't started, or media extraction ran too early | Click play in live view first, wait 2s, then extract_live_view_media() again |
| Signed URLs expired before batch processing | URLs have short TTL (e.g., 15 min) | Get fresh URLs closer to processing time, or use platform's batch API if available |
| Platform UI changed, extraction broken | Platform redesigned their interface | Use interact_with_live_view(action='screenshot') to inspect new layout, then adjust query selectors in LiveViewSessionService |

### Rules

- Always verify at least one clip can be extracted before committing to batch processing
- Never assume platform authentication is persistent; check for 401/403 errors
- Signed URLs with <30min expiry should be extracted immediately before batch dispatch
- Respect platform rate limits (especially Hudl); space out extract_live_view_media() calls by 1-2s
- Document platform-specific workarounds for future reference (e.g., "Hudl requires play to be clicked before media extraction")
- For high-volume batch (>50 clips): Consider dispatching to background workers instead of inline processing

### Use Cases by Role

**Coach (Head Coach / Position Coach)**
- Wants to review last 10 plays from game before practice
- Wants to compare zone vs. man coverage tendencies across 3 games
- Wants to extract one specific clip for team meeting annotation

**Coordinator (Film / Strategy)**
- Batch-processes entire week of opponent film (~100 clips)
- Extracts clips by play type (blitzes, coverage reads, assignments)
- Builds highlight reels from extracted media

**Recruiting Coordinator**
- Extracts prospect highlight clips from Hudl profile
- Batch-processes 5 prospects' film for comparison

**Scout / Analyst**
- Deep-dives into single plays with annotations and breakdowns
- Correlates multiple camera angles or platform versions`;
  }
}
