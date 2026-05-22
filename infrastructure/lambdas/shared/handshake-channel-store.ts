import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

const dynamo = new DynamoDBClient({});

export async function upsertHandshakeChannelMapping(args: {
  tableName: string;
  channelId: string;
  campaignId: string;
  sessionId: string;
}): Promise<void> {
  await dynamo.send(
    new PutItemCommand({
      TableName: args.tableName,
      Item: {
        channel_id: { S: args.channelId },
        campaign_id: { S: args.campaignId },
        session_id: { S: args.sessionId },
      },
    }),
  );
}
