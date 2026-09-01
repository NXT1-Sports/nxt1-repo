import { posix as pathPosix } from 'node:path';
import JSZip from 'jszip';

const PPTX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
]);
const MAX_EXTRACTED_TEXT_CHARS = 12_000;

export interface PptxSlideContent {
  readonly slideNumber: number;
  readonly slideText: string;
  readonly speakerNotes: string;
  readonly hasVisualElements: boolean;
  readonly visualElementCount: number;
}

export interface PptxDocumentContent {
  readonly slideCount: number;
  readonly slides: readonly PptxSlideContent[];
}

export function isPptxDocument(
  mimeType: string | undefined,
  fileName: string | undefined
): boolean {
  const normalizedMimeType = mimeType?.trim().toLowerCase();
  if (normalizedMimeType && PPTX_MIME_TYPES.has(normalizedMimeType)) {
    return true;
  }

  return /\.pptx?$/i.test(fileName ?? '');
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_match, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10))
    );
}

function normalizeExtractedText(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').split('\u0000').join('').trim();
  if (normalized.length <= MAX_EXTRACTED_TEXT_CHARS) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_EXTRACTED_TEXT_CHARS - 18).trimEnd()}\n...[truncated]`;
}

function extractTextRuns(xml: string): string {
  const paragraphs = Array.from(xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g))
    .map((paragraphMatch) => {
      const runs = Array.from(paragraphMatch[1].matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g))
        .map((match) => decodeXmlEntities(match[1]).replace(/\s+/g, ' ').trim())
        .filter((value) => value.length > 0);
      return runs.join(' ').trim();
    })
    .filter((value) => value.length > 0);

  if (paragraphs.length > 0) {
    return normalizeExtractedText(paragraphs.join('\n'));
  }

  const looseRuns = Array.from(xml.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g))
    .map((match) => decodeXmlEntities(match[1]).replace(/\s+/g, ' ').trim())
    .filter((value) => value.length > 0);

  return normalizeExtractedText(looseRuns.join('\n'));
}

function countMatches(source: string, pattern: RegExp): number {
  return Array.from(source.matchAll(pattern)).length;
}

function extractNotesTarget(slideXmlPath: string, relationshipsXml: string): string | null {
  const relationshipMatches = relationshipsXml.matchAll(/<Relationship\b([^>]+?)\/>/g);
  for (const match of relationshipMatches) {
    const attributes = match[1];
    if (!/Type="[^"]*\/notesSlide"/i.test(attributes)) {
      continue;
    }

    const targetMatch = attributes.match(/Target="([^"]+)"/i);
    if (!targetMatch?.[1]) {
      continue;
    }

    return pathPosix.normalize(pathPosix.join(pathPosix.dirname(slideXmlPath), targetMatch[1]));
  }

  return null;
}

function compareSlidePaths(left: string, right: string): number {
  const leftNumber = Number.parseInt(left.match(/slide(\d+)\.xml$/i)?.[1] ?? '0', 10);
  const rightNumber = Number.parseInt(right.match(/slide(\d+)\.xml$/i)?.[1] ?? '0', 10);
  return leftNumber - rightNumber;
}

export async function extractPptxDocumentContent(buffer: Buffer): Promise<PptxDocumentContent> {
  const zip = await JSZip.loadAsync(buffer);
  const slideXmlPaths = Object.keys(zip.files)
    .filter((filePath) => /^ppt\/slides\/slide\d+\.xml$/i.test(filePath))
    .sort(compareSlidePaths);

  const slides: PptxSlideContent[] = [];

  for (const slideXmlPath of slideXmlPaths) {
    const slideFile = zip.file(slideXmlPath);
    if (!slideFile) {
      continue;
    }

    const slideXml = await slideFile.async('string');
    const slideNumber = Number.parseInt(slideXmlPath.match(/slide(\d+)\.xml$/i)?.[1] ?? '0', 10);
    const relationshipsPath = pathPosix.join(
      pathPosix.dirname(slideXmlPath),
      '_rels',
      `${pathPosix.basename(slideXmlPath)}.rels`
    );
    const relationshipsXml = await zip.file(relationshipsPath)?.async('string');
    const notesXmlPath = relationshipsXml
      ? extractNotesTarget(slideXmlPath, relationshipsXml)
      : null;
    const notesXml = notesXmlPath ? await zip.file(notesXmlPath)?.async('string') : undefined;
    const visualElementCount =
      countMatches(slideXml, /<p:pic\b/gi) +
      countMatches(slideXml, /<c:chart\b/gi) +
      countMatches(slideXml, /<dgm:relIds\b/gi);

    slides.push({
      slideNumber,
      slideText: extractTextRuns(slideXml),
      speakerNotes: notesXml ? extractTextRuns(notesXml) : '',
      hasVisualElements: visualElementCount > 0 || /<p:graphicFrame\b/i.test(slideXml),
      visualElementCount,
    });
  }

  return {
    slideCount: slides.length,
    slides,
  };
}
