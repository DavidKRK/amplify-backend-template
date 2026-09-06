import { facebookConnector } from "./facebook";
import { twitchConnector } from "./twitch";
import type { PlatformConnector } from "./types";
import { youtubeConnector } from "./youtube";

const connectors: Record<string, PlatformConnector> = {
  youtube: youtubeConnector,
  twitch: twitchConnector,
  facebook: facebookConnector,
};

export function getConnector(platform: string): PlatformConnector | undefined {
  return connectors[platform.toLowerCase()];
}
