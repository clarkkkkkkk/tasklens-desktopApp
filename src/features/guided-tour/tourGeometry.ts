import type { TourPlacement } from './tourSteps';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Size {
  width: number;
  height: number;
}
const clearance = 12;
const gap = 16;
/** Header, progress and controls stay usable with a short scrolling body. */
const minimumCardHeight = 160;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(n, max));
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Prefer the requested side, but never cover the feature when another side fits. */
export function placeCard(
  target: Rect | null,
  card: Size,
  viewport: Size,
  preferred: TourPlacement = 'right',
): Rect {
  const width = Math.min(card.width, viewport.width - clearance * 2);
  const height = Math.min(card.height, viewport.height - clearance * 2);
  const fit = (x: number, y: number): Rect => ({
    x: clamp(x, clearance, viewport.width - width - clearance),
    y: clamp(y, clearance, viewport.height - height - clearance),
    width,
    height,
  });
  const centered = fit((viewport.width - width) / 2, (viewport.height - height) / 2);
  if (!target) return centered;
  const candidates = {
    right: fit(target.x + target.width + gap, target.y + target.height / 2 - height / 2),
    left: fit(target.x - width - gap, target.y + target.height / 2 - height / 2),
    below: fit(target.x + target.width / 2 - width / 2, target.y + target.height + gap),
    above: fit(target.x + target.width / 2 - width / 2, target.y - height - gap),
  };
  const bottom = fit((viewport.width - width) / 2, viewport.height - height - clearance);
  const order =
    viewport.width < 900
      ? [
          bottom,
          ...[preferred, 'above', 'below', 'right', 'left'].map(
            (side) => candidates[side as TourPlacement],
          ),
        ]
      : [preferred, 'right', 'left', 'below', 'above'].map(
          (side) => candidates[side as TourPlacement],
        );
  const placed = order.find((candidate) => !overlaps(candidate, target));
  if (placed) return placed;
  // No side fits at full height (short windows): shrink into the larger free band; content scrolls.
  const above = target.y - gap - clearance;
  const below = viewport.height - (target.y + target.height) - gap - clearance;
  const band = Math.max(above, below);
  if (band < minimumCardHeight) return bottom;
  return {
    x: candidates.below.x,
    y: above >= below ? clearance : target.y + target.height + gap,
    width,
    height: band,
  };
}

/** Clip to visible scroll containers so the outline never highlights hidden content. */
export function visibleTarget(element: HTMLElement, viewport: Size): Rect | null {
  const raw = element.getBoundingClientRect();
  if (raw.width <= 0 || raw.height <= 0) return null;
  let left = Math.max(0, raw.left),
    top = Math.max(0, raw.top);
  let right = Math.min(viewport.width, raw.right),
    bottom = Math.min(viewport.height, raw.bottom);
  for (
    let parent = element.parentElement;
    parent && parent !== document.body;
    parent = parent.parentElement
  ) {
    const style = getComputedStyle(parent);
    const rect = parent.getBoundingClientRect();
    if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
      top = Math.max(top, rect.top);
      bottom = Math.min(bottom, rect.bottom);
    }
    if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
      left = Math.max(left, rect.left);
      right = Math.min(right, rect.right);
    }
  }
  if (right - left < 2 || bottom - top < 2) return null;
  return {
    x: Math.max(4, left - 8),
    y: Math.max(4, top - 8),
    width: Math.min(viewport.width - 4, right + 8) - Math.max(4, left - 8),
    height: Math.min(viewport.height - 4, bottom + 8) - Math.max(4, top - 8),
  };
}

export function scrollTarget(element: HTMLElement, cardHeight: number) {
  // Scroll the owning workspace/nav container, never the document or the whole shell.
  for (
    let parent = element.parentElement;
    parent && parent !== document.body;
    parent = parent.parentElement
  ) {
    const style = getComputedStyle(parent);
    if (!/(auto|scroll)/.test(style.overflowY)) continue;
    const target = element.getBoundingClientRect(),
      box = parent.getBoundingClientRect();
    const availableBottom =
      innerWidth < 900 ? Math.min(box.bottom, innerHeight - cardHeight - 40) : box.bottom;
    if (target.top < box.top + 20 || target.bottom > availableBottom - 20)
      parent.scrollTop += target.top - box.top - 20;
  }
}
