import type { Handler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

interface StreamSessionRecord {
  id: string;
  title: string;
  description?: string;
  endedAt?: string;
  postLiveProcessedAt?: string;
  resultsJson?: string;
}

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const STREAM_SESSION_STATUS_INDEX = "byStatus";

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function listEndedSessions(tableName: string): Promise<StreamSessionRecord[]> {
  const items: StreamSessionRecord[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await dynamo.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: STREAM_SESSION_STATUS_INDEX,
        KeyConditionExpression: "#status = :ended",
        FilterExpression: "attribute_not_exists(postLiveProcessedAt)",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":ended": "ended",
        },
        ExclusiveStartKey: exclusiveStartKey,
      })
    );

    items.push(...((result.Items as StreamSessionRecord[] | undefined) ?? []));
    exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return items;
}

async function publishArchivePost(
  contentPostTableName: string,
  streamSession: StreamSessionRecord
): Promise<void> {
  const publishedAt = streamSession.endedAt ?? new Date().toISOString();

  await dynamo.send(
    new PutCommand({
      TableName: contentPostTableName,
      Item: {
        source: "livestream",
        externalId: streamSession.id,
        title: streamSession.title,
        url: `obs://session/${streamSession.id}`,
        publishedAt,
        description: streamSession.description ?? "Livestream completed",
        status: "published",
        rawJson: streamSession.resultsJson ?? "{}",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        __typename: "ContentPost",
      },
      ConditionExpression: "attribute_not_exists(source)",
    })
  );
}

async function markAsProcessed(sessionTableName: string, sessionId: string): Promise<void> {
  const now = new Date().toISOString();

  await dynamo.send(
    new UpdateCommand({
      TableName: sessionTableName,
      Key: { id: sessionId },
      UpdateExpression: "SET postLiveProcessedAt = :now, updatedAt = :now",
      ExpressionAttributeValues: {
        ":now": now,
      },
    })
  );
}

export const handler: Handler = async () => {
  const streamSessionTableName = getRequiredEnv("STREAM_SESSION_TABLE_NAME");
  const contentPostTableName = getRequiredEnv("CONTENT_POST_TABLE_NAME");

  const sessions = await listEndedSessions(streamSessionTableName);

  for (const streamSession of sessions) {
    try {
      await publishArchivePost(contentPostTableName, streamSession);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        error.name === "ConditionalCheckFailedException"
      ) {
        // Archive already exists
      } else {
        throw error;
      }
    }

    await markAsProcessed(streamSessionTableName, streamSession.id);
  }

  return {
    statusCode: 200,
    body: `Processed ${sessions.length} ended session(s).`,
  };
};
