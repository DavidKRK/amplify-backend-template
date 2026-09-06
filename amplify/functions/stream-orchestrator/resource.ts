import { defineFunction } from "@aws-amplify/backend";

export const streamOrchestrator = defineFunction({
  name: "stream-orchestrator",
  entry: "./handler.ts",
  schedule: "every 5m",
  timeoutSeconds: 60,
});
