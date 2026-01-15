# Design System & Tailwind Migration

## Status: Not Started

> From: `docs/TAILWIND-DESIGN-SYSTEM-ANALYSIS.md`

---

## Phase 1: Foundation (Week 1-2)

- [ ] Create `@nxt1/tailwind-preset` package
- [ ] Consolidate `tailwind.config.base.js` into preset
- [ ] Update `apps/web` to use preset
- [ ] Update `apps/mobile` to use preset
- [ ] Verify no visual regressions
- [ ] Delete redundant config code

---

## Phase 2: Token Pipeline (Week 3-4)

- [ ] Install Style Dictionary
- [ ] Convert SCSS tokens to `tokens.json` source format
- [ ] Generate SCSS, CSS, and TypeScript from JSON
- [ ] Update `design-tokens` package.json exports
- [ ] Update documentation

---

## Phase 3: Component Utilities (Week 5-6)

- [ ] Add `cn()` utility to `@nxt1/ui`
- [ ] Install `class-variance-authority`
- [ ] Create button variants (CVA)
- [ ] Create input variants (CVA)
- [ ] Create card variants (CVA)
- [ ] Document component patterns
- [ ] Create Storybook stories (optional)

---

## Phase 4: Optimization (Week 7-8)

- [ ] Implement content path optimization
- [ ] Add safelist for dynamic classes
- [ ] Configure PurgeCSS/Tailwind JIT properly
- [ ] Measure and document bundle size improvements
- [ ] Performance testing

---

## Additional Recommendations

From the analysis document:

| Priority | Task                                   | Benefit                           |
| -------- | -------------------------------------- | --------------------------------- |
| 🔴 HIGH  | Create `@nxt1/tailwind-preset` package | Unified config across all apps    |
| 🟡 MED   | Implement Style Dictionary             | Single source of truth for tokens |
| 🟡 MED   | Add `cn()` utility with CVA            | Type-safe component variants      |
| 🟢 LOW   | Runtime theme switching                | Dark/light mode toggle            |

---

## Files to Create/Modify

```
packages/
├── tailwind-preset/          # NEW PACKAGE
│   ├── package.json
│   ├── index.js              # Main preset export
│   ├── content.js            # Content path helper
│   └── plugins/              # Custom plugins
├── design-tokens/
│   ├── tokens.json           # NEW: Source of truth
│   └── src/
│       ├── _variables.scss   # Generated
│       ├── tokens.css        # Generated
│       └── tokens.ts         # Generated
└── ui/
    └── src/
        └── utils/
            └── cn.ts         # NEW: Class name utility
```
