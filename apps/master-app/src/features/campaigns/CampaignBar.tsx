import { DEFAULT_PLAY_LANGUAGE, type Campaign, type PlayLanguage } from '@amber/shared';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createCampaign } from '../../bridge/campaigns.js';
import { Button } from '../../components/ui/Button.js';
import { ActionIcons } from '../../components/ui/icons.js';
import { ErrorOutlet, useAppError } from '../../context/AppErrorContext.js';

import { PlayLanguageSelect } from './PlayLanguageSelect.js';

type CampaignId = Campaign['id'];

type Props = {
  campaigns: Campaign[];
  selectedId: CampaignId | null;
  onSelect: (id: CampaignId) => void;
  onCreated: (campaign: Campaign) => void;
  createDisabled?: boolean;
};

export function CampaignBar({
  campaigns,
  selectedId,
  onSelect,
  onCreated,
  createDisabled = false,
}: Props): ReactElement {
  const { t } = useTranslation();
  const { reportError } = useAppError();
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createLanguage, setCreateLanguage] = useState<PlayLanguage>(DEFAULT_PLAY_LANGUAGE);
  const [creating, setCreating] = useState(false);

  async function submitCreate(): Promise<void> {
    const name = createName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const campaign = await createCampaign({ name, playLanguage: createLanguage });
      onCreated(campaign);
      setCreateOpen(false);
      setCreateName('');
      setCreateLanguage(DEFAULT_PLAY_LANGUAGE);
    } catch (err) {
      reportError(err instanceof Error ? err.message : String(err), { region: 'sidebar' });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="field campaign-bar">
      <label className="campaign-bar__select-wrap" htmlFor="campaign-select">
        <div className="campaign-bar__label-row">
          <span>{t('campaign.label')}</span>
          <Button
            type="button"
            className="btn-icon-only campaign-bar__create"
            icon={ActionIcons.create}
            aria-label={t('campaign.create')}
            aria-expanded={createOpen}
            title={createDisabled ? t('campaign.createDisabledLive') : t('campaign.create')}
            disabled={createDisabled}
            onClick={(e) => {
              e.preventDefault();
              setCreateOpen((open) => !open);
            }}
          />
        </div>
        <select
          id="campaign-select"
          className="campaign-select"
          value={selectedId ?? ''}
          disabled={createDisabled}
          onChange={(e) => {
            if (e.target.value) onSelect(e.target.value as CampaignId);
          }}
        >
          <option value="">{t('campaign.none')}</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {createOpen ? (
        <div className="campaign-bar__create-form" role="form" aria-label={t('campaign.create')}>
          <label className="field" htmlFor="campaign-create-name">
            <span>{t('campaign.createName')}</span>
            <input
              id="campaign-create-name"
              type="text"
              value={createName}
              disabled={creating}
              autoComplete="off"
              onChange={(e) => setCreateName(e.target.value)}
            />
          </label>
          <PlayLanguageSelect
            id="campaign-create-language"
            value={createLanguage}
            disabled={creating}
            onChange={setCreateLanguage}
          />
          <div className="campaign-bar__create-actions">
            <Button
              type="button"
              variant="primary"
              disabled={creating || !createName.trim()}
              onClick={() => void submitCreate()}
            >
              {creating ? t('common.loading') : t('campaign.createConfirm')}
            </Button>
            <Button
              type="button"
              variant="default"
              disabled={creating}
              onClick={() => setCreateOpen(false)}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : null}

      <ErrorOutlet region="sidebar" compact />
    </div>
  );
}
