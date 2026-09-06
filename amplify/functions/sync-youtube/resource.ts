import { defineFunction } from "@aws-amplify/backend";

/**
 * Fonction planifiée : sync-youtube
 *
 * Déclenchée automatiquement toutes les heures.
 * Elle appelle l'API YouTube Data v3 pour récupérer les dernières vidéos
 * de la chaîne DavidKRK et les insère dans le modèle ContentPost
 * uniquement si elles n'existent pas déjà (insertion idempotente, sans mise à jour).
 * Les YouTube Shorts sont automatiquement détectés et stockés avec l'URL
 * au format `youtube.com/shorts/{id}`.
 *
 * Variables d'environnement requises dans Amplify Console :
 *   YOUTUBE_API_KEY      — clé API Google Cloud (YouTube Data API v3)
 *   YOUTUBE_CHANNEL_ID   — ID de la chaîne YouTube (ex: UCxxxxxxxxxxxxxxx)
 */
export const syncYoutube = defineFunction({
  name: "sync-youtube",
  entry: "./handler.ts",
  schedule: "every 1h",
  timeoutSeconds: 60,
});
