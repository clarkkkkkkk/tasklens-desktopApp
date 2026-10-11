import { useLayoutEffect, useRef, type ComponentPropsWithRef } from 'react';
import { animateMotion } from './motion';
type Props = Omit<ComponentPropsWithRef<'h1'>, 'children'> & {
  children: string;
  revealWords?: boolean;
};
export function MotionHeading({ children, revealWords = false, ...props }: Props) {
  const words = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!revealWords) return;
    const elements = Array.from(words.current?.children || []) as HTMLElement[];
    elements.forEach(
      (element, index) => void animateMotion(element, 'word', Math.min(index * 30, 120)),
    );
    return () =>
      elements.forEach((element) =>
        element.getAnimations().forEach((animation) => animation.cancel()),
      );
  }, [children, revealWords]);
  // Workspace headings share the page fade instead of layering text animations.
  if (!revealWords) return <h1 {...props}>{children}</h1>;
  return (
    <h1 {...props}>
      <span className="sr-only">{children}</span>
      <span ref={words} aria-hidden="true">
        {children.split(/\s+/).map((word, index) => (
          <span className="motion-word" key={`${index}-${word}`}>
            {word}{' '}
          </span>
        ))}
      </span>
    </h1>
  );
}
