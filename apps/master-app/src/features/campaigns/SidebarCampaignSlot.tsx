import type { Campaign } from '@amber/shared';
import type { ReactElement } from 'react';

import { useOptionalActiveSession } from '../../context/ActiveSessionContext.js';
import { ReturnToSessionSidebar } from '../sessions/ReturnToSessionSidebar.js';

import { CampaignBar } from './CampaignBar.js';

type CampaignId = Campaign['id'];

type Props = {
  campaigns: Campaign[];
  selectedId: CampaignId | null;
  onSelect: (id: CampaignId) => void;
  onCreated: (campaign: Campaign) => void;
  onOpenVault: () => void;
};

export function SidebarCampaignSlot({
  campaigns,
  selectedId,
  onSelect,
  onCreated,
  onOpenVault,
}: Props): ReactElement {
  const activeSession = useOptionalActiveSession()?.activeSession ?? null;

  if (activeSession) {
    return <ReturnToSessionSidebar onOpenVault={onOpenVault} />;
  }

  return (
    <CampaignBar
      campaigns={campaigns}
      selectedId={selectedId}
      onSelect={onSelect}
      onCreated={onCreated}
      createDisabled={false}
    />
  );
}
