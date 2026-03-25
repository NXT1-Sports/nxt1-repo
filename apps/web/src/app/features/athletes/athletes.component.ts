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
      title: 'For Athletes — The Sports Intelligence Platform | NXT1',
      description:
        "If they can't find you, they can't sign you. Let AI coordinators build your NXT1 profile, publish highlights, earn XP for daily actions, and climb the Risers to Watch leaderboard to get noticed by college coaches.",
      keywords: [
        'D1 athletics',
        'student athlete platform',
        'college scholarship offers',
        'athlete highlight reels',
        'athlete intelligence',
        'athlete visibility',
        'athlete leaderboard',
        'sports gamification',
        'athlete XP',
      ],
      canonicalUrl: 'https://nxt1sports.com/athletes',
      image: 'https://nxt1sports.com/assets/shared/images/athlete-1.png',
    });
  }
}
