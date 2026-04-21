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
      content = content.replace(/from\s+['"](\.[^'"]+)['"]/g, (match, p1) => {
        if (!p1.endsWith('.js') && !p1.endsWith('.json')) {
          changed = true;
          return `from '${p1}.js'`;
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
