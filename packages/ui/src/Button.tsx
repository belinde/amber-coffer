import type { Icon, IconWeight } from '@phosphor-icons/react';
import { Plus } from '@phosphor-icons/react';
import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from 'react';

export const BUTTON_ICON_SIZE = 18;
export const BUTTON_ICON_WEIGHT: IconWeight = 'duotone';
export const BUTTON_PLUS_ICON_WEIGHT: IconWeight = 'regular';

function weightForButtonIcon(icon: Icon | undefined): IconWeight {
  return icon === Plus ? BUTTON_PLUS_ICON_WEIGHT : BUTTON_ICON_WEIGHT;
}

type Variant = 'default' | 'primary' | 'secondary' | 'danger' | 'success';

type Props = Omit<ComponentPropsWithoutRef<'button'>, 'children'> & {
  variant?: Variant;
  icon?: Icon;
  iconRight?: Icon;
  children?: ReactNode;
};

function classNames(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function Button({
  variant = 'default',
  icon: IconStart,
  iconRight: IconEnd,
  className,
  children,
  type = 'button',
  ...rest
}: Props): ReactElement {
  return (
    <button
      type={type}
      className={classNames('btn', variant !== 'default' && variant, className)}
      {...rest}
    >
      {IconStart ? (
        <IconStart size={BUTTON_ICON_SIZE} weight={weightForButtonIcon(IconStart)} aria-hidden />
      ) : null}
      {children != null && children !== '' ? (
        typeof children === 'string' || typeof children === 'number' ? (
          <span className="btn-label">{children}</span>
        ) : (
          children
        )
      ) : null}
      {IconEnd ? (
        <IconEnd size={BUTTON_ICON_SIZE} weight={weightForButtonIcon(IconEnd)} aria-hidden />
      ) : null}
    </button>
  );
}
