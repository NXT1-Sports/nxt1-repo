type RichDocsBlockKind =
  | 'title'
  | 'subtitle'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'paragraph'
  | 'bulleted-list'
  | 'numbered-list'
  | 'rule';

interface RichDocsBlock {
  kind: RichDocsBlockKind;
  text?: string;
  readonly items?: readonly string[];
}

export interface GoogleDocsRichFormattingPlan {
  readonly insertText: string;
  readonly requests: readonly Record<string, unknown>[];
  readonly styledBlockCount: number;
}

const HEADING_PATTERN = /^\s{0,3}(#{1,6})\s+(.+)$/;
const UNORDERED_LIST_PATTERN = /^\s*[-*+]\s+(.+)$/;
const ORDERED_LIST_PATTERN = /^\s*(\d+)[.)]\s+(.+)$/;
const RULE_PATTERN = /^\s*([-*_])(?:\s*\1){2,}\s*$/;

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim();
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1');
}

function isUppercaseish(value: string): boolean {
  const letters = [...value].filter((char) => /[A-Za-z]/.test(char));
  if (letters.length === 0) return false;
  const uppercaseLetters = letters.filter((char) => char === char.toUpperCase()).length;
  return uppercaseLetters / letters.length >= 0.7;
}

function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

function looksLikeDocumentTitle(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 120) return false;
  if (wordCount(trimmed) < 4 || wordCount(trimmed) > 16) return false;
  if (/[.!?]$/.test(trimmed) || trimmed.includes(',')) return false;
  return isUppercaseish(trimmed) || /^[A-Z0-9]/.test(trimmed);
}

function looksLikeDocumentSubtitle(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 140) return false;
  if (wordCount(trimmed) > 14) return false;
  return !/[.!?]$/.test(trimmed);
}

function looksLikeSectionHeading(value: string, nextBlock: RichDocsBlock | undefined): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 120) return false;
  if (wordCount(trimmed) > 18) return false;
  if (/[.!?]$/.test(trimmed) || trimmed.includes(',')) return false;
  return (
    isUppercaseish(trimmed) ||
    /:$/.test(trimmed) ||
    nextBlock?.kind === 'bulleted-list' ||
    nextBlock?.kind === 'numbered-list'
  );
}

function pushParagraphBlock(target: RichDocsBlock[], paragraphLines: string[]): void {
  if (paragraphLines.length === 0) return;
  target.push({
    kind: 'paragraph',
    text: stripInlineMarkdown(paragraphLines.join(' ').trim()),
  });
  paragraphLines.length = 0;
}

function pushListBlock(
  target: RichDocsBlock[],
  listType: 'bulleted-list' | 'numbered-list' | null,
  items: string[]
): void {
  if (!listType || items.length === 0) return;
  target.push({ kind: listType, items: items.map((item) => stripInlineMarkdown(item.trim())) });
  items.length = 0;
}

function parseRichDocsBlocks(value: string, preferDocumentHeaderStyles: boolean): RichDocsBlock[] {
  const normalized = normalizeLineEndings(value);
  if (!normalized) return [];

  const rawLines = normalized.split('\n');
  const blocks: RichDocsBlock[] = [];
  const paragraphLines: string[] = [];
  const listItems: string[] = [];
  let listType: 'bulleted-list' | 'numbered-list' | null = null;
  let startLineIndex = 0;

  if (preferDocumentHeaderStyles) {
    const candidateLines: string[] = [];
    let scanIndex = 0;
    while (scanIndex < rawLines.length) {
      const trimmed = rawLines[scanIndex].trim();
      if (!trimmed) {
        if (candidateLines.length > 0) break;
        scanIndex += 1;
        continue;
      }
      if (
        HEADING_PATTERN.test(trimmed) ||
        UNORDERED_LIST_PATTERN.test(trimmed) ||
        ORDERED_LIST_PATTERN.test(trimmed) ||
        RULE_PATTERN.test(trimmed)
      ) {
        candidateLines.length = 0;
        break;
      }
      if (candidateLines.length >= 2) break;
      candidateLines.push(stripInlineMarkdown(trimmed));
      scanIndex += 1;
    }

    if (
      candidateLines.length === 2 &&
      looksLikeDocumentTitle(candidateLines[0]) &&
      looksLikeDocumentSubtitle(candidateLines[1])
    ) {
      blocks.push({ kind: 'title', text: candidateLines[0] });
      blocks.push({ kind: 'subtitle', text: candidateLines[1] });
      startLineIndex = scanIndex;
      while (startLineIndex < rawLines.length && !rawLines[startLineIndex].trim()) {
        startLineIndex += 1;
      }
    }
  }

  for (const rawLine of rawLines.slice(startLineIndex)) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      pushParagraphBlock(blocks, paragraphLines);
      pushListBlock(blocks, listType, listItems);
      listType = null;
      continue;
    }

    const headingMatch = trimmed.match(HEADING_PATTERN);
    if (headingMatch) {
      pushParagraphBlock(blocks, paragraphLines);
      pushListBlock(blocks, listType, listItems);
      listType = null;
      const headingText = stripInlineMarkdown(headingMatch[2].trim());
      const level = Math.min(headingMatch[1].length, 6);
      const kind: RichDocsBlockKind =
        level === 1 ? 'heading1' : level === 2 ? 'heading2' : 'heading3';
      blocks.push({ kind, text: headingText });
      continue;
    }

    const unorderedMatch = trimmed.match(UNORDERED_LIST_PATTERN);
    if (unorderedMatch) {
      pushParagraphBlock(blocks, paragraphLines);
      if (listType && listType !== 'bulleted-list') {
        pushListBlock(blocks, listType, listItems);
      }
      listType = 'bulleted-list';
      listItems.push(unorderedMatch[1]);
      continue;
    }

    const orderedMatch = trimmed.match(ORDERED_LIST_PATTERN);
    if (orderedMatch) {
      pushParagraphBlock(blocks, paragraphLines);
      if (listType && listType !== 'numbered-list') {
        pushListBlock(blocks, listType, listItems);
      }
      listType = 'numbered-list';
      listItems.push(orderedMatch[2]);
      continue;
    }

    if (RULE_PATTERN.test(trimmed)) {
      pushParagraphBlock(blocks, paragraphLines);
      pushListBlock(blocks, listType, listItems);
      listType = null;
      blocks.push({ kind: 'rule' });
      continue;
    }

    paragraphLines.push(trimmed);
  }

  pushParagraphBlock(blocks, paragraphLines);
  pushListBlock(blocks, listType, listItems);

  if (blocks.length === 0) return blocks;

  if (preferDocumentHeaderStyles && blocks[0]?.kind !== 'title') {
    if (blocks[0]?.kind === 'heading1') {
      blocks[0] = { ...blocks[0], kind: 'title' };
      if (blocks[1]?.kind === 'heading2') {
        blocks[1] = { ...blocks[1], kind: 'subtitle' };
      }
    } else if (
      blocks[0]?.kind === 'paragraph' &&
      blocks[1]?.kind === 'paragraph' &&
      looksLikeDocumentTitle(blocks[0].text ?? '') &&
      looksLikeDocumentSubtitle(blocks[1].text ?? '')
    ) {
      blocks[0] = { ...blocks[0], kind: 'title' };
      blocks[1] = { ...blocks[1], kind: 'subtitle' };
    }
  }

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.kind !== 'paragraph') continue;
    if (index < 2 && (blocks[index]?.kind === 'title' || blocks[index]?.kind === 'subtitle')) {
      continue;
    }
    if (looksLikeSectionHeading(block.text ?? '', blocks[index + 1])) {
      blocks[index] = { ...block, kind: 'heading1' };
    }
  }

  return blocks;
}

