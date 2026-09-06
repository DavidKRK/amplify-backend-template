import type { Handler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { getConnector } from "./connectors";
import type {
  ConnectorResult,
  StreamDestinationRecord,
  StreamSessionRecord,
} from "./connectors/types";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const STATUS_INDEX_NAME = "byStatus";

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseDestinationIds(raw: string | undefined): string[] | undefined | null {
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      if (parsed.every((item) => typeof item === "string")) {
        return parsed;
      }
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

function parseTimestampMs(raw: string | undefined): number | undefined | null {
  if (!raw) return undefined;
  const value = Date.parse(raw);
  if (Number.isNaN(value)) return null;
  return value;
}

function shouldStartSession(session: StreamSessionRecord): boolean | null {
  const plannedStartAtMs = parseTimestampMs(session.plannedStartAt);
  if (plannedStartAtMs === null) return null;
  if (plannedStartAtMs === undefined) return true;
  return plannedStartAtMs <= Date.now();
}

function shouldStopSession(session: StreamSessionRecord): boolean | null {
  const plannedEndAtMs = parseTimestampMs(session.plannedEndAt);
  if (plannedEndAtMs === null) return null;
  if (plannedEndAtMs === undefined) return false;
  return plannedEndAtMs <= Date.now();
}

function parseStoredResults(raw: string | undefined): Record<string, ConnectorResult> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, ConnectorResult>;
    }
  } catch {
  }
  return {};
}

async function listSessionsByStatus(
  tableName: string,
  status: "pending" | "starting" | "live" | "ending"
): Promise<StreamSessionRecord[]> {
  const items: StreamSessionRecord[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await dynamo.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: STATUS_INDEX_NAME,
        KeyConditionExpression: "#status = :status",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":status": status,
        },
        ExclusiveStartKey: exclusiveStartKey,
      })
    );

    items.push(...((result.Items as StreamSessionRecord[] | undefined) ?? []));
    exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return items;
}

async function listSessions(tableName: string): Promise<StreamSessionRecord[]> {
  const statuses: Array<"pending" | "starting" | "live" | "ending"> = [
    "pending",
    "starting",
    "live",
    "ending",
  ];
  const sessions = await Promise.all(statuses.map((status) => listSessionsByStatus(tableName, status)));
  return sessions.flat();
}

async function listDestinationsByStatus(
  tableName: string,
  status: "active" | "error"
): Promise<StreamDestinationRecord[]> {
  const items: StreamDestinationRecord[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await dynamo.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: STATUS_INDEX_NAME,
        KeyConditionExpression: "#status = :status",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":status": status,
        },
        ExclusiveStartKey: exclusiveStartKey,
      })
    );

    items.push(...((result.Items as StreamDestinationRecord[] | undefined) ?? []));
    exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return items;
}

async function listDestinations(tableName: string): Promise<StreamDestinationRecord[]> {
  const destinations = await Promise.all([
    listDestinationsByStatus(tableName, "active"),
    listDestinationsByStatus(tableName, "error"),
  ]);
  return destinations.flat().filter((destination) => destination.enabled);
}

async function updateSession(
  tableName: string,
  sessionId: string,
  status: string,
  results: Record<string, ConnectorResult>,
  expectedStatus: string,
  lastError?: string,
  markStarted = false,
  markEnded = false
): Promise<boolean> {
  const now = new Date().toISOString();

  try {
    await dynamo.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id: sessionId },
        UpdateExpression:
          "SET #status = :status, resultsJson = :results, lastError = :lastError, updatedAt = :now"
          + (markStarted ? ", startedAt = :now" : "")
          + (markEnded ? ", endedAt = :now" : ""),
        ConditionExpression: "#status = :expectedStatus",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":status": status,
          ":results": JSON.stringify(results),
          ":lastError": lastError ?? null,
          ":now": now,
          ":expectedStatus": expectedStatus,
        },
      })
    );
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name: string }).name === "ConditionalCheckFailedException"
    ) {
      // Another concurrent invocation already transitioned this session; skip it.
      return false;
    }
    throw error;
  }
}

