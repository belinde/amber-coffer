import {
  tokenSchema,
  type Map as TabletopMap,
  type Session,
  type Token,
  type TokenEntityKind,
} from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';

type MapId = TabletopMap['id'];
type SessionId = Session['id'];
type TokenId = Token['id'];
type TokenPosition = Token['position'];

export async function placeToken(args: {
  mapId: MapId;
  entityKind: TokenEntityKind;
  entityId: string;
  position?: TokenPosition;
}): Promise<Token> {
  const raw = await invoke<unknown>('place_token', {
    mapId: args.mapId,
    entityKind: args.entityKind,
    entityId: args.entityId,
    positionJson: args.position ?? null,
  });
  return tokenSchema.parse(raw);
}

export async function listTokens(mapId: MapId, sessionId?: SessionId | null): Promise<Token[]> {
  const raw = await invoke<unknown[]>('list_tokens', {
    mapId,
    sessionId: sessionId ?? null,
  });
  return raw.map((row) => tokenSchema.parse(row));
}

export async function createCustomSessionToken(args: {
  sessionId: SessionId;
  mapId: MapId;
  displayName: string;
  controlledByDiscordId?: string | null;
  position?: TokenPosition;
}): Promise<Token> {
  const controlledByDiscordId = args.controlledByDiscordId?.trim()
    ? args.controlledByDiscordId.trim()
    : null;
  const raw = await invoke<unknown>('create_custom_session_token', {
    sessionId: args.sessionId,
    mapId: args.mapId,
    displayName: args.displayName.trim(),
    controlledByDiscordId,
    positionJson: args.position ?? null,
  });
  return tokenSchema.parse(raw);
}

export async function moveToken(args: {
  tokenId: TokenId;
  position: TokenPosition;
}): Promise<Token> {
  const raw = await invoke<unknown>('move_token', {
    tokenId: args.tokenId,
    positionJson: args.position,
  });
  return tokenSchema.parse(raw);
}

export async function resolveTokenMoveRequest(args: {
  tokenId: TokenId;
  accepted: boolean;
  finalPosition?: TokenPosition;
  requesterDiscordId?: string | null;
}): Promise<unknown> {
  return invoke<unknown>('resolve_token_move_request', {
    tokenId: args.tokenId,
    accepted: args.accepted,
    finalPositionJson: args.finalPosition ?? null,
    requesterDiscordId: args.requesterDiscordId ?? null,
  });
}

export async function removeToken(tokenId: TokenId): Promise<void> {
  return invoke<void>('remove_token', { tokenId });
}

export async function setTokenController(args: {
  tokenId: TokenId;
  controlledByDiscordId: string | null;
}): Promise<Token> {
  const controlledByDiscordId = args.controlledByDiscordId?.trim()
    ? args.controlledByDiscordId.trim()
    : null;
  const raw = await invoke<unknown>('set_token_controller', {
    tokenId: args.tokenId,
    controlledByDiscordId,
  });
  return tokenSchema.parse(raw);
}

export async function setTokenVisibility(args: {
  tokenId: TokenId;
  visibleToPlayers: boolean;
}): Promise<Token> {
  const raw = await invoke<unknown>('set_token_visibility', {
    tokenId: args.tokenId,
    visibleToPlayers: args.visibleToPlayers,
  });
  return tokenSchema.parse(raw);
}

export async function ensureCampaignCharacterTokens(campaignId: string): Promise<number> {
  return invoke<number>('ensure_campaign_character_tokens', { campaignId });
}

export async function buildTabletopSnapshot(
  sessionId: SessionId,
  activeMapId?: string | null,
): Promise<unknown> {
  return invoke<unknown>('build_tabletop_snapshot_json', {
    sessionId,
    activeMapId: activeMapId ?? null,
  });
}

export async function publishTabletopSnapshot(
  sessionId: SessionId,
  activeMapId?: string | null,
): Promise<void> {
  return invoke<void>('publish_tabletop_snapshot', {
    sessionId,
    activeMapId: activeMapId ?? null,
  });
}

export async function listHandouts(sessionId: SessionId): Promise<unknown[]> {
  return invoke<unknown[]>('list_handouts', { sessionId });
}

export async function createHandout(args: {
  sessionId: SessionId;
  label: string;
  body?: string;
  imageLocalPath?: string;
}): Promise<unknown> {
  return invoke<unknown>('create_handout', {
    sessionId: args.sessionId,
    label: args.label,
    body: args.body ?? null,
    imageLocalPath: args.imageLocalPath ?? null,
  });
}
