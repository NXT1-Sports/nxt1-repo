declare module 'csv-parse/sync' {
  export interface CsvParseSyncOptions {
    readonly skip_empty_lines?: boolean;
    readonly relax_column_count?: boolean;
    readonly trim?: boolean;
  }

  export function parse(input: string, options?: CsvParseSyncOptions): unknown;
}

declare module 'pdf-parse' {
  export interface PdfParseResult {
    readonly text: string;
    readonly numpages: number;
    readonly numrender: number;
    readonly info?: Record<string, unknown>;
    readonly metadata?: Record<string, unknown>;
    readonly version?: string;
  }

  export default function pdfParse(
    dataBuffer: Buffer | Uint8Array,
    options?: Record<string, unknown>
  ): Promise<PdfParseResult>;
}
