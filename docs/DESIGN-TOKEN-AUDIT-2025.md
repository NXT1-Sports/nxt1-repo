# Design Token System Audit & Fixes - January 2025

## Executive Summary

A comprehensive audit was performed on the NXT1 monorepo design token
implementation. All identified issues have been resolved, resulting in a
production-ready theming system supporting light, dark, sport-specific, and
dynamic team themes.

## Audit Scope

| Area                   | Status             |
| ---------------------- | ------------------ |
| packages/design-tokens | ✅ Audited & Fixed |
| packages/ui            | ✅ Audited & Fixed |
| apps/web               | ✅ Verified        |
| apps/mobile            | ✅ Verified        |
| Auth flows             | ✅ Verified        |
| Onboarding flows       | ✅ Verified        |

---

## Issues Identified & Resolved

### 1. Missing Focus State Tokens (ACCESSIBILITY)

**Problem:** No dedicated focus ring tokens existed for keyboard navigation and
accessibility compliance.

**Solution:** Added `focus.ring` and `focus.ringOffset` tokens to all themes:

```json
"focus": {
  "ring": { "$value": "rgba(204, 255, 0, 0.5)", "$type": "color" },
  "ringOffset": { "$value": "#0a0a0a", "$type": "color" }
}
```

**Themes Updated:**

- ✅ Dark theme (primary green focus)
- ✅ Light theme (darker green focus)
- ✅ Sport-Football (green focus)
- ✅ Sport-Basketball (orange focus)
- ✅ Sport-Baseball (blue focus)
- ✅ Sport-Softball (yellow focus)
- ✅ Team theme (dynamic via CSS properties)

### 2. Missing Loading State Tokens

**Problem:** No standardized tokens for loading spinners, skeleton placeholders,
or shimmer effects.

**Solution:** Added `loading.spinner`, `loading.skeleton`, and
`loading.skeletonShimmer` tokens:

```json
"loading": {
  "spinner": { "$value": "#ccff00", "$type": "color" },
  "skeleton": { "$value": "rgba(255, 255, 255, 0.08)", "$type": "color" },
  "skeletonShimmer": { "$value": "rgba(255, 255, 255, 0.15)", "$type": "color" }
}
```

**CSS Custom Properties Generated:**

- `--nxt1-color-loading-spinner`
- `--nxt1-color-loading-skeleton`
- `--nxt1-color-loading-skeletonShimmer`

### 3. Light Theme Missing Feedback Variants

**Problem:** Light theme lacked `successLight/Dark`, `warningLight/Dark`,
`errorLight/Dark`, `infoLight/Dark` variants.

**Solution:** Added all light/dark feedback variants with appropriate light-mode
values:

```json
"successLight": { "$value": "#dcfce7", "$type": "color" },
"successDark": { "$value": "#14532d", "$type": "color" },
"warningLight": { "$value": "#fef3c7", "$type": "color" },
"warningDark": { "$value": "#78350f", "$type": "color" },
"errorLight": { "$value": "#fee2e2", "$type": "color" },
"errorDark": { "$value": "#7f1d1d", "$type": "color" },
"infoLight": { "$value": "#dbeafe", "$type": "color" },
"infoDark": { "$value": "#1e3a8a", "$type": "color" }
```

### 4. Hardcoded Colors in Ionic Toast Styles

**Problem:** `ionic-toast.css` contained hardcoded hex values like `#ccff00`,
`#ff6d00` instead of token references.

**Solution:** Replaced all hardcoded colors with CSS custom property references:

```css
/* Before */
.toast-success {
  --background: #00c853;
}

/* After */
.toast-success {
  --background: var(--nxt1-color-feedback-success);
}
```

**File:** `packages/ui/src/styles/components/ionic-toast.css`

### 5. Missing Team Theme

**Problem:** No team theme existed for dynamic team branding. Only sport themes
were available.

**Solution:** Created complete team theme with CSS custom property fallbacks
enabling runtime team color customization:

```json
"team": {
  "color": {
    "primary": { "$value": "var(--team-primary, #ccff00)" },
    "primaryLight": { "$value": "var(--team-primary-light, #d4ff4d)" },
    "secondary": { "$value": "var(--team-secondary, #ffffff)" },
    // ... full token set
  }
}
```

**Usage Example:**

```css
/* Set team colors at runtime */
:root {
  --team-primary: #ff0000;
  --team-primary-light: #ff4d4d;
  --team-secondary: #0000ff;
  --team-text-on-primary: #ffffff;
}

/* Apply team theme */
<body data-theme="team">
```

**File:** `packages/design-tokens/tokens.json/semantic.tokens.json`

### 6. Ionic Theme Missing Team Integration

**Problem:** `ionic-theme.css` had sport theme overrides but no team theme
integration.

**Solution:** Added team theme Ionic variable overrides with CSS custom property
fallbacks:

```css
[data-theme='team'] {
  --ion-color-primary: var(--team-primary, #ccff00);
  --ion-color-primary-rgb: var(--team-primary-rgb, 204, 255, 0);
  --ion-color-primary-contrast: var(--team-text-on-primary, #0a0a0a);
  --ion-color-secondary: var(--team-secondary, #ffffff);
  /* ... */
}
```

**File:** `packages/design-tokens/ionic/ionic-theme.css`

---

## Generated Output Verification

Build command: `npm run build` in `packages/design-tokens`

### Generated Files

