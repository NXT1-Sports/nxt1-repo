import PptxGenJS from 'pptxgenjs';
import { AgentEngineError } from '../exceptions/agent-engine.error.js';

interface PptxSlideLike {
  background?: { color: string };
  addShape(shapeName: string, options: Record<string, unknown>): void;
  addText(text: string | readonly { text: string; options?: Record<string, unknown> }[], options: Record<string, unknown>): void;
  addImage(options: Record<string, unknown>): void;
  addTable(rows: readonly unknown[][], options: Record<string, unknown>): void;
  addNotes?(notes: string): void;
}

interface PptxDeckLike {
  author: string;
  company: string;
  subject: string;
  title: string;
  lang: string;
  theme: {
    headFontFace: string;
    bodyFontFace: string;
    lang: string;
  };
  layout: string;
  defineLayout(layout: { name: string; width: number; height: number }): void;
  addSlide(): PptxSlideLike;
  write(props: { outputType: 'nodebuffer' }): Promise<string | ArrayBuffer | Blob | Uint8Array>;
}

type PptxConstructor = new () => PptxDeckLike;

const PptxGenJSCtor = PptxGenJS as unknown as PptxConstructor;
const DEFAULT_SCHEMA_VERSION = 'editable-pptx.v1';
const DEFAULT_FONT_FACE = 'Aptos';
const MAX_SLIDES = 80;
const MAX_ELEMENTS_PER_SLIDE = 160;
const HEX_COLOR_PATTERN = /^#?[0-9a-f]{6}$/i;

const ASPECT_RATIO_LAYOUTS = {
  widescreen_16_9: { name: 'NXT1_EDITABLE_16_9', width: 13.333, height: 7.5 },
  standard_4_3: { name: 'NXT1_EDITABLE_4_3', width: 10, height: 7.5 },
} as const;

export type EditablePptxAspectRatio = keyof typeof ASPECT_RATIO_LAYOUTS;
export type EditablePptxShapeKind = 'rect' | 'roundRect' | 'ellipse' | 'line' | 'arc' | 'triangle' | 'diamond' | 'chevron' | 'pentagon' | 'hexagon';
export type EditablePptxElementKind = 'text' | 'shape' | 'image' | 'table' | 'statCard' | 'badge' | 'divider' | 'group';

