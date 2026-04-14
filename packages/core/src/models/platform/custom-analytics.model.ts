export interface CustomAnalyticsEvent {
  readonly _id: string;
  readonly userId: string;
  readonly category:
    | 'recruiting'
    | 'nil'
    | 'performance'
    | 'academic'
    | 'scouting'
    | 'general'
    | string;
  readonly metric: string;
  readonly value: unknown;
  readonly tags: string[];
  readonly timestamp: string;
  readonly source: 'agent' | 'user' | 'system';
  readonly details?: Record<string, unknown>;
}
