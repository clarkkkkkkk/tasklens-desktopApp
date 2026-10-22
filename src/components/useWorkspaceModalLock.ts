import { useEffect } from 'react';
/** Locks the actual scroller, including nested modal lifetimes, without moving its content. */
export function useWorkspaceModalLock() {
  useEffect(() => {
    let locked: HTMLElement | null = null;
    let overflow = '';
    let top = 0;
    const unlock = () => {
      if (!locked) return;
      locked.style.overflowY = overflow;
      locked.scrollTop = top;
      locked = null;
    };
    const update = () => {
      if (!document.querySelector('dialog[open]')) {
        unlock();
        return;
      }
      const scroller = document.querySelector<HTMLElement>('.main-content');
      if (!scroller || locked === scroller) return;
      unlock();
      locked = scroller;
      top = scroller.scrollTop;
      overflow = scroller.style.overflowY;
      scroller.style.overflowY = 'hidden';
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open'],
    });
    update();
    return () => {
      observer.disconnect();
      unlock();
    };
  }, []);
}
