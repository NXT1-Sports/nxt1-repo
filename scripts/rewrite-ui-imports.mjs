#!/usr/bin/env node
/**
 * @fileoverview Codemod: Rewrite `from '@nxt1/ui'` imports to granular sub-paths.
 *
 * WHY:  The root barrel `@nxt1/ui` (src/index.ts) re-exports 1,354 lines of
 *       symbols from 30+ sub-directories. When esbuild resolves an import from
 *       '@nxt1/ui', it follows ALL re-exports and bundles them into one shared
 *       chunk (2.6 MB). Using granular sub-paths tells esbuild exactly which
 *       source modules are needed, enabling true code splitting.
 *
 * HOW:  1. Parses the root barrel to build symbol → sub-path mappings.
 *       2. For each app file with `from '@nxt1/ui'`, remaps symbols to sub-paths.
 *       3. Rewrites the imports.
 *
 * USAGE: node scripts/rewrite-ui-imports.mjs [--dry-run]
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const DRY_RUN = process.argv.includes('--dry-run');
const ROOT = process.cwd();

// ────────────────────────────────────────────────────────────
// 1. Build symbol → sub-path mapping from root barrel
// ────────────────────────────────────────────────────────────
const barrelPath = path.join(ROOT, 'packages', 'ui', 'src', 'index.ts');
const barrelContent = fs.readFileSync(barrelPath, 'utf8');

/** @type {Map<string, string>} symbol name → sub-path (e.g., 'NxtPlatformService' → 'services') */
const symbolMap = new Map();

// Parse export blocks: export { Foo, Bar, type Baz } from './some-path';
const exportBlockRegex = /export\s*\{([^}]+)\}\s*from\s*['"]\.\/([^'"]+)['"]/g;

let match;
while ((match = exportBlockRegex.exec(barrelContent)) !== null) {
  const rawSymbols = match[1];
  const fromPath = match[2]; // e.g., 'services', 'components', 'explore'

  // Strip single-line comments before parsing symbol names
  const cleanedSymbols = rawSymbols.replace(/\/\/[^\n]*/g, '');

  // Extract symbol names (strip `type ` prefix if present)
  const symbolNames = cleanedSymbols
    .split(',')
    .map((s) => s.trim().replace(/^type\s+/, ''))
    .filter(Boolean);

  for (const sym of symbolNames) {
    symbolMap.set(sym, fromPath);
  }
}

console.log(
  `Built mapping: ${symbolMap.size} symbols across ${new Set(symbolMap.values()).size} sub-paths.\n`
);

// Group paths into importable sub-paths
// The tsconfig wildcard `@nxt1/ui/*` → `packages/ui/src/*` means:
// - 'services' → '@nxt1/ui/services'
// - 'components' → '@nxt1/ui/components' (still a large barrel)
// - 'explore' → '@nxt1/ui/explore'
//
// For components, we want finer granularity. The root barrel exports
// from './components' which re-exports from sub-dirs. Let's check if
// the symbol is also available from a more specific component path.
const componentsBarrelPath = path.join(ROOT, 'packages', 'ui', 'src', 'components', 'index.ts');
const componentsContent = fs.readFileSync(componentsBarrelPath, 'utf8');

/** @type {Map<string, string>} symbol → specific component sub-path */
const componentSubMap = new Map();
let cmatch;
const compExportRegex = /export\s*\{([^}]+)\}\s*from\s*['"]\.\/([^'"]+)['"]/g;
while ((cmatch = compExportRegex.exec(componentsContent)) !== null) {
  const rawSymbols = cmatch[1];
  const fromPath = cmatch[2]; // e.g., 'icon', 'avatar', 'desktop-sidebar'

  // Strip single-line comments before parsing
  const cleanedSymbols = rawSymbols.replace(/\/\/[^\n]*/g, '');
  const symbolNames = cleanedSymbols
    .split(',')
    .map((s) => s.trim().replace(/^type\s+/, ''))
    .filter(Boolean);

  for (const sym of symbolNames) {
    componentSubMap.set(sym, `components/${fromPath}`);
  }
}

// Override generic 'components' path with specific sub-paths
for (const [sym, subPath] of componentSubMap) {
  if (symbolMap.get(sym) === 'components') {
    symbolMap.set(sym, subPath);
  }
}

