/**
 * @fileoverview Invite Celebration Component - XP Earned Overlay
 * @module @nxt1/ui/invite
 * @version 1.0.0
 *
 * Full-screen celebration overlay for XP rewards and achievements.
 * Features confetti animation and haptic feedback.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  afterNextRender,
  ElementRef,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { sparkles, trophy, close, checkmarkCircle } from 'ionicons/icons';
import type { InviteAchievement } from '@nxt1/core';

addIcons({ sparkles, trophy, close, checkmarkCircle });

@Component({
  selector: 'nxt1-invite-celebration',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect],
  template: `
    <div class="celebration-overlay" (click)="onDismiss()">
      <!-- Confetti Canvas -->
      <canvas #confettiCanvas class="celebration-confetti"></canvas>

      <!-- Content Card -->
      <div class="celebration-card" (click)="$event.stopPropagation()">
        <!-- Success Icon -->
        <div class="celebration-icon">
          <div class="celebration-icon__ring celebration-icon__ring--1"></div>
          <div class="celebration-icon__ring celebration-icon__ring--2"></div>
          <div class="celebration-icon__inner">
            <ion-icon name="checkmark-circle"></ion-icon>
          </div>
        </div>

        <!-- XP Display -->
        <div class="celebration-xp">
          <span class="celebration-xp__plus">+</span>
          <span class="celebration-xp__value">{{ xpEarned() }}</span>
          <span class="celebration-xp__label">XP</span>
        </div>

        <h2 class="celebration-title">Invite Sent!</h2>
        <p class="celebration-subtitle">You're on your way to becoming an Ambassador</p>

        <!-- Achievement Unlocked (if any) -->
        @if (achievement()) {
          <div class="celebration-achievement">
            <div class="celebration-achievement__badge" [style.background]="achievement()!.color">
              <ion-icon [name]="achievement()!.icon"></ion-icon>
            </div>
            <div class="celebration-achievement__info">
              <span class="celebration-achievement__label">Achievement Unlocked!</span>
              <span class="celebration-achievement__name">{{ achievement()!.name }}</span>
            </div>
            <span class="celebration-achievement__xp">+{{ achievement()!.xpReward }} XP</span>
          </div>
        }

        <!-- Dismiss Button -->
        <button type="button" class="celebration-dismiss" (click)="onDismiss()">
          <ion-ripple-effect></ion-ripple-effect>
          Continue
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
       CELEBRATION OVERLAY
       ============================================ */

      :host {
        display: block;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 9999;
      }

      .celebration-overlay {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.85);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        animation: fadeIn 0.3s ease-out;
        padding: var(--nxt1-spacing-4);
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      /* ============================================
       CONFETTI CANVAS
       ============================================ */

      .celebration-confetti {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }

      /* ============================================
       CELEBRATION CARD
       ============================================ */

      .celebration-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--nxt1-spacing-8) var(--nxt1-spacing-6);
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-2xl);
        max-width: 340px;
        width: 100%;
        animation: scaleIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      @keyframes scaleIn {
        from {
          opacity: 0;
          transform: scale(0.8);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }

      /* ============================================
       SUCCESS ICON
       ============================================ */

      .celebration-icon {
        position: relative;
        width: 80px;
        height: 80px;
        margin-bottom: var(--nxt1-spacing-4);
      }

      .celebration-icon__ring {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        border-radius: 50%;
        border: 2px solid var(--nxt1-color-primary);
        animation: ringPulse 1.5s ease-out infinite;
      }

      .celebration-icon__ring--1 {
        width: 100%;
        height: 100%;
        opacity: 0.3;
        animation-delay: 0s;
      }

      .celebration-icon__ring--2 {
        width: 120%;
        height: 120%;
        opacity: 0.15;
        animation-delay: 0.3s;
      }

      @keyframes ringPulse {
        0% {
          transform: translate(-50%, -50%) scale(0.8);
          opacity: 0.5;
        }
        100% {
          transform: translate(-50%, -50%) scale(1.2);
          opacity: 0;
        }
      }

      .celebration-icon__inner {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 64px;
        height: 64px;
        background: var(--nxt1-color-primary);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-text-onPrimary);
        font-size: 36px;
        box-shadow: 0 8px 24px var(--nxt1-color-alpha-primary40);
      }

      /* ============================================
       XP DISPLAY
       ============================================ */

      .celebration-xp {
        display: flex;
        align-items: baseline;
        gap: 2px;
        margin-bottom: var(--nxt1-spacing-2);
      }

      .celebration-xp__plus {
        font-size: var(--nxt1-fontSize-3xl);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-primary);
      }

      .celebration-xp__value {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 56px;
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-primary);
        line-height: 1;
        animation: countUp 0.5s ease-out;
      }

      @keyframes countUp {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .celebration-xp__label {
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-secondary);
        margin-left: 4px;
      }

      /* ============================================
       TEXT
       ============================================ */

      .celebration-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-1);
      }

      .celebration-subtitle {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        margin: 0 0 var(--nxt1-spacing-5);
        text-align: center;
      }

      /* ============================================
       ACHIEVEMENT BANNER
       ============================================ */

      .celebration-achievement {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        width: 100%;
        padding: var(--nxt1-spacing-3);
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-radius-lg);
        margin-bottom: var(--nxt1-spacing-5);
        animation: slideUp 0.4s ease-out 0.2s both;
      }

      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .celebration-achievement__badge {
        width: 44px;
        height: 44px;
        border-radius: var(--nxt1-radius-md);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 22px;
        flex-shrink: 0;
      }

      .celebration-achievement__info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }

      .celebration-achievement__label {
        font-size: 10px;
        color: var(--nxt1-color-text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .celebration-achievement__name {
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
      }

      .celebration-achievement__xp {
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-primary);
      }

      /* ============================================
       DISMISS BUTTON
       ============================================ */

      .celebration-dismiss {
        width: 100%;
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
        border: none;
        border-radius: var(--nxt1-radius-lg);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        cursor: pointer;
        position: relative;
        overflow: hidden;
        transition: all 0.2s ease;
      }

      .celebration-dismiss:hover {
        transform: scale(1.02);
      }

      .celebration-dismiss:active {
        transform: scale(0.98);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InviteCelebrationComponent {
  readonly xpEarned = input<number>(0);
  readonly achievement = input<InviteAchievement | null>(null);

  readonly dismiss = output<void>();

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('confettiCanvas');

  constructor() {
    afterNextRender(() => {
      this.startConfetti();
    });
  }

  protected onDismiss(): void {
    this.dismiss.emit();
  }

  private startConfetti(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Confetti particles
    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      color: string;
      size: number;
      rotation: number;
      rotationSpeed: number;
    }> = [];

    const colors = ['#CCFF00', '#00D4FF', '#FF6B35', '#FFD700', '#E4405F', '#25D366'];

    // Create particles
    for (let i = 0; i < 80; i++) {
      particles.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * 200,
        y: canvas.height / 2,
        vx: (Math.random() - 0.5) * 15,
        vy: Math.random() * -15 - 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 8 + 4,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
      });
    }

    // Animation loop
    let frame = 0;
    const animate = () => {
      frame++;
      if (frame > 120) return; // Stop after ~2 seconds

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.3; // Gravity
        p.vx *= 0.99; // Air resistance
        p.rotation += p.rotationSpeed;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });

      requestAnimationFrame(animate);
    };

    animate();
  }
}
