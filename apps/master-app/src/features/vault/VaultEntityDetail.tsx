import type { Campaign } from '@amber/shared';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { iconForSection, iconForVaultCategory } from '../../components/ui/icons.js';
import { useAppError } from '../../context/AppErrorContext.js';
import { applyValidationFailure } from '../validation/apply-validation-failure.js';
import { sectionHasFieldError } from '../validation/section-for-field-path.js';

import { EntityDetailLayout } from './components/EntityDetailLayout.js';
import { sectionsForCategory, type SectionId } from './entity-sections.config.js';
import type { VaultCategory } from './vault-categories.js';
import { NEW_ENTITY_ID } from './vault-categories.js';
import {
  deleteVaultEntity,
  emptyVaultEntity,
  entityDisplayName,
  loadVaultEntity,
  saveVaultEntity,
  type VaultEntity,
} from './vault-entity-api.js';
import { VaultEntitySections } from './VaultEntitySections.js';

type Props = {
  campaign: Campaign;
  category: VaultCategory;
  entityId: string;
  onBack: () => void;
  onSaved: (entityId: string) => void;
  onError: (message: string) => void;
  onOpenSessions?: (() => void) | undefined;
  onOpenImages?: (() => void) | undefined;
  onConfigureDiscord?: (() => void) | undefined;
};

export function VaultEntityDetail({
  campaign,
  category,
  entityId,
  onBack,
  onSaved,
  onError,
  onOpenSessions,
  onOpenImages,
  onConfigureDiscord,
}: Props): ReactElement {
  const campaignId = campaign.id;
  const { t } = useTranslation();
  const { clearError } = useAppError();
  const isNew = entityId === NEW_ENTITY_ID;
  const sections = sectionsForCategory(category);
  const [draft, setDraft] = useState<VaultEntity | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>(sections[0]?.id ?? 'identity');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isNew) {
        setDraft(emptyVaultEntity(category, campaignId));
      } else {
        const row = await loadVaultEntity(category, entityId);
        setDraft(row ?? emptyVaultEntity(category, campaignId));
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [campaignId, category, entityId, isNew, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(): Promise<void> {
    if (!draft) return;
    clearError();
    setSaving(true);
    setFieldErrors({});
    try {
      const id = await saveVaultEntity(category, isNew ? null : entityId, draft);
      onSaved(id);
    } catch (err) {
      const handled = applyValidationFailure(err, t, category, setFieldErrors, setActiveSection);
      if (!handled) {
        onError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSaving(false);
    }
  }

  function handleDraftChange(next: VaultEntity): void {
    setDraft(next);
    if (Object.keys(fieldErrors).length > 0) {
      setFieldErrors({});
    }
  }

  async function handleDelete(): Promise<void> {
    if (isNew) return;
    const name = draft ? entityDisplayName(category, draft) : '';
    if (!window.confirm(t('vault.deleteConfirm', { name }))) return;
    try {
      await deleteVaultEntity(category, entityId);
      onBack();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  if (loading || !draft) {
    return <p className="empty-state">{t('common.loading')}</p>;
  }

  const title = isNew ? t(`vault.create.${category}`) : entityDisplayName(category, draft);

  return (
    <EntityDetailLayout
      icon={iconForVaultCategory(category)}
      title={title}
      subtitle={t(`vault.categories.${category}`)}
      saving={saving}
      onBack={onBack}
      onSave={() => void handleSave()}
      {...(isNew ? {} : { onDelete: () => void handleDelete() })}
    >
      <nav className="vault-section-tabs" role="tablist" aria-label={t('vault.sectionNav')}>
        {sections.map((section) => {
          const TabIcon = iconForSection(section.id);
          const isActive = activeSection === section.id;
          const hasError = sectionHasFieldError(category, section.id, Object.keys(fieldErrors));
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={[
                'vault-section-tab',
                isActive && 'vault-section-tab--active',
                hasError && 'vault-section-tab--error',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setActiveSection(section.id)}
            >
              <TabIcon size={18} weight={isActive ? 'fill' : 'regular'} aria-hidden />
              <span>{t(section.labelKey)}</span>
            </button>
          );
        })}
      </nav>
      <VaultEntitySections
        campaign={campaign}
        category={category}
        entityId={entityId}
        sectionId={activeSection}
        draft={draft}
        fieldErrors={fieldErrors}
        onOpenSessions={onOpenSessions}
        onOpenImages={onOpenImages}
        onConfigureDiscord={onConfigureDiscord}
        onChange={handleDraftChange}
        onError={onError}
      />
    </EntityDetailLayout>
  );
}
