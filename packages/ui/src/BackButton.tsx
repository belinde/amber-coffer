import type { ReactElement } from 'react';

import { UiIcons } from './icons.js';

const BACK_ICON_SIZE = 14;

type Props = {
  label: string;
  onClick: () => void;
};

export function BackButton({ label, onClick }: Props): ReactElement {
  const Icon = UiIcons.back;

  return (
    <button type="button" className="btn btn-back" onClick={onClick}>
      <Icon size={BACK_ICON_SIZE} weight="regular" aria-hidden />
      <span className="btn-label">{label}</span>
    </button>
  );
}
