import { normalizeBaseSportKey } from '@nxt1/core';
import type { Firestore } from 'firebase-admin/firestore';
import { BoardDiagramAssetService } from '../../integrations/board-diagram/services/board-diagram-asset.service.js';
import type { BoardDiagramAsset } from '../../integrations/board-diagram/shared/board-diagram.types.js';
import type {
  NormalizedSport,
  DiagramLayout,
} from '../../integrations/play-diagram/shared/diagram.types.js';

type SyncPlaybookDiagramAssetInput = {
  readonly db: Firestore;
  readonly userId: string;
  readonly sport: string;
  readonly title: string;
  readonly description?: string;
  readonly diagramUrl?: string | null;
  readonly diagramAssetId?: string | null;
};

type SyncPlaybookDiagramAssetResult = {
  readonly diagramUrl?: string;
  readonly diagramAssetId?: string;
};

function normalizeSport(sport: string): NormalizedSport {
  const normalized = (normalizeBaseSportKey(sport) ?? sport).trim().toLowerCase();
  if (normalized.includes('football')) return 'football';
  if (normalized.includes('basketball')) return 'basketball';
  if (normalized.includes('soccer')) return 'soccer';
  if (normalized.includes('baseball')) return 'baseball';
  if (normalized.includes('softball')) return 'softball';

  return 'football';
}

function buildPlaceholderLayout(sport: NormalizedSport, title: string): DiagramLayout {
  const fieldHeight = sport === 'basketball' ? 360 : 440;
  const fieldWidth = sport === 'basketball' ? 520 : 600;
  const losY =
    sport === 'basketball'
      ? 180
      : sport === 'soccer'
        ? 220
        : sport === 'baseball' || sport === 'softball'
          ? 240
          : 280;

  return {
    sport,
    title,
    fieldWidth,
    fieldHeight,
    losY,
    players: [],
    routes: [],
  };
}

async function resolveAssetById(
  assetService: BoardDiagramAssetService,
  input: SyncPlaybookDiagramAssetInput,
  trimmedAssetId: string
): Promise<BoardDiagramAsset> {
  const asset = await assetService.getById(trimmedAssetId, input.userId);
  if (!asset) {
    throw new Error(`Diagram asset ${trimmedAssetId} was not found for this user.`);
  }

  return asset;
}

export async function syncPlaybookDiagramAsset(
  input: SyncPlaybookDiagramAssetInput
): Promise<SyncPlaybookDiagramAssetResult> {
  const trimmedDiagramUrl = input.diagramUrl?.trim();
  const trimmedAssetId = input.diagramAssetId?.trim();

  if (!trimmedDiagramUrl && !trimmedAssetId) {
    return {};
  }

  const assetService = new BoardDiagramAssetService(input.db);

  if (trimmedAssetId) {
    const asset = await resolveAssetById(assetService, input, trimmedAssetId);
    return {
      diagramAssetId: asset.id,
      diagramUrl: asset.imageUrl,
    };
  }

  if (!trimmedDiagramUrl) {
    return {};
  }

  const existing = await assetService.findByImageUrl(input.userId, trimmedDiagramUrl);
  if (existing) {
    return {
      diagramAssetId: existing.id,
      diagramUrl: existing.imageUrl,
    };
  }

  const now = Date.now();
  const title = input.title.trim() || 'Play Diagram';
  const description = input.description?.trim() || `Imported playbook diagram for ${title}`;
  const sport = normalizeSport(input.sport);

  const created = await assetService.create({
    kind: 'sport_play',
    sport,
    title,
    description,
    imageUrl: trimmedDiagramUrl,
    assetSource: 'external_image',
    sourceLayout: buildPlaceholderLayout(sport, title),
    userId: input.userId,
    threadId: null,
    deleted: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return {
    diagramAssetId: created.id,
    diagramUrl: created.imageUrl,
  };
}