export interface EditablePptxGeometry {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface EditablePptxTheme {
  readonly fontFace?: string;
  readonly headingFontFace?: string;
  readonly backgroundColor?: string;
  readonly surfaceColor?: string;
  readonly primaryColor?: string;
  readonly secondaryColor?: string;
  readonly accentColor?: string;
  readonly textColor?: string;
  readonly mutedTextColor?: string;
  readonly borderColor?: string;
}

interface EditablePptxElementBase extends EditablePptxGeometry {
  readonly id?: string;
  readonly type: EditablePptxElementKind;
}

export interface EditablePptxTextElement extends EditablePptxElementBase {
  readonly type: 'text';
  readonly text: string;
  readonly fontSize?: number;
  readonly fontFace?: string;
  readonly color?: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly align?: 'left' | 'center' | 'right' | 'justify';
  readonly valign?: 'top' | 'mid' | 'bottom';
  readonly bullet?: boolean;
  readonly fit?: 'shrink' | 'resize';
  readonly margin?: number;
}

export interface EditablePptxShapeElement extends EditablePptxElementBase {
  readonly type: 'shape';
  readonly shape: EditablePptxShapeKind;
  readonly fillColor?: string;
  readonly lineColor?: string;
  readonly lineWidth?: number;
  readonly transparency?: number;
  readonly radius?: number;
}

export interface EditablePptxImageElement extends EditablePptxElementBase {
  readonly type: 'image';
  readonly data?: string;
  readonly path?: string;
  readonly altText?: string;
  readonly transparency?: number;
}

export interface EditablePptxTableCell {
  readonly text: string | number | boolean | null;
  readonly fillColor?: string;
  readonly color?: string;
  readonly bold?: boolean;
  readonly align?: 'left' | 'center' | 'right';
}

export interface EditablePptxTableElement extends EditablePptxElementBase {
  readonly type: 'table';
  readonly rows: readonly (readonly (string | number | boolean | null | EditablePptxTableCell)[])[];
  readonly headerRow?: boolean;
  readonly fontSize?: number;
  readonly borderColor?: string;
  readonly headerFillColor?: string;
  readonly headerTextColor?: string;
  readonly cellFillColor?: string;
  readonly color?: string;
}

export interface EditablePptxStatCardElement extends EditablePptxElementBase {
  readonly type: 'statCard';
  readonly label: string;
  readonly value: string | number;
  readonly caption?: string;
  readonly fillColor?: string;
  readonly borderColor?: string;
  readonly accentColor?: string;
}

export interface EditablePptxBadgeElement extends EditablePptxElementBase {
  readonly type: 'badge';
  readonly label: string;
  readonly fillColor?: string;
  readonly textColor?: string;
  readonly borderColor?: string;
}

export interface EditablePptxDividerElement extends EditablePptxElementBase {
  readonly type: 'divider';
  readonly color?: string;
  readonly thickness?: number;
}

export interface EditablePptxGroupElement extends EditablePptxElementBase {
  readonly type: 'group';
  readonly children: readonly EditablePptxElement[];
}

export type EditablePptxElement =
  | EditablePptxTextElement
  | EditablePptxShapeElement
  | EditablePptxImageElement
  | EditablePptxTableElement
  | EditablePptxStatCardElement
  | EditablePptxBadgeElement
  | EditablePptxDividerElement
  | EditablePptxGroupElement;

export interface EditablePptxSlide {
  readonly id?: string;
  readonly title?: string;
  readonly backgroundColor?: string;
  readonly notes?: string;
  readonly elements: readonly EditablePptxElement[];
}

export interface EditablePptxDeckSchema {
  readonly schemaVersion?: string;
  readonly title?: string;
  readonly aspectRatio?: EditablePptxAspectRatio;
  readonly theme?: EditablePptxTheme;
  readonly slides: readonly EditablePptxSlide[];
}

export interface EditablePptxRenderMetadata {
  readonly schemaVersion: string;
  readonly slideCount: number;
  readonly aspectRatio: EditablePptxAspectRatio;
  readonly warnings: readonly string[];
  readonly verified: boolean;
}

export interface EditablePptxRenderResult {
  readonly buffer: Buffer;
  readonly metadata: EditablePptxRenderMetadata;
}

interface ResolvedTheme {
  readonly fontFace: string;
  readonly headingFontFace: string;
  readonly backgroundColor: string;
  readonly surfaceColor: string;
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly accentColor: string;
  readonly textColor: string;
  readonly mutedTextColor: string;
  readonly borderColor: string;
}

interface RenderContext {
  readonly slide: PptxSlideLike;
  readonly slideIndex: number;
  readonly path: string;
  readonly layout: (typeof ASPECT_RATIO_LAYOUTS)[EditablePptxAspectRatio];
  readonly theme: ResolvedTheme;
  readonly warnings: string[];
  readonly offsetX: number;
  readonly offsetY: number;
}

export class EditablePptxRendererService {
  async render(schema: EditablePptxDeckSchema): Promise<EditablePptxRenderResult> {
    const warnings: string[] = [];
    const normalizedSchema = this.normalizeSchema(schema, warnings);
    const aspectRatio = normalizedSchema.aspectRatio ?? 'widescreen_16_9';
    const layout = ASPECT_RATIO_LAYOUTS[aspectRatio];
    const theme = this.resolveTheme(normalizedSchema.theme, warnings);
    const deck = new PptxGenJSCtor();

    deck.author = 'NXT1 Agent X';
    deck.company = 'NXT1';
    deck.subject = 'Editable PowerPoint deck generated by Agent X';
    deck.title = normalizedSchema.title ?? 'Agent X Editable Deck';
    deck.lang = 'en-US';
    deck.theme = {
      headFontFace: theme.headingFontFace,
      bodyFontFace: theme.fontFace,
      lang: 'en-US',
    };
    deck.defineLayout(layout);
    deck.layout = layout.name;

    normalizedSchema.slides.forEach((schemaSlide, index) => {
      const slide = deck.addSlide();
      slide.background = { color: this.stripHash(schemaSlide.backgroundColor ?? theme.backgroundColor) };
      if (schemaSlide.notes?.trim()) {
        if (typeof slide.addNotes === 'function') {
          slide.addNotes(schemaSlide.notes.trim());
        } else {
          warnings.push(`slides[${index}].notes could not be embedded because the PPTX renderer does not support speaker notes.`);
        }
      }

      schemaSlide.elements.forEach((element, elementIndex) => {
        this.renderElement(element, {
          slide,
          slideIndex: index,
          path: `slides[${index}].elements[${elementIndex}]`,
          layout,
          theme,
          warnings,
          offsetX: 0,
          offsetY: 0,
        });
      });
    });

    const rawBuffer = await deck.write({ outputType: 'nodebuffer' });
    const buffer = this.toBuffer(rawBuffer);
    const isPptxPackage = buffer.subarray(0, 2).toString('utf8') === 'PK';
    if (!isPptxPackage) {
      throw new AgentEngineError(
        'AGENT_PIPELINE_FAILED',
        'Editable PPTX renderer produced invalid PPTX bytes'
      );
    }

    return {
      buffer,
      metadata: {
        schemaVersion: normalizedSchema.schemaVersion,
        slideCount: normalizedSchema.slides.length,
        aspectRatio,
        warnings,
        verified: warnings.length === 0,
      },
    };
  }

