import { Check } from '../icons';
/** Status messages appear and disappear immediately. */
export function MotionToast({ message }: { message: string }) {
  return (
    <div
      className={`toast ${message ? 'visible' : ''}`}
      role="status"
      aria-live="polite"
      aria-hidden={!message}
    >
      {message && (
        <>
          <Check size={16} />
          {message}
        </>
      )}
    </div>
  );
}
