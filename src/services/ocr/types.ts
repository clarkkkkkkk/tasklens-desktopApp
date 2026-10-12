import { z } from 'zod';

export const boundingBoxSchema = z.object({
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  width: z.number().positive(),
  height: z.number().positive(),
});
export const ocrRegionSchema = z.object({
  id: z.string().regex(/^r\d{1,4}$/),
  text: z.string().min(1).max(2000),
  /** Tesseract word confidence averaged over the line, 0–1. Diagnostic only. */
  confidence: z.number().min(0).max(1),
  /** Pixel box in the original (orientation-corrected) image. */
  box: boundingBoxSchema,
  /** Tesseract layout: lines sharing block and paragraph form one paragraph (e.g. a chat bubble). */
  block: z.number().int().nonnegative().optional(),
  paragraph: z.number().int().nonnegative().optional(),
});
export const ocrDocumentSchema = z
  .object({
    fullText: z.string().max(100000),
    regions: z.array(ocrRegionSchema).max(600),
    languages: z.array(z.string().max(10)).max(10),
    imageWidth: z.number().int().positive(),
    imageHeight: z.number().int().positive(),
    engine: z.string().max(100),
  })
  .superRefine((doc, ctx) => {
    const ids = new Set<string>();
    doc.regions.forEach((region, index) => {
      if (ids.has(region.id))
        ctx.addIssue({ code: 'custom', path: ['regions', index], message: 'Duplicate region ID' });
      ids.add(region.id);
    });
  });
export type OcrRegion = z.infer<typeof ocrRegionSchema>;
export type OcrDocument = z.infer<typeof ocrDocumentSchema>;

export interface OcrLanguageStatus {
  code: string;
  installed: boolean;
}
export interface OcrStatus {
  available: boolean;
  binaryFound: boolean;
  version: string | null;
  dataDirectory: string | null;
  languages: OcrLanguageStatus[];
}

export type OcrStage = 'preparing_image' | 'reading_text';

/** Local text recognition. Implementations must never send image content off the device. */
export interface OcrService {
  recognize(
    image: Blob,
    options: { jobId: string; signal: AbortSignal; onStage?: (stage: OcrStage) => void },
  ): Promise<OcrDocument>;
}