  private normalizeSchema(
    schema: EditablePptxDeckSchema,
    warnings: string[]
  ): Required<Pick<EditablePptxDeckSchema, 'schemaVersion' | 'aspectRatio' | 'slides'>> &
    Omit<EditablePptxDeckSchema, 'schemaVersion' | 'aspectRatio' | 'slides'> {
    if (!schema || typeof schema !== 'object') {
      throw new AgentEngineError('AGENT_VALIDATION_FAILED', 'Editable PPTX schema is required');
    }

    if (!Array.isArray(schema.slides) || schema.slides.length === 0) {
      throw new AgentEngineError(
        'AGENT_VALIDATION_FAILED',
        'Editable PPTX requires at least one slide'
      );
    }

    if (schema.slides.length > MAX_SLIDES) {
      throw new AgentEngineError(
        'AGENT_VALIDATION_FAILED',
        `Editable PPTX supports up to ${MAX_SLIDES} slides per render`
      );
    }

    const schemaVersion = schema.schemaVersion?.trim() || DEFAULT_SCHEMA_VERSION;
    if (schema.schemaVersion !== DEFAULT_SCHEMA_VERSION) {
      warnings.push(
        `Schema version ${schema.schemaVersion ?? '(missing)'} normalized for renderer ${DEFAULT_SCHEMA_VERSION}.`
      );
    }

    for (const [slideIndex, slide] of schema.slides.entries()) {
      if (!Array.isArray(slide.elements)) {
        throw new AgentEngineError(
          'AGENT_VALIDATION_FAILED',
          `slides[${slideIndex}].elements must be an array`
        );
      }
      if (slide.elements.length > MAX_ELEMENTS_PER_SLIDE) {
        throw new AgentEngineError(
          'AGENT_VALIDATION_FAILED',
          `slides[${slideIndex}] exceeds ${MAX_ELEMENTS_PER_SLIDE} elements`
        );
      }
    }

    return {
      ...schema,
      schemaVersion,
      aspectRatio: schema.aspectRatio ?? 'widescreen_16_9',
      slides: schema.slides,
    };
  }

