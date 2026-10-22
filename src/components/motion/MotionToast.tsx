import { Check, AlertCircle, CircleHelp } from '../icons';
/** Status messages appear and disappear immediately. */
export function MotionToast({
  message,
  tone = 'info',
}: {
  message: string;
  tone?: 'success' | 'warning' | 'info';
}) {
  return (
    <div
      className={`toast ${message ? 'visible' : ''}`}
      data-tone={tone}
      role="status"
      aria-live="polite"
      aria-hidden={!message}
    >
      {message && (
        <>
          {tone === 'success' ? (
            <Check size={16} />
          ) : tone === 'warning' ? (
            <AlertCircle size={16} />
          ) : (
            <CircleHelp size={16} />
          )}
          {message}
        </>
      )}
    </div>
  );
}
