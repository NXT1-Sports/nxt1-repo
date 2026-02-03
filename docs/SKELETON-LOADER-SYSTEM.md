# Skeleton Loader System — NXT1 Monorepo

> **2026 DESIGN TOKEN SYSTEM** — Centralized skeleton loader utilities with NO
> hardcoded values

---

## Overview

The NXT1 skeleton loader system provides a consistent, token-based approach to
loading states across web and mobile applications. All skeleton loaders use CSS
custom properties from the design token system, ensuring:

- ✅ **Consistent visual appearance** across all features
- ✅ **Single source of truth** for colors, timing, and animations
- ✅ **Theme-aware** skeleton loaders
- ✅ **Zero hardcoded values** in component styles
- ✅ **Reusable utility classes** for common patterns

---

## Design Token Structure

### JSON Tokens

Location: `packages/design-tokens/tokens.json/component.tokens.json`

```json
{
  "component": {
    "skeleton": {
      "color": {
        "base": "rgba(255, 255, 255, 0.03)",
        "highlight": "rgba(255, 255, 255, 0.08)",
        "accent": "rgba(204, 255, 0, 0.1)"
      },
      "animation": {
        "duration": "1.5s",
        "timing": "ease-in-out"
      },
      "height": {
        "xs": "12px",
        "sm": "14px",
        "md": "16px",
        "lg": "20px",
        "xl": "28px"
      }
    }
  }
}
```

### CSS Custom Properties

Generated CSS variables (available globally):

```css
:root {
  /* Colors */
  --nxt1-skeleton-color-base: rgba(255, 255, 255, 0.03);
  --nxt1-skeleton-color-highlight: rgba(255, 255, 255, 0.08);
  --nxt1-skeleton-color-accent: rgba(204, 255, 0, 0.1);

  /* Animation */
  --nxt1-skeleton-animation-duration: 1.5s;
  --nxt1-skeleton-animation-timing: ease-in-out;

  /* Heights */
  --nxt1-skeleton-height-xs: 12px;
  --nxt1-skeleton-height-sm: 14px;
  --nxt1-skeleton-height-md: 16px;
  --nxt1-skeleton-height-lg: 20px;
  --nxt1-skeleton-height-xl: 28px;

  /* Border Radius */
  --nxt1-skeleton-radius-sm: 4px;
  --nxt1-skeleton-radius-md: 8px;
  --nxt1-skeleton-radius-lg: 12px;
  --nxt1-skeleton-radius-xl: 16px;
  --nxt1-skeleton-radius-full: 9999px;
}
```

---

## Utility Classes

Location: `packages/design-tokens/foundation/skeleton.css`

### Basic Usage

```html
<!-- Text skeleton -->
<div class="nxt1-skeleton nxt1-skeleton--text-md"></div>

<!-- Avatar skeleton -->
<div class="nxt1-skeleton nxt1-skeleton--avatar"></div>

<!-- Image skeleton -->
<div class="nxt1-skeleton nxt1-skeleton--image"></div>

<!-- Card skeleton -->
<div class="nxt1-skeleton nxt1-skeleton--card"></div>
```

### Available Variants

#### Text Skeletons

- `nxt1-skeleton--text-xs` — 30% width, 12px height
- `nxt1-skeleton--text-sm` — 40% width, 14px height
- `nxt1-skeleton--text-md` — 60% width, 16px height
- `nxt1-skeleton--text-lg` — 75% width, 20px height
- `nxt1-skeleton--text-xl` — 100% width, 28px height
- `nxt1-skeleton--title` — 70% width, 28px height
- `nxt1-skeleton--subtitle` — 50% width, 16px height

#### Avatar Skeletons

- `nxt1-skeleton--avatar-xs` — 24x24px
- `nxt1-skeleton--avatar-sm` — 32x32px
- `nxt1-skeleton--avatar-md` — 40x40px (default)
- `nxt1-skeleton--avatar-lg` — 56x56px
- `nxt1-skeleton--avatar-xl` — 80x80px
- `nxt1-skeleton--avatar-2xl` — 120x120px

#### Image Skeletons

- `nxt1-skeleton--image` — 16:9 aspect ratio
- `nxt1-skeleton--image-square` — 1:1 aspect ratio
- `nxt1-skeleton--image-portrait` — 3:4 aspect ratio
- `nxt1-skeleton--image-landscape` — 16:9 aspect ratio
- `nxt1-skeleton--image-wide` — 21:9 aspect ratio

#### Component Skeletons

- `nxt1-skeleton--chip` — 60x22px pill shape
- `nxt1-skeleton--button` — 120x40px rounded
- `nxt1-skeleton--input` — Full width, 40px height
- `nxt1-skeleton--card` — Full width, 200px min-height

### Utility Modifiers

```html
<!-- Width modifiers -->
<div class="nxt1-skeleton nxt1-skeleton--w-sm"></div>
<!-- 40% width -->

<!-- Height modifiers -->
<div class="nxt1-skeleton nxt1-skeleton--h-lg"></div>
<!-- 20px height -->

<!-- Border radius modifiers -->
<div class="nxt1-skeleton nxt1-skeleton--rounded-full"></div>

<!-- Animation delay -->
<div class="nxt1-skeleton nxt1-skeleton--delay-2"></div>
```

