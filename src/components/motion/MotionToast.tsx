import { useState } from 'react';
import { Check } from '../icons';
/** Keep the last message painted during exit without announcing it again. */
export function MotionToast({ message }: { message: string }) {
  const [lastMessage, setLastMessage] = useState(message);
  if (message && message !== lastMessage) setLastMessage(message);
  return (
    <div
      className={`toast ${message ? 'visible' : ''}`}
      role="status"
      aria-live="polite"
      aria-hidden={!message}
    >
      {lastMessage && (
        <>
          <Check size={16} />
          {lastMessage}
        </>
      )}
    </div>
  );
}
