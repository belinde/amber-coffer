import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  titleKey: string;
  helpKey?: string;
  children: ReactNode;
};

export function SectionPanel({ titleKey, helpKey, children }: Props): ReactElement {
  const { t } = useTranslation();
  return (
    <section className="vault-section">
      <h3>{t(titleKey)}</h3>
      {helpKey ? <p className="vault-section-help">{t(helpKey)}</p> : null}
      {children}
    </section>
  );
}
