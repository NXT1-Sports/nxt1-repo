/**
 * @fileoverview Team Game Plan API Factory
 * @module @nxt1/core/ai/team-game-plan.api
 *
 * 100% portable pure TypeScript API factory for Team Game Plans.
 * Works across web, mobile, and backend without framework dependencies.
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import type { HttpAdapter, HttpRequestConfig } from '../api/http-adapter.js';
import type {
  TeamGamePlanDoc,
  TeamGamePlanAdjustmentTrigger,
  TeamGamePlanPriority,
  TeamGamePlanSection,
  TeamGamePlanPlayReference,
} from '../models/team/team-gameplan.model.js';

// ============================================
// API RESPONSE TYPES
// ============================================

/**
 * Standard API response wrapper.
 */
interface ApiResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}

/**
 * Request type for creating a game plan
 */
export interface CreateTeamGamePlanRequest {
  readonly teamId: string;
  readonly sport: string;
  readonly title: string;
  readonly phase?: 'pregame' | 'in-game' | 'postgame' | 'scouting';
  readonly status?: 'draft' | 'active' | 'archived';
  readonly season?: string;
  readonly division?: string;
  readonly gameDate?: string;
  readonly opponentId?: string;
  readonly opponentName?: string;
  readonly ownTeamColor?: string;
  readonly opponentTeamColor?: string;
  readonly perspectiveTeam?: 'own' | 'opponent' | 'neutral';
  readonly identityFocus?: string;
  readonly primaryAttackPlan?: string;
  readonly defensivePriorities?: string;
  readonly specialSituations?: string;
  readonly openingScript?: readonly string[];
  readonly adjustmentTriggers?: readonly TeamGamePlanAdjustmentTrigger[];
  readonly halftimePriorities?: readonly TeamGamePlanPriority[];
  readonly customSections?: readonly TeamGamePlanSection[];
  readonly linkedPlays?: readonly TeamGamePlanPlayReference[];
  readonly tags?: readonly string[];
  readonly source?: string;
  readonly sourceUrl?: string;
}

/**
 * Response type for create operations
 */
export interface CreateTeamGamePlanResponse {
  readonly gamePlan: TeamGamePlanDoc;
  readonly message: string;
}

/**
 * Request type for updating a game plan
 */
export interface UpdateTeamGamePlanRequest {
  readonly gamePlanId: string;
  readonly title?: string;
  readonly status?: 'draft' | 'active' | 'archived';
  readonly phase?: 'pregame' | 'in-game' | 'postgame' | 'scouting';
  readonly gameDate?: string;
  readonly opponentName?: string;
  readonly opponentId?: string;
  readonly ownTeamColor?: string;
  readonly opponentTeamColor?: string;
  readonly identityFocus?: string;
  readonly primaryAttackPlan?: string;
  readonly defensivePriorities?: string;
  readonly specialSituations?: string;
  readonly openingScript?: readonly string[];
  readonly adjustmentTriggers?: readonly TeamGamePlanAdjustmentTrigger[];
  readonly halftimePriorities?: readonly TeamGamePlanPriority[];
  readonly customSections?: readonly TeamGamePlanSection[];
  readonly linkedPlays?: readonly TeamGamePlanPlayReference[];
  readonly tags?: readonly string[];
}

/**
 * Response type for update operations
 */
export interface UpdateTeamGamePlanResponse {
  readonly gamePlan: TeamGamePlanDoc;
  readonly message: string;
}

/**
 * Request type for fetching a single game plan
 */
export interface GetTeamGamePlanRequest {
  readonly gamePlanId: string;
}

/**
 * Response type for get operations
 */
export interface GetTeamGamePlanResponse {
  readonly gamePlan: TeamGamePlanDoc;
}

/**
 * Request type for listing game plans
 */
export interface ListTeamGamePlansRequest {
  readonly teamId?: string;
  readonly sport?: string;
  readonly status?: 'draft' | 'active' | 'archived';
  readonly phase?: 'pregame' | 'in-game' | 'postgame' | 'scouting';
  readonly opponentName?: string;
  readonly includeArchived?: boolean;
  readonly limit?: number;
}

/**
 * Response type for list operations
 */
export interface ListTeamGamePlansResponse {
  readonly gamePlans: readonly TeamGamePlanDoc[];
  readonly total: number;
}

/**
 * Request type for deleting a game plan
 */
export interface DeleteTeamGamePlanRequest {
  readonly gamePlanId: string;
  readonly reason?: string;
}

/**
 * Response type for delete operations
 */
export interface DeleteTeamGamePlanResponse {
  readonly message: string;
}

