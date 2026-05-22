import type { ReactElement, ReactNode } from 'react';

type Props = {
  children: ReactNode;
  variant?: 'default' | 'portrait';
  className?: string | undefined;
  as?: 'ul' | 'div';
};

function classNames(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function CardGrid({
  children,
  variant = 'default',
  className,
  as: Tag = 'ul',
}: Props): ReactElement {
  return (
    <Tag
      className={classNames(
        'card-grid',
        variant === 'portrait' && 'card-grid--portrait',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
