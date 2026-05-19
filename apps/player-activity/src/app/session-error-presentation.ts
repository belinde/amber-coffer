/** Parsed handshake / bootstrap error for i18n in {@link PlayerActivityShell}. */
export type SessionErrorPresentation = {
  titleKey: string;
  detailKey?: string;
  detailParams?: Record<string, string>;
  /** Technical line (API code) for support. */
  technical?: string;
};

export function getSessionErrorPresentation(
  sessionError: string | null,
  channelId: string | null,
): SessionErrorPresentation {
  if (!sessionError) {
    return { titleKey: 'session.error' };
  }

  const [code, ...rest] = sessionError.split(':');
  const message = rest.join(':').trim();

  if (code === 'channel_not_linked') {
    const view: SessionErrorPresentation = {
      titleKey: 'session.errors.channelNotLinked.title',
      detailKey: 'session.errors.channelNotLinked.detail',
      detailParams: { channelId: channelId ?? '—' },
    };
    if (message.length > 0) {
      view.technical = sessionError;
    }
    return view;
  }

  if (code === 'discord_channel_unavailable') {
    return {
      titleKey: 'session.errors.channelUnavailable.title',
      detailKey: 'session.errors.channelUnavailable.detail',
      technical: sessionError,
    };
  }

  if (code === 'discord_voice_channel_required') {
    return {
      titleKey: 'session.errors.voiceChannelRequired.title',
      detailKey: 'session.errors.voiceChannelRequired.detail',
      detailParams: { channelId: channelId ?? '—' },
      technical: sessionError,
    };
  }

  if (code === 'sync_state_failed' || code === 'sync_poll_failed' || code === 'sync_not_started') {
    return {
      titleKey: 'session.errors.syncFailed.title',
      detailKey: 'session.errors.syncFailed.detail',
      technical: sessionError,
    };
  }

  return {
    titleKey: 'session.error',
    technical: sessionError,
  };
}
