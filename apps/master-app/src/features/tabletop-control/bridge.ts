import {
  tokenSchema,
  type Handout,
  type Map as TabletopMap,
  type Session,
  type Token,
  type TokenEntityKind,
} from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';

type HandoutId = Handout['id'];
type MapId = TabletopMap['id'];
type SessionId = Session['id'];
type TokenId = Token['id'];
type TokenPosition = Token['position'];

/**
 * Typed Tauri bridge for the tabletop feature.
 *
 * The Rust commands live in `apps/master-app/src-tauri/src/commands/tabletop.rs` and
 * `commands/handouts.rs`. They are stubs for now (return `NotImplemented`); the renderer
 * keeps this typed surface to avoid magic strings.
 */
export async function placeToken(args: {
  mapId: MapId;
  entityKind: TokenEntityKind;
  entityId: string;
  position: TokenPosition;
}): Promise<unknown> {
  return invoke<unknown>('place_token', {
    mapId: args.mapId,
    entityKind: args.entityKind,
    entityId: args.entityId,
    positionJson: args.position,
  });
}

export async function listTokens(mapId: MapId): Promise<Token[]> {
  const raw = await invoke<unknown[]>('list_tokens', { mapId });
  return raw.map((row) => tokenSchema.parse(row));
}

export async function moveToken(args: { tokenId: TokenId; position: TokenPosition }): Promise<Token> {
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
}): Promise<unknown> {
  return invoke<unknown>('resolve_token_move_request', {
    tokenId: args.tokenId,
    accepted: args.accepted,
    finalPositionJson: args.finalPosition ?? null,
  });
}

export async function removeToken(tokenId: TokenId): Promise<void> {
  return invoke<void>('remove_token', { tokenId });
}

export async function shareHandout(handoutId: HandoutId): Promise<unknown> {
  return invoke<unknown>('share_handout', { handoutId });
}

export async function hideHandout(handoutId: HandoutId): Promise<void> {
  return invoke<void>('hide_handout', { handoutId });
}

export async function publishTabletopSnapshot(sessionId: SessionId): Promise<void> {
  return invoke<void>('publish_tabletop_snapshot', { sessionId });
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
