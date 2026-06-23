import { Firestore } from 'firebase-admin/firestore';
import { AgentXSelectedContext } from '@nxt1/core';
import type { TeamFilmReviewDoc } from '@nxt1/core';

type TeamFilmReviewTimelinePlay = NonNullable<TeamFilmReviewDoc['timeline']>[number];

export async function expandSelectedContextsWithDatabase(
  db: Firestore,
  selectedContexts: readonly AgentXSelectedContext[]
): Promise<string> {
  if (!selectedContexts || selectedContexts.length === 0) {
    return '';
  }

  // Group context references by document, tracking video source info
  interface PlayRefWithContext {
    playIds: Set<string>;
    contexts: AgentXSelectedContext[];
  }
  const filmPlaysToFetch = new Map<string, PlayRefWithContext>(); // reviewId -> { playIds, contexts }

  for (const ctx of selectedContexts) {
    if (ctx.kind === 'film_play' && ctx.source?.type === 'film_review' && ctx.source?.id) {
      const reviewId = ctx.source.id;
      let ref = filmPlaysToFetch.get(reviewId);
      if (!ref) {
        ref = { playIds: new Set<string>(), contexts: [] };
        filmPlaysToFetch.set(reviewId, ref);
      }
      ref.contexts.push(ctx);

      // For bundle context
      if (ctx.entityRefs && ctx.entityRefs.length > 0) {
        for (const ref_ of ctx.entityRefs) {
          if (ref_.id) {
            ref.playIds.add(ref_.id);
          }
        }
      } else if (ctx.metadata && ctx.metadata['id']) {
        ref.playIds.add(String(ctx.metadata['id']));
      } else if (ctx.id) {
        // Remove play- prefix which might be present in the UI id vs the database
        ref.playIds.add(ctx.id.replace('play-', ''));
      }
    }
  }

  if (filmPlaysToFetch.size === 0) {
    return '';
  }

  let expandedContextStr = '\n\n[Expanded Breakdown Data for Selected Film Contexts]';
  let hasData = false;

  for (const [reviewId, ref] of filmPlaysToFetch.entries()) {
    try {
      const doc = await db.collection('TeamFilmReviews').doc(reviewId).get();
      if (doc.exists) {
        const review = doc.data() as TeamFilmReviewDoc;

        // Fetch the plays
        const matches: (TeamFilmReviewTimelinePlay & { sourceContext?: AgentXSelectedContext })[] =
          [];
        const playIdsArr = Array.from(ref.playIds);
        const playIdsNormalized = playIdsArr.map((id) => id.replace('play-', ''));

        const timeline = review.timeline ?? [];

        for (const play of timeline) {
          if (play.id && playIdsNormalized.includes(play.id.replace('play-', ''))) {
            // Find the context that selected this play for metadata
            const sourceContext = ref.contexts.find((ctx) => {
              if (ctx.entityRefs?.length) {
                return ctx.entityRefs.some((r) => r.id === play.id);
              }
              return false;
            });
            matches.push({ ...play, sourceContext });
          }
        }

        if (matches.length > 0) {
          hasData = true;

          // Include video source label if available
          const videoSource =
            ref.contexts[0]?.source?.label ?? ref.contexts[0]?.source?.type ?? 'Video';
          expandedContextStr += `\n\n**Film Review: ${review.title}** (from ${videoSource})`;
          expandedContextStr += `\n${matches.length} selected plays:`;
          expandedContextStr += '\n| # | Time Range | ODK | Down | Dist | Play Name | Result |';
          expandedContextStr += '\n|---|---|---|---|---|---|---|';

          // Sort chronologically
          matches.sort((a, b) => a.number - b.number);

          for (const play of matches) {
            const odk = play.tags?.['odk'] ?? play.tags?.['ODK'] ?? '-';
            const down = play.tags?.['down'] ?? play.tags?.['Down'] ?? '-';
            const dist = play.tags?.['distance'] ?? play.tags?.['Distance'] ?? '-';
            const playName =
              play.tags?.['play_name'] ?? play.tags?.['Play Name'] ?? play.label ?? '-';
            const result = play.tags?.['result'] ?? play.tags?.['Result'] ?? '-';

            // Include time range if available from context
            let timeRange = '-';
            if (play.sourceContext?.timeRange) {
              const { startSec, endSec } = play.sourceContext.timeRange;
              timeRange = endSec ? `${startSec}s-${endSec}s` : `${startSec}s`;
            }

            expandedContextStr += `\n| ${play.number} | ${timeRange} | ${odk} | ${down} | ${dist} | ${playName} | ${result} |`;
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch film review', reviewId, e);
    }
  }

  if (!hasData) {
    return '';
  }

  return expandedContextStr;
}
