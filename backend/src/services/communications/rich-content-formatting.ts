const HTML_TAG_PATTERN = /<\/?[a-z][\s\S]*>/i;
const HEADING_PATTERN = /^\s{0,3}(#{1,6})\s+(.+)$/;
const UNORDERED_LIST_PATTERN = /^\s*[-*+]\s+(.+)$/;
const ORDERED_LIST_PATTERN = /^\s*(\d+)[.)]\s+(.+)$/;
const BLOCKQUOTE_PATTERN = /^\s*>\s?(.+)$/;
const HORIZONTAL_RULE_PATTERN = /^\s*([-*_])(?:\s*\1){2,}\s*$/;

const EMAIL_ROOT_STYLE =
  'font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#111827;';
const EMAIL_PARAGRAPH_STYLE = 'margin:0 0 16px 0;';
const EMAIL_LIST_STYLE = 'margin:0 0 16px 24px;padding:0;';
const EMAIL_LIST_ITEM_STYLE = 'margin:0 0 8px 0;';
const EMAIL_LINK_STYLE = 'color:#0f62fe;text-decoration:underline;';
const EMAIL_CODE_STYLE =
  'font-family:SFMono-Regular,Consolas,"Liberation Mono",Menlo,monospace;background:#f3f4f6;border-radius:4px;padding:1px 4px;';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim();
}

function isSafeHref(value: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(value.trim());
}

function tokenizeLinks(value: string): { text: string; placeholders: Map<string, string> } {
  let tokenIndex = 0;
  const placeholders = new Map<string, string>();

  const createToken = (html: string): string => {
    const token = `%%NXT1LINK${tokenIndex++}%%`;
    placeholders.set(token, html);
    return token;
  };

  let text = value.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (match: string, label: string, href: string) => {
      if (!isSafeHref(href)) return match;
      return createToken(
        `<a href="${escapeHtml(href.trim())}" style="${EMAIL_LINK_STYLE}">${escapeHtml(label.trim())}</a>`
      );
    }
  );

  text = text.replace(/https?:\/\/[^\s<]+[^\s<.,!?;:)]/gi, (href: string) =>
    createToken(`<a href="${escapeHtml(href)}" style="${EMAIL_LINK_STYLE}">${escapeHtml(href)}</a>`)
  );

  return { text, placeholders };
}

function restorePlaceholders(value: string, placeholders: Map<string, string>): string {
  let restored = value;
  for (const [token, html] of placeholders.entries()) {
    restored = restored.replaceAll(token, html);
  }
  return restored;
}

