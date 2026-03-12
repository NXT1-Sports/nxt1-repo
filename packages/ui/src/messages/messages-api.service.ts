/**
 * @fileoverview Messages API Service — Angular HTTP Adapter
 * @module @nxt1/ui/messages
 * @version 1.0.0
 *
 * Angular HTTP adapter for Messages API.
 * Wraps the pure TypeScript API factory with Angular's HttpClient.
 */

import { Injectable, InjectionToken, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  createMessagesApi,
  type MessagesApi,
  type MessagesFilterId,
  type ConversationsResponse,
  type MessagesThreadResponse,
  type SendMessageRequest,
  type CreateConversationRequest,
  type Conversation,
  type Message,
} from '@nxt1/core';

/**
 * Injection token for API base URL.
 * Apps should provide this in their config:
 *
 * ```typescript
 * { provide: MESSAGES_API_BASE_URL, useValue: environment.apiUrl }
 * ```
 */
export const MESSAGES_API_BASE_URL = new InjectionToken<string>('MESSAGES_API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api/v1',
});

/**
 * Messages API Service.
 * Angular adapter for the pure TypeScript Messages API.
 */
@Injectable({ providedIn: 'root' })
export class MessagesApiService implements MessagesApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(MESSAGES_API_BASE_URL);

  private readonly api = createMessagesApi(
    {
      get: <T>(url: string) => firstValueFrom(this.http.get<T>(url)),
      post: <T>(url: string, body: unknown) => firstValueFrom(this.http.post<T>(url, body)),
      put: <T>(url: string, body: unknown) => firstValueFrom(this.http.put<T>(url, body)),
      patch: <T>(url: string, body: unknown) => firstValueFrom(this.http.patch<T>(url, body)),
      delete: <T>(url: string) => firstValueFrom(this.http.delete<T>(url)),
    },
    this.baseUrl
  );

  // ============================================
  // DELEGATE TO PURE API
  // ============================================

  getConversations(
    filter?: MessagesFilterId,
    page?: number,
    query?: string
  ): Promise<ConversationsResponse> {
    return this.api.getConversations(filter, page, query);
  }

  getThread(conversationId: string, page?: number): Promise<MessagesThreadResponse> {
    return this.api.getThread(conversationId, page);
  }

  sendMessage(request: SendMessageRequest): Promise<Message> {
    return this.api.sendMessage(request);
  }

  createConversation(request: CreateConversationRequest): Promise<Conversation> {
    return this.api.createConversation(request);
  }

  markAsRead(conversationId: string): Promise<void> {
    return this.api.markAsRead(conversationId);
  }

  archiveConversation(conversationId: string): Promise<void> {
    return this.api.archiveConversation(conversationId);
  }

  toggleMute(conversationId: string, muted: boolean): Promise<void> {
    return this.api.toggleMute(conversationId, muted);
  }

  togglePin(conversationId: string, pinned: boolean): Promise<void> {
    return this.api.togglePin(conversationId, pinned);
  }

  deleteConversation(conversationId: string): Promise<void> {
    return this.api.deleteConversation(conversationId);
  }

  getUnreadCount(): Promise<number> {
    return this.api.getUnreadCount();
  }
}
