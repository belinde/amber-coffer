import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const dynamo = new DynamoDBClient({});

const MAX_PENDING_EVENTS = 64;

export type SessionSyncRow = {
  pk: string;
  version: number;
  snapshot: unknown;
  pendingEvents: unknown[];
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
  const merged = [...(existing?.pendingEvents ?? []), ...args.events].slice(-MAX_PENDING_EVENTS);
  const version = (existing?.version ?? 0) + 1;
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

export async function clearPendingEvents(args: {
  tableName: string;
  campaignId: string;
  sessionId: string;
  consumeUpToVersion?: number;
}): Promise<SessionSyncRow | null> {
  const existing = await getSessionSyncRow(args.tableName, args.campaignId, args.sessionId);
  if (!existing) {
    return null;
  }
  if (args.consumeUpToVersion !== undefined && existing.version > args.consumeUpToVersion) {
    return existing;
  }
  const row: SessionSyncRow = {
    ...existing,
    pendingEvents: [],
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
  pendingEvents: unknown[];
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
