import { useEffect, useLayoutEffect, useRef } from 'react';
import { reducedMotion } from '../../components/motion/motion';
import { TourCard } from './TourCard';
import { TourSpotlight } from './TourSpotlight';
import { useTourTarget } from './useTourTarget';
import type { TourStep } from './tourSteps';
import './guided-tour.css';

export function GuidedTour({
  step,
  index,
  count,
  onMove,
  onDismiss,
}: {
  step: TourStep;
  index: number;
  count: number;
  onMove: (direction: number) => void;
  onDismiss: (finished?: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLDivElement>(null),
    content = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onMove, onDismiss });
  callbacks.current = { onMove, onDismiss };
  const layout = useTourTarget(step, card);
  const focused = useRef(false);
  useLayoutEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  useLayoutEffect(() => {
    const active = document.activeElement;
    // Back becomes disabled on the first step. Some engines then move focus to
    // body, which would otherwise strand arrow-key navigation outside the dialog.
    const lostFocus =
      !dialog.current?.contains(active) || (active instanceof HTMLButtonElement && active.disabled);
    if (layout.ready && (!focused.current || lostFocus)) {
      dialog.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
      focused.current = true;
    }
  }, [layout.ready, index]);
  useEffect(() => {
    const element = dialog.current!;
    const observer = new MutationObserver(() => {
      if (document.querySelector('dialog[open]:not([data-guided-tour])'))
        callbacks.current.onDismiss();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open'],
    });
    const cancel = () =>
      element.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    media.addEventListener('change', cancel);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', cancel);
      cancel();
    };
  }, []);
  useEffect(() => {
    const element = index === 0 ? card.current : content.current;
    if (!element || reducedMotion()) return;
    const animation = element.animate(
      [
        { opacity: 0, transform: 'translateY(4px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: index === 0 ? 260 : 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    );
    return () => animation.cancel();
  }, [step, index]);
  return (
    <dialog
      ref={dialog}
      data-guided-tour
      data-step={step.id}
      className="guided-tour"
      aria-modal="true"
      aria-labelledby="guided-tour-title"
      aria-describedby="guided-tour-description"
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => event.preventDefault()}
      onPaste={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault();
          onMove(event.key === 'ArrowRight' ? 1 : -1);
        }
        if (event.key === 'Tab') {
          const buttons = Array.from(
            dialog.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
          );
          const first = buttons[0],
            last = buttons[buttons.length - 1];
          if (
            event.shiftKey &&
            (document.activeElement === first || document.activeElement?.tagName === 'H2')
          ) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }}
    >
      <TourSpotlight target={layout.target} />
      <TourCard
        step={step}
        index={index}
        count={count}
        position={layout.card}
        cardRef={card}
        contentRef={content}
        missing={layout.missing}
        ready={layout.ready}
        onMove={onMove}
        onDismiss={onDismiss}
      />
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        Step {index + 1} of {count}: {step.title}
      </p>
    </dialog>
  );
}
