import { useRef, useState } from 'react';
import type { ExtractedAction } from '../../types/action';
import { Button } from '../../components/ui';
import { downloadText } from '../../lib/images';
export function SourceTranscript({ action }: { action: ExtractedAction }) {
  const transcript = action.source.transcript;
  const section = useRef<HTMLDetailsElement>(null);
  const [highlight, setHighlight] = useState<string[]>([]);
  if (!transcript) return null;
  const evidence = (action.evidence || []).filter((item) => {
    const current = action[item.field];
    const value = typeof current === 'string' ? current : JSON.stringify(current);
    return item.value === value;
  });
  return (
    <section className="detail-section source-transcript">
      {evidence.length > 0 && (
        <div className="transcript-evidence" aria-label="Source evidence">
          {evidence.map((item, index) => (
            <Button
              key={index}
              variant="ghost"
              onClick={() => {
                setHighlight(item.segmentIds);
                if (section.current) section.current.open = true;
                requestAnimationFrame(() => {
                  const target = section.current?.querySelector<HTMLElement>(
                    `[data-segment="${CSS.escape(item.segmentIds[0])}"]`,
                  );
                  target?.focus();
                  target?.scrollIntoView({ block: 'nearest' });
                });
              }}
            >
              Source for {item.field.replace('arrivalTime', 'arrival time')}
            </Button>
          ))}
        </div>
      )}
      <details ref={section}>
        <summary>Source Transcript</summary>
        <p className="field-help">
          Original transcription · {transcript.model} ·{' '}
          {transcript.language || 'Language not identified'}. Timestamps refer to the original
          audio; audio is not retained.
        </p>
        <ol>
          {transcript.segments.map((segment) => (
            <li
              key={segment.id}
              data-segment={segment.id}
              tabIndex={-1}
              className={highlight.includes(segment.id) ? 'transcript-highlight' : ''}
            >
              <span>
                {(segment.startMs / 1000).toFixed(1)}–{(segment.endMs / 1000).toFixed(1)}s
              </span>
              <p>{segment.text}</p>
            </li>
          ))}
        </ol>
        <Button onClick={() => downloadText(transcript.fullText, 'tasklens-transcript.txt')}>
          Export transcript
        </Button>
      </details>
    </section>
  );
}
