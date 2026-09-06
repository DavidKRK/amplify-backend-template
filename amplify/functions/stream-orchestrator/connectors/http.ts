import type { ConnectorResult } from "./types";

export async function callConnectorWebhook(
  endpoint: string | undefined,
  payload: unknown,
  fallbackMessage: string
): Promise<ConnectorResult> {
  if (!endpoint) {
    if (process.env.ALLOW_SIMULATED_CONNECTORS === "true") {
      return {
        success: true,
        message: fallbackMessage,
      };
    }

    return {
      success: false,
      message:
        "Missing connector webhook URL. Set platform webhook URL or ALLOW_SIMULATED_CONNECTORS=true.",
    };
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown network error";
    return {
      success: false,
      message: `Webhook call failed: ${message}`,
    };
  }

  if (!response.ok) {
    return {
      success: false,
      message: `Webhook call failed: HTTP ${response.status}`,
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  const parsed = body as { liveUrl?: string; message?: string } | undefined;

  return {
    success: true,
    message: parsed?.message ?? "Webhook call succeeded",
    liveUrl: parsed?.liveUrl,
  };
}
