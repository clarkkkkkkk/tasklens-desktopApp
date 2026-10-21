import { Check } from '../../components/icons';

export type CaptureMode = 'voice' | 'audio' | 'text';
export interface CaptureProgressModel {
  steps: readonly string[];
  current: number;
  complete?: boolean;
}
/** Real service milestones, not an estimated percentage. Only the stage label is live. */
export function CaptureProgress({ steps, current, complete = false }: CaptureProgressModel) {
  return (
    <ol className="capture-progress" aria-label="Processing stages">
      {steps.map((label, index) => {
        const done = complete || index < current;
        return (
          <li
            key={label}
            data-state={done ? 'complete' : index === current ? 'current' : 'pending'}
            aria-current={!complete && index === current ? 'step' : undefined}
          >
            <span className="capture-stage-marker" aria-hidden="true">
              {done ? <Check size={12} /> : index + 1}
            </span>
            <span>
              {label}
              <span className="sr-only">
                {done ? ', complete' : index === current ? ', in progress' : ', pending'}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
