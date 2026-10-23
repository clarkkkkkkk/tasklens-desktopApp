import { useEffect, useState } from 'react';

/** Observe existing workflow ownership without duplicating its state in the tour. */
export function useTourReadiness() {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const update = () => setBusy(!!document.querySelector('[data-tour-busy="true"]'));
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-tour-busy'],
    });
    update();
    return () => observer.disconnect();
  }, []);
  return busy;
}
