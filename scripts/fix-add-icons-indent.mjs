#!/usr/bin/env node
/**
 * Post-codemod fixup: Correct indentation of addIcons() blocks inside constructors.
 * The initial codemod trimmed whitespace; this restores proper nesting.
 *
 * Expected result:
 *   constructor() {
 *     addIcons({                   ← 4 spaces
 *       'key': value,              ← 6 spaces (object content)
 *     });                          ← 4 spaces
 *   }
 */

import fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const UI_SRC = path.join(ROOT, 'packages', 'ui', 'src');

// Find files that have addIcons inside a constructor
const grepOutput = execSync(`grep -rln "addIcons(" "${UI_SRC}" --include="*.ts"`, {
  encoding: 'utf8',
}).trim();

const filePaths = grepOutput.split('\n').filter(Boolean);
let fixedCount = 0;

for (const filePath of filePaths) {
  const original = fs.readFileSync(filePath, 'utf8');
  const lines = original.split('\n');
  let modified = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Find addIcons({ inside a constructor (indented with 4 spaces)
    if (/^\s{4}addIcons\(\{/.test(line)) {
      // Check if this is a multi-line call
      if (!line.includes('});')) {
        // Multi-line: fix indentation of inner lines until we hit the closing });
        let j = i + 1;
        while (j < lines.length) {
          const innerLine = lines[j];

          // Closing }); — should be at same indent as addIcons
          if (/^\s*\}\);/.test(innerLine)) {
            lines[j] = '    });';
            modified = true;
            break;
          }

          // Inner content lines: should be 6 spaces
          const trimmed = innerLine.trimStart();
          if (trimmed && !trimmed.startsWith('//')) {
            const currentIndent = innerLine.length - innerLine.trimStart().length;
            if (currentIndent !== 6) {
              lines[j] = '      ' + trimmed;
              modified = true;
            }
          }
          j++;
        }
      }
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    fixedCount++;
    const relPath = path.relative(UI_SRC, filePath);
    console.log(`✅ Fixed indentation: ${relPath}`);
  }
}

console.log(`\nFixed ${fixedCount} files.`);
