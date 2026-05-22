import type { CampaignId, Handout, Map, MqttMessage, SessionId, Token } from '@amber/shared';
import {
  buildSyncTopic,
  handoutSchema,
  mapSchema,
  sessionIdSchema,
  syncEnvelopeMqttSchema,
  tokenSchema,
} from '@amber/shared';

import {
  DEMO_CAMPAIGN_ID,
  DEMO_CAMPAIGN_ID_RAW,
  DEMO_PLAYER_A_RAW,
  DEMO_PLAYER_B_RAW,
  DEMO_SESSION_ID,
  DEMO_SESSION_ID_RAW,
} from '../../app/default-session-ids.js';

export type SyncEnvelopeParsed = ReturnType<typeof syncEnvelopeMqttSchema.parse>;

export const DEMO_MAP_ID = 'cccccccc-cccc-7ccc-8ccc-cccccccccccc' as Map['id'];
export const DEMO_TOKEN_CHARACTER_ID = 'dddddddd-dddd-7ddd-8ddd-dddddddddddd' as Token['id'];
export const DEMO_TOKEN_SUMMON_ID = 'eeeeeeee-eeee-7eee-8eee-eeeeeeeeeeee' as Token['id'];
export const DEMO_TOKEN_OTHER_ID = 'ffffffff-ffff-7fff-8fff-ffffffffffff' as Token['id'];
export const DEMO_HANDOUT_ID = '99999999-9999-7999-8999-999999999999' as Handout['id'];

const now = 1_700_000_000_000;

export function buildDemoMap(): Map {
  return mapSchema.parse({
    id: DEMO_MAP_ID,
    campaignId: DEMO_CAMPAIGN_ID_RAW,
    name: 'Demo tavern',
    imagePath: '',
    widthPx: 1200,
    heightPx: 900,
    gridSizePx: 50,
    gridCols: 24,
    gridRows: 18,
    benchSlots: 12,
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
}

function buildToken(args: {
  id: Token['id'];
  entityKind: Token['entityKind'];
  entityId: string;
  position: Token['position'];
  controlledByPlayerDiscordId: string | null;
}): Token {
  return tokenSchema.parse({
    id: args.id,
    mapId: DEMO_MAP_ID,
    entityKind: args.entityKind,
    entityId: args.entityId,
    position: args.position,
    visibleToPlayers: true,
    controlledByPlayerDiscordId: args.controlledByPlayerDiscordId,
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
}

export function buildDemoTokens(): Token[] {
  return [
    buildToken({
      id: DEMO_TOKEN_CHARACTER_ID,
      entityKind: 'character',
      entityId: 'char-hero',
      position: { zone: 'board', xCell: 4, yCell: 6 },
      controlledByPlayerDiscordId: DEMO_PLAYER_A_RAW,
    }),
    buildToken({
      id: DEMO_TOKEN_SUMMON_ID,
      entityKind: 'npc',
      entityId: 'npc-summoned-wolf',
      position: { zone: 'board', xCell: 6, yCell: 6 },
      controlledByPlayerDiscordId: DEMO_PLAYER_A_RAW,
    }),
    buildToken({
      id: DEMO_TOKEN_OTHER_ID,
      entityKind: 'character',
      entityId: 'char-rival',
      position: { zone: 'board', xCell: 10, yCell: 8 },
      controlledByPlayerDiscordId: DEMO_PLAYER_B_RAW,
    }),
  ];
}

export function buildDemoHandout(): Handout {
  return handoutSchema.parse({
    id: DEMO_HANDOUT_ID,
    campaignId: DEMO_CAMPAIGN_ID_RAW,
    sessionId: DEMO_SESSION_ID_RAW,
    label: 'Mysterious note',
    body: 'The seal bears a raven clutching a coin.',
    visibleToPlayers: true,
    shownAt: now,
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
}

export function buildTabletopSnapshotPayload(): Extract<
  MqttMessage,
  { kind: 'tabletop.snapshot' }
> {
  const tokens = buildDemoTokens();
  return {
    kind: 'tabletop.snapshot',
    sessionId: sessionIdSchema.parse(DEMO_SESSION_ID_RAW),
    activeMapId: DEMO_MAP_ID,
    maps: [buildDemoMap()],
    tokens,
    tokenLabels: {
      [DEMO_TOKEN_CHARACTER_ID]: 'HE',
      [DEMO_TOKEN_SUMMON_ID]: 'WL',
      [DEMO_TOKEN_OTHER_ID]: 'RI',
    },
    tokenNames: {
      [DEMO_TOKEN_CHARACTER_ID]: 'Hero',
      [DEMO_TOKEN_SUMMON_ID]: 'Summoned wolf',
      [DEMO_TOKEN_OTHER_ID]: 'Rival',
    },
    visibleHandouts: [],
    snapshotAt: now,
  };
}

let harnessSeq = 0;

export function buildSyncEnvelope(payload: MqttMessage): SyncEnvelopeParsed {
  return syncEnvelopeMqttSchema.parse({
    v: 1,
    campaignId: DEMO_CAMPAIGN_ID_RAW,
    sessionId: DEMO_SESSION_ID_RAW,
    senderRole: 'master',
    senderId: DEMO_PLAYER_B_RAW,
    seq: harnessSeq++,
    timestamp: Date.now(),
    payload,
  });
}

export function snapshotTopic(
  campaignId: CampaignId = DEMO_CAMPAIGN_ID,
  sessionId: SessionId = DEMO_SESSION_ID,
): string {
  return buildSyncTopic(campaignId, sessionId, 'snapshot');
}

export function tokensTopic(
  campaignId: CampaignId = DEMO_CAMPAIGN_ID,
  sessionId: SessionId = DEMO_SESSION_ID,
): string {
  return buildSyncTopic(campaignId, sessionId, 'tokens');
}

export function handoutsTopic(
  campaignId: CampaignId = DEMO_CAMPAIGN_ID,
  sessionId: SessionId = DEMO_SESSION_ID,
): string {
  return buildSyncTopic(campaignId, sessionId, 'handouts');
}

export function controlTopic(
  campaignId: CampaignId = DEMO_CAMPAIGN_ID,
  sessionId: SessionId = DEMO_SESSION_ID,
): string {
  return buildSyncTopic(campaignId, sessionId, 'control');
}
