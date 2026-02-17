/**
 * @fileoverview Messages Module — Barrel Export
 * @module @nxt1/ui/messages
 * @version 2.0.0
 *
 * PLATFORM-SPECIFIC COMPONENTS:
 * - Mobile (Ionic): MessagesShellComponent, ConversationShellComponent
 * - Web (Zero Ionic): MessagesShellWebComponent, ConversationShellWebComponent
 * - Shared: MessagesListComponent, MessagesItemComponent, MessagesSkeletonComponent, MessagesService
 * - Shared: ConversationHeaderComponent, MessageBubbleComponent, MessageInputComponent, ConversationService
 */

// ============================================
// MOBILE — Ionic-based components
// ============================================
export { MessagesShellComponent, type MessagesUser } from './messages-shell.component';

// ============================================
// WEB — Zero Ionic, SSR-optimized
// ============================================
export { MessagesShellWebComponent } from './web/messages-shell-web.component';

// ============================================
// SHARED — Works on both platforms
// ============================================
export { MessagesListComponent } from './messages-list.component';
export { MessagesItemComponent } from './messages-item.component';
export { MessagesSkeletonComponent } from './messages-skeleton.component';
export { MessagesService } from './messages.service';

// ============================================
// CONVERSATION — Thread/chat view
// ============================================
export {
  ConversationShellComponent,
  ConversationShellWebComponent,
  ConversationHeaderComponent,
  MessageBubbleComponent,
  MessageInputComponent,
  ConversationService,
} from './conversation';

// ============================================
// LEGACY — Kept for backward compatibility
// ============================================
export { MessagesPlaceholderComponent } from './messages-placeholder.component';
