import fs from 'fs';
import path from 'path';

function fixImports(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      fixImports(fullPath);
    } else if (file.endsWith('.d.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;
      content = content.replace(/(from|import)\s*(\(?)\s*['"](\.[^'"]+)['"]\s*(\)?)/g, (match, keyword, openParen, p1, closeParen) => {
        if (!p1.endsWith('.js') && !p1.endsWith('.mjs') && !p1.endsWith('.cjs') && !p1.endsWith('.json')) {
          changed = true;
          const resolvedPath = path.join(dir, p1);
          let target = p1 + '.js';
          if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
            target = p1 + '/index.js';
          }
          return `${keyword} ${openParen}'${target}'${closeParen}`;
        }
        return match;
      });
      if (changed) {
        fs.writeFileSync(fullPath, content, 'utf8');
      }
    }
  }
}

fixImports(path.join(process.cwd(), 'dist'));
console.log('✅ Fixed ESM relative import extensions in .d.ts files');
