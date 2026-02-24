#!/usr/bin/env node
/**
 * @fileoverview Codemod: Move module-scope addIcons() into class constructors.
 *
 * WHY:  Module-scope addIcons({…}) calls are side effects that prevent the
 *       bundler from tree-shaking unused components out of the @nxt1/ui FESM.
 *       Moving them into the constructor makes each component self-contained
 *       and side-effect-free at the module level. addIcons() is idempotent,
 *       so calling it per-instance is safe.
 *
 * WHAT: For every .ts file under packages/ui/src/ that has an addIcons() call
 *       at column 0 (module scope), this script:
 *         1. Extracts the full addIcons({…}); block (handles multi-line).
 *         2. Removes it from module scope.
 *         3. Inserts it into the class constructor (creates one if needed).
 *
 * USAGE: node scripts/fix-add-icons.mjs [--dry-run]
 */

import fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const DRY_RUN = process.argv.includes('--dry-run');
const ROOT = process.cwd();
const UI_SRC = path.join(ROOT, 'packages', 'ui', 'src');

// ────────────────────────────────────────────────────────────
// 1. Discover files with module-scope addIcons()
// ────────────────────────────────────────────────────────────
const grepOutput = execSync(`grep -rln "^addIcons(" "${UI_SRC}" --include="*.ts"`, {
  encoding: 'utf8',
}).trim();

if (!grepOutput) {
  console.log('No module-scope addIcons() calls found.');
  process.exit(0);
}

const filePaths = grepOutput.split('\n').filter(Boolean);
console.log(`Found ${filePaths.length} files with module-scope addIcons().\n`);

let successCount = 0;
let skipCount = 0;
const errors = [];

// ────────────────────────────────────────────────────────────
// 2. Transform each file
// ────────────────────────────────────────────────────────────
for (const filePath of filePaths) {
  const relPath = path.relative(UI_SRC, filePath);

  try {
    const original = fs.readFileSync(filePath, 'utf8');
    const lines = original.split('\n');

    // ── 2a. Locate the module-scope addIcons block ──────────
    let blockStart = -1;
    let blockEnd = -1;

    for (let i = 0; i < lines.length; i++) {
      // Must start at column 0 (module scope, not inside a function)
      if (/^addIcons\(/.test(lines[i])) {
        blockStart = i;
        // Track brace depth to find the matching close
        let depth = 0;
        for (let j = i; j < lines.length; j++) {
          for (const ch of lines[j]) {
            if (ch === '(') depth++;
            if (ch === ')') depth--;
          }
          if (depth === 0) {
            blockEnd = j;
            break;
          }
        }
        break; // Only handle the first module-scope occurrence
      }
    }

    if (blockStart === -1 || blockEnd === -1) {
      console.log(`⚠️  SKIP (parse failed): ${relPath}`);
      skipCount++;
      continue;
    }

    // Extract the block text
    const blockLines = lines.slice(blockStart, blockEnd + 1);
    // Re-indent each line to 4 spaces (constructor body)
    const indentedBlock = blockLines.map((l) => `    ${l.trimStart()}`).join('\n');

    // ── 2b. Remove the block from module scope ─────────────
    // Also remove a trailing blank line if present
    let removeCount = blockEnd - blockStart + 1;
    if (blockEnd + 1 < lines.length && lines[blockEnd + 1].trim() === '') {
      removeCount++;
    }
    lines.splice(blockStart, removeCount);

    // ── 2c. Insert into constructor ─────────────────────────
    // Find `constructor(…) {`
    const constructorIdx = lines.findIndex((l) => /^\s+constructor\s*\(/.test(l));

    if (constructorIdx !== -1) {
      // Find the opening brace line (could be on same line or next)
      let braceLineIdx = constructorIdx;
      while (braceLineIdx < lines.length && !lines[braceLineIdx].includes('{')) {
        braceLineIdx++;
      }
      // Insert the addIcons block right after the opening brace
      lines.splice(braceLineIdx + 1, 0, indentedBlock);
    } else {
      // No constructor — create one.
      // Find `export class Xxx … {`
      const classIdx = lines.findIndex((l) => /^export class\s/.test(l));

      if (classIdx === -1) {
        // Fallback: non-exported class
        const altClassIdx = lines.findIndex((l) => /^class\s/.test(l));
        if (altClassIdx === -1) {
          throw new Error('Could not find class declaration');
        }
        insertConstructorAfterClassOpen(lines, altClassIdx, indentedBlock);
      } else {
        insertConstructorAfterClassOpen(lines, classIdx, indentedBlock);
      }
    }

    // ── 2d. Write ───────────────────────────────────────────
    const result = lines.join('\n');

    if (DRY_RUN) {
      console.log(`🔍 DRY RUN: ${relPath}`);
    } else {
      fs.writeFileSync(filePath, result, 'utf8');
      console.log(`✅ ${relPath}`);
    }
    successCount++;
  } catch (err) {
    console.error(`❌ ${relPath}: ${err.message}`);
    errors.push({ file: relPath, error: err.message });
  }
}

// ────────────────────────────────────────────────────────────
// 3. Summary
// ────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
console.log(`✅ Transformed: ${successCount}`);
console.log(`⚠️  Skipped:     ${skipCount}`);
console.log(`❌ Errors:       ${errors.length}`);
if (errors.length > 0) {
  for (const e of errors) {
    console.log(`   ${e.file}: ${e.error}`);
  }
}
if (DRY_RUN) {
  console.log('\n(Dry run — no files were modified)');
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────
function insertConstructorAfterClassOpen(lines, classIdx, indentedBlock) {
  // Walk forward to find the `{` that opens the class body
  let braceLineIdx = classIdx;
  while (braceLineIdx < lines.length && !lines[braceLineIdx].includes('{')) {
    braceLineIdx++;
  }

  // Build the constructor block
  const ctorBlock = ['  constructor() {', indentedBlock, '  }', ''].join('\n');

  lines.splice(braceLineIdx + 1, 0, ctorBlock);
}
