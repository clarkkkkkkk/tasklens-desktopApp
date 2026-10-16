import { useLayoutEffect, type RefObject } from 'react';

export type MotionKind = 'page' | 'panel' | 'fade' | 'workspace' | 'word' | 'feedback';
const fallback = { page: 320, panel: 220, fade: 160, workspace: 320, word: 300, feedback: 160 };
export function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function duration(kind: MotionKind) {
  return (
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue(`--motion-${kind}`)) ||
    fallback[kind]
  );
}
const running = new WeakMap<Element, Animation>();
/** Cancels superseded work; reduced-motion changes also settle in-flight animations. */
export function animateMotion(
  element: HTMLElement,
  kind: MotionKind = 'page',
  delay = 0,
  exit = false,
): Promise<void> {
  const previous = running.get(element);
  const currentTransform =
    previous?.playState === 'running' && (kind === 'page' || kind === 'panel')
      ? getComputedStyle(element).transform
      : undefined;
  previous?.cancel();
  if (reducedMotion() || !element.isConnected) return Promise.resolve();
  const distance = kind === 'panel' ? 'translateY(12px)' : 'translateY(8px)';
  const frames =
    kind === 'page'
      ? [{ transform: currentTransform || 'translateY(12px)' }, { transform: 'none' }]
      : kind === 'fade'
        ? [{ opacity: 0 }, { opacity: 1 }]
        : kind === 'feedback'
          ? [{ opacity: 0.55 }, { opacity: 1 }]
          : [
              { opacity: kind === 'panel' ? 1 : 0, transform: currentTransform || distance },
              { opacity: 1, transform: 'none' },
            ];
  const animation = element.animate(exit ? [...frames].reverse() : frames, {
    duration: exit ? (kind === 'fade' ? 160 : 140) : duration(kind),
    delay: exit ? 0 : delay,
    easing:
      getComputedStyle(document.documentElement).getPropertyValue('--motion-ease').trim() ||
      'cubic-bezier(.16,1,.3,1)',
    fill: 'backwards',
  });
  running.set(element, animation);
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const stop = () => {
    if (preference.matches) animation.cancel();
  };
  preference.addEventListener('change', stop);
  return animation.finished
    .then(() => {})
    .catch(() => {})
    .finally(() => {
      preference.removeEventListener('change', stop);
      if (running.get(element) === animation) running.delete(element);
      animation.cancel();
    });
}
export function useEntrance<T extends HTMLElement>(
  ref: RefObject<T | null>,
  identity: unknown,
  kind: MotionKind = 'page',
  active = true,
) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !active) return;
    void animateMotion(element, kind);
    const animation = running.get(element);
    return () => {
      // Let a replacement entrance read the current position before canceling.
      queueMicrotask(() => {
        if (running.get(element) === animation) animation?.cancel();
      });
    };
  }, [ref, identity, kind, active]);
}
/** Visual-only exit: state/focus updates never wait, and no live controls are retained. */
export function prepareExit(element: HTMLElement | null, durationMs = 140) {
  if (!element || reducedMotion() || !element.isConnected) return () => {};
  const rect = element.getBoundingClientRect();
  const clone = element.cloneNode(true) as HTMLElement;
  const originalNodes = [element, ...element.querySelectorAll<HTMLElement>('*')];
  const cloneNodes = [clone, ...clone.querySelectorAll<HTMLElement>('*')];
  const scrollOffsets = originalNodes.map((node) => ({
    top: node.scrollTop,
    left: node.scrollLeft,
  }));
  clone.inert = true;
  clone.setAttribute('aria-hidden', 'true');
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
  clone
    .querySelectorAll('input,button,select,textarea')
    .forEach((node) => node.setAttribute('disabled', ''));
  Object.assign(clone.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: '0',
    pointerEvents: 'none',
    zIndex: '40',
    overflow: 'hidden',
  });
  clone.classList.add('motion-exit-snapshot');
  return () => {
    if (reducedMotion()) return;
    // A new transition replaces the previous visual exit instead of queuing it.
    document.querySelectorAll('.motion-exit-snapshot').forEach((node) => node.remove());
    document.body.append(clone);
    cloneNodes.forEach((node, index) => {
      node.scrollTop = scrollOffsets[index].top;
      node.scrollLeft = scrollOffsets[index].left;
    });
    const animation = clone.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: durationMs,
      easing: 'ease-out',
      fill: 'forwards',
    });
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => {
      if (preference.matches) animation.cancel();
    };
    preference.addEventListener('change', stop);
    // A compositor can suspend background-window animations indefinitely. Visual
    // snapshots must still disappear and must never delay navigation or persistence.
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      preference.removeEventListener('change', stop);
      clone.remove();
      animation.cancel();
    };
    const timeout = window.setTimeout(cleanup, durationMs + 150);
    void animation.finished.catch(() => {}).finally(cleanup);
  };
}