| File                                   | Description                 | Status       |
| -------------------------------------- | --------------------------- | ------------ |
| `dist/css/tokens.css`                  | Combined CSS tokens         | ✅ Generated |
| `dist/css/themes/dark.css`             | Dark theme overrides        | ✅ Generated |
| `dist/css/themes/light.css`            | Light theme overrides       | ✅ Generated |
| `dist/css/themes/sport-football.css`   | Football theme              | ✅ Generated |
| `dist/css/themes/sport-basketball.css` | Basketball theme            | ✅ Generated |
| `dist/css/themes/sport-baseball.css`   | Baseball theme              | ✅ Generated |
| `dist/css/themes/sport-softball.css`   | Softball theme              | ✅ Generated |
| `dist/css/themes/team.css`             | Dynamic team theme          | ✅ NEW       |
| `dist/scss/_tokens.scss`               | SCSS variables (deprecated) | ✅ Generated |
| `dist/js/tokens.mjs`                   | JavaScript module           | ✅ Generated |
| `dist/js/tokens.d.ts`                  | TypeScript definitions      | ✅ Generated |
| `dist/json/resolved.json`              | Resolved token values       | ✅ Generated |

### New CSS Custom Properties

Focus tokens (in all themes):

```css
--nxt1-color-focus-ring
--nxt1-color-focus-ringOffset
```

Loading tokens (in all themes):

```css
--nxt1-color-loading-spinner
--nxt1-color-loading-skeleton
--nxt1-color-loading-skeletonShimmer
```

Light theme feedback variants:

```css
--nxt1-color-feedback-successLight
--nxt1-color-feedback-successDark
--nxt1-color-feedback-warningLight
--nxt1-color-feedback-warningDark
--nxt1-color-feedback-errorLight
--nxt1-color-feedback-errorDark
--nxt1-color-feedback-infoLight
--nxt1-color-feedback-infoDark
```

---

## Theme Color Reference

| Theme      | Primary               | Focus Ring               | Loading Spinner |
| ---------- | --------------------- | ------------------------ | --------------- |
| Dark       | `#ccff00`             | `rgba(204, 255, 0, 0.5)` | `#ccff00`       |
| Light      | `#a3cc00`             | `rgba(163, 204, 0, 0.5)` | `#a3cc00`       |
| Football   | `#00c853`             | `rgba(0, 200, 83, 0.5)`  | `#00c853`       |
| Basketball | `#ff6d00`             | `rgba(255, 109, 0, 0.5)` | `#ff6d00`       |
| Baseball   | `#2575ff`             | `rgba(30, 91, 198, 0.5)` | `#2575ff`       |
| Softball   | `#ffc107`             | `rgba(255, 193, 7, 0.5)` | `#ffc107`       |
| Team       | `var(--team-primary)` | Dynamic                  | Dynamic         |

---

## Usage Guidelines

### Applying Focus Styles

```css
.interactive-element:focus-visible {
  outline: 2px solid var(--nxt1-color-focus-ring);
  outline-offset: 2px;
  background-color: var(--nxt1-color-focus-ringOffset);
}
```

### Skeleton Loading

```css
.skeleton-placeholder {
  background: var(--nxt1-color-loading-skeleton);
  animation: skeleton-shimmer 1.5s infinite;
}

@keyframes skeleton-shimmer {
  0% {
    background-color: var(--nxt1-color-loading-skeleton);
  }
  50% {
    background-color: var(--nxt1-color-loading-skeletonShimmer);
  }
  100% {
    background-color: var(--nxt1-color-loading-skeleton);
  }
}
```

### Dynamic Team Branding

```javascript
// Set team colors dynamically
document.documentElement.style.setProperty('--team-primary', team.primaryColor);
document.documentElement.style.setProperty(
  '--team-primary-light',
  lighten(team.primaryColor, 20)
);
document.documentElement.style.setProperty(
  '--team-secondary',
  team.secondaryColor
);
document.documentElement.style.setProperty(
  '--team-text-on-primary',
  getContrastColor(team.primaryColor)
);

// Apply team theme
document.body.setAttribute('data-theme', 'team');
```

---

## No Action Required

The following areas were audited and found to be correctly implemented:

- ✅ Auth component styles use token references via `--auth-*` CSS variables
- ✅ Onboarding components properly reference design tokens
- ✅ ThemeService in mobile app correctly handles theme persistence
- ✅ Build pipeline (build.mjs) correctly transforms DTCG tokens to all output
  formats
- ✅ Web app imports tokens correctly via `@nxt1/design-tokens`
- ✅ Mobile app imports tokens correctly via `@nxt1/design-tokens`

---

## Recommendations for Future Development

1. **Always use token references** - Never hardcode hex colors in component
   styles
2. **Test all themes** - When adding new components, verify appearance in all 8
   themes
3. **Maintain parity** - When adding tokens to one theme, add to all themes
4. **Document new tokens** - Add `$description` property to all new tokens
5. **Run build after changes** - Always run `npm run build` in
   `packages/design-tokens` after modifying tokens

---

## Files Modified

| File                                                      | Change Type                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------------- |
| `packages/design-tokens/tokens.json/semantic.tokens.json` | Added focus, loading tokens; Created team theme; Fixed light theme feedback |
| `packages/ui/src/styles/components/ionic-toast.css`       | Replaced hardcoded colors with token references                             |
| `packages/design-tokens/ionic/ionic-theme.css`            | Added team theme Ionic integration                                          |

---

**Audit Date:** January 2025  
**Auditor:** GitHub Copilot  
**Status:** ✅ Complete - Production Ready
