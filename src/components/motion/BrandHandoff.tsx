import { useLayoutEffect, useRef } from 'react';
import './brand-handoff.css';

/** One brand travels from the center into the real sidebar's measured position. */
export function BrandHandoff({ onComplete }: { onComplete: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const logo = useRef<HTMLImageElement>(null);
  const name = useRef<HTMLSpanElement>(null);
  const mask = useRef<HTMLSpanElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const complete = useRef(onComplete);
  complete.current = onComplete;

  useLayoutEffect(() => {
    const layer = root.current!;
    const image = logo.current!;
    const wordmark = name.current!;
    const reveal = mask.current!;
    const background = scrim.current!;
    const targetLogo = document.querySelector<HTMLElement>('.sidebar .brand img');
    const targetName = document.querySelector<HTMLElement>('.sidebar .brand-name');
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const animations: Animation[] = [];
    let active = true;
    const finish = () => {
      if (!active) return;
      active = false;
      complete.current();
    };
    const motionChange = () => {
      if (preference.matches) finish();
    };
    // Resizing can change sidebar geometry; settle at the real destination immediately.
    window.addEventListener('resize', finish);
    preference.addEventListener('change', motionChange);
    // The visual layer never owns focus or interactive controls.
    const timeout = window.setTimeout(finish, 3200);

    async function run() {
      if (!targetLogo || !targetName || preference.matches) return finish();
      const iconRect = targetLogo.getBoundingClientRect();
      const nameRect = targetName.getBoundingClientRect();
      if (!iconRect.width || !nameRect.width) return finish();
      const font = getComputedStyle(targetName);
      Object.assign(wordmark.style, {
        fontFamily: font.fontFamily,
        fontSize: font.fontSize,
        fontWeight: font.fontWeight,
        lineHeight: font.lineHeight,
        letterSpacing: font.letterSpacing,
        color: font.color,
      });
      for (const [element, rect] of [
        [image, iconRect],
        [wordmark, nameRect],
      ] as const) {
        Object.assign(element.style, {
          left: `${rect.left}px`,
          top: `${rect.top}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
        });
      }
      const gap = 20;
      const scale = Math.min(
        2.4,
        (window.innerWidth - 64 - gap) / (iconRect.width + nameRect.width),
      );
      const width = (iconRect.width + nameRect.width) * scale + gap;
      const left = (window.innerWidth - width) / 2;
      const iconY = (window.innerHeight - iconRect.height * scale) / 2 - iconRect.top;
      const iconX = left - iconRect.left;
      const centeredX = (window.innerWidth - iconRect.width * scale) / 2 - iconRect.left;
      const pose = (x: number, y: number) => `translate(${x}px, ${y}px) scale(${scale})`;
      const centered = pose(centeredX, iconY);
      const lockup = pose(iconX, iconY);
      const namePose = pose(
        left + iconRect.width * scale + gap - nameRect.left,
        (window.innerHeight - nameRect.height * scale) / 2 - nameRect.top,
      );
      image.style.transform = centered;
      wordmark.style.transform = namePose;
      const easing = getComputedStyle(layer).getPropertyValue('--brand-handoff-ease').trim();
      const play = (element: HTMLElement, frames: Keyframe[], duration: number) => {
        const animation = element.animate(frames, { duration, easing, fill: 'both' });
        animations.push(animation);
        return animation.finished;
      };
      try {
        layer.dataset.phase = 'logo';
        await play(
          image,
          [
            { opacity: 0, transform: pose(centeredX, iconY + 12) },
            { opacity: 1, transform: centered },
          ],
          400,
        );
        if (!active) return;
        layer.dataset.phase = 'reveal';
        await Promise.all([
          play(image, [{ transform: centered }, { transform: lockup }], 650),
          play(reveal, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }], 650),
        ]);
        if (!active) return;
        await play(reveal, [{ opacity: 1 }, { opacity: 1 }], 450);
        if (!active) return;
        layer.dataset.phase = 'dock';
        await Promise.all([
          play(image, [{ transform: lockup }, { transform: 'none' }], 1100),
          play(wordmark, [{ transform: namePose }, { transform: 'none' }], 1100),
          play(background, [{ opacity: 1 }, { opacity: 0 }], 1000),
        ]);
        finish();
      } catch {
        // Cancellation, unmount, or unavailable animation support must never block Inbox.
        finish();
      }
    }
    void run();
    return () => {
      active = false;
      clearTimeout(timeout);
      window.removeEventListener('resize', finish);
      preference.removeEventListener('change', motionChange);
      animations.forEach((animation) => animation.cancel());
    };
  }, []);

  return (
    <div ref={root} className="brand-handoff" inert aria-hidden="true">
      <div ref={scrim} className="brand-handoff-scrim" aria-hidden="true" />
      <img
        ref={logo}
        className="brand-handoff-logo"
        src="/TaskLens.png"
        alt=""
        aria-hidden="true"
      />
      <span ref={name} className="brand-handoff-name" aria-hidden="true">
        <span ref={mask}>TaskLens</span>
      </span>
    </div>
  );
}
