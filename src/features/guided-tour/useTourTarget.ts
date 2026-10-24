import { useLayoutEffect, useState, type RefObject } from 'react';
import type { TourStep } from './tourSteps';
import { placeCard, scrollTarget, visibleTarget, type Rect } from './tourGeometry';

interface Layout {
  target: Rect | null;
  card: Rect;
  missing: boolean;
  ready: boolean;
}
export function useTourTarget(step: TourStep, cardRef: RefObject<HTMLDivElement | null>) {
  const [layout, setLayout] = useState<Layout>({
    target: null,
    card: { x: 12, y: 12, width: 440, height: 340 },
    missing: false,
    ready: false,
  });
  useLayoutEffect(() => {
    let frame = 0,
      target: HTMLElement | null = null;
    let scrolled = false,
      cancelled = false;
    let previous = '';
    const started = performance.now();
    const measure = () => {
      if (cancelled) return;
      const viewport = { width: document.documentElement.clientWidth, height: innerHeight };
      const card = cardRef.current?.getBoundingClientRect();
      // Natural height, so a card shrunk for a short window grows back when space returns.
      const content = cardRef.current?.querySelector('.tour-card-content');
      const natural =
        card && content ? card.height - content.clientHeight + content.scrollHeight : card?.height;
      const size = {
        width: card?.width || Math.min(440, viewport.width - 24),
        height: natural || 340,
      };
      const find = (id?: string) =>
        id
          ? (Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`)).find(
              (el) => el.getClientRects().length && !el.closest('[hidden]'),
            ) ?? null)
          : null;
      const primary = find(step.target);
      const expired = performance.now() - started >= 750;
      const next = primary ?? (expired ? find(step.fallback) : null);
      if (next !== target) {
        target = next;
        scrolled = false;
      }
      if (target && !scrolled) {
        scrollTarget(target, size.height);
        scrolled = true;
      }
      const rect = target ? visibleTarget(target, viewport) : null;
      const position = placeCard(rect, size, viewport, step.placement);
      const nextLayout = {
        target: rect,
        card: position,
        missing: expired && !primary,
        ready: true,
      };
      const serialized = JSON.stringify(nextLayout);
      if (serialized !== previous) {
        previous = serialized;
        setLayout(nextLayout);
      }
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(() => {
      scrolled = false;
    });
    if (cardRef.current) observer.observe(cardRef.current);
    const resized = () => {
      scrolled = false;
    };
    window.addEventListener('resize', resized);
    window.visualViewport?.addEventListener('resize', resized);
    measure();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', resized);
      window.visualViewport?.removeEventListener('resize', resized);
    };
  }, [step, cardRef]);
  return layout;
}
