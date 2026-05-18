import { parsePlayLanguage, type Campaign, type PlayLanguage } from '@amber/shared';
import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { updateCampaign } from '../../bridge/campaigns.js';
import { Button } from '../../components/ui/Button.js';
import { Field } from '../../components/ui/Field.js';
import { CampaignVaultIcon } from '../../components/ui/icons.js';
import { PanelPageHeader } from '../../components/ui/PanelPageHeader.js';
import { ErrorOutlet } from '../../context/AppErrorContext.js';

import { CAMPAIGN_TABS, iconForCampaignTab, type CampaignTabId } from './campaign-tabs.config.js';
import { CampaignDiscordLinkWizard } from './CampaignDiscordLinkWizard.js';
import { PlayLanguageSelect } from './PlayLanguageSelect.js';

type Props = {
  campaign: Campaign;
  onBack: () => void;
  onError: (message: string) => void;
  onCampaignUpdated: (campaign: Campaign) => void;
  onOpenSettings: () => void;
};

export function CampaignView({
  campaign,
  onBack,
  onError,
  onCampaignUpdated,
  onOpenSettings,
}: Props): ReactElement {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<CampaignTabId>('general');
  const [name, setName] = useState(campaign.name);
  const [catchphrase, setCatchphrase] = useState(campaign.catchphrase ?? '');
  const [playLanguage, setPlayLanguage] = useState<PlayLanguage>(() =>
    parsePlayLanguage(campaign.playLanguage),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(campaign.name);
    setCatchphrase(campaign.catchphrase ?? '');
    setPlayLanguage(parsePlayLanguage(campaign.playLanguage));
  }, [campaign]);

  const metadataDirty =
    name.trim() !== campaign.name ||
    catchphrase.trim() !== (campaign.catchphrase ?? '') ||
    playLanguage !== parsePlayLanguage(campaign.playLanguage);

  async function saveMetadata(): Promise<void> {
    const trimmedName = name.trim();
    if (!trimmedName) {
      onError(t('validation.string.required'));
      return;
    }
    setSaving(true);
    try {
      const updated = await updateCampaign({
        id: campaign.id,
        name: trimmedName,
        catchphrase: catchphrase.trim() || null,
        playLanguage,
      });
      onCampaignUpdated(updated);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="vault-campaign">
      <PanelPageHeader icon={CampaignVaultIcon} title={t('vault.campaignTitle')} onBack={onBack} />
      <ErrorOutlet region="main" />

      <nav className="vault-section-tabs" role="tablist" aria-label={t('campaign.sectionNav')}>
        {CAMPAIGN_TABS.map((tab) => {
          const TabIcon = iconForCampaignTab(tab.id);
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={['vault-section-tab', isActive && 'vault-section-tab--active']
                .filter(Boolean)
                .join(' ')}
              onClick={() => setActiveTab(tab.id)}
            >
              <TabIcon size={18} weight={isActive ? 'fill' : 'regular'} aria-hidden />
              <span>{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </nav>

      {activeTab === 'general' ? (
        <section
          className="vault-campaign__metadata"
          role="tabpanel"
          aria-labelledby="campaign-metadata-heading"
        >
          <h3 id="campaign-metadata-heading">{t('campaign.metadataTitle')}</h3>
          <Field label={t('campaign.nameLabel')} htmlFor="campaign-name">
            <input
              id="campaign-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              disabled={saving}
            />
          </Field>
          <Field label={t('campaign.catchphraseLabel')} htmlFor="campaign-catchphrase">
            <textarea
              id="campaign-catchphrase"
              value={catchphrase}
              onChange={(e) => setCatchphrase(e.target.value)}
              rows={2}
              disabled={saving}
            />
          </Field>
          <PlayLanguageSelect
            id="campaign-play-language"
            value={playLanguage}
            disabled={saving}
            onChange={setPlayLanguage}
          />
          <Button
            type="button"
            variant="primary"
            disabled={saving || !metadataDirty || !name.trim()}
            onClick={() => void saveMetadata()}
          >
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </section>
      ) : null}

      {activeTab === 'discord' ? (
        <CampaignDiscordLinkWizard
          campaign={campaign}
          onCampaignUpdated={onCampaignUpdated}
          onError={onError}
          onConfigureToken={onOpenSettings}
        />
      ) : null}
    </div>
  );
}
