# NXT1 Tailwind CSS & Design System Analysis

> **Comprehensive assessment of current implementation with enterprise-grade
> recommendations**
>
> _Generated: January 2026_

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Strengths Assessment](#strengths-assessment)
4. [Gap Analysis](#gap-analysis)
5. [Enterprise Best Practices Comparison](#enterprise-best-practices-comparison)
6. [Detailed Recommendations](#detailed-recommendations)
7. [Migration Roadmap](#migration-roadmap)
8. [Implementation Examples](#implementation-examples)

---

## Executive Summary

### Overall Assessment: ⭐⭐⭐⭐ (4/5 Stars - Professional Grade)

The NXT1 monorepo demonstrates a **well-architected design system** that aligns
with many enterprise patterns used by leading applications like Stripe, Linear,
Shopify, and Vercel. The foundation is solid with clear opportunities for
optimization.

| Category             | Current Score | Enterprise Target |
| -------------------- | ------------- | ----------------- |
| Token Architecture   | ⭐⭐⭐⭐⭐    | ⭐⭐⭐⭐⭐        |
| Tailwind Integration | ⭐⭐⭐⭐      | ⭐⭐⭐⭐⭐        |
| Code Sharing         | ⭐⭐⭐⭐      | ⭐⭐⭐⭐⭐        |
| Build Optimization   | ⭐⭐⭐        | ⭐⭐⭐⭐⭐        |
| Documentation        | ⭐⭐⭐⭐      | ⭐⭐⭐⭐⭐        |
| Theming (Dark/Light) | ⭐⭐⭐⭐⭐    | ⭐⭐⭐⭐⭐        |
| Component Patterns   | ⭐⭐⭐        | ⭐⭐⭐⭐⭐        |

---

## Current State Analysis

### 1. Package Structure

```
nxt1-monorepo/
├── packages/
│   ├── design-tokens/           ✅ Centralized token system
│   │   ├── tokens/              ✅ Foundation tokens (colors, typography, etc.)
│   │   ├── components/          ✅ Component-level styles
│   │   └── ionic/               ✅ Platform integration
│   ├── core/                    ✅ Pure TypeScript (no UI coupling)
│   ├── ui/                      ✅ Angular/Ionic components
│   └── config/                  ✅ Shared configurations
├── apps/
│   ├── web/
│   │   └── tailwind.config.js   ⚠️ Duplicated config
│   └── mobile/
│       └── tailwind.config.js   ⚠️ Duplicated config
└── tailwind.config.base.js      ✅ Base config exists
```

### 2. Design Token Architecture

**Current Implementation:**

```scss
// packages/design-tokens/tokens/_colors.scss
$nxt1-primary-400: #ccff00; // SCSS variable (compile-time)

:root {
  --nxt1-color-primary: #{$nxt1-primary-400}; // CSS custom property (runtime)
}
```

**Tailwind Integration:**

```javascript
// tailwind.config.base.js
colors: {
  primary: {
    400: 'var(--color-primary-400)',
    DEFAULT: 'var(--color-primary-600)',
  }
}
```

### 3. Token Categories Identified

| Category       | SCSS Variables | CSS Custom Properties | Tailwind Mapping |
| -------------- | -------------- | --------------------- | ---------------- |
| Colors         | ✅ Complete    | ✅ Complete           | ✅ Mapped        |
| Typography     | ✅ Complete    | ✅ Complete           | ✅ Mapped        |
| Spacing        | ✅ Complete    | ✅ Complete           | ⚠️ Partial       |
| Border Radius  | ✅ Complete    | ✅ Complete           | ✅ Mapped        |
| Shadows        | ✅ Complete    | ✅ Complete           | ⚠️ Partial       |
| Motion         | ✅ Complete    | ✅ Complete           | ⚠️ Partial       |
| Z-Index        | ✅ Complete    | ✅ Complete           | ❌ Not Mapped    |
| Component Dims | ✅ Complete    | ✅ Complete           | ❌ Not Mapped    |

---

## Strengths Assessment

### ✅ What You're Doing Right

#### 1. **Dual Token System (SCSS + CSS Custom Properties)**

```scss
// Excellent pattern: Both compile-time and runtime tokens
$nxt1-primary-400: #ccff00;
--nxt1-color-primary: #{$nxt1-primary-400};
```

This matches patterns used by:

- **Stripe**: SCSS variables + CSS custom properties
- **GitHub Primer**: Same dual-layer approach
- **Shopify Polaris**: Design tokens with CSS custom properties

#### 2. **Theme Support Architecture**

```scss
:root,
[data-theme='dark'] {
  // Dark theme (default)
}

[data-theme='light'] {
  // Light theme override
}
```

**Enterprise Alignment:** Matches Linear, Notion, and Discord's theming
patterns.

#### 3. **Platform-Aware Design (Ionic Integration)**

```scss
--ion-color-primary: var(--nxt1-color-primary);
--ion-background-color: var(--nxt1-color-bg-primary);
```

**Enterprise Alignment:** Proper abstraction layer between design system and
framework.

#### 4. **Semantic Color Naming**

```scss
--nxt1-color-surface-100: #{$nxt1-dark-150};
--nxt1-color-text-primary: #{$nxt1-dark-1000};
--nxt1-color-border-subtle: rgba(255, 255, 255, 0.08);
```

**Enterprise Alignment:** Follows Radix UI, Shadcn/ui, and Chakra UI semantic
naming.

#### 5. **Comprehensive Token Coverage**

- ✅ Color primitives (full scale)
- ✅ Semantic colors (success, warning, error, info)
- ✅ Sport-specific colors (domain-specific)
- ✅ Interactive states (hover, pressed, focus)
- ✅ Alpha variants (transparency levels)

---

## Gap Analysis

### ⚠️ Areas for Improvement

#### 1. **Duplicated Tailwind Configurations**

**Current Problem:**

```
apps/web/tailwind.config.js      # 121 lines
apps/mobile/tailwind.config.js   # 137 lines
tailwind.config.base.js          # 105 lines
```

**Issue:** ~90% code duplication between web and mobile configs, creating
maintenance burden and drift risk.

#### 2. **Variable Naming Inconsistency**

```javascript
// tailwind.config.base.js uses:
'var(--color-primary-400)';

// design-tokens uses:
'var(--nxt1-color-primary)';
```

**Issue:** Tailwind expects `--color-*` but design tokens define
`--nxt1-color-*`, creating a potential mismatch.

#### 3. **Missing Tailwind Plugin for Design Tokens**

**Current:** Manual mapping of each token in Tailwind config. **Enterprise
Pattern:** Automated token-to-Tailwind generation.

#### 4. **No TypeScript Token Generation**

**Current:** Only SCSS/CSS tokens. **Enterprise Pattern:** Generate TypeScript
constants for type-safe token access.

```typescript
// What enterprises do:
export const colors = {
  primary: {
    400: 'var(--nxt1-color-primary)',
  },
} as const;
```

#### 5. **Content Path Optimization Missing**

```javascript
// Current:
content: [
  './src/**/*.{html,ts,scss}',
  '../../packages/core/src/**/*.{ts,html}',
];

// Missing:
// - packages/ui (shared components)
// - packages/design-tokens (if any HTML)
```

#### 6. **No JIT Safelist for Dynamic Classes**

For dynamic class generation (sport colors, user themes), safelist is needed:

```javascript
safelist: [
  { pattern: /^bg-sport-/ },
  { pattern: /^text-(primary|secondary|error|success)/ },
];
```

---

## Enterprise Best Practices Comparison

### How Leading Companies Structure Design Systems

#### 1. **Stripe (Design Tokens)**

```
stripe-design/
├── tokens/
│   ├── base.json           # Source of truth (JSON)
│   └── themes/
│       ├── light.json
│       └── dark.json
├── build/
│   ├── css/tokens.css      # Generated
│   ├── scss/tokens.scss    # Generated
│   ├── js/tokens.ts        # Generated
│   └── tailwind.preset.js  # Generated
```

#### 2. **Linear (Tailwind + Tokens)**

```javascript
// Single source, multiple outputs
module.exports = {
  presets: [require('@linear/tailwind-config')],
  content: ['./src/**/*.tsx', '../../packages/ui/**/*.tsx'],
};
```

#### 3. **Vercel/Geist (Component Library)**

```
@vercel/geist/
├── tokens/
│   └── design-tokens.ts    # TypeScript as source
├── components/
│   └── button/
│       ├── button.tsx
│       └── button.module.css
└── tailwind.preset.js      # Exports preset
```

#### 4. **Shopify Polaris**

```
polaris/
├── tokens/
│   └── src/
│       └── tokens.json     # JSON source
├── build/
│   └── css/custom-properties.css
└── tailwind-polaris-preset/
    └── index.js            # Published npm package
```

---

## Detailed Recommendations

### Recommendation 1: Create Unified Tailwind Preset Package

**Priority: HIGH** | **Effort: Medium** | **Impact: High**

Create a dedicated Tailwind preset that apps consume:

```
packages/
└── tailwind-preset/
    ├── package.json
    ├── index.js              # Main preset
    ├── plugins/
    │   ├── nxt1-colors.js    # Custom color plugin
    │   └── nxt1-components.js
    └── README.md
```

**Implementation:**

```javascript
// packages/tailwind-preset/index.js
const nxt1Colors = require('./plugins/nxt1-colors');
const nxt1Components = require('./plugins/nxt1-components');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Automatically generated from design-tokens
        primary: {
          50: 'var(--nxt1-color-primary-50, #f4ffe0)',
          100: 'var(--nxt1-color-primary-100, #e8ffb3)',
          // ... full scale with fallbacks
          DEFAULT: 'var(--nxt1-color-primary, #ccff00)',
        },
        surface: {
          100: 'var(--nxt1-color-surface-100)',
          200: 'var(--nxt1-color-surface-200)',
          // ...
        },
        // Semantic
        success: 'var(--nxt1-color-success)',
        warning: 'var(--nxt1-color-warning)',
        error: 'var(--nxt1-color-error)',
        info: 'var(--nxt1-color-info)',
      },
      spacing: {
        // Map all nxt1 spacing tokens
        ...Object.fromEntries(
          [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 20, 24, 28, 32].map(
            (n) => [`nxt1-${n}`, `var(--nxt1-spacing-${n})`]
          )
        ),
      },
      borderRadius: {
        nxt1: {
          xs: 'var(--nxt1-radius-xs)',
          sm: 'var(--nxt1-radius-sm)',
          md: 'var(--nxt1-radius-md)',
          lg: 'var(--nxt1-radius-lg)',
          xl: 'var(--nxt1-radius-xl)',
        },
      },
      boxShadow: {
        nxt1: {
          sm: 'var(--nxt1-shadow-sm)',
          DEFAULT: 'var(--nxt1-shadow-default)',
          md: 'var(--nxt1-shadow-md)',
          lg: 'var(--nxt1-shadow-lg)',
          xl: 'var(--nxt1-shadow-xl)',
          glow: 'var(--nxt1-glow-default)',
          'glow-lg': 'var(--nxt1-glow-lg)',
        },
      },
      zIndex: {
        dropdown: 'var(--nxt1-z-index-dropdown, 1000)',
        sticky: 'var(--nxt1-z-index-sticky, 1020)',
        fixed: 'var(--nxt1-z-index-fixed, 1030)',
        'modal-backdrop': 'var(--nxt1-z-index-modal-backdrop, 1040)',
        modal: 'var(--nxt1-z-index-modal, 1050)',
        popover: 'var(--nxt1-z-index-popover, 1060)',
        tooltip: 'var(--nxt1-z-index-tooltip, 1070)',
        toast: 'var(--nxt1-z-index-toast, 1080)',
      },
      fontFamily: {
        brand: ['var(--nxt1-font-family-brand)', 'system-ui', 'sans-serif'],
        body: ['var(--nxt1-font-family-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--nxt1-font-family-mono)', 'monospace'],
      },
      transitionDuration: {
        fast: 'var(--nxt1-duration-fast, 100ms)',
        normal: 'var(--nxt1-duration-normal, 200ms)',
        slow: 'var(--nxt1-duration-slow, 300ms)',
      },
      transitionTimingFunction: {
        'nxt1-ease': 'var(--nxt1-ease-in-out)',
        'nxt1-bounce': 'var(--nxt1-ease-bounce)',
        'nxt1-spring': 'var(--nxt1-ease-spring)',
      },
    },
  },
  plugins: [nxt1Colors, nxt1Components],
};
```

**App consumption becomes trivial:**

```javascript
// apps/web/tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@nxt1/tailwind-preset')],
  content: [
    './src/**/*.{html,ts,scss}',
    '../../packages/ui/**/*.{html,ts}',
    '../../packages/core/**/*.{ts}',
  ],
  // Web-specific overrides only
};
```

---

### Recommendation 2: Implement Design Token Build Pipeline

**Priority: HIGH** | **Effort: High** | **Impact: Very High**

Use **Style Dictionary** or **Tokens Studio** to generate all formats from a
single source:

```
packages/design-tokens/
├── tokens.json                 # 👈 Single source of truth
├── build/
│   ├── css/
│   │   └── tokens.css
│   ├── scss/
│   │   ├── _variables.scss
│   │   └── _custom-properties.scss
│   ├── ts/
│   │   └── tokens.ts           # TypeScript constants
│   └── tailwind/
│       └── theme.js            # Tailwind theme object
└── style-dictionary.config.js
```

**tokens.json (Source of Truth):**

```json
{
  "nxt1": {
    "color": {
      "primary": {
        "50": { "value": "#f4ffe0" },
        "100": { "value": "#e8ffb3" },
        "400": { "value": "#ccff00", "comment": "Main brand color" },
        "DEFAULT": { "value": "{nxt1.color.primary.400}" }
      },
      "surface": {
        "100": {
          "value": "{nxt1.color.dark.150}",
          "darkValue": "{nxt1.color.dark.150}",
          "lightValue": "{nxt1.color.light.50}"
        }
      }
    },
    "spacing": {
      "0": { "value": "0" },
      "1": { "value": "0.25rem" },
      "2": { "value": "0.5rem" }
    }
  }
}
```

**Generated TypeScript (type-safe access):**

```typescript
// packages/design-tokens/build/ts/tokens.ts
export const tokens = {
  color: {
    primary: {
      50: 'var(--nxt1-color-primary-50)',
      100: 'var(--nxt1-color-primary-100)',
      400: 'var(--nxt1-color-primary-400)',
      DEFAULT: 'var(--nxt1-color-primary)',
    },
  },
  spacing: {
    0: 'var(--nxt1-spacing-0)',
    1: 'var(--nxt1-spacing-1)',
  },
} as const;

export type ColorToken = keyof typeof tokens.color;
export type SpacingToken = keyof typeof tokens.spacing;
```

---

### Recommendation 3: Create Component Composition Utilities

**Priority: MEDIUM** | **Effort: Medium** | **Impact: High**

Create a `cn()` utility and component variant patterns:

```typescript
// packages/ui/src/utils/cn.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Component Variant Pattern (CVA-style):**

```typescript
// packages/ui/src/components/button/button.variants.ts
import { cva, type VariantProps } from 'class-variance-authority';

export const buttonVariants = cva(
  // Base styles
  'focus-visible:ring-primary inline-flex items-center justify-center font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary hover:bg-primary-300 shadow-nxt1-glow text-black',
        secondary:
          'bg-surface-200 text-text-primary hover:bg-surface-300 border-border-subtle border',
        ghost: 'text-text-primary hover:bg-surface-100',
        danger: 'bg-error hover:bg-error-dark text-white',
      },
      size: {
        sm: 'rounded-nxt1-sm h-8 px-3 text-sm',
        md: 'rounded-nxt1-md h-10 px-4 text-base',
        lg: 'rounded-nxt1-lg h-12 px-6 text-lg',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;
```

---

### Recommendation 4: Implement Tailwind Safelist for Dynamic Classes

**Priority: MEDIUM** | **Effort: Low** | **Impact: Medium**

```javascript
// packages/tailwind-preset/index.js
module.exports = {
  safelist: [
    // Sport colors (dynamically applied)
    {
      pattern:
        /^bg-sport-(football|basketball|baseball|soccer|volleyball|lacrosse)$/,
    },
    {
      pattern:
        /^text-sport-(football|basketball|baseball|soccer|volleyball|lacrosse)$/,
    },
    {
      pattern:
        /^border-sport-(football|basketball|baseball|soccer|volleyball|lacrosse)$/,
    },

    // Dynamic opacity variants
    { pattern: /^bg-primary\/(10|20|30|50)$/ },
    { pattern: /^bg-surface-(100|200|300|400|500)$/ },

    // State variants that might be dynamically applied
    { pattern: /^(bg|text|border)-(success|warning|error|info)$/ },
  ],
};
```

---

### Recommendation 5: Optimize Content Paths

**Priority: HIGH** | **Effort: Low** | **Impact: High**

```javascript
// packages/tailwind-preset/content.js
const path = require('path');

function getContentPaths(appDir) {
  const monorepoRoot = path.resolve(appDir, '../..');
  return [
    // App-specific
    `${appDir}/src/**/*.{html,ts,tsx,scss}`,

    // Shared packages
    `${monorepoRoot}/packages/ui/**/*.{html,ts,tsx}`,
    `${monorepoRoot}/packages/core/src/**/*.ts`,

    // Design tokens (component styles)
    `${monorepoRoot}/packages/design-tokens/components/**/*.scss`,
  ];
}

module.exports = { getContentPaths };
```

**App usage:**

```javascript
// apps/web/tailwind.config.js
const { getContentPaths } = require('@nxt1/tailwind-preset/content');

module.exports = {
  presets: [require('@nxt1/tailwind-preset')],
  content: getContentPaths(__dirname),
};
```

---

### Recommendation 6: Add TypeScript Token Types

**Priority: MEDIUM** | **Effort: Low** | **Impact: Medium**

```typescript
// packages/design-tokens/assets/tokens.types.ts

export type NXT1ColorScale =
  | 50
  | 100
  | 200
  | 300
  | 400
  | 500
  | 600
  | 700
  | 800
  | 900;

export type NXT1PrimaryColor = `primary-${NXT1ColorScale}` | 'primary';
export type NXT1SemanticColor = 'success' | 'warning' | 'error' | 'info';
export type NXT1SurfaceColor = `surface-${100 | 200 | 300 | 400 | 500}`;
export type NXT1TextColor =
  | 'text-primary'
  | 'text-secondary'
  | 'text-tertiary'
  | 'text-inverse';

export type NXT1Color =
  | NXT1PrimaryColor
  | NXT1SemanticColor
  | NXT1SurfaceColor
  | NXT1TextColor;

export type NXT1Spacing =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 12
  | 14
  | 16
  | 20
  | 24
  | 28
  | 32;

export type NXT1Radius = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full';

export type NXT1Shadow =
  | 'none'
  | 'xs'
  | 'sm'
  | 'default'
  | 'md'
  | 'lg'
  | 'xl'
  | '2xl';

export type NXT1Glow = 'sm' | 'default' | 'lg' | 'xl';

export type NXT1Duration =
  | 'instant'
  | 'fast'
  | 'normal'
  | 'slow'
  | 'slower'
  | 'slowest';

export type NXT1Sport =
  | 'football'
  | 'basketball'
  | 'baseball'
  | 'soccer'
  | 'volleyball'
  | 'lacrosse'
  | 'hockey'
  | 'tennis'
  | 'golf'
  | 'swimming'
  | 'track'
  | 'wrestling'
  | 'softball'
  | 'default';
```

---

## Migration Roadmap

### Phase 1: Foundation (Week 1-2)

```
□ Create @nxt1/tailwind-preset package
□ Consolidate tailwind.config.base.js into preset
□ Update apps/web and apps/mobile to use preset
□ Verify no visual regressions
□ Delete redundant config code
```

### Phase 2: Token Pipeline (Week 3-4)

```
□ Install Style Dictionary
□ Convert SCSS tokens to tokens.json source format
□ Generate SCSS, CSS, and TypeScript from JSON
□ Update design-tokens package.json exports
□ Update documentation
```

### Phase 3: Component Utilities (Week 5-6)

```
□ Add cn() utility to @nxt1/ui
□ Install class-variance-authority
□ Create button, input, card variants
□ Document component patterns
□ Create Storybook stories (optional)
```

### Phase 4: Optimization (Week 7-8)

```
□ Implement content path optimization
□ Add safelist for dynamic classes
□ Configure PurgeCSS/Tailwind JIT properly
□ Measure and document bundle size improvements
□ Performance testing
```

---

## Implementation Examples

### Example: Migrated App Config

```javascript
// apps/web/tailwind.config.js (AFTER migration)
const { getContentPaths } = require('@nxt1/tailwind-preset/content');

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@nxt1/tailwind-preset')],
  content: getContentPaths(__dirname),

  // Web-specific additions only
  theme: {
    extend: {
      // Nothing needed - all comes from preset
    },
  },

  plugins: [
    // Web-specific plugins
    // require('@tailwindcss/typography'),
  ],
};
```

```javascript
// apps/mobile/tailwind.config.js (AFTER migration)
const { getContentPaths } = require('@nxt1/tailwind-preset/content');

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@nxt1/tailwind-preset')],
  content: getContentPaths(__dirname),

  // Mobile-specific additions
  corePlugins: {
    preflight: false, // Ionic handles base styles
  },

  theme: {
    extend: {
      colors: {
        // Ionic-specific color aliases
        ionic: {
          primary: 'var(--ion-color-primary)',
          secondary: 'var(--ion-color-secondary)',
        },
      },
    },
  },
};
```

### Example: Component with Design Tokens

```typescript
// Angular component using design system properly
@Component({
  selector: 'app-athlete-card',
  standalone: true,
  template: `
    <div
      class="bg-surface-200 border-border-subtle rounded-nxt1-lg p-nxt1-4 hover:bg-surface-300 duration-normal shadow-nxt1-sm hover:shadow-nxt1-md border transition-colors"
    >
      <div class="gap-nxt1-3 flex items-center">
        <img
          [src]="athlete.photoURL"
          class="w-nxt1-12 h-nxt1-12 rounded-full object-cover"
        />
        <div>
          <h3 class="text-text-primary text-lg font-semibold">
            {{ athlete.displayName }}
          </h3>
          <p class="text-text-secondary text-sm">
            {{ athlete.sport }} • {{ athlete.position }}
          </p>
        </div>
      </div>
      <div class="mt-nxt1-4 gap-nxt1-2 flex">
        <span
          class="bg-sport-{{ athlete.sport | lowercase }} text-white 
                     px-2 py-1 rounded-nxt1-sm text-xs"
        >
          {{ athlete.sport }}
        </span>
        <span
          class="bg-primary/10 text-primary rounded-nxt1-sm px-2 py-1 text-xs"
        >
          Class of {{ athlete.graduationYear }}
        </span>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AthleteCardComponent {
  @Input({ required: true }) athlete!: Athlete;
}
```

---

## Summary

### Current Strengths to Preserve

1. ✅ Dual-layer token system (SCSS + CSS custom properties)
2. ✅ Comprehensive dark/light theme support
3. ✅ Ionic platform integration
4. ✅ Semantic naming conventions
5. ✅ Comprehensive token coverage

### Key Actions for Enterprise Grade

| Priority | Action                          | Impact                 |
| -------- | ------------------------------- | ---------------------- |
| 🔴 HIGH  | Create @nxt1/tailwind-preset    | Eliminate duplication  |
| 🔴 HIGH  | Fix variable naming consistency | Prevent runtime errors |
| 🟡 MED   | Implement Style Dictionary      | Single source of truth |
| 🟡 MED   | Add TypeScript token types      | Type safety            |
| 🟢 LOW   | Add CVA component variants      | Consistent components  |
| 🟢 LOW   | Optimize content paths          | Smaller bundles        |

---

## References

- [Tailwind CSS Presets](https://tailwindcss.com/docs/presets)
- [Style Dictionary](https://amzn.github.io/style-dictionary/)
- [Tokens Studio](https://tokens.studio/)
- [Class Variance Authority](https://cva.style/docs)
- [Radix UI Themes](https://www.radix-ui.com/themes)
- [Shopify Polaris](https://polaris.shopify.com/tokens)
- [GitHub Primer](https://primer.style/foundations/primitives)
