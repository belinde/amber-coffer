import type { ReactElement, ReactNode } from 'react';

import { UiIcons } from './icons.js';

type Props = {
  dismissAriaLabel: string;
  onDismiss: () => void;
  children: ReactNode;
  labelledBy?: string | undefined;
};

export function InfoBanner({
  dismissAriaLabel,
  onDismiss,
  children,
  labelledBy,
}: Props): ReactElement {
  const DismissIcon = UiIcons.dismiss;

  return (
    <div
      className="info-banner"
      role="region"
      {...(labelledBy ? { 'aria-labelledby': labelledBy } : {})}
    >
      <button
        type="button"
        className="btn btn-icon-only info-banner__dismiss"
        onClick={onDismiss}
        aria-label={dismissAriaLabel}
      >
        <DismissIcon size={18} weight="regular" aria-hidden />
      </button>
      <div className="info-banner__body">{children}</div>
    </div>
  );
}
