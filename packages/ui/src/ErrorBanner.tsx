import type { ReactElement } from 'react';

import { UiIcons } from './icons.js';

type Props = {
  message: string;
  dismissAriaLabel: string;
  onDismiss: () => void;
  compact?: boolean;
};

export function ErrorBanner({
  message,
  dismissAriaLabel,
  onDismiss,
  compact = false,
}: Props): ReactElement {
  const DismissIcon = UiIcons.dismiss;

  return (
    <div className={compact ? 'error-banner error-banner--compact' : 'error-banner'} role="alert">
      <p className="error-banner__message">{message}</p>
      <button
        type="button"
        className="btn btn-icon-only error-banner__dismiss"
        onClick={onDismiss}
        aria-label={dismissAriaLabel}
      >
        <DismissIcon size={18} weight="regular" aria-hidden />
      </button>
    </div>
  );
}