### Layout Patterns

Pre-built skeleton layouts for common UI patterns:

```html
<!-- Profile Card Skeleton -->
<div class="nxt1-skeleton-profile">
  <div class="nxt1-skeleton nxt1-skeleton--avatar-lg"></div>
  <div class="nxt1-skeleton-profile__content">
    <div class="nxt1-skeleton nxt1-skeleton--text-md"></div>
    <div class="nxt1-skeleton nxt1-skeleton--text-sm"></div>
  </div>
</div>

<!-- List Item Skeleton -->
<div class="nxt1-skeleton-list-item">
  <div class="nxt1-skeleton nxt1-skeleton--avatar"></div>
  <div class="nxt1-skeleton-list-item__content">
    <div class="nxt1-skeleton nxt1-skeleton--text-md"></div>
    <div class="nxt1-skeleton nxt1-skeleton--text-xs"></div>
  </div>
</div>

<!-- Grid Card Skeleton -->
<div class="nxt1-skeleton-grid-card">
  <div class="nxt1-skeleton nxt1-skeleton--image"></div>
  <div class="nxt1-skeleton nxt1-skeleton--title"></div>
  <div class="nxt1-skeleton nxt1-skeleton--text-sm"></div>
</div>
```

---

## Component Usage

### Angular Components (Standalone)

When building custom skeleton components, use design tokens instead of hardcoded
values:

```typescript
// ❌ WRONG: Hardcoded values
@Component({
  styles: [
    `
      .skeleton {
        background: rgba(255, 255, 255, 0.03);
        animation: shimmer 1.5s ease-in-out infinite;
      }
    `,
  ],
})
export class MySkeletonComponent {}

// ✅ CORRECT: Design tokens
@Component({
  styles: [
    `
      .skeleton {
        background: var(--nxt1-skeleton-color-base);
        animation: shimmer var(--nxt1-skeleton-animation-duration)
          var(--nxt1-skeleton-animation-timing) infinite;
      }
    `,
  ],
})
export class MySkeletonComponent {}
```

### Shimmer Animation

Use the standardized shimmer gradient:

```css
.skeleton-shimmer {
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    var(--nxt1-skeleton-color-base) 0%,
    var(--nxt1-skeleton-color-highlight) 25%,
    var(--nxt1-skeleton-color-accent) 50%,
    var(--nxt1-skeleton-color-highlight) 75%,
    var(--nxt1-skeleton-color-base) 100%
  );
  background-size: 200% 100%;
  animation: shimmer var(--nxt1-skeleton-animation-duration)
    var(--nxt1-skeleton-animation-timing) infinite;
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}
```

---

## Migration Guide

### Step 1: Identify Hardcoded Skeleton Styles

Search for hardcoded skeleton patterns:

```bash
# Find hardcoded skeleton colors
grep -r "rgba(255, 255, 255, 0\." --include="*.scss" --include="*.ts"

# Find hardcoded animations
grep -r "animation.*1\.5s" --include="*.scss" --include="*.ts"

# Find skeleton classes
grep -r "class=\"skeleton" --include="*.html" --include="*.ts"
```

### Step 2: Replace with Design Tokens

**Before:**

```scss
.skeleton-element {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  animation: shimmer 1.5s ease-in-out infinite;
}

.skeleton-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.08) 0%,
    rgba(204, 255, 0, 0.15) 50%,
    rgba(255, 255, 255, 0.08) 100%
  );
}
```

**After:**

```scss
.skeleton-element {
  background: var(--nxt1-skeleton-color-base);
  border-radius: var(--nxt1-skeleton-radius-md);
  animation: shimmer var(--nxt1-skeleton-animation-duration)
    var(--nxt1-skeleton-animation-timing) infinite;
}

.skeleton-avatar {
  width: 56px;
  height: 56px;
  border-radius: var(--nxt1-skeleton-radius-full);
  background: linear-gradient(
    90deg,
    var(--nxt1-skeleton-color-base) 0%,
    var(--nxt1-skeleton-color-highlight) 25%,
    var(--nxt1-skeleton-color-accent) 50%,
    var(--nxt1-skeleton-color-highlight) 75%,
    var(--nxt1-skeleton-color-base) 100%
  );
}
```

### Step 3: Use Utility Classes Where Possible

If the skeleton is simple, replace custom styles with utility classes:

**Before:**

```html
<div class="custom-skeleton-name"></div>
<div class="custom-skeleton-position"></div>
<div class="custom-skeleton-avatar"></div>
```

```scss
.custom-skeleton-name {
  height: 16px;
  width: 70%;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
}
.custom-skeleton-position {
  height: 12px;
  width: 60%;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
}
.custom-skeleton-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
}
```

**After:**

```html
<div class="nxt1-skeleton nxt1-skeleton--text-md"></div>
<div class="nxt1-skeleton nxt1-skeleton--text-sm"></div>
<div class="nxt1-skeleton nxt1-skeleton--avatar-lg"></div>
```

---

