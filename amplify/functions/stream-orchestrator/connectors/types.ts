export interface StreamDestinationRecord {
  id: string;
  platform: string;
  name: string;
  enabled: boolean;
  status: string;
  streamKeySecretName?: string;
  rtmpUrl?: string;
  channelId?: string;
  pageId?: string;
  defaultTitle?: string;
  defaultDescription?: string;
}

export interface StreamSessionRecord {
  id: string;
  title: string;
  description?: string;
  plannedStartAt?: string;
  plannedEndAt?: string;
  status: string;
  destinationsJson?: string;
  resultsJson?: string;
  lastError?: string;
}

export interface ConnectorResult {
  success: boolean;
  message: string;
  liveUrl?: string;
}

export interface PlatformConnector {
  platform: string;
  prepareLive: (session: StreamSessionRecord, destination: StreamDestinationRecord) => Promise<ConnectorResult>;
  startLive: (session: StreamSessionRecord, destination: StreamDestinationRecord) => Promise<ConnectorResult>;
  stopLive: (session: StreamSessionRecord, destination: StreamDestinationRecord) => Promise<ConnectorResult>;
}
