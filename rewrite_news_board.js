const fs = require('fs');
const path = 'packages/ui/src/components/news-board/news-board.component.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(/import type \{ NewsBoardItem \} from '@nxt1\/core';/, "import type { NewsArticle } from '@nxt1/core';");
code = code.replace(/import \{ NxtContentCardWebComponent \} from '\.\.\/content-card';/, "import { NewsArticleCardComponent } from '../../news/news-article-card.component';");

code = code.replace(/NxtContentCardWebComponent/g, 'NewsArticleCardComponent');
code = code.replace(/readonly items = input\.required<readonly NewsBoardItem\[\]>\(\);/, 'readonly items = input.required<readonly NewsArticle[]>();');

// Update the output event type
code = code.replace(/readonly itemClick = output<NewsBoardItem>\(\);/, 'readonly itemClick = output<NewsArticle>();');

// Update the parameter type in handleItemClick
code = code.replace(/handleItemClick\(item: NewsBoardItem\)/, 'handleItemClick(item: NewsArticle)');

const fs = require('fs');
const pathnsconst path = 'packages/u<!let code = fs.readFileSync(path, 'utf8');

code = code.replace(/import type d)
code = code.replace(/import type \{ Newc fcode = code.replace(/import \{ NxtContentCardWebComponent \} from '\.\.\/content-card';/, "import { NewsArticleCardComponent  
code = code.replace(/NxtContentCardWebComponent/g, 'NewsArticleCardComponent');
code = code.replace(/readonly items = input'megaphone' : 'newspaper'"
          [badgeText]="itemcode = code.replace(/readonly items = input\.required<readonly NewsBoardItem\[')
// Update the output event type
code = code.replace(/readonly itemClick = output<NewsBoardItem>\(\);/, 'readonly itemClick = output<NewsArticle>();')temcode = code.replace(/readonly { 
// Update the parameter type in handleItemClick
code = code.replace(/handleItemClick\(item: NewsBoardItem\)/, 'handlickcode = code.replace(/handleItemClick\(item: Nete
const fs = require('fs');
const pathnsconst path = 'packages/u<!let code = fs.readFileSync(path, '   const pathnsconst path = N
code = code.replace(/import type d)
code = code.replace(/import type \{ Newc em"code = code.replace(/import tydleItecode = code.replace(/NxtContentCardWebComponent/g, 'NewsArticleCardComponent');
code = code.reileSync(path, code);
