import { forwardRef } from 'react';
import type { ExtractedAction } from '../../types/action';

export interface TraceTarget {
  label: string;
  ids: string[];
}

/**
 * The source screenshot with OCR bounding boxes of the selected field's evidence highlighted.
 * Boxes come from Tesseract, scaled by percentage so they fit the stored thumbnail.
 */
export const SourceTrace = forwardRef<
  HTMLDetailsElement,
  {
    action: ExtractedAction;
    target: TraceTarget | null;
  }
>(function SourceTrace({ action, target }, ref) {
  const { previewUrl, ocr, fileName } = action.source;
  if (!previewUrl) return null;
  const regions = ocr && target ? ocr.regions.filter((r) => target.ids.includes(r.id)) : [];
  return (
    <details className="source-details source-trace" ref={ref}>
      <summary>View source screenshot</summary>
      {target && (
        <p className="field-help" role="status">
          {regions.length
            ? `Source for ${target.label.toLowerCase()}: “${regions.map((r) => r.text).join(' ')}”`
            : `No source text was found for ${target.label.toLowerCase()}.`}
        </p>
      )}
      <div className="trace-figure">
        <img src={previewUrl} alt={`Source: ${fileName || 'screenshot'}`} />
        {ocr &&
          regions.map((r) => (
            <span
              key={r.id}
              className="trace-box"
              aria-hidden="true"
              style={{
                left: `${(r.box.x / ocr.imageWidth) * 100}%`,
                top: `${(r.box.y / ocr.imageHeight) * 100}%`,
                width: `${(r.box.width / ocr.imageWidth) * 100}%`,
                height: `${(r.box.height / ocr.imageHeight) * 100}%`,
              }}
            />
          ))}
      </div>
    </details>
  );
});