console.log(
  `Refined component mapping: ${componentSubMap.size} symbols have specific component sub-paths.\n`
);

// ────────────────────────────────────────────────────────────
// 2. Find all files with `from '@nxt1/ui'` (exact root barrel)
// ────────────────────────────────────────────────────────────
const grepOutput = execSync(`grep -rln "from '@nxt1/ui'" apps/web/src/ --include="*.ts"`, {
  encoding: 'utf8',
  cwd: ROOT,
}).trim();

const filePaths = grepOutput.split('\n').filter(Boolean);
console.log(`Found ${filePaths.length} files with root barrel imports.\n`);

let successCount = 0;
let skipCount = 0;
const errors = [];

// ────────────────────────────────────────────────────────────
// 3. Transform each file
// ────────────────────────────────────────────────────────────
for (const relFile of filePaths) {
  const filePath = path.join(ROOT, relFile);
  try {
    const original = fs.readFileSync(filePath, 'utf8');

    // Find all `from '@nxt1/ui'` import statements (could be multi-line)
    // We need to handle:
    //   import { A, B } from '@nxt1/ui';
    //   import { A,\n  B,\n  type C } from '@nxt1/ui';
    const importRegex = /import\s*\{([^}]+)\}\s*from\s*'@nxt1\/ui'\s*;/g;

    let modified = original;
    let anyChange = false;

    // Process all import blocks (could be multiple per file)
    const imports = [...original.matchAll(importRegex)];

    for (const m of imports) {
      const fullMatch = m[0];
      const symbolsStr = m[1];

      // Parse symbols
      const symbols = symbolsStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      // Group symbols by their target sub-path
      /** @type {Map<string, string[]>} sub-path → list of symbol strings (with 'type' prefix) */
      const groups = new Map();
      const unmapped = [];

      for (const sym of symbols) {
        const cleanSym = sym.replace(/^type\s+/, '');
        const subPath = symbolMap.get(cleanSym);

        if (subPath) {
          if (!groups.has(subPath)) groups.set(subPath, []);
          groups.get(subPath).push(sym);
        } else {
          unmapped.push(sym);
        }
      }

      if (unmapped.length > 0) {
        // Keep unmapped symbols in the original import
        console.warn(`⚠️  ${relFile}: Unmapped symbols: ${unmapped.join(', ')}`);
        if (!groups.has('__unmapped__')) groups.set('__unmapped__', []);
        groups.get('__unmapped__').push(...unmapped);
      }

      // Build replacement import statements
      const newImports = [];

      for (const [subPath, syms] of groups) {
        if (subPath === '__unmapped__') {
          // Keep original import for unmapped symbols
          const symList = syms.join(', ');
          newImports.push(`import { ${symList} } from '@nxt1/ui';`);
          continue;
        }

        const symList = syms.join(', ');
        // For readability, multi-line if > 2 symbols
        if (syms.length <= 2) {
          newImports.push(`import { ${symList} } from '@nxt1/ui/${subPath}';`);
        } else {
          const symLines = syms.map((s) => `  ${s},`).join('\n');
          newImports.push(`import {\n${symLines}\n} from '@nxt1/ui/${subPath}';`);
        }
      }

      const replacement = newImports.join('\n');
      modified = modified.replace(fullMatch, replacement);
      anyChange = true;
    }

    if (anyChange) {
      if (DRY_RUN) {
        console.log(`🔍 DRY RUN: ${relFile}`);
      } else {
        fs.writeFileSync(filePath, modified, 'utf8');
        console.log(`✅ ${relFile}`);
      }
      successCount++;
    } else {
      skipCount++;
    }
  } catch (err) {
    console.error(`❌ ${relFile}: ${err.message}`);
    errors.push({ file: relFile, error: err.message });
  }
}

// ────────────────────────────────────────────────────────────
// 4. Summary
// ────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
console.log(`✅ Transformed: ${successCount}`);
console.log(`⏭  Skipped:     ${skipCount}`);
console.log(`❌ Errors:       ${errors.length}`);
if (errors.length > 0) {
  for (const e of errors) {
    console.log(`   ${e.file}: ${e.error}`);
  }
}
if (DRY_RUN) {
  console.log('\n(Dry run — no files were modified)');
}
