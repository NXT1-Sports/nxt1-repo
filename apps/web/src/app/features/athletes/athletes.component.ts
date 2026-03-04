/**
 * @fileoverview Athletes Persona Web Page Wrapper
 * @module apps/web/features/athletes
 *
 * Web-specific wrapper for the `/athletes` persona landing page.
 * Injects SEO metadata for the public marketing route.
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { NxtAthletesLandingComponent } from '../marketing/personas';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-athletes',
  standalone: true,
  imports: [NxtAthletesLandingComponent],
  template: `<nxt1-athletes-landing />`,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AthletesComponent implements OnInit {
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'For Athletes — D1 Dream Recruiting Platform | NXT1',
      description:
        "If they can't find you, they can't sign you. Build a verified NXT1 recruiting profile, publish highlights, earn XP for daily actions, and climb the Risers to Watch leaderboard to get discovered by college coaches.",
      keywords: [
        'D1 recruiting',
        'student athlete recruiting',
        'college scholarship offers',
        'athlete highlight reels',
        'recruiting profile',
        'recruiting visibility',
        'athlete leaderboard',
        'sports gamification',
        'recruiting XP',
      ],
      canonicalUrl: 'https://nxt1sports.com/athletes',
      image: 'https://nxt1sports.com/assets/shared/images/athlete-1.png',
    });
  }
}
