/**
 * @fileoverview Tabs Page Component
 * @module @nxt1/mobile
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
  IonBadge,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  homeOutline,
  home,
  searchOutline,
  search,
  trophyOutline,
  trophy,
  chatbubbleOutline,
  chatbubble,
  personOutline,
  person,
} from 'ionicons/icons';

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonBadge],
  template: `
    <ion-tabs>
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="home">
          <ion-icon name="home-outline"></ion-icon>
          <ion-label>Home</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="discover">
          <ion-icon name="search-outline"></ion-icon>
          <ion-label>Discover</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="rankings">
          <ion-icon name="trophy-outline"></ion-icon>
          <ion-label>Rankings</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="messages">
          <ion-icon name="chatbubble-outline"></ion-icon>
          <ion-label>Messages</ion-label>
          @if (unreadCount > 0) {
            <ion-badge color="danger">{{ unreadCount }}</ion-badge>
          }
        </ion-tab-button>

        <ion-tab-button tab="profile">
          <ion-icon name="person-outline"></ion-icon>
          <ion-label>Profile</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  `,
  styles: `
    ion-tab-bar {
      --background: var(--ion-tab-bar-background, #ffffff);
      border-top: 1px solid var(--ion-border-color, #e5e5e5);
    }

    ion-tab-button {
      --color: var(--ion-color-medium);
      --color-selected: var(--ion-color-primary);
    }

    ion-badge {
      position: absolute;
      top: 4px;
      right: 12px;
      font-size: 10px;
      padding: 2px 6px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabsPage {
  unreadCount = 0;

  constructor() {
    addIcons({
      homeOutline,
      home,
      searchOutline,
      search,
      trophyOutline,
      trophy,
      chatbubbleOutline,
      chatbubble,
      personOutline,
      person,
    });
  }
}
