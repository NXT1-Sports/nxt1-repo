/**
 * @fileoverview Create Post Module Exports
 * @module @nxt1/ui/create-post
 * @version 1.0.0
 *
 * Barrel export for all Create Post UI components and services.
 *
 * @example
 * ```typescript
 * import {
 *   CreatePostShellComponent,
 *   CreatePostService,
 *   CreatePostApiService,
 * } from '@nxt1/ui';
 * ```
 */

// Components
export { CreatePostSkeletonComponent } from './create-post-skeleton.component';
export { CreatePostXpIndicatorComponent } from './create-post-xp-indicator.component';
export { CreatePostPrivacySelectorComponent } from './create-post-privacy-selector.component';
export { CreatePostMediaPickerComponent } from './create-post-media-picker.component';
export { CreatePostEditorComponent } from './create-post-editor.component';
export { CreatePostToolbarComponent } from './create-post-toolbar.component';
export { CreatePostPreviewComponent } from './create-post-preview.component';
export { CreatePostProgressComponent, type UploadingFile } from './create-post-progress.component';
export { CreatePostShellComponent } from './create-post-shell.component';

// Services
export { CreatePostService, type CreatePostServiceState } from './create-post.service';
export { CreatePostApiService } from './create-post-api.service';

// Mock data (for development only)
export * from './create-post.mock-data';
