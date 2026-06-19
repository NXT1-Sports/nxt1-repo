import { z } from 'zod';

export const FfmpegOperationResultSchema = z
  .object({
    success: z.boolean(),
    // Returned by app.py after GCS upload — this is the canonical output URL
    outputUrl: z.string().url().optional(),
    // Legacy field from the raw upstream tool (local path, may be absent after upload)
    output_path: z.string().optional(),
    error: z.string().optional(),
  })
  .passthrough();

export type FfmpegOperationResult = z.infer<typeof FfmpegOperationResultSchema>;

export const TrimVideoInputSchema = z
  .object({
    inputPath: z.string().trim().min(1).describe('Publicly accessible URL of the input video'),
    outputPath: z
      .string()
      .trim()
      .min(1)
      .optional()
      .default('output.mp4')
      .describe('Output filename (e.g. trimmed.mp4). The service handles storage automatically.'),
    startTime: z
      .string()
      .trim()
      .min(1)
      .describe('Start time in seconds or HH:MM:SS format. Use 0 when preserving a full clip.'),
    endTime: z.string().trim().min(1).optional().describe('End time in seconds or HH:MM:SS format'),
    duration: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        'Duration in seconds. For highlight reels, prefer full short clips or 10-20+ second play windows unless the user requests tight social cuts.'
      ),
  })
  .refine((value) => value.endTime || value.duration, {
    message: 'Either endTime or duration must be provided.',
    path: ['endTime'],
  })
  .refine((value) => !(value.endTime && value.duration), {
    message: 'Provide endTime or duration, not both.',
    path: ['duration'],
  });

export type TrimVideoInput = z.infer<typeof TrimVideoInputSchema>;

export const MergeVideosInputSchema = z.object({
  inputPaths: z
    .array(z.string().trim().min(1))
    .min(2)
    .describe('Array of publicly accessible video URLs to merge in order'),
  outputPath: z
    .string()
    .trim()
    .min(1)
    .optional()
    .default('merged.mp4')
    .describe('Output filename (e.g. merged.mp4)'),
  // Default to concat_filter — it always re-encodes inputs to a common codec/timebase
  // and resets PTS/DTS to 0 for each clip, preventing corrupt durations.
  // concat_demuxer is faster but requires perfectly matching bitstreams and timestamps,
  // which is never guaranteed when clips come from different sources or have been resized/re-encoded.
  method: z.enum(['concat_demuxer', 'concat_filter']).optional().default('concat_filter'),
  maxIntroSeconds: z
    .number()
    .positive()
    .max(10)
    .optional()
    .describe(
      'Maximum duration for a detected intro/opener first segment. Use 4 for branded highlight reels.'
    ),
});

export type MergeVideosInput = z.infer<typeof MergeVideosInputSchema>;

export const ResizeVideoInputSchema = z
  .object({
    inputPath: z.string().trim().min(1).describe('Publicly accessible URL of the input video'),
    outputPath: z
      .string()
      .trim()
      .min(1)
      .optional()
      .default('resized.mp4')
      .describe('Output filename (e.g. resized.mp4)'),
    width: z.number().int().positive().optional().describe('Target width in pixels'),
    height: z.number().int().positive().optional().describe('Target height in pixels'),
    scale: z.string().trim().min(1).optional().describe('FFmpeg scale expression e.g. "1920:-1"'),
  })
  .refine((value) => Boolean(value.scale || value.width || value.height), {
    message: 'Specify scale, width, or height.',
    path: ['scale'],
  });

export type ResizeVideoInput = z.infer<typeof ResizeVideoInputSchema>;

const AnnotationPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

const AnnotationBoundsSchema = z
  .object({
    minX: z.number().min(0).max(1),
    minY: z.number().min(0).max(1),
    maxX: z.number().min(0).max(1),
    maxY: z.number().min(0).max(1),
  })
  .refine((bounds) => bounds.maxX > bounds.minX && bounds.maxY > bounds.minY, {
    message: 'annotation.bounds max values must be greater than min values',
  });

