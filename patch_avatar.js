const fs = require('fs');
const file =
  '/Users/johnkeller/My Mac (Johns-MacBook-Pro.local)/Main/NXT1/nxt1-monorepo/apps/web/src/app/core/layout/shell/web-shell.component.ts';
let content = fs.readFileSync(file, 'utf8');

// Also, let's enable showAvatar on mobile header just in case they thought missing avatar = logged out
content = content.replace(/showAvatar: false,/g, 'showAvatar: true,');

fs.writeFileSync(file, content);
console.log('AVATAR PATCH DONE');
