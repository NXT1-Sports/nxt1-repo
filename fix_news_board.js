const fs = require('fs');
const path = 'packages/ui/src/components/news-board/news-board.component.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(/NewsBoardItem/g, 'NewsArticle');

fs.writeFileSync(path, code);
