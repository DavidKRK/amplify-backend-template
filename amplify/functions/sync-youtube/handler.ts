import type { Handler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

/**
 * Handler de la fonction sync-youtube
 *
 * Flux :
 * 1. Récupère l'ID de la playlist 'uploads' de la chaîne via channels.list
 * 2. Lit les 50 dernières vidéos via playlistItems.list (coût quota : 1 unité/appel)
 * 3. Détecte les YouTube Shorts via videos.list?part=contentDetails (coût quota : 1 unité)
 *    — un Short est une vidéo de durée ≤ 3 minutes (180 secondes)
 *    — URL stockée : youtube.com/shorts/{id} pour les Shorts,
 *                    youtube.com/watch?v={id} pour les vidéos classiques
 * 4. Pour chaque vidéo, insertion idempotente (create-if-not-exists) dans la table ContentPost DynamoDB
 *    (clé composite source+externalId — ConditionExpression empêche les doublons, sans mettre à jour les éléments existants)
 *
 * Quota YouTube Data API v3 :
 *   - channels.list     : 1 unité
 *   - playlistItems.list: 1 unité
 *   - videos.list       : 1 unité (jusqu'à 50 IDs par appel)
 *   Total par exécution : ~3 unités (très économique, max 10 000 unités/jour)
 */

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const MAX_DESCRIPTION_LENGTH = 500;
/** Durée maximale en secondes pour qu'une vidéo soit considérée comme un Short */
const SHORT_MAX_SECONDS = 180;

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    console.error(`[sync-youtube] Variable d'environnement requise manquante : ${name}.`);
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

/**
 * Retourne la durée totale en secondes à partir d'une durée ISO 8601 (ex: "PT1M30S" → 90).
 * Retourne Infinity pour les durées invalides, vides, ou comportant des jours
 * (ces vidéos ne peuvent pas être des Shorts).
 *
 * Note : YouTube a étendu la durée maximale des Shorts à 3 minutes (180 s) en octobre 2024.
 */
function isoToSeconds(isoDuration: string): number {
  if (!isoDuration) return Infinity;
  // Accepte uniquement PT[H]M?S? — les durées P1DT... sont exclues (jamais des Shorts)
  const match = isoDuration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return Infinity;
  const hours = parseInt(match[1] ?? "0", 10);
  const minutes = parseInt(match[2] ?? "0", 10);
  const seconds = parseInt(match[3] ?? "0", 10);
  const total = hours * 3600 + minutes * 60 + seconds;
  // Durée de 0 seconde = métadonnée absente ou vidéo en cours de traitement → ne pas traiter comme Short
  return total > 0 ? total : Infinity;
}

export const handler: Handler = async () => {
  const TABLE_NAME = getRequiredEnv("CONTENT_POST_TABLE_NAME");
  const youtubeCredential = getRequiredEnv("YOUTUBE_API_KEY");
  const CHANNEL_ID = getRequiredEnv("YOUTUBE_CHANNEL_ID");

  try {
    // ── ÉTAPE 1 : récupérer l'ID de la playlist 'uploads' ────────────────────
    const channelRes = await fetch(
      `${YOUTUBE_API_BASE}/channels?part=contentDetails&id=${CHANNEL_ID}&key=${youtubeCredential}`
    );
    if (!channelRes.ok) throw new Error(`channels.list HTTP ${channelRes.status}`);
    const channelData = await channelRes.json() as YouTubeChannelResponse;

    const uploadsPlaylistId =
      channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

    if (!uploadsPlaylistId) {
      throw new Error(`Playlist 'uploads' introuvable pour la chaîne ${CHANNEL_ID}`);
    }
    console.info(`[sync-youtube] Playlist uploads : ${uploadsPlaylistId}`);

    // ── ÉTAPE 2 : récupérer les 50 dernières vidéos ──────────────────────────
    const playlistRes = await fetch(
      `${YOUTUBE_API_BASE}/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=50&key=${youtubeCredential}`
    );
    if (!playlistRes.ok) throw new Error(`playlistItems.list HTTP ${playlistRes.status}`);
    const playlistData = await playlistRes.json() as YouTubePlaylistResponse;

    const items = playlistData.items ?? [];
    console.info(`[sync-youtube] ${items.length} vidéo(s) récupérée(s).`);

    // ── ÉTAPE 3 : détecter les YouTube Shorts via videos.list ─────────────────
    const videoIds = items
      .map((item) => item.snippet?.resourceId?.videoId)
      .filter((id): id is string => Boolean(id));

    const shortVideoIds = new Set<string>();

    if (videoIds.length > 0) {
      try {
        const videosRes = await fetch(
          `${YOUTUBE_API_BASE}/videos?part=contentDetails&id=${videoIds.join(",")}&key=${youtubeCredential}`
        );
        if (!videosRes.ok) {
          // Non bloquant : on continue sans détection Short et on utilise watch?v= par défaut
          console.warn(
            `[sync-youtube] videos.list HTTP ${videosRes.status} — détection Shorts ignorée, URLs watch?v= utilisées.`
          );
        } else {
          const videosData = await videosRes.json() as YouTubeVideosResponse;
          for (const video of (videosData.items ?? [])) {
            const duration = video.contentDetails?.duration ?? "";
            if (!duration) {
              console.warn(
                `[sync-youtube] Durée manquante pour la vidéo ${video.id ?? "?"} — traitée comme vidéo classique.`
              );
            }
            if (video.id && isoToSeconds(duration) <= SHORT_MAX_SECONDS) {
              shortVideoIds.add(video.id);
            }
          }
          console.info(
            `[sync-youtube] ${shortVideoIds.size} Short(s) détecté(s) sur ${videoIds.length} vidéo(s).`
          );
        }
      } catch (err) {
        console.warn(
          "[sync-youtube] Échec de la détection des Shorts (erreur réseau ou de parsing) — utilisation des URLs classiques par défaut.",
          err
        );
      }
    }

    let created = 0;
    let skipped = 0;

    // ── ÉTAPE 4 : insertion idempotente dans DynamoDB ────────────────────────
    for (const item of items) {
      const snippet = item.snippet;
      const videoId = snippet?.resourceId?.videoId;
      if (!videoId) continue;

      const isShort = shortVideoIds.has(videoId);
      const videoUrl = isShort
        ? `https://www.youtube.com/shorts/${videoId}`
        : `https://www.youtube.com/watch?v=${videoId}`;

      const post = {
        // Clé primaire composite DynamoDB (générée par .identifier(["source", "externalId"])) :
        //   source     → partition key
        //   externalId → sort key
        source: "youtube",
        externalId: videoId,
        title: snippet?.title ?? "Sans titre",
        url: videoUrl,
        publishedAt: snippet?.publishedAt ?? new Date().toISOString(),
        thumbnailUrl:
          snippet?.thumbnails?.maxres?.url ??
          snippet?.thumbnails?.high?.url ??
          snippet?.thumbnails?.default?.url ??
          "",
        description: (() => {
          const raw = snippet?.description ?? "";
          if (raw.length > MAX_DESCRIPTION_LENGTH) {
            console.warn(
              `[sync-youtube] Description tronquée pour ${videoId} : ${raw.length} → ${MAX_DESCRIPTION_LENGTH} caractères`
            );
          }
          return raw.substring(0, MAX_DESCRIPTION_LENGTH);
        })(),
        status: "published",
        rawJson: JSON.stringify(snippet),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        __typename: "ContentPost",
      };

      try {
        await dynamo.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: post,
            // attribute_not_exists(source) est l'idiome DynamoDB standard pour "créer seulement
            // si l'item n'existe pas encore" : DynamoDB évalue cette condition dans le contexte
            // de l'item identifié par la clé composite exacte (source, externalId), donc un item
            // avec le même externalId mais une source différente n'est pas concerné.
            ConditionExpression: "attribute_not_exists(source)",
          })
        );
        created++;
        console.info(`[sync-youtube] Ajouté (${isShort ? "Short" : "vidéo"}) : ${post.title} (${videoId})`);
      } catch (err) {
        if (
          typeof err === "object" &&
          err !== null &&
          "name" in err &&
          err.name === "ConditionalCheckFailedException"
        ) {
          skipped++;
          console.info(`[sync-youtube] Déjà présente, ignorée : ${post.title} (${videoId})`);
          continue;
        }
        throw err;
      }
    }

    console.info(
      `[sync-youtube] Terminé — ${created} créées, ${skipped} déjà présentes.`
    );
    return { statusCode: 200, body: `${created} vidéos ajoutées.` };
  } catch (err) {
    console.error("[sync-youtube] Erreur :", err);
    throw err;
  }
};

// ── Types YouTube Data API v3 (minimal) ──────────────────────────────────────

interface YouTubeChannelResponse {
  items?: Array<{
    contentDetails?: {
      relatedPlaylists?: {
        uploads?: string;
      };
    };
  }>;
}

interface YouTubePlaylistResponse {
  items?: Array<{
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      resourceId?: { videoId?: string };
      thumbnails?: {
        default?: { url: string };
        high?: { url: string };
        maxres?: { url: string };
      };
    };
  }>;
}

interface YouTubeVideosResponse {
  items?: Array<{
    id?: string;
    contentDetails?: {
      duration?: string;
    };
  }>;
}
