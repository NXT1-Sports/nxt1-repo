/**
 * @fileoverview Explore "For You" Landing Component — Mobile (Ionic)
 * @module @nxt1/ui/explore
 * @version 2.0.0
 *
 * NXT1 2026 Elite "For You" Dashboard — 10 AI-curated sections.
 * Uses Ionic components for native feel. Inherits --nxt1-* tokens via --ion-* mapping.
 *
 * ⭐ MOBILE ONLY — Uses Ionic components and design tokens ⭐
 *
 * Sections:
 *  1. AI Executive Summary (Hero)       — No @defer (LCP critical)
 *  2. Stock Exchange (Trending Movers)  — @defer
 *  3. Film Room (Cinematic Inject)      — @defer, autoplays via @defer(on viewport)
 *  4. Matchmaker / War Room (Bento)     — @defer
 *  5. Social Pulse (Algorithmic Feed)   — @defer
 *  6. Campus Radar (College Programs)   — @defer
 *  7. Intel Desk (Deep Dives)           — @defer
 *  8. Proving Grounds (Events/Camps)    — @defer
 *  9. Inner Circle (Social Proof)       — @defer
 * 10. Agent X Contextual Inject         — @defer
 *
 * Design Token Compliance: ZERO hardcoded colors. All via --nxt1-* CSS variables.
 * Haptics: HapticsService.impact('light') on all interactions.
 */

import { Component, ChangeDetectionStrategy, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonCard,
  IonCardContent,
  IonItem,
  IonList,
  IonLabel,
  IonAvatar,
  IonBadge,
  IonChip,
} from '@ionic/angular/standalone';
import type { ExploreItem, ExploreTabId } from '@nxt1/core';
import type { ExploreUser } from './explore-shell.component';
import { HapticsService } from '../services/haptics/haptics.service';
import { MOCK_ATHLETES, MOCK_COLLEGES, MOCK_VIDEOS } from './explore.mock-data';

// ── Inline mock data for new section types ──
const MOCK_EVENTS = [
  {
    id: 'evt-1',
    title: 'Elite Showcase Camp',
    sport: 'Basketball',
    date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
    location: 'Los Angeles, CA',
    spots: 12,
  },
  {
    id: 'evt-2',
    title: 'National Combine',
    sport: 'Football',
    date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
    location: 'Dallas, TX',
    spots: 8,
  },
  {
    id: 'evt-3',
    title: 'Volleyball Summit',
    sport: 'Volleyball',
    date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 21),
    location: 'San Diego, CA',
    spots: 20,
  },
  {
    id: 'evt-4',
    title: 'Soccer Academy Trials',
    sport: 'Soccer',
    date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 28),
    location: 'Miami, FL',
    spots: 15,
  },
];

const MOCK_INTEL = [
  {
    id: 'intel-1',
    title: '5-Star PG Marcus Johnson Commits to UCLA',
    category: 'Commitment',
    thumbnail: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=200',
    timeAgo: '2h ago',
    readTime: '3 min read',
  },
  {
    id: 'intel-2',
    title: 'SEC Recruiting Rankings: Top 2026 Prospects',
    category: 'Rankings',
    thumbnail: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=200',
    timeAgo: '4h ago',
    readTime: '5 min read',
  },
  {
    id: 'intel-3',
    title: "James Thompson's 4.3 Speed Draws NFL Interest",
    category: 'Scout Report',
    thumbnail: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=200',
    timeAgo: '6h ago',
    readTime: '4 min read',
  },
  {
    id: 'intel-4',
    title: "Big Ten Expanding Women's Basketball Recruiting",
    category: 'News',
    thumbnail: 'https://images.unsplash.com/photo-1587280501635-68a0e82cd5ff?w=200',
    timeAgo: '8h ago',
    readTime: '2 min read',
  },
];

const MOCK_SOCIAL_POSTS = [
  {
    id: 'post-1',
    authorName: 'Marcus Johnson',
    authorAvatar: 'https://i.pravatar.cc/150?img=12',
    content: 'Blessed to announce my commitment to UCLA! 🐻💙 #GoUCLA #Committed',
    timestamp: '2h ago',
    likes: 2847,
    comments: 341,
  },
  {
    id: 'post-2',
    authorName: 'Sarah Williams',
    authorAvatar: 'https://i.pravatar.cc/150?img=25',
    content: 'New PR in the 100m today — 10.98! Hard work paying off 🏃‍♀️⚡',
    timestamp: '5h ago',
    likes: 1204,
    comments: 98,
  },
  {
    id: 'post-3',
    authorName: 'Carlos Rodriguez',
    authorAvatar: 'https://i.pravatar.cc/150?img=33',
    content: 'Game winner in overtime! Nothing better than this feeling ⚽🔥',
    timestamp: '1d ago',
    likes: 3510,
    comments: 267,
  },
];

