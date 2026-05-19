import type { DiscordVoiceChannelOption } from '@amber/shared';

export function formatVoiceChannelLabel(
  channel: DiscordVoiceChannelOption,
  stageLabel: string,
): string {
  const prefix = channel.parentName ? `${channel.parentName} / ` : '';
  const stage = channel.kind === 'stage' ? ` (${stageLabel})` : '';
  return `${prefix}${channel.name}${stage}`;
}