export const BurnAnnotationInputSchema = z
  .object({
    inputPath: z.string().trim().min(1).describe('Publicly accessible URL of the input video'),
    outputPath: z
      .string()
      .trim()
      .min(1)
      .optional()
      .default('annotated-clip.mp4')
      .describe('Output filename (e.g. annotated-clip.mp4)'),
    annotation: z.object({
      kind: z.enum(['freehand', 'square', 'circle']),
      bounds: AnnotationBoundsSchema,
      strokeCount: z.number().int().positive().optional(),
      points: z
        .array(AnnotationPointSchema)
        .min(2)
        .max(120)
        .optional()
        .describe('Normalized annotation path points from selected context when available'),
    }),
    startTime: z
      .number()
      .min(0)
      .optional()
      .describe('Optional start time in seconds for when the annotation should appear'),
    endTime: z
      .number()
      .min(0)
      .optional()
      .describe('Optional end time in seconds for when the annotation should disappear'),
    strokeColor: z
      .string()
      .trim()
      .min(1)
      .optional()
      .default('light-green')
      .describe('Annotation stroke color. Use the selected-context stroke color when available.'),
    strokeWidth: z
      .number()
      .int()
      .min(2)
      .max(32)
      .optional()
      .default(8)
      .describe('Annotation stroke width in pixels'),
    opacity: z
      .number()
      .min(0.1)
      .max(1)
      .optional()
      .default(0.95)
      .describe('Annotation opacity from 0.1 to 1'),
  })
  .refine(
    (value) =>
      value.startTime === undefined ||
      value.endTime === undefined ||
      value.endTime > value.startTime,
    {
      message: 'endTime must be greater than startTime when both are provided',
      path: ['endTime'],
    }
  );

export type BurnAnnotationInput = z.infer<typeof BurnAnnotationInputSchema>;

export const AddTextOverlayInputSchema = z.object({
  inputPath: z.string().trim().min(1).describe('Publicly accessible URL of the input video'),
  outputPath: z
    .string()
    .trim()
    .min(1)
    .optional()
    .default('overlay.mp4')
    .describe('Output filename (e.g. overlay.mp4)'),
  text: z.string().trim().min(1).describe('Text to overlay on the video'),
  fontSize: z
    .number()
    .int()
    .min(10)
    .max(200)
    .optional()
    .default(72)
    .describe('Font size in points (default 72)'),
  fontColor: z
    .string()
    .trim()
    .min(1)
    .optional()
    .default('white')
    .describe('Font color (default white)'),
  x: z
    .string()
    .trim()
    .min(1)
    .optional()
    .default('(w-text_w)/2')
    .describe('X position expression (default centered)'),
  y: z
    .string()
    .trim()
    .min(1)
    .optional()
    .default('(h-text_h)/2')
    .describe('Y position expression (default centered)'),
  startTime: z.number().min(0).optional().describe('Start time in seconds for the overlay'),
  endTime: z.number().min(0).optional().describe('End time in seconds for the overlay'),
  box: z
    .boolean()
    .optional()
    .default(true)
    .describe('Draw background box behind text (default true)'),
  boxColor: z
    .string()
    .trim()
    .min(1)
    .optional()
    .default('black@0.6')
    .describe('Box background color with optional alpha (default black@0.6)'),
});

export type AddTextOverlayInput = z.infer<typeof AddTextOverlayInputSchema>;

export const BurnSubtitlesInputSchema = z.object({
  inputPath: z.string().trim().min(1).describe('Publicly accessible URL of the input video'),
  subtitlePath: z
    .string()
    .trim()
    .min(1)
    .describe('Publicly accessible URL of the SRT or VTT subtitle file'),
  outputPath: z
    .string()
    .trim()
    .min(1)
    .optional()
    .default('subtitled.mp4')
    .describe('Output filename (e.g. subtitled.mp4)'),
  fontSize: z.number().int().positive().optional().describe('Subtitle font size'),
  fontName: z.string().trim().min(1).optional().describe('Font name (e.g. Arial)'),
  primaryColor: z.string().trim().min(1).optional().describe('Primary subtitle color'),
  marginV: z.number().int().min(0).optional().describe('Vertical margin in pixels'),
});

