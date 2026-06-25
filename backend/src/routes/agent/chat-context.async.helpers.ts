import { Firestore } from 'firebase-admin/firestore';
import {
  AgentXSelectedContext,
  UNIVERSAL_FILES_COLLECTION,
  type TeamFilmReviewDoc,
} from '@nxt1/core';
import { buildFilmReviewSemanticText } from '../../services/team/universal-file-semantic.service.js';

type TeamFilmReviewTimelinePlay = NonNullable<TeamFilmReviewDoc['timeline']>[number];
type UniversalFileData = Record<string, unknown>;
type UniversalFileExpansionTarget = {
  readonly fileId: string;
  readonly label: string;
  readonly folderTitle: string | null;
};

const MAX_EXPANDED_TEAM_FILES = 8;

export async function expandSelectedContextsWithDatabase(
  db: Firestore,
  selectedContexts: readonly AgentXSelectedContext[]
): Promise<string> {
  if (!selectedContexts || selectedContexts.length === 0) {
    return '';
  }

  interface PlayRefWithContext {
    playIds: Set<string>;
    contexts: AgentXSelectedContext[];
  }

  const filmPlaysToFetch = new Map<string, PlayRefWithContext>();
  const teamFilesToExpand: UniversalFileExpansionTarget[] = [];
  const queuedTeamFileIds = new Set<string>();

  const queueTeamFileExpansion = (
    fileId: string | null | undefined,
    label: string | null | undefined,
    folderTitle: string | null = null
  ): void => {
    const normalizedFileId = fileId?.trim();
    if (!normalizedFileId || queuedTeamFileIds.has(normalizedFileId)) {
      return;
    }

    queuedTeamFileIds.add(normalizedFileId);
    teamFilesToExpand.push({
      fileId: normalizedFileId,
      label: label?.trim() || normalizedFileId,
      folderTitle: folderTitle?.trim() || null,
    });
  };

  for (const context of selectedContexts) {
    if (isFolderOrPlaylistContext(context)) {
      const folderTitle = context.title?.trim() || context.source?.label?.trim() || 'Folder';
      for (const fileId of resolveFolderFileIds(context)) {
        queueTeamFileExpansion(fileId, fileId, folderTitle);
      }
      continue;
    }

    if (context.source?.type === 'film_review' && context.source.id) {
      const reviewId = context.source.id;
      const playIds = resolveSelectedFilmPlayIds(context);

      if (playIds.length > 0) {
        let ref = filmPlaysToFetch.get(reviewId);
        if (!ref) {
          ref = { playIds: new Set<string>(), contexts: [] };
          filmPlaysToFetch.set(reviewId, ref);
        }

        ref.contexts.push(context);
        for (const playId of playIds) {
          ref.playIds.add(playId);
        }
        continue;
      }

      if (isFullFilmReviewContext(context)) {
        queueTeamFileExpansion(reviewId, context.title ?? context.source.label ?? reviewId);
        continue;
      }

      const fallbackPlayId = resolveFallbackFilmPlayId(context);
      if (context.kind === 'film_play' && fallbackPlayId) {
        let ref = filmPlaysToFetch.get(reviewId);
        if (!ref) {
          ref = { playIds: new Set<string>(), contexts: [] };
          filmPlaysToFetch.set(reviewId, ref);
        }

        ref.contexts.push(context);
        ref.playIds.add(fallbackPlayId);
        continue;
      }
    }

    for (const fileId of resolveDirectTeamFileIds(context)) {
      queueTeamFileExpansion(fileId, context.title ?? fileId);
    }
  }

  if (filmPlaysToFetch.size === 0 && teamFilesToExpand.length === 0) {
    return '';
  }

  let expandedContextStr = '';

  const filmPlayExpansion = await expandSelectedFilmPlayContexts(db, filmPlaysToFetch);
  if (filmPlayExpansion) {
    expandedContextStr += filmPlayExpansion;
  }

  const teamFileExpansion = await expandSelectedTeamFiles(db, teamFilesToExpand);
  if (teamFileExpansion) {
    expandedContextStr += teamFileExpansion;
  }

  return expandedContextStr;
}

