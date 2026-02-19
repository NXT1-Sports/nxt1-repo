/**
 * @fileoverview Recruiting Athletes Web Page Wrapper
 * @module apps/web/features/recruiting-athletes
 *
 * Web-specific wrapper for the `/recruiting-athletes` persona landing page.
 * Injects SEO metadata for the public marketing route.
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { NxtRecruitingAthletesLandingComponent } from '@nxt1/ui';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-recruiting-athletes',
  standalone: true,
  imports: [NxtRecruitingAthletesLandingComponent],
  template: `<nxt1-recruiting-athletes-landing />`,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecruitingAthletesComponent implements OnInit {
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.updatePage({
      title: "Recruiting — See Who's Watching Your Profile | NXT1",
      description:
        'NXT1 Recruiting Radar shows you exactly which college coaches are viewing your profile, watching your highlights, and downloading your transcript. The read receipt for your career.',
      keywords: [
        'recruiting radar',
        'college recruiting',
        'recruiting signals',
        'coach profile views',
        'recruiting analytics',
        'athlete recruiting',
        'college coach interest',
        'recruiting visibility',
      ],
      canonicalUrl: 'https://nxt1sports.com/recruiting-athletes',
      image: 'https://nxt1sports.com/assets/images/og-image.jpg',
    });
  }
}
