import type { CampaignId, DiscordUserId, SessionId } from '@amber/shared';

export type SessionStatus = 'idle' | 'connecting' | 'connected' | 'ended' | 'error';

export type MqttSessionContextValue = {
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId;
  readonly sessionStatus: SessionStatus;
  readonly sessionError: string | null;
  readonly playerDiscordId: DiscordUserId;
  setPlayerDiscordId: (id: DiscordUserId) => void;
  setSessionStatus: (status: SessionStatus, error?: string | null) => void;
  /** Re-run AWS handshake after a failed bootstrap (does not auto-retry). */
  retrySessionBootstrap: () => void;
};

export type DevFixtureIds = {
  campaignId: CampaignId;
  sessionId: SessionId;
  playerA: DiscordUserId;
  playerB: DiscordUserId;
};
