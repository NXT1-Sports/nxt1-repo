/**
 * Injection token for team logo upload.
 *
 * The manage-team-shell lives in packages/ui (shared, no app layer access),
 * so actual upload logic is provided by each app via this token.
 *
 * Usage in providers:
 * ```ts
 * { provide: TEAM_LOGO_UPLOADER, useFactory: () => (teamId, file) => uploadService.uploadTeamLogo(teamId, file) }
 * ```
 */
import { InjectionToken } from '@angular/core';

/**
 * Function that uploads a team logo file and returns the public URL,
 * or null if the upload fails.
 */
export type TeamLogoUploader = (teamId: string, file: File) => Promise<string | null>;

export const TEAM_LOGO_UPLOADER = new InjectionToken<TeamLogoUploader>('TEAM_LOGO_UPLOADER');
