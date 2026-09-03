import { Router, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';

const router = Router();

const CALLSHEET_REFERENCE_ASSET_CANDIDATES = [
  path.resolve(
    process.cwd(),
    'src/modules/agent/skills/assets/callsheet/maumelle-callsheet-reference.png'
  ),
  path.resolve(
    process.cwd(),
    'dist/modules/agent/skills/assets/callsheet/maumelle-callsheet-reference.png'
  ),
];

const MATCHUP_STARTERS_REFERENCE_ASSET_CANDIDATES = [
  path.resolve(
    process.cwd(),
    'src/modules/agent/skills/assets/football/matchup-starters-reference.png'
  ),
  path.resolve(
    process.cwd(),
    'dist/modules/agent/skills/assets/football/matchup-starters-reference.png'
  ),
];

function resolveCallsheetReferenceAsset(): string | null {
  return CALLSHEET_REFERENCE_ASSET_CANDIDATES.find((candidate) => existsSync(candidate)) ?? null;
}

function resolveMatchupStartersReferenceAsset(): string | null {
  return (
    MATCHUP_STARTERS_REFERENCE_ASSET_CANDIDATES.find((candidate) => existsSync(candidate)) ?? null
  );
}

router.get(
  '/reference-assets/callsheet/maumelle-callsheet-reference.png',
  (_req: Request, res: Response) => {
    const assetPath = resolveCallsheetReferenceAsset();
    if (!assetPath) {
      res.status(404).json({ success: false, error: 'Reference asset not found' });
      return;
    }

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.type('png');
    res.sendFile(assetPath);
  }
);

router.get(
  '/reference-assets/football/matchup-starters-reference.png',
  (_req: Request, res: Response) => {
    const assetPath = resolveMatchupStartersReferenceAsset();
    if (!assetPath) {
      res.status(404).json({ success: false, error: 'Reference asset not found' });
      return;
    }

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.type('png');
    res.sendFile(assetPath);
  }
);

export default router;
