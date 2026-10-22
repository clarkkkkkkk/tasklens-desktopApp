import { Check, LoaderCircle, AlertCircle, X } from '../../components/icons';
export type CaptureMode = 'voice' | 'audio' | 'text';
export type StageState = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export interface CaptureProgressModel {
  steps: readonly string[];
  current: number;
  complete?: boolean;
  outcome?: 'failed' | 'cancelled';
}
/** Only actual service milestones mark previous stages complete. */
export function CaptureProgress({
  steps,
  current,
  complete = false,
  outcome,
}: CaptureProgressModel) {
  return (
    <ol className="capture-progress" aria-label="Processing stages">
      {steps.map((label, index) => {
        const state: StageState =
          complete || index < current
            ? 'completed'
            : index === current
              ? (outcome ?? 'running')
              : 'pending';
        return (
          <li
            key={label}
            data-state={
              state === 'completed' ? 'complete' : state === 'running' ? 'current' : state
            }
            aria-current={state === 'running' ? 'step' : undefined}
          >
            <span className="capture-stage-marker" aria-hidden="true">
              {state === 'completed' ? (
                <Check size={12} />
              ) : state === 'running' ? (
                <LoaderCircle size={14} className="capture-spinner" />
              ) : state === 'failed' ? (
                <AlertCircle size={14} />
              ) : state === 'cancelled' ? (
                <X size={14} />
              ) : (
                index + 1
              )}
            </span>
            <span className={state === 'running' ? 'capture-running' : undefined}>
              {label}
              <span className="sr-only">, {state === 'running' ? 'in progress' : state}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