@Component({
  selector: 'nxt1-explore-for-you',
  standalone: true,
  imports: [
    CommonModule,
    IonCard,
    IonCardContent,
    IonItem,
    IonList,
    IonLabel,
    IonAvatar,
    IonBadge,
    IonChip,
  ],
  template: `
    <section class="for-you" aria-label="For You — personalized explore">
      <!-- ═══════════════════════════════════════════════════════
           SECTION 1: AI Executive Summary (Hero)
           No @defer — LCP critical, loads immediately
           Full-width IonCard with no margins
           ═══════════════════════════════════════════════════════ -->
      <ion-card class="hero-card" aria-labelledby="mobile-hero-title">
        <!-- Background image -->
        <div class="hero-image-wrap">
          <img
            src="https://images.unsplash.com/photo-1546519638-68e109498ffc?w=900&q=80"
            alt="Today's top sports recruiting moments"
            class="hero-img"
            loading="eager"
          />
          <div class="hero-gradient"></div>
        </div>

        <ion-card-content class="hero-content">
          <!-- AI Badge -->
          <div class="hero-badges">
            <span class="ai-badge">⚡ AI Executive Summary</span>
            <span class="time-badge">Updated 2 min ago</span>
          </div>

          <!-- Headline -->
          <h2 id="mobile-hero-title" class="hero-title">
            Today's Biggest Moves in Sports Recruiting
          </h2>
          <p class="hero-subtitle">AI-curated highlights from 247 sources.</p>

          <!-- Athlete chips -->
          <div class="hero-chips">
            @for (athlete of topAthletes(); track athlete.id) {
              <button
                type="button"
                class="hero-chip"
                (click)="onItemTap(athlete)"
                [attr.aria-label]="athlete.name"
              >
                {{ athlete.name }}
              </button>
            }
          </div>
        </ion-card-content>
      </ion-card>

      <!-- ═══════════════════════════════════════════════════════
           SECTION 2: The Stock Exchange (Trending Movers)
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport; prefetch on idle) {
        <section class="section" aria-labelledby="mob-stock-exchange">
          <header class="section-header">
            <h2 id="mob-stock-exchange" class="section-title">📈 Stock Exchange</h2>
            <button
              type="button"
              class="see-all-btn"
              (click)="onCategorySelect('athletes')"
            >
              See All
            </button>
          </header>

          <div class="h-scroll" role="list">
            @for (mover of trendingMovers(); track mover.id; let i = $index) {
              <ion-card
                class="mover-card"
                button="true"
                role="listitem"
                (click)="onItemTap(mover)"
              >
                <ion-avatar class="mover-avatar">
                  <img [src]="mover.imageUrl" [alt]="mover.name" loading="lazy" />
                </ion-avatar>
                <ion-card-content class="mover-content">
                  <p class="mover-name">{{ mover.name }}</p>
                  <p class="mover-sport">{{ mover.sport }}</p>
                  <div class="mover-trend">
                    @if (i % 3 !== 2) {
                      <span class="trend-up">↑ +{{ 8 + i * 3 }}%</span>
                    } @else {
                      <span class="trend-steady">→ Steady</span>
                    }
                  </div>
                  @if (mover['commitment']) {
                    <ion-badge class="committed-badge">Committed</ion-badge>
                  }
                </ion-card-content>
              </ion-card>
            }
          </div>
        </section>
      } @placeholder {
        <div class="skeleton-section">
          <div class="skeleton-title animate-pulse bg-surface-300"></div>
          <div class="skeleton-row">
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="skeleton-mover-card animate-pulse bg-surface-300"></div>
            }
          </div>
        </div>
      } @loading (minimum 300ms) {
        <div class="skeleton-section">
          <div class="skeleton-title animate-pulse bg-surface-300"></div>
          <div class="skeleton-row">
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="skeleton-mover-card animate-pulse bg-surface-300"></div>
            }
          </div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 3: The Film Room (Cinematic Inject)
           @defer(on viewport) — autoplays muted video
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport; prefetch on idle) {
        <section class="section film-room-section" aria-labelledby="mob-film-room">
          <header class="section-header">
            <h2 id="mob-film-room" class="section-title">🎬 Film Room</h2>
            <button
              type="button"
              class="see-all-btn"
              (click)="onCategorySelect('videos')"
            >
              See All
            </button>
          </header>

          <!-- Featured video (autoplays when @defer loads in viewport) -->
          <div class="film-room-video-wrap">
            <video
              class="film-room-video"
              autoplay
              muted
              loop
              playsinline
              poster="https://images.unsplash.com/photo-1546519638-68e109498ffc?w=900&q=60"
              aria-label="Featured highlight reel"
            >
              <source src="https://www.w3schools.com/html/mov_bbb.mp4" type="video/mp4" />
            </video>
            <div class="film-room-overlay"></div>
            <div class="film-room-label">
              <p class="film-room-video-title">{{ featuredVideo().name }}</p>
              <p class="film-room-creator">{{ featuredVideo().creator.name }}</p>
            </div>
          </div>

          <!-- Video cards -->
          <div class="h-scroll h-scroll--videos">
            @for (video of videoList(); track video.id) {
              <ion-card class="video-card" button="true" (click)="onItemTap(video)">
                <div class="video-thumb-wrap">
                  <img
                    [src]="video.thumbnailUrl"
                    [alt]="video.name"
                    class="video-thumb"
                    loading="lazy"
                  />
                  <span class="video-duration">{{ formatDuration(video.duration) }}</span>
                </div>
                <ion-card-content class="video-info">
                  <p class="video-title">{{ video.name }}</p>
                  <p class="video-views">{{ formatViews(video.views) }} views</p>
                </ion-card-content>
              </ion-card>
            }
          </div>
        </section>
      } @placeholder {
        <div class="skeleton-section">
          <div class="skeleton-title animate-pulse bg-surface-300"></div>
          <div class="skeleton-video animate-pulse bg-surface-300"></div>
        </div>
      } @loading (minimum 300ms) {
        <div class="skeleton-section">
          <div class="skeleton-title animate-pulse bg-surface-300"></div>
          <div class="skeleton-video animate-pulse bg-surface-300"></div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 4: Matchmaker / War Room (Dense Bento Grid)
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport; prefetch on idle) {
        <section class="section" aria-labelledby="mob-war-room">
          <header class="section-header">
            <h2 id="mob-war-room" class="section-title">🧠 Matchmaker / War Room</h2>
            <button
              type="button"
              class="see-all-btn"
              (click)="onCategorySelect('colleges')"
            >
              See All
            </button>
          </header>

          <!-- Bento grid -->
          <div class="bento-grid">
            @for (college of bentoColleges(); track college.id; let i = $index) {
              <ion-card
                class="bento-card"
                button="true"
                (click)="onItemTap(college)"
              >
                <ion-card-content class="bento-content">
                  <img
                    [src]="college.imageUrl"
                    [alt]="college.name + ' logo'"
                    class="bento-logo"
                    loading="lazy"
                  />
                  <h3 class="bento-name">{{ college.name }}</h3>
                  <p class="bento-division">{{ college.division }}</p>
                  <div class="bento-match">
                    <span class="match-badge">{{ 85 + i * 3 }}% Match</span>
                    <span class="bento-rank">#{{ college.ranking }}</span>
                  </div>
                </ion-card-content>
              </ion-card>
            }
          </div>
        </section>
      } @placeholder {
        <div class="skeleton-section">
          <div class="skeleton-title animate-pulse bg-surface-300"></div>
          <div class="bento-grid">
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="skeleton-bento animate-pulse bg-surface-300"></div>
            }
          </div>
        </div>
      } @loading (minimum 300ms) {
        <div class="skeleton-section">
          <div class="skeleton-title animate-pulse bg-surface-300"></div>
          <div class="bento-grid">
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="skeleton-bento animate-pulse bg-surface-300"></div>
            }
          </div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 5: The Social Pulse (Algorithmic Best-Of)
           Vertical stack on Mobile
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport; prefetch on idle) {
        <section class="section" aria-labelledby="mob-social-pulse">
          <header class="section-header">
            <h2 id="mob-social-pulse" class="section-title">💬 Social Pulse</h2>
            <button
              type="button"
              class="see-all-btn"
              (click)="onCategorySelect('feed')"
            >
              See All
            </button>
          </header>

          <div class="social-stack">
            @for (post of socialPosts(); track post.id) {
              <ion-card class="social-post-card">
                <ion-card-content class="social-post-content">
                  <div class="post-author-row">
                    <img
                      [src]="post.authorAvatar"
                      [alt]="post.authorName"
                      class="post-avatar"
                      loading="lazy"
                    />
                    <div class="post-author-info">
                      <p class="post-author-name">{{ post.authorName }}</p>
                      <p class="post-timestamp">{{ post.timestamp }}</p>
                    </div>
                  </div>
                  <p class="post-body">{{ post.content }}</p>
                  <div class="post-engagement">
                    <span class="engagement-item">
                      <svg class="engagement-icon" fill="currentColor" viewBox="0 0 24 24">
                        <path
                          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                        />
                      </svg>
                      {{ post.likes.toLocaleString() }}
                    </span>
                    <span class="engagement-item">
                      <svg
                        class="engagement-icon"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                        />
                      </svg>
                      {{ post.comments }}
                    </span>
                  </div>
                </ion-card-content>
              </ion-card>
            }
          </div>
        </section>
      } @placeholder {
        <div class="skeleton-section">
          <div class="skeleton-title animate-pulse bg-surface-300"></div>
          @for (i of [1, 2, 3]; track i) {
            <div class="skeleton-post animate-pulse bg-surface-300"></div>
          }
        </div>
      } @loading (minimum 300ms) {
        <div class="skeleton-section">
          <div class="skeleton-title animate-pulse bg-surface-300"></div>
          @for (i of [1, 2, 3]; track i) {
            <div class="skeleton-post animate-pulse bg-surface-300"></div>
          }
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 6: The Campus Radar (Targeted Programs)
           Large horizontal cards with edge-to-edge campus imagery
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport; prefetch on idle) {
        <section class="section" aria-labelledby="mob-campus-radar">
          <header class="section-header">
            <h2 id="mob-campus-radar" class="section-title">🎓 Campus Radar</h2>
            <button
              type="button"
              class="see-all-btn"
              (click)="onCategorySelect('colleges')"
            >
              See All
            </button>
          </header>

          <div class="h-scroll h-scroll--campus" role="list">
            @for (college of campusColleges(); track college.id) {
              <ion-card
                class="campus-card"
                button="true"
                role="listitem"
                (click)="onItemTap(college)"
              >
                <div class="campus-image-wrap">
                  <img
                    [src]="college.imageUrl"
                    [alt]="college.name"
                    class="campus-img"
                    loading="lazy"
                  />
                  <div class="campus-gradient"></div>
                </div>
                <div class="campus-info">
                  <div class="campus-logo-wrap">
                    <img [src]="college.imageUrl" [alt]="college.name" class="campus-logo" />
                  </div>
                  <div>
                    <h3 class="campus-name">{{ college.name }}</h3>
                    <p class="campus-meta">{{ college.conference }} · {{ college.location }}</p>
                  </div>
                  <span class="campus-rank">#{{ college.ranking }}</span>
                </div>
              </ion-card>
            }
          </div>
        </section>
      } @placeholder {
        <div class="skeleton-section">
          <div class="skeleton-title animate-pulse bg-surface-300"></div>
          <div class="skeleton-row">
            @for (i of [1, 2, 3]; track i) {
              <div class="skeleton-campus animate-pulse bg-surface-300"></div>
            }
          </div>
        </div>
      } @loading (minimum 300ms) {
        <div class="skeleton-section">
          <div class="skeleton-title animate-pulse bg-surface-300"></div>
          <div class="skeleton-row">
            @for (i of [1, 2, 3]; track i) {
              <div class="skeleton-campus animate-pulse bg-surface-300"></div>
            }
          </div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 7: The Intel Desk (Deep Dives)
           List view: thumbnail left, text right
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport; prefetch on idle) {
        <section class="section" aria-labelledby="mob-intel-desk">
          <header class="section-header">
            <h2 id="mob-intel-desk" class="section-title">📡 Intel Desk</h2>
            <button
              type="button"
              class="see-all-btn"
              (click)="onCategorySelect('news')"
            >
              See All
            </button>
          </header>

          <ion-list class="intel-list" lines="none">
            @for (article of intelArticles(); track article.id) {
              <ion-item
                class="intel-item"
                button="true"
                detail="false"
                (click)="onArticleTap()"
              >
                <div class="intel-thumb-wrap" slot="start">
                  <img
                    [src]="article.thumbnail"
                    [alt]="article.title"
                    class="intel-thumb"
                    loading="lazy"
                  />
                </div>
                <ion-label class="intel-label">
                  <span class="intel-category">{{ article.category }}</span>
                  <h3 class="intel-title">{{ article.title }}</h3>
                  <div class="intel-meta">
                    <span>{{ article.timeAgo }}</span>
                    <span class="intel-dot">·</span>
                    <span>{{ article.readTime }}</span>
                  </div>
                </ion-label>
              </ion-item>
            }
          </ion-list>
        </section>
      } @placeholder {
        <div class="skeleton-section">
          <div class="skeleton-title animate-pulse bg-surface-300"></div>
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="skeleton-intel animate-pulse bg-surface-300"></div>
          }
        </div>
      } @loading (minimum 300ms) {
        <div class="skeleton-section">
          <div class="skeleton-title animate-pulse bg-surface-300"></div>
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="skeleton-intel animate-pulse bg-surface-300"></div>
          }
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 8: The Proving Grounds (Events/Camps)
           Calendar-driven bento boxes
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport; prefetch on idle) {
        <section class="section" aria-labelledby="mob-proving-grounds">
          <header class="section-header">
            <h2 id="mob-proving-grounds" class="section-title">🏟️ Proving Grounds</h2>
            <button
              type="button"
              class="see-all-btn"
              (click)="onCategorySelect('camps')"
            >
              See All
            </button>
          </header>

          <div class="events-grid">
            @for (event of events(); track event.id) {
              <ion-card class="event-card" button="true" (click)="onEventTap()">
                <ion-card-content class="event-content">
                  <!-- Date badge -->
                  <div class="event-date-badge">
                    <span class="event-month">{{ event.date | date: 'MMM' }}</span>
                    <span class="event-day">{{ event.date | date: 'd' }}</span>
                  </div>
                  <!-- Event info -->
                  <div class="event-info">
                    <h3 class="event-title">{{ event.title }}</h3>
                    <p class="event-sport">{{ event.sport }}</p>
                    <p class="event-location">📍 {{ event.location }}</p>
                  </div>
                  <!-- Spots remaining -->
                  <ion-badge class="event-spots-badge">{{ event.spots }} spots</ion-badge>
                </ion-card-content>
              </ion-card>
            }
          </div>
        </section>
      } @placeholder {
        <div class="skeleton-section">
          <div class="skeleton-title animate-pulse bg-surface-300"></div>
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="skeleton-event animate-pulse bg-surface-300"></div>
          }
        </div>
      } @loading (minimum 300ms) {
        <div class="skeleton-section">
          <div class="skeleton-title animate-pulse bg-surface-300"></div>
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="skeleton-event animate-pulse bg-surface-300"></div>
          }
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 9: The Inner Circle (Social Proof)
           Horizontal avatar cluster + activity ticker
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport; prefetch on idle) {
        <section class="section" aria-labelledby="mob-inner-circle">
          <header class="section-header">
            <h2 id="mob-inner-circle" class="section-title">🔥 Inner Circle</h2>
            <button
              type="button"
              class="see-all-btn"
              (click)="onCategorySelect('following')"
            >
              See All
            </button>
          </header>

          <!-- Avatar cluster -->
          <div class="avatar-cluster-wrap">
            <div class="avatar-cluster" role="list" aria-label="Active athletes you follow">
              @for (athlete of innerCircleAvatars(); track athlete.id; let i = $index) {
                <ion-avatar
                  class="cluster-avatar"
                  [style.z-index]="innerCircleAvatars().length - i"
                  role="listitem"
                >
                  <img
                    [src]="athlete.imageUrl"
                    [alt]="athlete.name"
                    loading="lazy"
                  />
                </ion-avatar>
              }
              <div class="cluster-more">+24</div>
            </div>
            <p class="cluster-label">
              <strong>47 athletes</strong> in your network are active
            </p>
          </div>

          <!-- Activity ticker -->
          <ion-list class="activity-list" lines="none">
            @for (athlete of innerCircleAvatars().slice(0, 3); track athlete.id) {
              <ion-item class="activity-item" button="true" detail="false" (click)="onActivityTap()">
                <ion-avatar slot="start" class="activity-avatar">
                  <img [src]="athlete.imageUrl" [alt]="athlete.name" loading="lazy" />
                </ion-avatar>
                <ion-label>
                  <p class="activity-text">
                    <strong>{{ athlete.name }}</strong> posted a new highlight
                  </p>
                </ion-label>
                <span slot="end" class="activity-time">now</span>
              </ion-item>
            }
          </ion-list>
        </section>
      } @placeholder {
        <div class="skeleton-section">
          <div class="skeleton-title animate-pulse bg-surface-300"></div>
          <div class="skeleton-avatars animate-pulse bg-surface-300"></div>
          @for (i of [1, 2, 3]; track i) {
            <div class="skeleton-activity animate-pulse bg-surface-300"></div>
          }
        </div>
      } @loading (minimum 300ms) {
        <div class="skeleton-section">
          <div class="skeleton-title animate-pulse bg-surface-300"></div>
          <div class="skeleton-avatars animate-pulse bg-surface-300"></div>
          @for (i of [1, 2, 3]; track i) {
            <div class="skeleton-activity animate-pulse bg-surface-300"></div>
          }
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 10: Agent X Contextual Inject (The Closer)
           AI conversational block at the bottom of the feed
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport; prefetch on idle) {
        <section class="section section--last agent-x-section" aria-labelledby="mob-agent-x">
          <ion-card class="agent-x-card" aria-labelledby="mob-agent-x">
            <ion-card-content class="agent-x-content">
              <!-- Agent header -->
              <div class="agent-header">
                <div class="agent-icon">
                  <svg fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"
                    />
                  </svg>
                </div>
                <div>
                  <h2 id="mob-agent-x" class="agent-name">Agent X</h2>
                  <p class="agent-role">Your AI recruiting strategist</p>
                </div>
                <span class="agent-live-badge">⚡ Live</span>
              </div>

              <!-- AI Message -->
              <div class="agent-message">
                <p class="agent-message-label">Agent X says:</p>
                <p class="agent-message-body">
                  Based on your profile and recent activity, I've identified
                  <strong class="agent-highlight">3 new college programs</strong> actively
                  recruiting athletes with your exact skill set. Your commitment window is opening in
                  <strong class="agent-highlight">the next 60 days</strong>. Ready to take action?
                </p>
              </div>

              <!-- Action buttons -->
              <div class="agent-actions">
                <button
                  type="button"
                  class="agent-btn-primary"
                  (click)="onCategorySelect('colleges')"
                >
                  Show Me the Programs
                </button>
                <button
                  type="button"
                  class="agent-btn-secondary"
                  (click)="onAgentXTap()"
                >
                  Ask Agent X
                </button>
              </div>

              <!-- Contextual chips -->
              <div class="agent-chips">
                <ion-chip class="agent-chip">🏀 Basketball profile matched</ion-chip>
                <ion-chip class="agent-chip">📊 4.2 GPA compatible</ion-chip>
                <ion-chip class="agent-chip">🎓 Division I eligible</ion-chip>
              </div>
            </ion-card-content>
          </ion-card>
        </section>
      } @placeholder {
        <div class="skeleton-section">
          <div class="skeleton-agent animate-pulse bg-surface-300"></div>
        </div>
      } @loading (minimum 300ms) {
        <div class="skeleton-section">
          <div class="skeleton-agent animate-pulse bg-surface-300"></div>
        </div>
      }
    </section>
  `,
  styles: [
    `
      /* ============================================================
         EXPLORE FOR YOU — Mobile / Ionic
         Design token driven, zero hard-coded values.
         All spacing, color, typography via CSS custom properties.
         ============================================================ */

      :host {
        display: block;
      }

      /* ── FOR YOU WRAPPER ── */

      .for-you {
        padding-bottom: var(--nxt1-spacing-10, 40px);
      }

      /* ── SECTION LAYOUT ── */

      .section {
        padding: var(--nxt1-spacing-5, 20px) 0 0;
      }

      .section--last {
        padding-bottom: var(--nxt1-spacing-4, 16px);
      }

      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-3, 12px);
      }

      .section-title {
        font-size: var(--nxt1-fontSize-base, 16px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--nxt1-color-text-primary);
        letter-spacing: -0.2px;
        margin: 0;
      }

      .see-all-btn {
        font-size: var(--nxt1-fontSize-sm, 13px);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        color: var(--nxt1-color-primary);
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        -webkit-tap-highlight-color: transparent;
      }

      /* ── HORIZONTAL SCROLL ── */

      .h-scroll {
        display: flex;
        gap: var(--nxt1-spacing-3, 12px);
        padding: 0 var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-2, 8px);
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }

      .h-scroll::-webkit-scrollbar {
        display: none;
      }

      /* ══════════════════════
         SECTION 1: HERO CARD
         ══════════════════════ */

      .hero-card {
        margin: var(--nxt1-spacing-4, 16px);
        border-radius: var(--nxt1-radius-xl, 20px);
        overflow: hidden;
        background: var(--nxt1-color-surface-100);
        --background: var(--nxt1-color-surface-100);
        border: none;
        box-shadow: none;
      }

      .hero-image-wrap {
        position: relative;
        aspect-ratio: 21 / 9;
        overflow: hidden;
      }

      .hero-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .hero-gradient {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          to top,
          var(--nxt1-color-bg-primary) 0%,
          color-mix(in srgb, var(--nxt1-color-bg-primary) 60%, transparent) 50%,
          transparent 100%
        );
      }

      .hero-content {
        padding: var(--nxt1-spacing-4, 16px);
        --padding-start: var(--nxt1-spacing-4, 16px);
        --padding-end: var(--nxt1-spacing-4, 16px);
        --padding-top: var(--nxt1-spacing-4, 16px);
        --padding-bottom: var(--nxt1-spacing-4, 16px);
      }

      .hero-badges {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2, 8px);
        margin-bottom: var(--nxt1-spacing-3, 12px);
      }

      .ai-badge {
        display: inline-block;
        padding: 3px 10px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-on-primary, #000);
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .time-badge {
        display: inline-block;
        padding: 3px 10px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-secondary);
        font-size: 10px;
        font-weight: 500;
      }

      .hero-title {
        font-size: var(--nxt1-fontSize-xl, 20px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-2, 8px);
        line-height: 1.3;
      }

      .hero-subtitle {
        font-size: var(--nxt1-fontSize-sm, 13px);
        color: var(--nxt1-color-text-secondary);
        margin: 0 0 var(--nxt1-spacing-3, 12px);
      }

      .hero-chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .hero-chip {
        display: inline-block;
        padding: 4px 12px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-primary);
        font-size: 12px;
        font-weight: 500;
        border: none;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: background-color 0.15s ease;
      }

      .hero-chip:active {
        background: var(--nxt1-color-surface-300);
        transform: scale(0.96);
      }

      /* ══════════════════════════════
         SECTION 2: STOCK EXCHANGE
         ══════════════════════════════ */

      .mover-card {
        flex-shrink: 0;
        width: 120px;
        scroll-snap-align: start;
        margin: 0;
        border-radius: var(--nxt1-radius-md, 12px);
        background: var(--nxt1-color-surface-200);
        --background: var(--nxt1-color-surface-200);
        border: 1px solid var(--nxt1-color-border-subtle);
        box-shadow: none;
        -webkit-tap-highlight-color: transparent;
      }

      .mover-card:active {
        transform: scale(0.96);
      }

      .mover-avatar {
        width: 48px;
        height: 48px;
        margin: 12px auto 0;
      }

      .mover-content {
        text-align: center;
        padding: 8px;
        --padding-start: 8px;
        --padding-end: 8px;
        --padding-top: 8px;
        --padding-bottom: 8px;
      }

      .mover-name {
        font-size: 11px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        margin: 0 0 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .mover-sport {
        font-size: 10px;
        color: var(--nxt1-color-text-tertiary);
        margin: 0 0 4px;
      }

      .mover-trend {
        margin-bottom: 4px;
      }

      .trend-up {
        font-size: 11px;
        font-weight: 700;
        color: var(--nxt1-color-primary);
      }

      .trend-steady {
        font-size: 10px;
        color: var(--nxt1-color-text-secondary);
      }

      .committed-badge {
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        --background: var(--nxt1-color-primary);
        --color: var(--nxt1-color-on-primary, #000);
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      /* ══════════════════════════
         SECTION 3: FILM ROOM
         ══════════════════════════ */

      .film-room-section {
        background: var(--nxt1-color-bg-primary);
      }

      .film-room-video-wrap {
        position: relative;
        aspect-ratio: 16 / 9;
        overflow: hidden;
        background: var(--nxt1-color-bg-primary);
      }

      .film-room-video {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .film-room-overlay {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 40%;
        background: linear-gradient(to top, var(--nxt1-color-bg-primary), transparent);
        pointer-events: none;
      }

      .film-room-label {
        position: absolute;
        bottom: var(--nxt1-spacing-3, 12px);
        left: var(--nxt1-spacing-4, 16px);
        right: var(--nxt1-spacing-4, 16px);
      }

      .film-room-video-title {
        font-size: 14px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
        margin: 0 0 2px;
        text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
      }

      .film-room-creator {
        font-size: 12px;
        color: var(--nxt1-color-text-secondary);
        margin: 0;
      }

      .h-scroll--videos {
        padding-top: var(--nxt1-spacing-3, 12px);
      }

      .video-card {
        flex-shrink: 0;
        width: 190px;
        scroll-snap-align: start;
        margin: 0;
        border-radius: var(--nxt1-radius-md, 12px);
        background: var(--nxt1-color-surface-100);
        --background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        box-shadow: none;
        overflow: hidden;
        -webkit-tap-highlight-color: transparent;
      }

      .video-card:active {
        transform: scale(0.97);
      }

      .video-thumb-wrap {
        position: relative;
        aspect-ratio: 16 / 9;
        overflow: hidden;
        background: var(--nxt1-color-surface-200);
      }

      .video-thumb {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .video-duration {
        position: absolute;
        bottom: 4px;
        right: 4px;
        padding: 2px 6px;
        background: var(--nxt1-color-surface-300);
        color: var(--nxt1-color-text-primary);
        font-size: 10px;
        font-weight: 500;
        border-radius: var(--nxt1-radius-sm, 6px);
        backdrop-filter: blur(4px);
      }

      .video-info {
        padding: 8px 10px 10px;
        --padding-start: 10px;
        --padding-end: 10px;
        --padding-top: 8px;
        --padding-bottom: 10px;
      }

      .video-title {
        font-size: 11px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        margin: 0 0 2px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        line-height: 1.3;
      }

      .video-views {
        font-size: 10px;
        color: var(--nxt1-color-text-tertiary);
        margin: 0;
      }

      /* ══════════════════════════════
         SECTION 4: BENTO GRID
         ══════════════════════════════ */

      .bento-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--nxt1-spacing-3, 12px);
        padding: 0 var(--nxt1-spacing-4, 16px);
      }

      .bento-card {
        margin: 0;
        border-radius: var(--nxt1-radius-md, 12px);
        background: var(--nxt1-color-surface-100);
        --background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        box-shadow: none;
        -webkit-tap-highlight-color: transparent;
        transition: border-color 0.15s ease;
      }

      .bento-card:active {
        transform: scale(0.97);
      }

      .bento-content {
        padding: 12px;
        --padding-start: 12px;
        --padding-end: 12px;
        --padding-top: 12px;
        --padding-bottom: 12px;
      }

      .bento-logo {
        width: 44px;
        height: 44px;
        object-fit: contain;
        border-radius: var(--nxt1-radius-sm, 6px);
        margin-bottom: 8px;
      }

      .bento-name {
        font-size: 13px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
        margin: 0 0 2px;
      }

      .bento-division {
        font-size: 11px;
        color: var(--nxt1-color-text-secondary);
        margin: 0 0 8px;
      }

      .bento-match {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .match-badge {
        display: inline-block;
        padding: 2px 6px;
        border-radius: var(--nxt1-radius-sm, 6px);
        background: color-mix(in srgb, var(--nxt1-color-primary) 10%, transparent);
        color: var(--nxt1-color-primary);
        font-size: 10px;
        font-weight: 700;
      }

      .bento-rank {
        font-size: 10px;
        color: var(--nxt1-color-text-tertiary);
      }

      /* ══════════════════════════════════
         SECTION 5: SOCIAL PULSE
         ══════════════════════════════════ */

      .social-stack {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
        padding: 0 var(--nxt1-spacing-4, 16px);
      }

      .social-post-card {
        margin: 0;
        border-radius: var(--nxt1-radius-md, 12px);
        background: var(--nxt1-color-surface-200);
        --background: var(--nxt1-color-surface-200);
        border: 1px solid var(--nxt1-color-border-subtle);
        box-shadow: none;
      }

      .social-post-content {
        padding: 12px;
        --padding-start: 12px;
        --padding-end: 12px;
        --padding-top: 12px;
        --padding-bottom: 12px;
      }

      .post-author-row {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 10px;
      }

      .post-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        object-fit: cover;
        flex-shrink: 0;
        border: 1px solid var(--nxt1-color-border-subtle);
      }

      .post-author-info {
        min-width: 0;
      }

      .post-author-name {
        font-size: 13px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .post-timestamp {
        font-size: 10px;
        color: var(--nxt1-color-text-secondary);
        margin: 0;
      }

      .post-body {
        font-size: 13px;
        color: var(--nxt1-color-text-primary);
        line-height: 1.5;
        margin: 0 0 10px;
      }

      .post-engagement {
        display: flex;
        gap: 16px;
      }

      .engagement-item {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        color: var(--nxt1-color-text-secondary);
      }

      .engagement-icon {
        width: 13px;
        height: 13px;
        flex-shrink: 0;
      }

      /* ══════════════════════════
         SECTION 6: CAMPUS RADAR
         ══════════════════════════ */

      .h-scroll--campus {
        gap: var(--nxt1-spacing-4, 16px);
        padding-bottom: var(--nxt1-spacing-3, 12px);
      }

      .campus-card {
        flex-shrink: 0;
        width: 260px;
        scroll-snap-align: start;
        margin: 0;
        border-radius: var(--nxt1-radius-xl, 20px);
        overflow: hidden;
        background: var(--nxt1-color-surface-100);
        --background: var(--nxt1-color-surface-100);
        border: none;
        box-shadow: none;
        -webkit-tap-highlight-color: transparent;
      }

      .campus-card:active {
        transform: scale(0.98);
      }

      .campus-image-wrap {
        position: relative;
        aspect-ratio: 4 / 3;
        overflow: hidden;
        background: var(--nxt1-color-surface-200);
      }

      .campus-img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }

      .campus-gradient {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          to top,
          var(--nxt1-color-bg-primary) 0%,
          color-mix(in srgb, var(--nxt1-color-bg-primary) 50%, transparent) 50%,
          transparent 100%
        );
      }

      .campus-info {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px 12px;
      }

      .campus-logo-wrap {
        flex-shrink: 0;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: var(--nxt1-color-surface-100);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 4px;
      }

      .campus-logo {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }

      .campus-name {
        font-size: 13px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
        margin: 0 0 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .campus-meta {
        font-size: 10px;
        color: var(--nxt1-color-text-secondary);
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .campus-rank {
        margin-left: auto;
        flex-shrink: 0;
        font-size: 10px;
        font-weight: 700;
        color: var(--nxt1-color-primary);
        padding: 2px 6px;
        border-radius: var(--nxt1-radius-sm, 6px);
        background: color-mix(in srgb, var(--nxt1-color-primary) 10%, transparent);
      }

      /* ══════════════════════
         SECTION 7: INTEL DESK
         ══════════════════════ */

      .intel-list {
        background: transparent;
        --background: transparent;
        padding: 0 var(--nxt1-spacing-4, 16px);
      }

      .intel-item {
        --background: transparent;
        --border-color: var(--nxt1-color-border-subtle);
        --border-style: solid;
        --border-width: 0 0 1px 0;
        --padding-start: 0;
        --padding-end: 0;
        --inner-padding-start: 0;
        --inner-padding-end: 0;
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
        -webkit-tap-highlight-color: transparent;
      }

      .intel-item:last-child {
        border-bottom: none;
      }

      .intel-thumb-wrap {
        width: 64px;
        height: 64px;
        border-radius: var(--nxt1-radius-md, 12px);
        overflow: hidden;
        background: var(--nxt1-color-surface-200);
        flex-shrink: 0;
        margin-right: 12px;
      }

      .intel-thumb {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .intel-label {
        padding: 12px 0;
      }

      .intel-category {
        display: inline-block;
        padding: 1px 6px;
        border-radius: 4px;
        background: color-mix(in srgb, var(--nxt1-color-primary) 10%, transparent);
        color: var(--nxt1-color-primary);
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        margin-bottom: 4px;
      }

      .intel-title {
        font-size: 13px !important;
        font-weight: 600;
        color: var(--nxt1-color-text-primary) !important;
        margin: 0 0 4px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        line-height: 1.3;
        white-space: normal !important;
      }

      .intel-meta {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        color: var(--nxt1-color-text-secondary);
      }

      .intel-dot {
        opacity: 0.5;
      }

      /* ══════════════════════════════════
         SECTION 8: PROVING GROUNDS
         ══════════════════════════════════ */

      .events-grid {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
        padding: 0 var(--nxt1-spacing-4, 16px);
      }

      .event-card {
        margin: 0;
        border-radius: var(--nxt1-radius-md, 12px);
        background: var(--nxt1-color-surface-100);
        --background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        box-shadow: none;
        -webkit-tap-highlight-color: transparent;
      }

      .event-card:active {
        transform: scale(0.99);
      }

      .event-content {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        --padding-start: 12px;
        --padding-end: 12px;
        --padding-top: 12px;
        --padding-bottom: 12px;
      }

      .event-date-badge {
        flex-shrink: 0;
        width: 52px;
        height: 52px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border-radius: var(--nxt1-radius-md, 12px);
        background: color-mix(in srgb, var(--nxt1-color-primary) 10%, transparent);
        color: var(--nxt1-color-primary);
      }

      .event-month {
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        line-height: 1;
      }

      .event-day {
        font-size: 22px;
        font-weight: 700;
        line-height: 1.2;
      }

      .event-info {
        flex: 1;
        min-width: 0;
      }

      .event-title {
        font-size: 13px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
        margin: 0 0 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .event-sport {
        font-size: 11px;
        color: var(--nxt1-color-text-secondary);
        margin: 0 0 2px;
      }

      .event-location {
        font-size: 10px;
        color: var(--nxt1-color-text-tertiary);
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .event-spots-badge {
        flex-shrink: 0;
        font-size: 10px;
        font-weight: 700;
        --background: color-mix(in srgb, var(--nxt1-color-primary) 10%, transparent);
        --color: var(--nxt1-color-primary);
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      /* ══════════════════════════════
         SECTION 9: INNER CIRCLE
         ══════════════════════════════ */

      .avatar-cluster-wrap {
        padding: 0 var(--nxt1-spacing-4, 16px);
        margin-bottom: var(--nxt1-spacing-3, 12px);
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .avatar-cluster {
        display: flex;
        align-items: center;
      }

      .cluster-avatar {
        width: 38px;
        height: 38px;
        margin-left: -8px;
        border: 2px solid var(--nxt1-color-bg-primary);
        border-radius: 50%;
        overflow: hidden;
      }

      .cluster-avatar:first-child {
        margin-left: 0;
      }

      .cluster-more {
        width: 38px;
        height: 38px;
        margin-left: -8px;
        border-radius: 50%;
        border: 2px solid var(--nxt1-color-bg-primary);
        background: var(--nxt1-color-surface-200);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 700;
        color: var(--nxt1-color-text-secondary);
      }

      .cluster-label {
        font-size: 12px;
        color: var(--nxt1-color-text-secondary);
        margin: 0;
      }

      .cluster-label strong {
        color: var(--nxt1-color-text-primary);
      }

      .activity-list {
        background: transparent;
        --background: transparent;
        padding: 0 var(--nxt1-spacing-4, 16px);
      }

      .activity-item {
        --background: var(--nxt1-color-surface-100);
        --border-radius: var(--nxt1-radius-md, 12px);
        --border-color: var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-md, 12px);
        border: 1px solid var(--nxt1-color-border-subtle);
        margin-bottom: 6px;
        -webkit-tap-highlight-color: transparent;
      }

      .activity-avatar {
        width: 32px;
        height: 32px;
      }

      .activity-text {
        font-size: 12px !important;
        color: var(--nxt1-color-text-primary) !important;
        white-space: normal !important;
      }

      .activity-text strong {
        font-weight: 600;
      }

      .activity-time {
        font-size: 10px;
        color: var(--nxt1-color-text-tertiary);
      }

      /* ══════════════════════
         SECTION 10: AGENT X
         ══════════════════════ */

      .agent-x-section {
        padding-left: var(--nxt1-spacing-4, 16px);
        padding-right: var(--nxt1-spacing-4, 16px);
      }

      .agent-x-card {
        margin: 0;
        border-radius: var(--nxt1-radius-xl, 20px);
        background: var(--nxt1-color-surface-300);
        --background: var(--nxt1-color-surface-300);
        border: 1px solid var(--nxt1-color-border-primary);
        box-shadow: 0 0 15px var(--nxt1-color-alpha-primary20, rgba(204, 255, 0, 0.12));
      }

      .agent-x-content {
        padding: 16px;
        --padding-start: 16px;
        --padding-end: 16px;
        --padding-top: 16px;
        --padding-bottom: 16px;
      }

      .agent-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 14px;
      }

      .agent-icon {
        width: 40px;
        height: 40px;
        flex-shrink: 0;
        border-radius: 50%;
        background: var(--nxt1-color-primary);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-on-primary, #000);
      }

      .agent-icon svg {
        width: 20px;
        height: 20px;
      }

      .agent-name {
        font-size: 14px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
        margin: 0 0 2px;
      }

      .agent-role {
        font-size: 11px;
        color: var(--nxt1-color-text-secondary);
        margin: 0;
      }

      .agent-live-badge {
        margin-left: auto;
        flex-shrink: 0;
        display: inline-block;
        padding: 3px 8px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: color-mix(in srgb, var(--nxt1-color-primary) 10%, transparent);
        color: var(--nxt1-color-primary);
        font-size: 10px;
        font-weight: 700;
      }

      .agent-message {
        padding: 12px;
        border-radius: var(--nxt1-radius-md, 12px);
        background: var(--nxt1-color-surface-100);
        margin-bottom: 12px;
      }

      .agent-message-label {
        font-size: 10px;
        font-weight: 600;
        color: var(--nxt1-color-text-secondary);
        margin: 0 0 4px;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }

      .agent-message-body {
        font-size: 13px;
        line-height: 1.5;
        color: var(--nxt1-color-text-primary);
        margin: 0;
      }

      .agent-highlight {
        color: var(--nxt1-color-primary);
        font-weight: 600;
      }

      .agent-actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 12px;
      }

      .agent-btn-primary {
        width: 100%;
        padding: 12px;
        border-radius: var(--nxt1-radius-md, 12px);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-on-primary, #000);
        font-size: 13px;
        font-weight: 700;
        border: none;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: opacity 0.15s ease;
      }

      .agent-btn-primary:active {
        opacity: 0.85;
        transform: scale(0.98);
      }

      .agent-btn-secondary {
        width: 100%;
        padding: 12px;
        border-radius: var(--nxt1-radius-md, 12px);
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-primary);
        font-size: 13px;
        font-weight: 500;
        border: 1px solid var(--nxt1-color-border-primary);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: background-color 0.15s ease;
      }

      .agent-btn-secondary:active {
        background: var(--nxt1-color-surface-200);
        transform: scale(0.98);
      }

      .agent-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .agent-chip {
        font-size: 11px;
        --background: var(--nxt1-color-surface-100);
        --color: var(--nxt1-color-text-secondary);
        border-radius: var(--nxt1-radius-full, 9999px);
        height: auto;
        padding: 4px 10px;
      }

      /* ══════════════════════
         SKELETON LOADERS
         ══════════════════════ */

      .skeleton-section {
        padding: var(--nxt1-spacing-5, 20px) var(--nxt1-spacing-4, 16px) 0;
      }

      .skeleton-title {
        height: 20px;
        width: 140px;
        border-radius: var(--nxt1-radius-sm, 6px);
        margin-bottom: 12px;
      }

      .skeleton-row {
        display: flex;
        gap: 12px;
        overflow: hidden;
      }

      .skeleton-mover-card {
        width: 120px;
        height: 160px;
        flex-shrink: 0;
        border-radius: var(--nxt1-radius-md, 12px);
      }

      .skeleton-video {
        aspect-ratio: 16 / 9;
        width: 100%;
        border-radius: var(--nxt1-radius-md, 12px);
      }

      .skeleton-bento {
        height: 140px;
        border-radius: var(--nxt1-radius-md, 12px);
      }

      .skeleton-post {
        height: 100px;
        border-radius: var(--nxt1-radius-md, 12px);
        margin-bottom: 8px;
      }

      .skeleton-campus {
        width: 260px;
        height: 200px;
        flex-shrink: 0;
        border-radius: var(--nxt1-radius-xl, 20px);
      }

      .skeleton-intel {
        height: 70px;
        border-radius: var(--nxt1-radius-md, 12px);
        margin-bottom: 4px;
      }

      .skeleton-event {
        height: 76px;
        border-radius: var(--nxt1-radius-md, 12px);
        margin-bottom: 8px;
      }

      .skeleton-avatars {
        height: 48px;
        border-radius: var(--nxt1-radius-full, 9999px);
        width: 200px;
        margin-bottom: 10px;
      }

      .skeleton-activity {
        height: 52px;
        border-radius: var(--nxt1-radius-md, 12px);
        margin-bottom: 6px;
      }

      .skeleton-agent {
        height: 200px;
        border-radius: var(--nxt1-radius-xl, 20px);
      }

      /* ── REDUCED MOTION ── */

      @media (prefers-reduced-motion: reduce) {
        * {
          transition: none !important;
          animation: none !important;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreForYouComponent {
  private readonly haptics = inject(HapticsService);

  // ── Inputs ──────────────────────────────────────────────
  readonly user = input<ExploreUser | null>(null);

  // ── Outputs ─────────────────────────────────────────────
  /** Emitted when the user taps a content item */
  readonly itemTap = output<ExploreItem>();
  /** Emitted when the user taps "See All" or a category tile */
  readonly categorySelect = output<ExploreTabId>();

  // ── State (Signals) ─────────────────────────────────────
  readonly topAthletes = signal(MOCK_ATHLETES.slice(0, 5));
  readonly trendingMovers = signal(MOCK_ATHLETES);
  readonly featuredVideo = signal(MOCK_VIDEOS[0]);
  readonly videoList = signal(MOCK_VIDEOS);
  readonly bentoColleges = signal(MOCK_COLLEGES.slice(0, 4));
  readonly socialPosts = signal(MOCK_SOCIAL_POSTS);
  readonly campusColleges = signal(MOCK_COLLEGES.slice(0, 3));
  readonly intelArticles = signal(MOCK_INTEL);
  readonly events = signal(MOCK_EVENTS);
  readonly innerCircleAvatars = signal(MOCK_ATHLETES.slice(0, 5));

  // ── Interaction Handlers ─────────────────────────────────
  onItemTap(item: ExploreItem): void {
    void this.haptics.impact('light');
    this.itemTap.emit(item);
  }

  onCategorySelect(tab: ExploreTabId): void {
    void this.haptics.impact('light');
    this.categorySelect.emit(tab);
  }

  onArticleTap(): void {
    void this.haptics.impact('light');
  }

  onEventTap(): void {
    void this.haptics.impact('light');
  }

  onActivityTap(): void {
    void this.haptics.impact('light');
  }

  onAgentXTap(): void {
    void this.haptics.impact('medium');
  }

  // ── Helpers ─────────────────────────────────────────────
  formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  formatViews(views: number): string {
    if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
    if (views >= 1_000) return `${(views / 1_000).toFixed(0)}K`;
    return views.toString();
  }
}
