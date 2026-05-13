/**
 * Injection token for team media upload.
 *
 * The manage-team-shell lives in packages/ui (shared, no app layer access),
 * so actual upload logic is provided by each app via this token. The existing
 * token name is kept for API compatibility, but the shell uses it for both the
 * organization logo slot and the team image gallery.
 *
 * Usage in providers:
 * ```ts
 * { provide: TEAM_LOGO_UPLOADER, useFactory: () => (teamId, file) => uploadService.uploadTeamLogo(teamId, file) }
 * ```
 */
import { InjectionToken } from '@angular/core';

/**
 * Function that uploads a team logo or gallery image file and returns the public URL,
 * or null if the upload fails.
 */
export type TeamLogoUploader = (teamId: string, file: File) => Promise<string | null>;

export const TEAM_LOGO_UPLOADER = new InjectionToken<TeamLogoUploader>('TEAM_LOGO_UPLOADER');
