import { CircleHelp, ScanLine } from '../../components/icons';
import { Button } from '../../components/ui';
import { displayDate, displayTime } from '../../lib/dates';
import type { ExtractionAmbiguity } from '../../types/action';

const FIELD_LABELS: Record<string, string> = {
  date: 'Date',
  time: 'Start time',
  endTime: 'End time',
  arrivalTime: 'Arrival time',
  location: 'Location',
  requirements: 'Requirements',
  title: 'Title',
  item: 'This item',
  general: 'Question',
};

/** Human label for an option; ISO dates and 24-hour times are shown in local formats. */
function optionLabel(field: string, option: string): string {
  if (field === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(option))
    return displayDate(option, { weekday: 'short', month: 'short', day: 'numeric' });
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(option)) return displayTime(option);
  return option;
}

/** Questions the extraction could not answer from the source. Never auto-resolved. */
export function OpenQuestions({
  questions,
  onAnswer,
  onDismiss,
  onTrace,
  disabled,
}: {
  questions: ExtractionAmbiguity[];
  onAnswer: (question: ExtractionAmbiguity, option: string) => void;
  onDismiss: (question: ExtractionAmbiguity) => void;
  onTrace?: (question: ExtractionAmbiguity) => void;
  disabled: boolean;
}) {
  if (!questions.length) return null;
  return (
    <section className="detail-section open-questions" aria-labelledby="open-questions-heading">
      <h3 id="open-questions-heading">
        <CircleHelp size={16} />
        Needs your answer
        <span className="count-label">{questions.length}</span>
      </h3>
      <ul>
        {questions.map((q) => (
          <li key={q.id}>
            <span className="question-field">{FIELD_LABELS[q.field] ?? q.field}</span>
            <p>{q.question}</p>
            <div className="question-actions">
              {q.options.map((option) => (
                <Button key={option} disabled={disabled} onClick={() => onAnswer(q, option)}>
                  Use {optionLabel(q.field, option)}
                </Button>
              ))}
              {onTrace && q.segmentIds.length > 0 && (
                <Button variant="ghost" onClick={() => onTrace(q)}>
                  <ScanLine size={15} />
                  Show source
                </Button>
              )}
              <Button variant="ghost" disabled={disabled} onClick={() => onDismiss(q)}>
                Dismiss
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