export type BurnSubtitlesInput = z.infer<typeof BurnSubtitlesInputSchema>;

export const GenerateThumbnailInputSchema = z.object({
  inputPath: z.string().trim().min(1).describe('Publicly accessible URL of the input video'),
  outputPath: z
    .string()
    .trim()
    .min(1)
    .optional()
    .default('thumbnail.jpg')
    .describe('Output filename (e.g. thumbnail.jpg)'),
  time: z
    .string()
    .trim()
    .min(1)
    .optional()
    .default('00:00:01')
    .describe('Timestamp to extract frame from (default 00:00:01)'),
  cropBounds: z
    .object({
      minX: z.number().min(0).max(1),
      minY: z.number().min(0).max(1),
      maxX: z.number().min(0).max(1),
      maxY: z.number().min(0).max(1),
    })
    .refine((bounds) => bounds.maxX > bounds.minX && bounds.maxY > bounds.minY, {
      message: 'cropBounds max values must be greater than min values',
    })
    .optional()
    .describe(
      'Optional normalized video-frame bounds to crop around after extracting the thumbnail. Use for film-review drawn/circled subject grounding.'
    ),
});

export type GenerateThumbnailInput = z.infer<typeof GenerateThumbnailInputSchema>;

export const ConvertVideoInputSchema = z.object({
  inputPath: z.string().trim().min(1).describe('Publicly accessible URL of the input video'),
  outputPath: z
    .string()
    .trim()
    .min(1)
    .optional()
    .default('converted.mp4')
    .describe('Output filename including extension (e.g. converted.webm)'),
  videoCodec: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Video codec (e.g. libx264, libvpx-vp9)'),
  audioCodec: z.string().trim().min(1).optional().describe('Audio codec (e.g. aac, libopus)'),
  videoBitrate: z.string().trim().min(1).optional().describe('Video bitrate (e.g. 2M)'),
  audioBitrate: z.string().trim().min(1).optional().describe('Audio bitrate (e.g. 128k)'),
  preset: z.string().trim().min(1).optional().describe('Encoding preset (e.g. fast, medium, slow)'),
  crf: z
    .number()
    .int()
    .min(0)
    .max(51)
    .optional()
    .describe('Constant Rate Factor 0-51 (lower = better quality)'),
  addSilentAudio: z
    .preprocess((value) => {
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
        if (['false', '0', 'no', 'n'].includes(normalized)) return false;
      }
      return value;
    }, z.boolean())
    .optional()
    .describe(
      'When true, ensure the output has an AAC stereo audio track by adding silent audio if the input has no audio.'
    ),
  extraArgs: z.string().trim().min(1).optional().describe('Additional FFmpeg arguments'),
});

export type ConvertVideoInput = z.infer<typeof ConvertVideoInputSchema>;

export const CompressVideoInputSchema = z.object({
  inputPath: z.string().trim().min(1).describe('Publicly accessible URL of the input video'),
  outputPath: z
    .string()
    .trim()
    .min(1)
    .optional()
    .default('compressed.mp4')
    .describe('Output filename (e.g. compressed.mp4)'),
  targetSizeMb: z.number().positive().optional().describe('Target output file size in MB'),
  crf: z
    .number()
    .int()
    .min(10)
    .max(40)
    .optional()
    .default(28)
    .describe('Quality level: 18=high quality, 28=good balance, 35=smaller file (default 28)'),
  videoCodec: z.string().trim().min(1).optional().describe('Video codec (default libx264)'),
  preset: z.string().trim().min(1).optional().describe('Encoding speed preset (default medium)'),
});

export type CompressVideoInput = z.infer<typeof CompressVideoInputSchema>;