  private renderElement(element: EditablePptxElement, context: RenderContext): void {
    const geometry = this.resolveGeometry(element, context);
    switch (element.type) {
      case 'text':
        this.renderText(element, geometry, context);
        return;
      case 'shape':
        this.renderShape(element, geometry, context);
        return;
      case 'image':
        this.renderImage(element, geometry, context);
        return;
      case 'table':
        this.renderTable(element, geometry, context);
        return;
      case 'statCard':
        this.renderStatCard(element, geometry, context);
        return;
      case 'badge':
        this.renderBadge(element, geometry, context);
        return;
      case 'divider':
        this.renderDivider(element, geometry, context);
        return;
      case 'group':
        this.renderGroup(element, geometry, context);
        return;
      default:
        context.warnings.push(`${context.path} has unsupported element type and was skipped.`);
    }
  }

  private renderText(
    element: EditablePptxTextElement,
    geometry: EditablePptxGeometry,
    context: RenderContext
  ): void {
    context.slide.addText(String(element.text ?? ''), {
      ...geometry,
      fontFace: element.fontFace ?? context.theme.fontFace,
      fontSize: this.clampNumber(element.fontSize, 6, 72, 16),
      bold: element.bold ?? false,
      italic: element.italic ?? false,
      color: this.stripHash(this.resolveColor(element.color, context.theme.textColor, context.warnings, `${context.path}.color`)),
      align: element.align ?? 'left',
      valign: element.valign ?? 'top',
      fit: element.fit ?? 'shrink',
      margin: element.margin ?? 0.04,
      ...(element.bullet ? { bullet: { type: 'ul' } } : {}),
    });
  }

  private renderShape(
    element: EditablePptxShapeElement,
    geometry: EditablePptxGeometry,
    context: RenderContext
  ): void {
    context.slide.addShape(element.shape, {
      ...geometry,
      rectRadius: element.radius,
      line: {
        color: this.stripHash(
          this.resolveColor(element.lineColor, context.theme.borderColor, context.warnings, `${context.path}.lineColor`)
        ),
        pt: this.clampNumber(element.lineWidth, 0, 12, 1),
      },
      fill: {
        color: this.stripHash(
          this.resolveColor(element.fillColor, context.theme.surfaceColor, context.warnings, `${context.path}.fillColor`)
        ),
        transparency: this.clampNumber(element.transparency, 0, 100, 0),
      },
    });
  }

  private renderImage(
    element: EditablePptxImageElement,
    geometry: EditablePptxGeometry,
    context: RenderContext
  ): void {
    const source = element.data ? { data: element.data } : element.path ? { path: element.path } : null;
    if (!source) {
      context.warnings.push(`${context.path} image skipped because no data or path was provided.`);
      return;
    }

    context.slide.addImage({
      ...source,
      ...geometry,
      transparency: this.clampNumber(element.transparency, 0, 100, 0),
      altText: element.altText ?? element.id ?? 'Editable deck image',
    });
  }

  private renderTable(
    element: EditablePptxTableElement,
    geometry: EditablePptxGeometry,
    context: RenderContext
  ): void {
    if (!Array.isArray(element.rows) || element.rows.length === 0) {
      context.warnings.push(`${context.path} table skipped because rows are empty.`);
      return;
    }

    const rows = element.rows.map((row, rowIndex) =>
      row.map((cell: string | number | boolean | null | EditablePptxTableCell) => {
        const cellObject = this.normalizeTableCell(cell);
        return {
          text: String(cellObject.text ?? ''),
          options: {
            bold: cellObject.bold ?? (element.headerRow === true && rowIndex === 0),
            color: this.stripHash(
              this.resolveColor(
                cellObject.color,
                element.headerRow === true && rowIndex === 0
                  ? (element.headerTextColor ?? '#FFFFFF')
                  : (element.color ?? context.theme.textColor),
                context.warnings,
                `${context.path}.rows[${rowIndex}].color`
              )
            ),
            fill: {
              color: this.stripHash(
                this.resolveColor(
                  cellObject.fillColor,
                  element.headerRow === true && rowIndex === 0
                    ? (element.headerFillColor ?? context.theme.primaryColor)
                    : (element.cellFillColor ?? context.theme.surfaceColor),
                  context.warnings,
                  `${context.path}.rows[${rowIndex}].fillColor`
                )
              ),
            },
            align: cellObject.align ?? 'left',
          },
        };
      })
    );

    context.slide.addTable(rows, {
      ...geometry,
      fontFace: context.theme.fontFace,
      fontSize: this.clampNumber(element.fontSize, 5, 24, 9),
      border: { type: 'solid', color: this.stripHash(element.borderColor ?? context.theme.borderColor), pt: 0.5 },
      margin: 0.05,
      valign: 'mid',
    });
  }

