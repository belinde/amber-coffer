import type { Icon } from '@phosphor-icons/react';
import type { ReactElement, ReactNode } from 'react';

import { BackButton } from './BackButton.js';

const PAGE_ICON_SIZE = 44;
const PAGE_ICON_WEIGHT = 'duotone' as const;

type Props = {
  icon: Icon;
  title: string;
  subtitle?: string | undefined;
  onBack: () => void;
  actions?: ReactNode;
};

export function PanelPageHeader({ icon: PageIcon, title, subtitle, onBack, actions }: Props): ReactElement {
  return (
    <header className="panel-page-header">
      <div className="panel-page-header__brand">
        <div className="panel-page-header__heading">
          <span className="panel-page-header__icon" aria-hidden>
            <PageIcon size={PAGE_ICON_SIZE} weight={PAGE_ICON_WEIGHT} />
          </span>
          <div className="panel-page-header__titles">
            <h2 className="panel-page-header__title">{title}</h2>
            {subtitle ? <p className="panel-page-header__subtitle">{subtitle}</p> : null}
          </div>
        </div>
        <BackButton onClick={onBack} />
      </div>
      {actions ? <div className="panel-page-header__actions">{actions}</div> : null}
    </header>
  );
}