async function expandSelectedFilmPlayContexts(
  db: Firestore,
  filmPlaysToFetch: ReadonlyMap<
    string,
    {
      playIds: Set<string>;
      contexts: AgentXSelectedContext[];
    }
  >
): Promise<string> {
  if (filmPlaysToFetch.size === 0) {
    return '';
  }

  let expandedContextStr = '\n\n[Expanded Breakdown Data for Selected Film Contexts]';
  let hasData = false;

  for (const [reviewId, ref] of filmPlaysToFetch.entries()) {
    try {
      const review = await fetchTeamFilmReview(db, reviewId);
      if (!review) {
        continue;
      }

      const matches: (TeamFilmReviewTimelinePlay & { sourceContext?: AgentXSelectedContext })[] =
        [];
      const playIdsNormalized = Array.from(ref.playIds, (id) => id.replace('play-', ''));

      for (const play of review.timeline ?? []) {
        if (!play.id || !playIdsNormalized.includes(play.id.replace('play-', ''))) {
          continue;
        }

        const sourceContext = ref.contexts.find((context) => {
          return (
            context.entityRefs?.some((entityRef) => entityRef.id === play.id) ??
            resolveFallbackFilmPlayId(context) === play.id
          );
        });

        matches.push({ ...play, sourceContext });
      }

      if (matches.length === 0) {
        continue;
      }

      hasData = true;
      const videoSource =
        ref.contexts[0]?.source?.label ?? ref.contexts[0]?.source?.type ?? 'Video';
      expandedContextStr += `\n\n**Film Review: ${review.title}** (from ${videoSource})`;
      expandedContextStr += `\n${matches.length} selected plays:`;
      expandedContextStr += '\n| # | Time Range | ODK | Down | Dist | Play Name | Result |';
      expandedContextStr += '\n|---|---|---|---|---|---|---|';

      matches.sort((left, right) => left.number - right.number);

      for (const play of matches) {
        const odk = play.tags?.['odk'] ?? play.tags?.['ODK'] ?? '-';
        const down = play.tags?.['down'] ?? play.tags?.['Down'] ?? '-';
        const dist = play.tags?.['distance'] ?? play.tags?.['Distance'] ?? '-';
        const playName = play.tags?.['play_name'] ?? play.tags?.['Play Name'] ?? play.label ?? '-';
        const result = play.tags?.['result'] ?? play.tags?.['Result'] ?? '-';

        let timeRange = '-';
        if (play.sourceContext?.timeRange) {
          const { startSec, endSec } = play.sourceContext.timeRange;
          timeRange = endSec ? `${startSec}s-${endSec}s` : `${startSec}s`;
        }

        expandedContextStr += `\n| ${play.number} | ${timeRange} | ${odk} | ${down} | ${dist} | ${playName} | ${result} |`;
      }
    } catch (error) {
      console.error('Failed to fetch film review', reviewId, error);
    }
  }

  return hasData ? expandedContextStr : '';
}

async function expandSelectedTeamFiles(
  db: Firestore,
  targets: readonly UniversalFileExpansionTarget[]
): Promise<string> {
  if (targets.length === 0) {
    return '';
  }

  const expandableTargets = targets.slice(0, MAX_EXPANDED_TEAM_FILES);
  let expandedContextStr = '\n\n[Expanded Team File Contexts]';
  let hasData = false;

  for (const [index, target] of expandableTargets.entries()) {
    try {
      const fileDoc = await db.collection(UNIVERSAL_FILES_COLLECTION).doc(target.fileId).get();
      if (!fileDoc.exists) {
        continue;
      }

      const fileData = fileDoc.data();
      if (!fileData) {
        continue;
      }

      const documentText = buildTeamFileContextText(target.fileId, fileData);
      if (!documentText) {
        continue;
      }

      hasData = true;
      const heading = target.folderTitle
        ? `${index + 1}. ${target.label} (from folder: ${target.folderTitle})`
        : `${index + 1}. ${target.label}`;
      expandedContextStr += `\n\n${heading}\n${documentText}`;
    } catch (error) {
      console.error('Failed to fetch team file', target.fileId, error);
    }
  }

  const omittedCount = targets.length - expandableTargets.length;
  if (hasData && omittedCount > 0) {
    expandedContextStr += `\n\n(${omittedCount} additional file context${omittedCount === 1 ? '' : 's'} omitted to keep the prompt concise.)`;
  }

  return hasData ? expandedContextStr : '';
}

async function fetchTeamFilmReview(
  db: Firestore,
  reviewId: string
): Promise<TeamFilmReviewDoc | null> {
  const fileDoc = await db.collection(UNIVERSAL_FILES_COLLECTION).doc(reviewId).get();
  if (!fileDoc.exists) {
    return null;
  }

  const fileData = fileDoc.data();
  if (!fileData) {
    return null;
  }

  return extractFilmReviewFromFileData(fileData);
}

function extractFilmReviewFromFileData(fileData: UniversalFileData): TeamFilmReviewDoc | null {
  const payload = fileData['payload'];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const filmReview = (payload as Record<string, unknown>)['filmReview'];
  if (!filmReview || typeof filmReview !== 'object' || Array.isArray(filmReview)) {
    return null;
  }

  return filmReview as TeamFilmReviewDoc;
}