  private renderStatCard(
    element: EditablePptxStatCardElement,
    geometry: EditablePptxGeometry,
    context: RenderContext
  ): void {
    context.slide.addShape('roundRect', {
      ...geometry,
      rectRadius: 0.08,
      line: { color: this.stripHash(element.borderColor ?? context.theme.borderColor), pt: 1 },
      fill: { color: this.stripHash(element.fillColor ?? context.theme.surfaceColor) },
    });
    context.slide.addShape('rect', {
      x: geometry.x,
      y: geometry.y,
      w: 0.08,
      h: geometry.h,
      line: { color: this.stripHash(element.accentColor ?? context.theme.accentColor), transparency: 100 },
      fill: { color: this.stripHash(element.accentColor ?? context.theme.accentColor) },
    });
    context.slide.addText(String(element.value), {
      x: geometry.x + 0.18,
      y: geometry.y + 0.12,
      w: Math.max(0.1, geometry.w - 0.36),
      h: Math.max(0.2, geometry.h * 0.38),
      fontFace: context.theme.headingFontFace,
      fontSize: this.clampNumber(undefined, 8, 44, Math.min(28, geometry.h * 18)),
      bold: true,
      color: this.stripHash(context.theme.textColor),
      margin: 0,
      fit: 'shrink',
    });
    context.slide.addText(element.label, {
      x: geometry.x + 0.18,
      y: geometry.y + geometry.h * 0.52,
      w: Math.max(0.1, geometry.w - 0.36),
      h: Math.max(0.16, geometry.h * 0.18),
      fontFace: context.theme.fontFace,
      fontSize: 8.5,
      bold: true,
      color: this.stripHash(context.theme.mutedTextColor),
      margin: 0,
      fit: 'shrink',
    });
    if (element.caption) {
      context.slide.addText(element.caption, {
        x: geometry.x + 0.18,
        y: geometry.y + geometry.h * 0.72,
        w: Math.max(0.1, geometry.w - 0.36),
        h: Math.max(0.14, geometry.h * 0.18),
        fontFace: context.theme.fontFace,
        fontSize: 7.5,
        color: this.stripHash(context.theme.mutedTextColor),
        margin: 0,
        fit: 'shrink',
      });
    }
  }

  private renderBadge(
    element: EditablePptxBadgeElement,
    geometry: EditablePptxGeometry,
    context: RenderContext
  ): void {
    context.slide.addShape('roundRect', {
      ...geometry,
      rectRadius: 0.08,
      line: { color: this.stripHash(element.borderColor ?? element.fillColor ?? context.theme.primaryColor), pt: 0.8 },
      fill: { color: this.stripHash(element.fillColor ?? context.theme.primaryColor) },
    });
    context.slide.addText(element.label, {
      ...geometry,
      fontFace: context.theme.fontFace,
      fontSize: Math.max(6, Math.min(14, geometry.h * 9)),
      bold: true,
      color: this.stripHash(element.textColor ?? '#FFFFFF'),
      align: 'center',
      valign: 'mid',
      fit: 'shrink',
      margin: 0.03,
    });
  }

  private renderDivider(
    element: EditablePptxDividerElement,
    geometry: EditablePptxGeometry,
    context: RenderContext
  ): void {
    const thickness = this.clampNumber(element.thickness, 0.25, 8, 1);
    context.slide.addShape('line', {
      x: geometry.x,
      y: geometry.y + geometry.h / 2,
      w: geometry.w,
      h: 0,
      line: { color: this.stripHash(element.color ?? context.theme.borderColor), pt: thickness },
    });
  }

