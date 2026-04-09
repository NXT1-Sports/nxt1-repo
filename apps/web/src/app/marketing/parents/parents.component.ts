/**
 * @fileoverview Parents Persona Web Page Wrapper
 * @module apps/web/features/parents
 *
 * Web-specific wrapper for the `/parents` persona landing page.
 * Injects SEO metadata for the public marketing route.
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { NxtParentsLandingComponent } from '../shared/personas';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-parents',
  standalone: true,
  imports: [NxtParentsLandingComponent],
  template: `<nxt1-parents-landing />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParentsComponent implements OnInit {
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.updatePage({
      title: "For Parents — Support Your Child's Recruiting Journey | NXT1",
      description:
        "Track your child's recruiting progress, see which coaches are watching, and know exactly what to do next. NXT1 gives parents full visibility into the recruiting process.",
    });
  }
}
