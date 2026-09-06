import { defineFunction } from "@aws-amplify/backend";

export const postLiveMaintenance = defineFunction({
  name: "post-live-maintenance",
  entry: "./handler.ts",
  schedule: "every 1h",
  timeoutSeconds: 60,
});
