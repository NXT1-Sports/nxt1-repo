#!/usr/bin/env python3
"""Remove moved TS members from profile-shell-web.component.ts"""

F = 'packages/ui/src/profile/web/profile-shell-web.component.ts'
with open(F, 'r') as f:
    lines = f.readlines()

total = len(lines)
print(f'Total lines before: {total}')

# 1-indexed line ranges to REMOVE (inclusive on both ends)
# These are the TS members that were moved to child components
remove_ranges = [
    # Group A: typewriter fields (moved to Overview)
    (3797, 3801),

    # Group B: mobile hero computeds (moved to MobileHero)
    # mobileDisplayName through mobileRemainingBadgeCount
    # KEEP carouselOverlaySubtitle/Titles/Subtitles (line 4005+)
    (3859, 4003),

    # Group A: displayAgentXSummary + agentXSummaryTypewriterEffectRef
    (4063, 4104),

    # Group C: stats block (_activeStatCategoryIdx through toBarPercent)
    (4378, 4836),

    # Group A: startTypewriter + clearTypewriterTimer
    (4837, 4867),

    # Group E: onEditContact
    (5039, 5043),

    # Group D: formatEventMonth + formatEventDay
    (5056, 5063),

    # Group D: scheduleEvents + scheduleRows + scheduleTeamName
    (5108, 5169),

    # Group G: Awards block (awardsEmptyState through parseAwardYear)
    (5171, 5232),

    # Group D: schedule helpers (resolveMatchup through parseMatchupTeams)
    (5233, 5299),

    # Group G: traitCategoryLabel
    (5301, 5306),

    # Group G: playerHistoryAffiliations
    (5357, 5414),

    # Group G: historySeasonLabel + historyTeamRecord + parseRecordNumber
    (5426, 5461),

    # Group G: measurables verification block + lastSyncedLabel
    (5463, 5519),

    # Group F: verification banner block (VERIFICATION_PROVIDERS through onVerificationBannerLogoError + onSyncNow)
    (5519, 5689),

    # Group G: archetypeIconName + ensureAbsoluteUrl + providerHost + formatRelativeTime
    # KEEP normalizeTeamType (starts at 5744)
    (5692, 5742),

    # Group E: PLATFORM_META + connectedAccountsList
    # KEEP line 5824 (closing brace)
    (5769, 5823),
]

remove_set = set()
for start, end in remove_ranges:
    for i in range(start - 1, end):
        remove_set.add(i)

print(f'Lines to remove: {len(remove_set)}')

new_lines = []
for i, line in enumerate(lines):
    if i not in remove_set:
        new_lines.append(line)

print(f'Total lines after: {len(new_lines)}')

with open(F, 'w') as f:
    f.writelines(new_lines)

print('Done.')
