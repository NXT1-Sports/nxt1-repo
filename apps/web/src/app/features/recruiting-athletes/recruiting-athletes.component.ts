/**
 * @fileoverview Recruiting Athletes Web Page Wrapper
 * @module apps/web/features/recruiting-athletes
 *
 * Web-specific wrapper for the `/recruiting-athletes` persona landing page.
 * Injects SEO metadata for the public marketing route.
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { NxtRecruitingAthletesLandingComponent } from '../marketing/personas';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-recruiting-athletes',
  standalone: true,
  imports: [NxtRecruitingAthletesLandingComponent],
  template: `
    <main id="main-content" role="main">
      <nxt1-recruiting-athletes-landing />
    </main>
  `,
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
      title: 'The Entire NCAA In Your Pocket — Direct Access to 85,000+ Coaches | NXT1',
      description:
        'Open doors to every college program in the country. NXT1 gives athletes direct access to 85,000+ college coaches with one click — plus Recruiting Radar shows you exactly who is watching your profile.',
      keywords: [
        'college recruiting',
        'ncaa coaches',
        'recruiting radar',
        'college coach contact',
        'recruiting signals',
        'athlete recruiting platform',
        'college coach directory',
        'recruiting visibility',
        'open doors recruiting',
      ],
      canonicalUrl: 'https://nxt1sports.com/recruiting-athletes',
      image: 'https://nxt1sports.com/assets/images/og-image.jpg',
    });
  }
}
