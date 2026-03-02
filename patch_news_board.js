const fs = require('fs');
const path = 'packages/ui/src/components/news-board/news-board.component.ts';
let code = fs.readFileSync(path, 'utf8');

const oldRegex = /<nxt1-content-card[\s\S]*?\/>/m;
const replacement = `<nxt1-news-article-card
              [article]="item"
              (articleClick)="onItemClick(item)"
            />`;

code = code.replace(oldRegex, replacement);

fs.writeFileSync(path, code);