function renderInlineMarkdownToHtml(value: string): string {
  const { text: tokenized, placeholders } = tokenizeLinks(value);
  let html = escapeHtml(tokenized);

  html = html.replace(
    /`([^`]+)`/g,
    (_match: string, code: string) => `<code style="${EMAIL_CODE_STYLE}">${code}</code>`
  );
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '<em>$1</em>');

  return restorePlaceholders(html, placeholders);
}

function renderInlineMarkdownToPlainText(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1');
}

function convertHtmlToPrettyText(value: string): string {
  const withAnchors = value.replace(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_match: string, href: string, label: string) => {
      const cleanLabel = label
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return cleanLabel ? `${cleanLabel} (${href})` : href;
    }
  );

  const withBreaks = withAnchors
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<\/(li|p|div|section|article|blockquote|h[1-6]|ul|ol|table|tr)>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    .replace(/<[^>]+>/g, ' ');

  return decodeHtmlEntities(withBreaks)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function isHtmlContent(value: string): boolean {
  return HTML_TAG_PATTERN.test(value);
}

export function renderRichContentAsEmailHtml(value: string): string {
  if (isHtmlContent(value)) {
    return value;
  }

  const normalized = normalizeLineEndings(value);
  if (!normalized) {
    return `<div style="${EMAIL_ROOT_STYLE}"></div>`;
  }

  const blocks: string[] = [];
  const paragraphLines: string[] = [];
  const listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    blocks.push(
      `<p style="${EMAIL_PARAGRAPH_STYLE}">${paragraphLines
        .map((line) => renderInlineMarkdownToHtml(line.trim()))
        .join('<br/>')}</p>`
    );
    paragraphLines.length = 0;
  };

  const flushList = () => {
    if (!listType || listItems.length === 0) return;
    blocks.push(
      `<${listType} style="${EMAIL_LIST_STYLE}">${listItems
        .map(
          (item) => `<li style="${EMAIL_LIST_ITEM_STYLE}">${renderInlineMarkdownToHtml(item)}</li>`
        )
        .join('')}</${listType}>`
    );
    listItems.length = 0;
    listType = null;
  };

  for (const rawLine of normalized.split('\n')) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = trimmed.match(HEADING_PATTERN);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = Math.min(headingMatch[1].length, 6);
      const marginBottom = level === 1 ? 20 : 16;
      blocks.push(
        `<h${level} style="margin:24px 0 ${marginBottom}px 0;line-height:1.25;color:#111827;">${renderInlineMarkdownToHtml(headingMatch[2].trim())}</h${level}>`
      );
      continue;
    }

    const unorderedListMatch = trimmed.match(UNORDERED_LIST_PATTERN);
    if (unorderedListMatch) {
      flushParagraph();
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(unorderedListMatch[1].trim());
      continue;
    }

    const orderedListMatch = trimmed.match(ORDERED_LIST_PATTERN);
    if (orderedListMatch) {
      flushParagraph();
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(`${orderedListMatch[1]}. ${orderedListMatch[2].trim()}`);
      continue;
    }

    const blockquoteMatch = trimmed.match(BLOCKQUOTE_PATTERN);
    if (blockquoteMatch) {
      flushParagraph();
      flushList();
      blocks.push(
        `<blockquote style="margin:0 0 16px 0;padding:0 0 0 16px;border-left:4px solid #d1d5db;color:#374151;"><p style="${EMAIL_PARAGRAPH_STYLE}">${renderInlineMarkdownToHtml(blockquoteMatch[1].trim())}</p></blockquote>`
      );
      continue;
    }

    if (HORIZONTAL_RULE_PATTERN.test(trimmed)) {
      flushParagraph();
      flushList();
      blocks.push('<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>');
      continue;
    }

    paragraphLines.push(trimmed);
  }

  flushParagraph();
  flushList();

  return `<div style="${EMAIL_ROOT_STYLE}">${blocks.join('')}</div>`;
}

export function renderRichContentAsDocumentText(value: string): string {
  if (isHtmlContent(value)) {
    return convertHtmlToPrettyText(value);
  }

  const normalized = normalizeLineEndings(value);
  if (!normalized) return '';

  const lines: string[] = [];
  let previousWasBlank = false;

  const pushLine = (line: string) => {
    const clean = line.trimEnd();
    if (!clean) {
      if (previousWasBlank || lines.length === 0) return;
      lines.push('');
      previousWasBlank = true;
      return;
    }
    lines.push(clean);
    previousWasBlank = false;
  };

  for (const rawLine of normalized.split('\n')) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      pushLine('');
      continue;
    }

    const headingMatch = trimmed.match(HEADING_PATTERN);
    if (headingMatch) {
      pushLine(renderInlineMarkdownToPlainText(headingMatch[2].trim()));
      pushLine('');
      continue;
    }

    const unorderedListMatch = trimmed.match(UNORDERED_LIST_PATTERN);
    if (unorderedListMatch) {
      pushLine(`• ${renderInlineMarkdownToPlainText(unorderedListMatch[1].trim())}`);
      continue;
    }

    const orderedListMatch = trimmed.match(ORDERED_LIST_PATTERN);
    if (orderedListMatch) {
      pushLine(
        `${orderedListMatch[1]}. ${renderInlineMarkdownToPlainText(orderedListMatch[2].trim())}`
      );
      continue;
    }

    const blockquoteMatch = trimmed.match(BLOCKQUOTE_PATTERN);
    if (blockquoteMatch) {
      pushLine(`> ${renderInlineMarkdownToPlainText(blockquoteMatch[1].trim())}`);
      continue;
    }

    if (HORIZONTAL_RULE_PATTERN.test(trimmed)) {
      pushLine('---');
      continue;
    }

    pushLine(renderInlineMarkdownToPlainText(trimmed));
  }

  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
