import { callConnectorWebhook } from "./http";
import type { PlatformConnector } from "./types";

const endpoint = process.env.FACEBOOK_LIVE_WEBHOOK_URL;

export const facebookConnector: PlatformConnector = {
  platform: "facebook",
  prepareLive: async (session, destination) =>
    callConnectorWebhook(
      endpoint,
      {
        action: "prepare",
        session,
        destination,
      },
      "Facebook prepare simulated (no webhook configured)"
    ),
  startLive: async (session, destination) =>
    callConnectorWebhook(
      endpoint,
      {
        action: "start",
        session,
        destination,
      },
      "Facebook start simulated (no webhook configured)"
    ),
  stopLive: async (session, destination) =>
    callConnectorWebhook(
      endpoint,
      {
        action: "stop",
        session,
        destination,
      },
      "Facebook stop simulated (no webhook configured)"
    ),
};
