import { useLayoutEffect, useRef, type RefObject } from 'react';

/** Presentation only: navigation, focus and persistence never wait for an entrance. */
export function useOnboardingMotion(
  ref: RefObject<HTMLElement | null>,
  step: string,
  workflow: number,
  demoReady: boolean,
) {
  const previous = useRef<{ step: string; workflow: number; demoReady: boolean } | null>(null);
  // StrictMode repeats mount effects; the second setup still needs the first-load reveal.
  useLayoutEffect(
    () => () => {
      previous.current = null;
    },
    [],
  );
  useLayoutEffect(() => {
    const last = previous.current;
    previous.current = { step, workflow, demoReady };
    const node = ref.current;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!node || media.matches) return;

    const entering = !last || last.step !== step;
    const workflowChange = !entering && step === 'workflow' && last.workflow !== workflow;
    const sampleLoaded = !entering && step === 'demo' && !last.demoReady && demoReady;
    const selector = entering
      ? '.onboarding-visual [data-onboarding-reveal]'
      : workflowChange
        ? '.onboarding-workflow-content'
        : sampleLoaded
          ? '.onboarding-demo-card > [data-onboarding-reveal]'
          : null;
    if (!selector) return;

    const targets = Array.from(node.querySelectorAll<HTMLElement>(selector)).filter(
      (element) => element.getClientRects().length > 0,
    );
    const animations = targets.map((element) => {
      const order = Number(element.dataset.onboardingReveal || 0);
      return element.animate(
        [
          { opacity: 0.65, transform: 'translateY(4px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        {
          duration: workflowChange ? 260 : 300,
          delay: workflowChange ? 0 : Math.min(order, 4) * 60,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          fill: 'backwards',
        },
      );
    });
    const settle = () => {
      if (media.matches) animations.forEach((animation) => animation.cancel());
    };
    media.addEventListener('change', settle);
    return () => {
      animations.forEach((animation) => animation.cancel());
      media.removeEventListener('change', settle);
    };
  }, [ref, step, workflow, demoReady]);
}