  private renderGroup(
    element: EditablePptxGroupElement,
    geometry: EditablePptxGeometry,
    context: RenderContext
  ): void {
    if (!Array.isArray(element.children) || element.children.length === 0) {
      context.warnings.push(`${context.path} group skipped because children are empty.`);
      return;
    }

    element.children.forEach((child, childIndex) => {
      this.renderElement(child, {
        ...context,
        path: `${context.path}.children[${childIndex}]`,
        offsetX: geometry.x,
        offsetY: geometry.y,
      });
    });
  }

  private resolveGeometry(
    element: EditablePptxGeometry,
    context: RenderContext
  ): EditablePptxGeometry {
    const geometry = {
      x: context.offsetX + element.x,
      y: context.offsetY + element.y,
      w: element.w,
      h: element.h,
    };

    for (const key of ['x', 'y', 'w', 'h'] as const) {
      if (!Number.isFinite(geometry[key])) {
        throw new AgentEngineError(
          'AGENT_VALIDATION_FAILED',
          `${context.path}.${key} must be a finite number of inches`
        );
      }
    }

    if (geometry.w <= 0 || geometry.h <= 0) {
      throw new AgentEngineError(
        'AGENT_VALIDATION_FAILED',
        `${context.path} width and height must be positive inches`
      );
    }

    if (
      geometry.x < 0 ||
      geometry.y < 0 ||
      geometry.x + geometry.w > context.layout.width ||
      geometry.y + geometry.h > context.layout.height
    ) {
      context.warnings.push(
        `${context.path} extends outside ${context.layout.width}x${context.layout.height}in slide bounds.`
      );
    }

    return geometry;
  }

  private resolveTheme(theme: EditablePptxTheme | undefined, warnings: string[]): ResolvedTheme {
    return {
      fontFace: theme?.fontFace?.trim() || DEFAULT_FONT_FACE,
      headingFontFace: theme?.headingFontFace?.trim() || theme?.fontFace?.trim() || DEFAULT_FONT_FACE,
      backgroundColor: this.resolveColor(theme?.backgroundColor, '#FFFFFF', warnings, 'theme.backgroundColor'),
      surfaceColor: this.resolveColor(theme?.surfaceColor, '#FFFFFF', warnings, 'theme.surfaceColor'),
      primaryColor: this.resolveColor(theme?.primaryColor, '#0F766E', warnings, 'theme.primaryColor'),
      secondaryColor: this.resolveColor(theme?.secondaryColor, '#0F172A', warnings, 'theme.secondaryColor'),
      accentColor: this.resolveColor(theme?.accentColor, '#F59E0B', warnings, 'theme.accentColor'),
      textColor: this.resolveColor(theme?.textColor, '#111827', warnings, 'theme.textColor'),
      mutedTextColor: this.resolveColor(theme?.mutedTextColor, '#4B5563', warnings, 'theme.mutedTextColor'),
      borderColor: this.resolveColor(theme?.borderColor, '#D1D5DB', warnings, 'theme.borderColor'),
    };
  }

  private resolveColor(
    value: string | undefined,
    fallback: string,
    warnings: string[],
    path: string
  ): string {
    if (!value) return fallback;
    const trimmed = value.trim();
    if (!HEX_COLOR_PATTERN.test(trimmed)) {
      warnings.push(`${path} is not a 6-digit hex color; using ${fallback}.`);
      return fallback;
    }
    return trimmed.startsWith('#') ? trimmed.toUpperCase() : `#${trimmed.toUpperCase()}`;
  }

  private normalizeTableCell(
    value: string | number | boolean | null | EditablePptxTableCell
  ): EditablePptxTableCell {
    if (value && typeof value === 'object' && 'text' in value) return value;
    return { text: value };
  }

  private clampNumber(
    value: number | undefined,
    min: number,
    max: number,
    fallback: number
  ): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
  }

  private stripHash(value: string): string {
    return value.replace(/^#/, '').toUpperCase();
  }

  private toBuffer(value: string | ArrayBuffer | Blob | Uint8Array): Buffer {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    if (typeof value === 'string') return Buffer.from(value, 'binary');
    return Buffer.from(value as ArrayBuffer);
  }
}