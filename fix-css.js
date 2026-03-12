const fs = require('fs');
let file = fs.readFileSync(
  'apps/web/src/app/features/settings/account-information.component.ts',
  'utf8'
);
file = file.replace(
  /\/\* ── Re-auth card ── \*\/\s*\.reauth-card[\s\S]*?\.reauth-btn--secondary:not\(:disabled\):hover(?:[^{]*\{[^}]*\})?\n/,
  ''
);
fs.writeFileSync('apps/web/src/app/features/settings/account-information.component.ts', file);
