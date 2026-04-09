# Onboarding Progress Pills - Compact Native Mobile Indicator

## Overview

Implemented a **native-style compact progress indicator** for mobile onboarding
flows, inspired by MaxPreps and other professional apps. The component displays
small dots for each step, with the active step shown as an elongated pill.

## Design Pattern

```
┌──────────────────────────────────────────┐
│                                          │
│    ●  ━━  ●  ●                          │  ← Progress Pills
│                                          │
│  ┌────────────────────────────────┐     │
│  │         Continue               │     │  ← Action Button
│  └────────────────────────────────┘     │
│                                          │
└──────────────────────────────────────────┘
     Mobile Footer (Fixed Position)
```

## Component: OnboardingProgressPillsComponent

**Location:** `/packages/ui/src/onboarding/onboarding-progress-pills/`

### Features

- **Compact dots** (8×8px) for incomplete/future steps
- **Elongated pill** (32×8px) for active step
- **Smooth CSS transitions** between states
- **Design token based** - no hardcoded colors
- **Fully accessible** with ARIA labels
- **Pure presentation logic** - no business logic

### Props

```typescript
@Input() totalSteps: number = 0;           // Total number of steps
@Input() currentStepIndex: number = 0;     // Active step (0-based)
@Input() completedStepIndices: number[] = []; // Completed steps array
```

### Usage

```html
<nxt1-onboarding-progress-pills
  [totalSteps]="4"
  [currentStepIndex]="1"
  [completedStepIndices]="[0]"
/>
```

### Visual States

| Step State | Visual Style | Width | Color                        |
| ---------- | ------------ | ----- | ---------------------------- |
| Future     | Dot          | 8px   | `--nxt1-color-border-subtle` |
| Current    | Pill         | 32px  | `--nxt1-color-primary`       |
| Completed  | Dot          | 8px   | `--nxt1-color-primary`       |

## Integration

### Mobile Footer (OnboardingButtonMobileComponent)

The progress pills are **automatically included** in the mobile footer
component, positioned above the Continue button:

```html
<nxt1-onboarding-button-mobile
  [totalSteps]="totalSteps()"
  [currentStepIndex]="currentStepIndex()"
  [completedStepIndices]="completedStepIndices()"
  [showSkip]="isCurrentStepOptional()"
  [isLastStep]="isLastStep()"
  [loading]="isLoading()"
  [disabled]="!isCurrentStepValid()"
  [showSignOut]="true"
  (skipClick)="onSkip()"
  (continueClick)="onContinue()"
  (signOutClick)="onSignOut()"
/>
```

### Onboarding Page Implementation

**Added computed signal for completed indices:**

```typescript
/** Completed step indices (0-based) for progress indicator */
readonly completedStepIndices = computed(() => {
  const completedIds = this._completedSteps();
  const steps = this._steps();
  return steps
    .map((step, index) => (completedIds.has(step.id) ? index : -1))
    .filter((index) => index >= 0);
});
```

**Removed large progress bar from main content:**

```html
<!-- BEFORE: Large stepper in main content -->
<nxt1-onboarding-progress-bar
  [steps]="steps()"
  [currentStepIndex]="currentStepIndex()"
  [completedStepIds]="completedStepIds()"
  (stepClick)="goToStep($event)"
/>

<!-- AFTER: Compact pills in footer only -->
<!-- (Progress pills automatically included in footer component) -->
```

## Design Tokens Used

All colors and dimensions use design tokens for consistency:

```css
/* Active step pill */
background: var(--nxt1-color-primary);

/* Future/inactive steps */
background: var(--nxt1-color-border-subtle);

/* Dimensions */
border-radius: var(--nxt1-borderRadius-full);

/* Transitions */
transition: all var(--nxt1-duration-normal) var(--nxt1-easing-inOut);
```

## Benefits

1. **Native Feel** - Matches patterns from Instagram, TikTok, MaxPreps
2. **Space Efficient** - Takes minimal vertical space
3. **Always Visible** - Fixed position in footer
4. **Professional** - Clean, modern design
5. **Accessible** - Proper ARIA labels
6. **Themeable** - Uses design tokens throughout
7. **Maintainable** - Single source of truth for step state

## Files Modified

### New Component

- `/packages/ui/src/onboarding/onboarding-progress-pills/onboarding-progress-pills.component.ts`
- `/packages/ui/src/onboarding/onboarding-progress-pills/index.ts`

### Updated Components

- `/packages/ui/src/onboarding/onboarding-button-mobile/onboarding-button-mobile.component.ts`
  - Added `OnboardingProgressPillsComponent` import
  - Added progress pills to template
  - Added `totalSteps`, `currentStepIndex`, `completedStepIndices` inputs

### Updated Pages

- `/apps/mobile/src/app/features/auth/pages/onboarding/onboarding.page.ts`
  - Added `completedStepIndices` computed signal
  - Removed `OnboardingProgressBarComponent` from main content
  - Passed step data to footer component

### Barrel Exports

- `/packages/ui/src/onboarding/index.ts` - Added component export
- `/packages/ui/src/index.ts` - Added to main package export

## Testing Checklist

- [ ] Progress pills render correctly for all step counts (1-10)
- [ ] Active step shows as elongated pill
- [ ] Completed steps show as filled dots
- [ ] Future steps show as outlined dots
- [ ] Transitions are smooth when changing steps
- [ ] ARIA labels are present and correct
- [ ] Component respects theme colors
- [ ] Works on different screen sizes
- [ ] No layout shift when step changes
- [ ] SafeArea respected on notched devices

## Future Enhancements

1. **Click to navigate** - Allow users to jump to completed steps
2. **Swipe gestures** - Swipe left/right to change steps
3. **Step labels** - Optional tooltip showing step name on hover/long-press
4. **Custom colors** - Per-step color overrides for special flows
5. **Animations** - More elaborate entrance/exit animations

---

**Implementation Date:** January 2026  
**Component Version:** 1.0.0  
**Related Docs:** [ONBOARDING-FLOW-MIGRATION.md](./ONBOARDING-FLOW-MIGRATION.md)
