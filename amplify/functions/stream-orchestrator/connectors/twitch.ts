import { callConnectorWebhook } from "./http";
import type { PlatformConnector } from "./types";

const endpoint = process.env.TWITCH_LIVE_WEBHOOK_URL;

export const twitchConnector: PlatformConnector = {
  platform: "twitch",
  prepareLive: async (session, destination) =>
    callConnectorWebhook(
      endpoint,
      {
        action: "prepare",
        session,
        destination,
      },
      "Twitch prepare simulated (no webhook configured)"
    ),
  startLive: async (session, destination) =>
    callConnectorWebhook(
      endpoint,
      {
        action: "start",
        session,
        destination,
      },
      "Twitch start simulated (no webhook configured)"
    ),
  stopLive: async (session, destination) =>
    callConnectorWebhook(
      endpoint,
      {
        action: "stop",
        session,
        destination,
      },
      "Twitch stop simulated (no webhook configured)"
    ),
};
