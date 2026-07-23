import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ResolveFn } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { type HelpArticle, type HelpArticleResponse } from '@nxt1/core';
import { environment } from '../../../environments/environment';

export const helpCenterArticleResolver: ResolveFn<HelpArticle | null> = async (route) => {
  const slug = route.paramMap.get('slug')?.trim();
  if (!slug) {
    return null;
  }

  const http = inject(HttpClient);
  const logger = inject(NxtLoggingService).child('HelpCenterArticleResolver');

  try {
    const encodedSlug = encodeURIComponent(slug);
    const url = `${environment.apiURL}/help-center/articles/${encodedSlug}`;
    const response = await firstValueFrom(http.get<HelpArticleResponse>(url));
    return response.success && response.data ? response.data : null;
  } catch (error) {
    logger.warn('Failed to resolve help center article before navigation', { slug, error });
    return null;
  }
};
