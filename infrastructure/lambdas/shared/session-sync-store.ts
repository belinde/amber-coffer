import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const dynamo = new DynamoDBClient({});

const MAX_PENDING_EVENTS = 64;

/**
 * Versioned event envelope stored in the rolling buffer.
 * Mirrors `SessionSyncEvent` from `@amber/shared` (kept local to avoid
 * cross-package dependency in the Lambda bundle).
 */
export type StoredSyncEvent = {
  eventVersion: number;
  message: unknown;
};

export type SessionSyncRow = {
  pk: string;
  version: number;
  snapshot: unknown;
  pendingEvents: StoredSyncEvent[];
  sessionEnded: boolean;
  updatedAt: number;
};

export function sessionSyncPk(campaignId: string, sessionId: string): string {
  return `CAMPAIGN#${campaignId}#SESSION#${sessionId}`;
}

export async function getSessionSyncRow(
  tableName: string,
  campaignId: string,
  sessionId: string,
): Promise<SessionSyncRow | null> {
  const pk = sessionSyncPk(campaignId, sessionId);
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: tableName,
      Key: { pk: { S: pk } },
    }),
  );
  if (!result.Item) {
    return null;
  }
  const row = unmarshall(result.Item) as SessionSyncRow;
  return {
    pk,
    version: row.version ?? 0,
    snapshot: row.snapshot ?? null,
    pendingEvents: Array.isArray(row.pendingEvents) ? row.pendingEvents : [],
    sessionEnded: Boolean(row.sessionEnded),
    updatedAt: row.updatedAt ?? 0,
  };
}

export async function putSessionSnapshot(args: {
  tableName: string;
  campaignId: string;
  sessionId: string;
  snapshot: unknown;
}): Promise<SessionSyncRow> {
  const existing = await getSessionSyncRow(args.tableName, args.campaignId, args.sessionId);
  const version = (existing?.version ?? 0) + 1;
  const row: SessionSyncRow = {
    pk: sessionSyncPk(args.campaignId, args.sessionId),
    version,
    snapshot: args.snapshot,
    pendingEvents: existing?.pendingEvents ?? [],
    sessionEnded: existing?.sessionEnded ?? false,
    updatedAt: Date.now(),
  };
  await dynamo.send(
    new PutItemCommand({
      TableName: args.tableName,
      Item: marshall(row, { removeUndefinedValues: true }),
    }),
  );
  return row;
}

export async function appendPendingEvents(args: {
  tableName: string;
  campaignId: string;
  sessionId: string;
  events: unknown[];
}): Promise<SessionSyncRow> {
  const existing = await getSessionSyncRow(args.tableName, args.campaignId, args.sessionId);
  const baseVersion = existing?.version ?? 0;
  const version = baseVersion + 1;

  // Derive a strictly increasing eventVersion for each new event.
  // The first event in this batch gets `version * 1000 + 1`, subsequent
  // events increment from there. This leaves room for multiple events per
  // version bump while guaranteeing monotonicity across calls (each call
  // bumps `version`, so the next batch's base is always higher).
  const batchBase = version * 1000;
  const envelopes: StoredSyncEvent[] = args.events.map((message, index) => ({
    eventVersion: batchBase + index + 1,
    message,
  }));

  const merged = [...(existing?.pendingEvents ?? []), ...envelopes].slice(-MAX_PENDING_EVENTS);

  const row: SessionSyncRow = {
    pk: sessionSyncPk(args.campaignId, args.sessionId),
    version,
    snapshot: existing?.snapshot ?? null,
    pendingEvents: merged,
    sessionEnded: existing?.sessionEnded ?? false,
    updatedAt: Date.now(),
  };
  await dynamo.send(
    new PutItemCommand({
      TableName: args.tableName,
      Item: marshall(row, { removeUndefinedValues: true }),
    }),
  );
  return row;
}

/**
 * Drains (trims) events whose `eventVersion` is at or below
 * `acknowledgedEventVersion`. This prevents unbounded retention while letting
 * slow clients catch up within the rolling window.
 *
 * If `acknowledgedEventVersion` is omitted, all pending events are cleared
 * (legacy full-drain behavior, retained for session-end cleanup).
 */
export async function clearPendingEvents(args: {
  tableName: string;
  campaignId: string;
  sessionId: string;
  acknowledgedEventVersion?: number;
}): Promise<SessionSyncRow | null> {
  const existing = await getSessionSyncRow(args.tableName, args.campaignId, args.sessionId);
  if (!existing) {
    return null;
  }

  const trimmed =
    args.acknowledgedEventVersion !== undefined
      ? existing.pendingEvents.filter((e) => e.eventVersion > args.acknowledgedEventVersion!)
      : [];

  const row: SessionSyncRow = {
    ...existing,
    pendingEvents: trimmed,
    updatedAt: Date.now(),
  };
  await dynamo.send(
    new PutItemCommand({
      TableName: args.tableName,
      Item: marshall(row, { removeUndefinedValues: true }),
    }),
  );
  return row;
}

export function rowToStateResponse(row: SessionSyncRow | null): {
  version: number;
  snapshot: unknown;
  sessionEnded: boolean;
  pendingEvents: StoredSyncEvent[];
} {
  if (!row) {
    return { version: 0, snapshot: null, sessionEnded: false, pendingEvents: [] };
  }
  return {
    version: row.version,
    snapshot: row.snapshot,
    sessionEnded: row.sessionEnded,
    pendingEvents: row.pendingEvents,
  };
}
