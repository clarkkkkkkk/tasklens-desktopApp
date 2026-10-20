import type { ComponentPropsWithRef } from 'react';
type Props = Omit<ComponentPropsWithRef<'h1'>, 'children'> & { children: string };
export function MotionHeading({ children, ...props }: Props) {
  return <h1 {...props}>{children}</h1>;
}