function paragraphNamedStyle(kind: RichDocsBlockKind): string | null {
  switch (kind) {
    case 'title':
      return 'TITLE';
    case 'subtitle':
      return 'SUBTITLE';
    case 'heading1':
      return 'HEADING_1';
    case 'heading2':
      return 'HEADING_2';
    case 'heading3':
      return 'HEADING_3';
    default:
      return null;
  }
}

export function shouldUseGoogleDocsRichFormatting(value: string): boolean {
  const normalized = normalizeLineEndings(value);
  if (!normalized) return false;
  return (
    /\n/.test(normalized) ||
    HEADING_PATTERN.test(normalized) ||
    UNORDERED_LIST_PATTERN.test(normalized) ||
    ORDERED_LIST_PATTERN.test(normalized)
  );
}

export function buildGoogleDocsRichFormattingPlan(
  value: string,
  insertionIndex: number,
  options?: { preferDocumentHeaderStyles?: boolean }
): GoogleDocsRichFormattingPlan | null {
  const blocks = parseRichDocsBlocks(value, options?.preferDocumentHeaderStyles ?? false);
  if (blocks.length === 0) return null;

  const requests: Record<string, unknown>[] = [];
  const insertParts: string[] = [];
  let offset = 0;
  let styledBlockCount = 0;

  for (const block of blocks) {
    if (block.kind === 'bulleted-list' || block.kind === 'numbered-list') {
      const items = block.items ?? [];
      if (items.length === 0) continue;
      const listBody = `${items.join('\n')}\n`;
      insertParts.push(listBody, '\n');
      requests.push({
        createParagraphBullets: {
          range: {
            startIndex: insertionIndex + offset,
            endIndex: insertionIndex + offset + listBody.length,
          },
          bulletPreset:
            block.kind === 'numbered-list'
              ? 'NUMBERED_DECIMAL_ALPHA_ROMAN'
              : 'BULLET_DISC_CIRCLE_SQUARE',
        },
      });
      styledBlockCount += 1;
      offset += listBody.length + 1;
      continue;
    }

    const text = block.kind === 'rule' ? '------------------------------' : (block.text ?? '');
    const paragraphText = `${text}\n`;
    insertParts.push(paragraphText, '\n');

    const namedStyleType = paragraphNamedStyle(block.kind);
    if (namedStyleType) {
      requests.push({
        updateParagraphStyle: {
          range: {
            startIndex: insertionIndex + offset,
            endIndex: insertionIndex + offset + paragraphText.length,
          },
          paragraphStyle: {
            namedStyleType,
          },
          fields: 'namedStyleType',
        },
      });
      styledBlockCount += 1;
    }

    offset += paragraphText.length + 1;
  }

  const insertText = insertParts.join('').trimEnd() + '\n';
  if (styledBlockCount === 0) return null;

  return {
    insertText,
    requests: [
      {
        insertText: {
          location: { index: insertionIndex },
          text: insertText,
        },
      },
      ...requests,
    ],
    styledBlockCount,
  };
}
