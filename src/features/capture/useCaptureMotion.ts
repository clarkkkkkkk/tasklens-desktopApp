import { useLayoutEffect, useRef, type RefObject } from 'react';

/** Capture-only content motion. No cloned exits, delayed state changes, or page entrances. */
export function useCaptureMotion(ref: RefObject<HTMLElement | null>, key: string, mode: string) {
  const previous = useRef({ key, mode });
  useLayoutEffect(() => {
    const last = previous.current;
    previous.current = { key, mode };
    if (last.key === key && last.mode === mode) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const node = ref.current;
    if (!node || media.matches) return;
    const animation = node.animate(
      [
        { opacity: 0.85, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: last.mode !== mode ? 240 : 280, easing: 'cubic-bezier(.16,1,.3,1)' },
    );
    const settle = () => {
      if (media.matches) animation.cancel();
    };
    media.addEventListener('change', settle);
    return () => {
      animation.cancel();
      media.removeEventListener('change', settle);
    };
  }, [key, mode, ref]);
}
