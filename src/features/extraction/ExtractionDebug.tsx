import type { ExtractionDiagnostics } from '../../services/extraction/ExtractionService';

/**
 * Developer-only diagnostics (Settings › Local AI › Developer mode). Shows what the local
 * OCR read and what the local model returned, so failures can be diagnosed. The OCR
 * confidence is Tesseract's own engine score, not a model-generated number.
 */
export function ExtractionDebug({ diagnostics }: { diagnostics: Partial<ExtractionDiagnostics> }) {
  const { ocr, attempts = [], issues = [], promptVersion } = diagnostics;
  return (
    <details className="extraction-debug">
      <summary>Developer details</summary>
      {ocr && (
        <>
          <h3>
            OCR · {ocr.engine} · {ocr.languages.join('+') || 'no languages'} · {ocr.imageWidth}×
            {ocr.imageHeight}
          </h3>
          <pre>{ocr.fullText || '(no text)'}</pre>
          <table>
            <caption className="sr-only">OCR regions</caption>
            <thead>
              <tr>
                <th scope="col">Region</th>
                <th scope="col">OCR confidence</th>
                <th scope="col">Box</th>
                <th scope="col">Text</th>
              </tr>
            </thead>
            <tbody>
              {ocr.regions.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{Math.round(r.confidence * 100)}</td>
                  <td>
                    {r.box.x},{r.box.y} {r.box.width}×{r.box.height}
                  </td>
                  <td>{r.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {promptVersion !== undefined && <h3>Prompt version {promptVersion}</h3>}
      {attempts.map((attempt, i) => (
        <div key={i}>
          <h3>
            Model attempt {i + 1} · {(attempt.elapsedMs / 1000).toFixed(1)}s
            {attempt.truncated ? ' · truncated' : ''}
            {attempt.error ? ` · ${attempt.error}` : ''}
          </h3>
          <pre>{attempt.rawOutput}</pre>
        </div>
      ))}
      {issues.length > 0 && (
        <>
          <h3>Validator corrections</h3>
          <ul>
            {issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}