/**
 * Creates a portable API for Team Game Plans.
 * Intended to be used with HttpAdapter implementations across web, mobile, and backend.
 *
 * @param http HttpAdapter for making HTTP requests
 * @param baseUrl Base URL for the API endpoint (e.g., https://api.example.com)
 * @returns Object with methods for game plan CRUD operations
 *
 * @example
 * // Web (with Angular HttpClient)
 * const httpAdapter = {
 *   get: <T>(url: string) => firstValueFrom(this.http.get<T>(url)),
 *   post: <T>(url: string, body: unknown) => firstValueFrom(this.http.post<T>(url, body)),
 *   put: <T>(url: string, body: unknown) => firstValueFrom(this.http.put<T>(url, body)),
 *   delete: <T>(url: string) => firstValueFrom(this.http.delete<T>(url)),
 * };
 * const gamePlanApi = createTeamGamePlanApi(httpAdapter, environment.apiUrl);
 *
 * // Mobile (with Capacitor)
 * const httpAdapter = {
 *   get: async <T>(url: string) => (await CapacitorHttp.get({ url })).data as T,
 *   post: async <T>(url: string, data: unknown) => (await CapacitorHttp.post({ url, data: data as object })).data as T,
 *   put: async <T>(url: string, data: unknown) => (await CapacitorHttp.put({ url, data: data as object })).data as T,
 *   delete: async <T>(url: string) => (await CapacitorHttp.delete({ url })).data as T,
 * };
 * const gamePlanApi = createTeamGamePlanApi(httpAdapter, baseUrl);
 */
export function createTeamGamePlanApi(http: HttpAdapter, baseUrl: string) {
  const endpoint = `${baseUrl}/gameplans`;

  return {
    /**
     * Create a new team game plan
     */
    async createGamePlan(data: CreateTeamGamePlanRequest): Promise<TeamGamePlanDoc> {
      const response = await http.post<ApiResponse<CreateTeamGamePlanResponse>>(endpoint, data);
      if (!response.success || !response.data?.gamePlan) {
        throw new Error(response.error ?? 'Failed to create game plan');
      }
      return response.data.gamePlan;
    },

    /**
     * Fetch a single game plan by ID
     */
    async getGamePlan(id: string): Promise<TeamGamePlanDoc | null> {
      const response = await http.get<ApiResponse<GetTeamGamePlanResponse>>(`${endpoint}/${id}`);
      return response.success && response.data?.gamePlan ? response.data.gamePlan : null;
    },

    /**
     * List game plans with optional filtering
     */
    async listGamePlans(filters?: ListTeamGamePlansRequest): Promise<readonly TeamGamePlanDoc[]> {
      const queryParams = new URLSearchParams();
      if (filters?.teamId) queryParams.set('teamId', filters.teamId);
      if (filters?.sport) queryParams.set('sport', filters.sport);
      if (filters?.status) queryParams.set('status', filters.status);
      if (filters?.phase) queryParams.set('phase', filters.phase);
      if (filters?.opponentName) queryParams.set('opponentName', filters.opponentName);
      if (filters?.includeArchived) queryParams.set('includeArchived', 'true');
      if (filters?.limit) queryParams.set('limit', String(filters.limit));

      const url = queryParams.toString() ? `${endpoint}?${queryParams.toString()}` : endpoint;
      const response = await http.get<ApiResponse<ListTeamGamePlansResponse>>(url);
      if (!response.success) {
        throw new Error(response.error ?? 'Failed to list game plans');
      }
      return response.data?.gamePlans ?? [];
    },

    /**
     * Update an existing game plan (partial update)
     */
    async updateGamePlan(
      id: string,
      updates: Omit<UpdateTeamGamePlanRequest, 'gamePlanId'>
    ): Promise<TeamGamePlanDoc> {
      const response = await http.put<ApiResponse<UpdateTeamGamePlanResponse>>(
        `${endpoint}/${id}`,
        updates
      );
      if (!response.success || !response.data?.gamePlan) {
        throw new Error(response.error ?? 'Failed to update game plan');
      }
      return response.data.gamePlan;
    },

    /**
     * Delete (archive) a game plan by ID
     */
    async deleteGamePlan(id: string, reason?: string): Promise<void> {
      const config: HttpRequestConfig = {};
      if (reason) {
        config.params = { reason };
      }
      const response = await http.delete<ApiResponse<DeleteTeamGamePlanResponse>>(
        `${endpoint}/${id}`,
        config
      );
      if (!response.success) {
        throw new Error(response.error ?? 'Failed to delete game plan');
      }
    },
  } as const;
}

/**
 * Type alias for the returned API object
 */
export type TeamGamePlanApi = ReturnType<typeof createTeamGamePlanApi>;
