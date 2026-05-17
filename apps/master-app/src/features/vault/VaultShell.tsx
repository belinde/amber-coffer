import type { Campaign, Session } from '@amber/shared';
import type { ReactElement } from 'react';

import { ImagesView } from '../images/ImagesView.js';
import { SessionDetailView } from '../sessions/SessionDetailView.js';
import { SessionsView } from '../sessions/SessionsView.js';

import { ConnectionsPanel } from './ConnectionsPanel.js';
import { VaultCategoryBrowse } from './VaultCategoryBrowse.js';
import { VaultEntityDetail } from './VaultEntityDetail.js';
import { VaultHome } from './VaultHome.js';
import { useVaultNavigationContext } from './VaultNavigationContext.js';

type Props = {
  campaign: Campaign;
  onError: (message: string) => void;
};

export function VaultShell({ campaign, onError }: Props): ReactElement {
  const { current, pushView, popView } = useVaultNavigationContext();

  if (current.kind === 'home') {
    return (
      <VaultHome
        campaignName={campaign.name}
        onOpenCategory={(category) => pushView({ kind: 'category', category })}
        onOpenImages={() => pushView({ kind: 'images' })}
        onOpenConnections={() => pushView({ kind: 'connections' })}
        onOpenSessions={() => pushView({ kind: 'sessions' })}
      />
    );
  }

  if (current.kind === 'images') {
    return <ImagesView campaignId={campaign.id} onBack={popView} onError={onError} />;
  }

  if (current.kind === 'sessions') {
    return (
      <SessionsView
        campaignId={campaign.id}
        onBack={popView}
        onError={onError}
        onOpenSession={(sessionId) => pushView({ kind: 'sessionDetail', sessionId })}
      />
    );
  }

  if (current.kind === 'sessionDetail') {
    return (
      <SessionDetailView
        campaignId={campaign.id}
        sessionId={current.sessionId as Session['id']}
        onBack={popView}
        onError={onError}
        onConfigureDiscord={popView}
      />
    );
  }

  if (current.kind === 'connections') {
    return <ConnectionsPanel campaignId={campaign.id} onBack={popView} onError={onError} />;
  }

  if (current.kind === 'category') {
    return (
      <VaultCategoryBrowse
        campaignId={campaign.id}
        category={current.category}
        onBack={popView}
        onOpenEntity={(entityId) =>
          pushView({ kind: 'detail', category: current.category, entityId })
        }
        onError={onError}
      />
    );
  }

  return (
    <VaultEntityDetail
      campaignId={campaign.id}
      category={current.category}
      entityId={current.entityId}
      onBack={popView}
      onSaved={() => popView()}
      onError={onError}
      onOpenSessions={() => pushView({ kind: 'sessions' })}
      onOpenImages={() => pushView({ kind: 'images' })}
    />
  );
}