async function runPhase(
  phase: "prepareLive" | "startLive" | "stopLive",
  session: StreamSessionRecord,
  destinations: StreamDestinationRecord[]
): Promise<{ results: Record<string, ConnectorResult>; failures: string[] }> {
  const results: Record<string, ConnectorResult> = {};
  const failures: string[] = [];

  for (const destination of destinations) {
    const connector = getConnector(destination.platform);

    if (!connector) {
      const message = `Unsupported platform: ${destination.platform}`;
      results[destination.id] = { success: false, message };
      failures.push(`${destination.platform}: ${message}`);
      continue;
    }

    const result = await connector[phase](session, destination);
    results[destination.id] = result;

    if (!result.success) {
      failures.push(`${destination.platform}: ${result.message}`);
    }
  }

  return { results, failures };
}

export const handler: Handler = async () => {
  const sessionTableName = getRequiredEnv("STREAM_SESSION_TABLE_NAME");
  const destinationTableName = getRequiredEnv("STREAM_DESTINATION_TABLE_NAME");

  const sessions = await listSessions(sessionTableName);
  const destinations = await listDestinations(destinationTableName);
  const destinationsById = new Map(destinations.map((destination) => [destination.id, destination]));

  for (const session of sessions) {
    const existingResults = parseStoredResults(session.resultsJson);
    const destinationIds = parseDestinationIds(session.destinationsJson);
    if (destinationIds === null) {
      await updateSession(
        sessionTableName,
        session.id,
        "failed",
        existingResults,
        session.status,
        "Invalid destinationsJson: expected a JSON array of destination IDs"
      );
      continue;
    }

    const shouldStart = shouldStartSession(session);
    if (shouldStart === null) {
      await updateSession(
        sessionTableName,
        session.id,
        "failed",
        existingResults,
        session.status,
        "Invalid plannedStartAt timestamp"
      );
      continue;
    }

    const shouldStop = shouldStopSession(session);
    if (shouldStop === null) {
      await updateSession(
        sessionTableName,
        session.id,
        "failed",
        existingResults,
        session.status,
        "Invalid plannedEndAt timestamp"
      );
      continue;
    }

    const selectedDestinations = (destinationIds === undefined
      ? destinations
      : destinationIds
          .map((destinationId) => destinationsById.get(destinationId))
          .filter((destination): destination is StreamDestinationRecord => Boolean(destination))
    );

    if (selectedDestinations.length === 0) {
      await updateSession(
        sessionTableName,
        session.id,
        "failed",
        existingResults,
        session.status,
        "No enabled stream destinations available"
      );
      continue;
    }

    if (session.status === "pending") {
      if (!shouldStart) {
        continue;
      }

      const { results: phaseResults, failures } = await runPhase("prepareLive", session, selectedDestinations);
      const mergedResults = { ...existingResults, ...phaseResults };
      const updated = await updateSession(
        sessionTableName,
        session.id,
        failures.length > 0 ? "failed" : "starting",
        mergedResults,
        session.status,
        failures[0]
      );
      if (!updated) continue;
    }

    if (session.status === "starting") {
      const { results: phaseResults, failures } = await runPhase("startLive", session, selectedDestinations);
      const mergedResults = { ...existingResults, ...phaseResults };
      const updated = await updateSession(
        sessionTableName,
        session.id,
        failures.length > 0 ? "failed" : "live",
        mergedResults,
        session.status,
        failures[0],
        failures.length === 0,
        false
      );
      if (!updated) continue;
    }

    if (session.status === "live" && shouldStop) {
      const updated = await updateSession(sessionTableName, session.id, "ending", existingResults, session.status, undefined, false, false);
      if (!updated) continue;
    }

    if (session.status === "ending") {
      const { results: phaseResults, failures } = await runPhase("stopLive", session, selectedDestinations);
      const mergedResults = { ...existingResults, ...phaseResults };
      await updateSession(
        sessionTableName,
        session.id,
        failures.length > 0 ? "failed" : "ended",
        mergedResults,
        session.status,
        failures[0],
        false,
        failures.length === 0
      );
    }
  }

  return {
    statusCode: 200,
    body: `Processed ${sessions.length} session(s).`,
  };
};
