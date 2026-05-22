import type { ReactElement, ReactNode } from 'react';

type Props = {
  children: ReactNode;
  className?: string | undefined;
};

function classNames(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function PageCard({ children, className }: Props): ReactElement {
  return <article className={classNames('page-card', className)}>{children}</article>;
}
