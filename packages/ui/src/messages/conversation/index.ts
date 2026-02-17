/**
 * @fileoverview Conversation Module — Barrel Export
 * @module @nxt1/ui/messages/conversation
 * @version 1.0.0
 *
 * PLATFORM-SPECIFIC COMPONENTS:
 * - Mobile (Ionic): ConversationShellComponent
 * - Web (Zero Ionic): ConversationShellWebComponent
 * - Shared: ConversationHeaderComponent, MessageBubbleComponent, MessageInputComponent, ConversationService
 */

// ============================================
// MOBILE — Ionic-based shell
// ============================================
export { ConversationShellComponent } from './conversation-shell.component';

// ============================================
// WEB — Zero Ionic, SSR-optimized shell
// ============================================
export { ConversationShellWebComponent } from './conversation-shell-web.component';

// ============================================
// SHARED — Works on both platforms
// ============================================
export { ConversationHeaderComponent } from './conversation-header.component';
export { MessageBubbleComponent } from './message-bubble.component';
export { MessageInputComponent } from './message-input.component';
export { ConversationService } from './conversation.service';
