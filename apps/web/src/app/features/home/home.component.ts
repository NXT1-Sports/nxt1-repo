/**
 * @fileoverview Home Page Component
 * @module @nxt1/web/features/home
 *
 * Main landing page after successful authentication.
 * Protected by auth guard - requires user to be logged in.
 */

import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthFlowService } from '../auth/services';
import { AUTH_ROUTES } from '@nxt1/core/constants';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div
      class="min-h-screen overflow-y-auto bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800"
    >
      <!-- Header -->
      <header class="bg-white shadow-sm dark:bg-gray-800">
        <div class="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <!-- Logo -->
              <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
                <span class="text-xl font-bold text-white">N1</span>
              </div>
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white">NXT1 Sports</h1>
            </div>

            <!-- User Info & Sign Out -->
            <div class="flex items-center gap-4">
              @if (user(); as currentUser) {
                <div class="text-right">
                  <p class="text-sm font-medium text-gray-900 dark:text-white">
                    {{ currentUser.displayName || currentUser.email }}
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    {{ currentUser.email }}
                  </p>
                </div>
              }
              <button
                type="button"
                (click)="onSignOut()"
                class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <!-- Main Content -->
      <main class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <!-- Welcome Section -->
        <div class="mb-8 rounded-2xl bg-white p-8 shadow-lg dark:bg-gray-800">
          <h2 class="mb-2 text-3xl font-bold text-gray-900 dark:text-white">
            Welcome to NXT1 Sports! 🎉
          </h2>
          <p class="text-lg text-gray-600 dark:text-gray-300">
            Your recruiting journey starts here. This is a placeholder home page.
          </p>
        </div>

        <!-- Feature Cards -->
        <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <!-- Card 1: Profile -->
          <div
            class="rounded-xl bg-white p-6 shadow-md transition-shadow hover:shadow-xl dark:bg-gray-800"
          >
            <div
              class="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900"
            >
              <svg
                class="h-6 w-6 text-blue-600 dark:text-blue-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <h3 class="mb-2 text-xl font-semibold text-gray-900 dark:text-white">Your Profile</h3>
            <p class="text-gray-600 dark:text-gray-300">
              View and edit your athletic profile, stats, and achievements.
            </p>
          </div>

          <!-- Card 2: Explore -->
          <div
            class="rounded-xl bg-white p-6 shadow-md transition-shadow hover:shadow-xl dark:bg-gray-800"
          >
            <div
              class="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900"
            >
              <svg
                class="h-6 w-6 text-green-600 dark:text-green-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <h3 class="mb-2 text-xl font-semibold text-gray-900 dark:text-white">Explore</h3>
            <p class="text-gray-600 dark:text-gray-300">
              Discover colleges, coaches, and opportunities that match your goals.
            </p>
          </div>

          <!-- Card 3: Messages -->
          <div
            class="rounded-xl bg-white p-6 shadow-md transition-shadow hover:shadow-xl dark:bg-gray-800"
          >
            <div
              class="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900"
            >
              <svg
                class="h-6 w-6 text-purple-600 dark:text-purple-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
            </div>
            <h3 class="mb-2 text-xl font-semibold text-gray-900 dark:text-white">Messages</h3>
            <p class="text-gray-600 dark:text-gray-300">
              Connect with coaches and teammates through secure messaging.
            </p>
          </div>

          <!-- Card 4: Stats -->
          <div
            class="rounded-xl bg-white p-6 shadow-md transition-shadow hover:shadow-xl dark:bg-gray-800"
          >
            <div
              class="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900"
            >
              <svg
                class="h-6 w-6 text-orange-600 dark:text-orange-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <h3 class="mb-2 text-xl font-semibold text-gray-900 dark:text-white">Performance</h3>
            <p class="text-gray-600 dark:text-gray-300">
              Track your athletic performance and improvement over time.
            </p>
          </div>

          <!-- Card 5: Videos -->
          <div
            class="rounded-xl bg-white p-6 shadow-md transition-shadow hover:shadow-xl dark:bg-gray-800"
          >
            <div
              class="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900"
            >
              <svg
                class="h-6 w-6 text-red-600 dark:text-red-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h3 class="mb-2 text-xl font-semibold text-gray-900 dark:text-white">Highlight Reel</h3>
            <p class="text-gray-600 dark:text-gray-300">
              Upload and share your best game highlights and skills videos.
            </p>
          </div>

          <!-- Card 6: Rankings -->
          <div
            class="rounded-xl bg-white p-6 shadow-md transition-shadow hover:shadow-xl dark:bg-gray-800"
          >
            <div
              class="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-100 dark:bg-yellow-900"
            >
              <svg
                class="h-6 w-6 text-yellow-600 dark:text-yellow-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                />
              </svg>
            </div>
            <h3 class="mb-2 text-xl font-semibold text-gray-900 dark:text-white">Rankings</h3>
            <p class="text-gray-600 dark:text-gray-300">
              See where you stand among recruits in your class and position.
            </p>
          </div>
        </div>

        <!-- Auth Status Card -->
        <div class="mt-8 rounded-xl bg-blue-50 p-6 dark:bg-blue-900/20">
          <h3 class="mb-3 text-lg font-semibold text-blue-900 dark:text-blue-100">
            Authentication Status
          </h3>
          <div class="space-y-2 text-sm text-blue-800 dark:text-blue-200">
            <p>✅ You are successfully signed in</p>
            <p>✅ Auth guard is working - protected route</p>
            <p>✅ Session persistence active</p>
            @if (user(); as currentUser) {
              <p>👤 User ID: {{ currentUser.uid }}</p>
              @if (currentUser.email) {
                <p>📧 Email: {{ currentUser.email }}</p>
              }
            }
          </div>
        </div>
      </main>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  private readonly authFlow = inject(AuthFlowService);
  private readonly router = inject(Router);

  /** Current authenticated user */
  readonly user = computed(() => this.authFlow.user());

  /**
   * Handle sign out
   */
  async onSignOut(): Promise<void> {
    try {
      await this.authFlow.signOut();
      await this.router.navigate([AUTH_ROUTES.ROOT]);
    } catch (error) {
      console.error('[Home] Sign out failed:', error);
    }
  }
}
