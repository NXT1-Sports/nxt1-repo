const fs = require('fs');
const file =
  '/Users/johnkeller/My Mac (Johns-MacBook-Pro.local)/Main/NXT1/nxt1-monorepo/apps/web/src/app/core/layout/shell/web-shell.component.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /const showSignIn = this\.authFlow\.isInitialized\(\) && this\.sidebarUserData\(\) === null;/g,
  'const showSignIn = this.authFlow.isInitialized() && !this.isAuthenticated();'
);

content = content.replace(
  /const showSignIn = this\.authFlow\.isInitialized\(\) && this\.mobileHeaderUserData\(\) === null;/g,
  'const showSignIn = this.authFlow.isInitialized() && !this.isAuthenticated();'
);

fs.writeFileSync(file, content);
console.log('PATCH DONE');
