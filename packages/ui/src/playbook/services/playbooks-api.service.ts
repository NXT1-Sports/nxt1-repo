/**
 * @fileoverview Playbooks API Service (Angular Adapter)
 * @module nxt1-ui/playbooks
 *
 * Angular service that adapts the portable playbook.api factory for web use.
 * Implements full observability with logging, analytics, breadcrumbs, and performance tracing.
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  createPlaybookApi,
  type PlaybookApi,
  type PlayItem,
  type CreatePlayRequest,
  type UpdatePlayRequest,
} from '@nxt1/core/ai';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { TRACE_NAMES } from '@nxt1/core/performance';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { PERFORMANCE_ADAPTER } from '../../services/performance';

/**
 * Angular service adapter for Team Playbooks and Plays.
 * Provides full CRUD operations with complete observability instrumentation.
 *
 * @example
 * ```typescript
 * @Component({...})
 * export class PlaybooksComponent {
 *   private readonly playbooksApi = inject(PlaybooksApiService);
 *
 *   async createPlay(playbookId: string, playData: CreatePlayRequest): Promise<void> {
 *     try {
 *       const play = await this.playbooksApi.createPlay(playbookId, playData);
 *       // Handle success
 *     } catch (err) {
 *       // Handle error
 *     }
 *   }
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class PlaybooksApiService implements PlaybookApi {
  private readonly http = inject(HttpClient);
  private readonly logger = inject(NxtLoggingService).child('PlaybooksApiService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly performance = inject(PERFORMANCE_ADAPTER, { optional: true });

  /**
   * Internal portable API factory
   */
  private readonly api = createPlaybookApi(
    {
      get: <T>(url: string) => firstValueFrom(this.http.get<T>(url)),
      post: <T>(url: string, body: unknown) => firstValueFrom(this.http.post<T>(url, body)),
      put: <T>(url: string, body: unknown) => firstValueFrom(this.http.put<T>(url, body)),
      patch: <T>(url: string, body: unknown) => firstValueFrom(this.http.patch<T>(url, body)),
      delete: <T>(url: string) => firstValueFrom(this.http.delete<T>(url)),
    },
    '/api/v1'
  );

  /**
   * Create a new play in a playbook with full observability
   * POST /playbooks/:playbookId/plays
   *
   * @param playbookId The playbook ID
   * @param playData The play creation request data
   * @returns Created play item
   * @throws Error if creation fails
   */
  async createPlay(playbookId: string, playData: CreatePlayRequest): Promise<PlayItem> {
    if (this.performance) {
      return this.performance.trace(
        TRACE_NAMES.PLAYBOOK_PLAY_CREATE,
        () => this.createPlayImpl(playbookId, playData),
        {
          attributes: {
            playbook_id: playbookId,
            play_name: playData.name,
            install_stage: playData.installStage ?? 'install',
          },
          onSuccess: async (play) => {
            this.logger.info('Play created', {
              playbookId,
              playName: play.name,
              pointsCount: play.coachingPoints?.length ?? 0,
            });
          },
        }
      );
    }
    return this.createPlayImpl(playbookId, playData);
  }

  /**
   * Update an existing play in a playbook
   * PATCH /playbooks/:playbookId/plays/:playIndex
   *
   * @param playbookId The playbook ID
   * @param playIndex The play index in the array
   * @param playData The play update request data
   * @returns Updated play item
   * @throws Error if update fails
   */
  async updatePlay(
    playbookId: string,
    playIndex: number,
    playData: UpdatePlayRequest
  ): Promise<PlayItem> {
    return (
      this.performance?.trace(
        TRACE_NAMES.PLAYBOOK_PLAY_UPDATE,
        () => this.updatePlayImpl(playbookId, playIndex, playData),
        {
          attributes: {
            playbook_id: playbookId,
            play_index: String(playIndex),
            updated_fields: Object.keys(playData).join(','),
          },
        }
      ) ?? (await this.updatePlayImpl(playbookId, playIndex, playData))
    );
  }

  /**
   * Delete a play from a playbook
   * DELETE /playbooks/:playbookId/plays/:playIndex
   *
   * @param playbookId The playbook ID
   * @param playIndex The play index in the array
   * @throws Error if deletion fails
   */
  async deletePlay(playbookId: string, playIndex: number): Promise<void> {
    return (
      this.performance?.trace(
        TRACE_NAMES.PLAYBOOK_PLAY_DELETE,
        () => this.deletePlayImpl(playbookId, playIndex),
        {
          attributes: {
            playbook_id: playbookId,
            play_index: String(playIndex),
          },
        }
      ) ?? (await this.deletePlayImpl(playbookId, playIndex))
    );
  }

  /**
   * Internal implementation of play creation with logging and breadcrumbs
   */
  private async createPlayImpl(playbookId: string, playData: CreatePlayRequest): Promise<PlayItem> {
    this.logger.info('Creating play', { playbookId, playName: playData.name });
    void this.breadcrumb.trackStateChange('playbook_plays', { state: 'creating' });

    try {
      const play = await this.api.createPlay(playbookId, playData);

      this.logger.info('Play created successfully', {
        playbookId,
        playName: play.name,
      });

      void this.breadcrumb.trackStateChange('playbook_plays', { state: 'created' });

      this.analytics?.trackEvent(APP_EVENTS.PLAY_CREATED, {
        playbook_id: playbookId,
        play_name: play.name,
        has_formation: !!play.formation,
        has_personnel: !!play.personnel,
        install_stage: play.installStage ?? 'install',
        coaching_points_count: (play.coachingPoints ?? []).length,
      });

      return play;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create play';
      this.logger.error('Failed to create play', err, { playbookId, playName: playData.name });

      void this.breadcrumb.trackStateChange('playbook_plays', { state: 'error' });

      this.analytics?.trackEvent(APP_EVENTS.ERROR_OCCURRED, {
        feature: 'playbook_play_create',
        error_message: message,
        playbook_id: playbookId,
      });

      throw err;
    }
  }

  /**
   * Internal implementation of play update with logging and breadcrumbs
   */
  private async updatePlayImpl(
    playbookId: string,
    playIndex: number,
    playData: UpdatePlayRequest
  ): Promise<PlayItem> {
    this.logger.info('Updating play', {
      playbookId,
      playIndex,
      updatedFields: Object.keys(playData),
    });
    void this.breadcrumb.trackStateChange('playbook_plays', { state: 'updating' });

    try {
      const play = await this.api.updatePlay(playbookId, playIndex, playData);

      this.logger.info('Play updated successfully', {
        playbookId,
        playIndex,
        playName: play.name,
      });

      void this.breadcrumb.trackStateChange('playbook_plays', { state: 'updated' });

      this.analytics?.trackEvent(APP_EVENTS.PLAY_UPDATED, {
        playbook_id: playbookId,
        play_index: playIndex,
        play_name: play.name,
        updated_fields: Object.keys(playData).join(','),
      });

      return play;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update play';
      this.logger.error('Failed to update play', err, { playbookId, playIndex });

      void this.breadcrumb.trackStateChange('playbook_plays', { state: 'error' });

      this.analytics?.trackEvent(APP_EVENTS.ERROR_OCCURRED, {
        feature: 'playbook_play_update',
        error_message: message,
        playbook_id: playbookId,
        play_index: playIndex,
      });

      throw err;
    }
  }

  /**
   * Internal implementation of play deletion with logging and breadcrumbs
   */
  private async deletePlayImpl(playbookId: string, playIndex: number): Promise<void> {
    this.logger.info('Deleting play', { playbookId, playIndex });
    void this.breadcrumb.trackStateChange('playbook_plays', { state: 'deleting' });

    try {
      await this.api.deletePlay(playbookId, playIndex);

      this.logger.info('Play deleted successfully', { playbookId, playIndex });

      void this.breadcrumb.trackStateChange('playbook_plays', { state: 'deleted' });

      this.analytics?.trackEvent(APP_EVENTS.PLAY_DELETED, {
        playbook_id: playbookId,
        play_index: playIndex,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete play';
      this.logger.error('Failed to delete play', err, { playbookId, playIndex });

      void this.breadcrumb.trackStateChange('playbook_plays', { state: 'error' });

      this.analytics?.trackEvent(APP_EVENTS.ERROR_OCCURRED, {
        feature: 'playbook_play_delete',
        error_message: message,
        playbook_id: playbookId,
        play_index: playIndex,
      });

      throw err;
    }
  }
}
