const fs = require('fs');
const path = '../packages/ui/src/team-profile/web/team-profile-shell-web.component.ts';

let content = fs.readFileSync(path, 'utf8');

// Replace madden-team-block styles
content = content.replace(
  /\.madden-team-block \{([\s\S]*?)border: 1px solid var\(--m-border\);\s*\}/,
  `.madden-team-block {$1border: 1px solid var(--nxt1-ui-border-subtle, var(--m-border, rgba(255, 255, 255, 0.08)));
        box-shadow: var(--nxt1-ui-shadow-sm, 0 10px 28px rgba(0, 0, 0, 0.14));
      }`
);

// Also fix background to match intel cards exactly
content = content.replace(
  /background: var\(--m-surface\);/,
  `background: var(--nxt1-ui-bg-card, var(--m-surface, rgba(255, 255, 255, 0.04)));`
);

// Increase spacing below option scroller
content = content.replace(
  /padding-top: var\(--nxt1-spacing-2, 8px\);/,
  `padding-top: var(--nxt1-spacing-5, 24px);`
);

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed team card shadow and top spacing!');
