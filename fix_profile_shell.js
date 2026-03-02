const fs = require('fs');
const path = 'packages/ui/src/profile/profile-shell.component.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(/type NewsBoardItem,\n  mapNewsArticlesToBoardItems,/, '');
code = code.replace(/mapNewsArticlesToBoardItems\(MOCK_NEWS_ARTICLES\)/, 'MOCK_NEWS_ARTICLES');

fs.writeFileSync(path, code);