## Accessibility

### ARIA Attributes

Always include proper ARIA attributes on skeleton loaders:

```html
<div
  class="nxt1-skeleton-profile"
  role="progressbar"
  aria-label="Loading profile"
  aria-busy="true"
>
  <!-- Skeleton content -->
</div>
```

### Reduced Motion Support

The skeleton system automatically respects `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  .nxt1-skeleton::before {
    animation: none;
    background: var(--nxt1-skeleton-color-highlight);
  }
}
```

---

## Examples

### Scout Report Card Skeleton

```html
<div class="nxt1-skeleton-grid-card">
  <!-- Image -->
  <div class="nxt1-skeleton nxt1-skeleton--image-portrait"></div>

  <!-- Content -->
  <div style="display: flex; flex-direction: column; gap: 8px;">
    <!-- Name -->
    <div class="nxt1-skeleton nxt1-skeleton--text-lg"></div>

    <!-- Chips -->
    <div style="display: flex; gap: 4px;">
      <div class="nxt1-skeleton nxt1-skeleton--chip"></div>
      <div class="nxt1-skeleton nxt1-skeleton--chip-sm"></div>
    </div>

    <!-- Meta -->
    <div class="nxt1-skeleton nxt1-skeleton--text-sm"></div>

    <!-- Stats -->
    <div
      style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;"
    >
      <div class="nxt1-skeleton nxt1-skeleton--h-lg"></div>
      <div class="nxt1-skeleton nxt1-skeleton--h-lg"></div>
      <div class="nxt1-skeleton nxt1-skeleton--h-lg"></div>
      <div class="nxt1-skeleton nxt1-skeleton--h-lg"></div>
    </div>
  </div>
</div>
```

### Profile Header Skeleton

```html
<div class="nxt1-skeleton-profile">
  <div class="nxt1-skeleton nxt1-skeleton--avatar-2xl"></div>
  <div class="nxt1-skeleton-profile__content">
    <div class="nxt1-skeleton nxt1-skeleton--title"></div>
    <div class="nxt1-skeleton nxt1-skeleton--subtitle"></div>
    <div class="nxt1-skeleton nxt1-skeleton--text-sm"></div>
  </div>
</div>
```

### Table Row Skeleton

```html
<div class="nxt1-skeleton-table-row">
  <div class="nxt1-skeleton nxt1-skeleton--text-md"></div>
  <div class="nxt1-skeleton nxt1-skeleton--text-sm"></div>
  <div class="nxt1-skeleton nxt1-skeleton--text-sm"></div>
  <div class="nxt1-skeleton nxt1-skeleton--text-xs"></div>
</div>
```

---

## Testing

### Visual Regression Tests

Skeleton loaders should have consistent appearance across themes and platforms:

```typescript
describe('Skeleton Loaders', () => {
  it('should render with correct token values', () => {
    const skeleton = fixture.debugElement.query(By.css('.nxt1-skeleton'));
    const styles = window.getComputedStyle(skeleton.nativeElement);

    expect(styles.background).toBe('var(--nxt1-skeleton-color-base)');
    expect(styles.animationDuration).toBe('1.5s');
  });

  it('should respect prefers-reduced-motion', () => {
    // Test reduced motion support
  });
});
```

---

## Common Mistakes to Avoid

### ❌ DON'T: Hardcode skeleton colors

```scss
.skeleton {
  background: rgba(255, 255, 255, 0.03); // ❌ Hardcoded
}
```

### ✅ DO: Use design tokens

```scss
.skeleton {
  background: var(--nxt1-skeleton-color-base); // ✅ Token-based
}
```

### ❌ DON'T: Create custom skeleton animations

```scss
@keyframes my-custom-shimmer {
  // ❌ Custom animation
  from {
    opacity: 0.3;
  }
  to {
    opacity: 0.8;
  }
}
```

### ✅ DO: Use the standardized shimmer

```scss
animation: shimmer var(--nxt1-skeleton-animation-duration)
  var(--nxt1-skeleton-animation-timing) infinite; // ✅ Standardized
```

### ❌ DON'T: Inline skeleton styles

```html
<div
  style="background: rgba(255,255,255,0.03); height: 20px; border-radius: 4px;"
></div>
```

### ✅ DO: Use utility classes

```html
<div class="nxt1-skeleton nxt1-skeleton--text-lg"></div>
```

---

## Future Enhancements

- [ ] Theme-aware skeleton colors (light mode support)
- [ ] Skeleton pattern library in Storybook
- [ ] Automated skeleton generator from component props
- [ ] Performance monitoring for skeleton render times
- [ ] A11y testing suite for skeleton loaders

---

## References

- [Design Tokens Documentation](../design-tokens/DESIGN-TOKENS.md)
- [Component Tokens JSON](../design-tokens/tokens.json/component.tokens.json)
- [Skeleton CSS Utilities](../design-tokens/foundation/skeleton.css)
- [Scout Report Skeleton Component](../packages/ui/src/scout-reports/scout-report-skeleton.component.ts)

---

**Version:** 1.0.0 **Last Updated:** February 3, 2026 **Status:** Production
Ready
