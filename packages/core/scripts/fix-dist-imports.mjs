import fs from 'fs';
import path from 'path';

const HAS_EXTENSION_RE = /\.(?:js|mjs|cjs|json)$/;

function resolveImportTarget(baseDir, specifier) {
  if (HAS_EXTENSION_RE.test(specifier)) {
    return specifier;
  }

  const resolvedPath = path.join(baseDir, specifier);
  if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
    return `${specifier}/index.js`;
  }
  return `${specifier}.js`;
}

function rewriteDeclarationImports(content, baseDir) {
  let changed = false;

  // import type { Foo } from './foo'
  // export type { Foo } from './foo'
  // export * from './foo'
  const importFromRe =
    /^(\s*(?:import|export)\b[^\n]*?\bfrom\s+)(['"])(\.[^'"\n]+)(['"])(\s*;?\s*)$/gm;
  content = content.replace(importFromRe, (match, prefix, q1, specifier, q2, suffix) => {
    const target = resolveImportTarget(baseDir, specifier);
    if (target !== specifier) {
      changed = true;
      return `${prefix}${q1}${target}${q2}${suffix}`;
    }
    return match;
  });

  // import './polyfills'
  const sideEffectImportRe = /^(\s*import\s+)(['"])(\.[^'"\n]+)(['"])(\s*;?\s*)$/gm;
  content = content.replace(sideEffectImportRe, (match, prefix, q1, specifier, q2, suffix) => {
    const target = resolveImportTarget(baseDir, specifier);
    if (target !== specifier) {
      changed = true;
      return `${prefix}${q1}${target}${q2}${suffix}`;
    }
    return match;
  });

  return { content, changed };
}

function fixImports(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      fixImports(fullPath);
    } else if (file.endsWith('.d.ts')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const result = rewriteDeclarationImports(content, path.dirname(fullPath));
      if (result.changed) {
        fs.writeFileSync(fullPath, result.content, 'utf8');
      }
    }
  }
}

fixImports(path.join(process.cwd(), 'dist'));
console.log('✅ Fixed ESM relative import extensions in .d.ts files');