function buildTeamFileContextText(fileId: string, fileData: UniversalFileData): string {
  const semanticText =
    typeof fileData['semanticText'] === 'string' ? fileData['semanticText'].trim() : '';
  if (semanticText) {
    return semanticText;
  }

  const filmReview = extractFilmReviewFromFileData(fileData);
  if (filmReview) {
    return buildFilmReviewSemanticText(filmReview);
  }

  const title =
    typeof fileData['title'] === 'string' && fileData['title'].trim().length > 0
      ? fileData['title'].trim()
      : fileId;
  const summary =
    typeof fileData['summary'] === 'string' && fileData['summary'].trim().length > 0
      ? fileData['summary'].trim()
      : null;
  const subtype = resolveFileSubtype(fileData);

  const lines = [`Title: ${title}`, `Subtype: ${subtype}`];
  if (summary) {
    lines.push(`Summary: ${summary}`);
  }

  return lines.join('\n');
}

function resolveFileSubtype(fileData: UniversalFileData): string {
  const classification = fileData['classification'];
  if (classification && typeof classification === 'object' && !Array.isArray(classification)) {
    const primary = (classification as Record<string, unknown>)['primary'];
    if (typeof primary === 'string' && primary.trim().length > 0) {
      return primary.trim();
    }
  }

  const payload = fileData['payload'];
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const kind = (payload as Record<string, unknown>)['kind'];
    if (typeof kind === 'string' && kind.trim().length > 0) {
      return kind.trim();
    }
  }

  const type = fileData['type'];
  return typeof type === 'string' && type.trim().length > 0 ? type.trim() : 'team_file';
}

function isFolderOrPlaylistContext(context: AgentXSelectedContext): boolean {
  return (
    context.metadata?.['itemType'] === 'team_file_folder' ||
    context.metadata?.['itemType'] === 'film_review_playlist' ||
    context.entityRefs?.some(
      (entityRef) => entityRef.type === 'team_file_folder' || entityRef.type === 'film_playlist'
    ) === true
  );
}

function isFullFilmReviewContext(context: AgentXSelectedContext): boolean {
  if (context.metadata?.['itemType'] === 'film_review') {
    return true;
  }

  const entityRefs = context.entityRefs ?? [];
  const hasFilmReviewRef = entityRefs.some((entityRef) => entityRef.type === 'film_review');
  const hasFilmPlayRef = entityRefs.some((entityRef) => entityRef.type === 'film_play');
  return hasFilmReviewRef && !hasFilmPlayRef;
}

function resolveSelectedFilmPlayIds(context: AgentXSelectedContext): string[] {
  const entityPlayIds =
    context.entityRefs
      ?.filter((entityRef) => entityRef.type === 'film_play' && typeof entityRef.id === 'string')
      .map((entityRef) => entityRef.id.trim())
      .filter((playId) => playId.length > 0) ?? [];

  if (entityPlayIds.length > 0) {
    return entityPlayIds;
  }

  const metadataId = context.metadata?.['id'];
  if (typeof metadataId === 'string' && metadataId.trim().length > 0) {
    return [metadataId.trim()];
  }

  return [];
}

function resolveFallbackFilmPlayId(context: AgentXSelectedContext): string | null {
  const metadataId = context.metadata?.['id'];
  if (typeof metadataId === 'string' && metadataId.trim().length > 0) {
    return metadataId.trim();
  }

  if (!context.id) {
    return null;
  }

  const parts = context.id.split(':');
  const fallbackId = parts[parts.length - 1]?.trim();
  return fallbackId && fallbackId.length > 0 ? fallbackId : null;
}

function resolveFolderFileIds(context: AgentXSelectedContext): string[] {
  const orderedIds: string[] = [];
  const seen = new Set<string>();

  const pushId = (value: string | null | undefined): void => {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    orderedIds.push(normalized);
  };

  const csv = context.metadata?.['fileIdsCsv'] ?? context.metadata?.['reviewIdsCsv'];
  if (typeof csv === 'string') {
    for (const value of csv.split(',')) {
      pushId(value);
    }
  }

  for (const entityRef of context.entityRefs ?? []) {
    if (entityRef.type === 'team_file' || entityRef.type === 'film_review') {
      pushId(entityRef.id);
    }
  }

  return orderedIds;
}

function resolveDirectTeamFileIds(context: AgentXSelectedContext): string[] {
  const orderedIds: string[] = [];
  const seen = new Set<string>();

  const pushId = (value: string | null | undefined): void => {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    orderedIds.push(normalized);
  };

  if (context.metadata?.['itemType'] === 'team_file' && context.source?.id) {
    pushId(context.source.id);
  }

  for (const entityRef of context.entityRefs ?? []) {
    if (entityRef.type === 'team_file') {
      pushId(entityRef.id);
    }
  }

  return orderedIds;
}
