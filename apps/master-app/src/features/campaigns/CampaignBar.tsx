import type { Campaign } from '@amber/shared';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { createCampaign } from '../../bridge/campaigns.js';
import { Button } from '../../components/ui/Button.js';
import { ActionIcons } from '../../components/ui/icons.js';

type CampaignId = Campaign['id'];

type Props = {
  campaigns: Campaign[];
  selectedId: CampaignId | null;
  onSelect: (id: CampaignId) => void;
  onCreated: (campaign: Campaign) => void;
  onError: (message: string) => void;
};

export function CampaignBar({
  campaigns,
  selectedId,
  onSelect,
  onCreated,
  onError,
}: Props): ReactElement {
  const { t } = useTranslation();

  async function handleCreate(): Promise<void> {
    const name = window.prompt(t('campaign.createPrompt'));
    if (!name?.trim()) return;
    try {
      const campaign = await createCampaign({ name: name.trim() });
      onCreated(campaign);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <label className="field campaign-bar" htmlFor="campaign-select">
      <div className="campaign-bar__label-row">
        <span>{t('campaign.label')}</span>
        <Button
          type="button"
          className="btn-icon-only campaign-bar__create"
          icon={ActionIcons.create}
          aria-label={t('campaign.create')}
          title={t('campaign.create')}
          onClick={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
        />
      </div>
      <select
        id="campaign-select"
        className="campaign-select"
        value={selectedId ?? ''}
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
  );
}

