/**
 * @fileoverview @ionic/angular/standalone stub module for Vitest
 *
 * Replaces the real Ionic package via resolve.alias so that:
 *  1. Node.js never loads the Ionic FESM bundle (which uses unsupported ESM
 *     directory imports like `@ionic/core/components`).
 *  2. All Ionic symbols imported by @nxt1/ui resolve without errors.
 *
 * These are intentionally minimal class stubs. Tests that need specific
 * behaviour should provide their own mock via `useValue` in TestBed.
 */

// ── Ionic UI components ────────────────────────────────────────────────────

export class IonBadge {}
export class IonButton {}
export class IonContent {}
export class IonIcon {}
export class IonInfiniteScroll {}
export class IonInfiniteScrollContent {}
export class IonInput {}
export class IonItem {}
export class IonLabel {}
export class IonList {}
export class IonModal {}
export class IonNote {}
export class IonPopover {}
export class IonRange {}
export class IonRefresher {}
export class IonRefresherContent {}
export class IonRippleEffect {}
export class IonSearchbar {}
export class IonSelect {}
export class IonSelectOption {}
export class IonSkeletonText {}
export class IonSpinner {}
export class IonTabBar {}
export class IonTabButton {}
export class IonTextarea {}
export class IonToggle {}

// ── Ionic service controllers ──────────────────────────────────────────────

export class AlertController {
  async create() {
    return { present: async () => {}, dismiss: async () => {}, onDidDismiss: async () => ({}) };
  }
}

export class MenuController {
  async open() {}
  async close() {}
  async toggle() {}
  async enable() {}
  async isOpen() {
    return false;
  }
  async getMenus() {
    return [];
  }
}

export class ModalController {
  async create() {
    return { present: async () => {}, dismiss: async () => {} };
  }
  async dismiss() {}
}

export class ToastController {
  async create() {
    return { present: async () => {}, dismiss: async () => {} };
  }
}

export class Platform {
  is() {
    return false;
  }
  async ready() {
    return 'dom';
  }
  width() {
    return 0;
  }
  height() {
    return 0;
  }
}
