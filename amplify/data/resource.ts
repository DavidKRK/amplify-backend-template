import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

/**
 * Schéma V1.1 — ContentPost + UserUpload
 * ContentPost  : vidéos YouTube synchronisées depuis la chaîne DavidKRK.
 * UserUpload   : fichiers uploadés par les utilisateurs authentifiés (S3).
 * Authorization : ContentPost en lecture publique via API Key ; UserUpload en écriture propriétaire via User Pool, avec lecture publique via API Key.
 */
const schema = a.schema({
  /**
   * StreamDestination — Configuration des destinations de livestreaming
   * (YouTube, Twitch, Facebook, Instagram, etc.).
   */
  StreamDestination: a
    .model({
      /** Plateforme cible (youtube, twitch, facebook, instagram, ...) */
      platform: a.string().required(),
      /** Nom métier de la destination (ex: YouTube Principal) */
      name: a.string().required(),
      /** Destination activée/désactivée */
      enabled: a.boolean().required(),
      /** Statut opérationnel : active | disabled | error */
      status: a.string().required(),
      /** Référence du secret (nom/clé) pour la stream key/token */
      streamKeySecretName: a.string(),
      /** URL RTMP cible (ou URL restream) */
      rtmpUrl: a.string(),
      /** ID chaîne/compte (optionnel selon plateforme) */
      channelId: a.string(),
      /** ID page Facebook (optionnel) */
      pageId: a.string(),
      /** Paramètres par défaut du live */
      defaultTitle: a.string(),
      defaultDescription: a.string(),
      /** Paramètres additionnels JSON (tags, catégorie, etc.) */
      settingsJson: a.string(),
      /** Dernière erreur connue */
      lastError: a.string(),
      /** Dernière synchronisation des métadonnées */
      lastSyncedAt: a.string(),
    })
    .secondaryIndexes((index) => [
      index("status").name("byStatus").projection("ALL"),
    ])
    .authorization((allow) => [
      allow.groups(["admin"]),
    ]),

  /**
   * StreamSession — Session de diffusion centralisée pilotée par l'orchestrateur.
   * Le cycle de vie est géré en phases : pending -> starting -> live -> ending -> ended.
   */
  StreamSession: a
    .model({
      /** Titre du livestream */
      title: a.string().required(),
      /** Description du livestream */
      description: a.string(),
      /** Date/heure prévue de démarrage */
      plannedStartAt: a.string(),
      /** Date/heure prévue de fin */
      plannedEndAt: a.string(),
      /** Statut global : pending | starting | live | ending | ended | failed */
      status: a.string().required(),
      /** Profil/scene OBS utilisés */
      obsProfile: a.string(),
      obsScene: a.string(),
      /** IDs de destinations ciblées (JSON string[]) */
      destinationsJson: a.string(),
      /** Résultats par plateforme (JSON) */
      resultsJson: a.string(),
      /** Horodatages de vie */
      startedAt: a.string(),
      endedAt: a.string(),
      postLiveProcessedAt: a.string(),
      /** Dernière erreur globale */
      lastError: a.string(),
    })
    .secondaryIndexes((index) => [
      index("status").name("byStatus").projection("ALL"),
    ])
    .authorization((allow) => [
      allow.groups(["admin"]),
    ]),

  /**
   * UserUpload — Fichier uploadé par un utilisateur authentifié
   * Autorisations : propriétaire (CRUD), lecture publique via API Key.
   */
  UserUpload: a
    .model({
      /** Clé S3 de l'objet (ex: uploads/{entity_id}/mon-fichier.mp3) */
      key: a.string().required(),
      /** Nom de fichier d'origine */
      filename: a.string().required(),
      /** Type MIME (ex: audio/mpeg, image/jpeg) */
      fileType: a.string().required(),
      /** Taille en octets */
      fileSize: a.integer(),
      /** Titre affiché */
      title: a.string().required(),
      /** Description optionnelle */
      description: a.string(),
      /** Statut : 'pending' | 'processing' | 'published' | 'rejected' */
      status: a.string().required(),
      /** URL publique du fichier (renseignée après traitement) */
      publicUrl: a.string(),
    })
    .authorization((allow) => [
      // Le propriétaire peut créer, lire, modifier et supprimer ses uploads (nécessite User Pool)
      allow.owner(),
      // Lecture publique ponctuelle via API Key (sans list) ; cette règle ne filtre pas automatiquement sur status
      allow.publicApiKey().to(["read"]),
    ]),

  ContentPost: a
    .model({
      /** Source du contenu : 'youtube' | 'soundcloud' | 'mixcloud' | ... */
      source: a.string().required(),
      /** ID externe de la vidéo/track (ex: YouTube videoId) — forme la clé composite avec source */
      externalId: a.string().required(),
      /** Titre de la vidéo */
      title: a.string().required(),
      /** URL publique de la vidéo (ex: https://www.youtube.com/watch?v=...) */
      url: a.string().required(),
      /** Date de publication ISO 8601 */
      publishedAt: a.string().required(),
      /** URL de la miniature (thumbnail) */
      thumbnailUrl: a.string(),
      /** Description courte / extrait */
      description: a.string(),
      /** Statut : 'published' | 'draft' | 'archived' */
      status: a.string().required(),
      /** JSON brut de la réponse API (pour debug / enrichissement futur) */
      rawJson: a.string(),
    })
    // Clé composite (source, externalId) — garantit l'unicité au niveau DynamoDB
    // et permet à la Lambda de faire une insertion idempotente (create-if-not-exists) sans index secondaire.
    .identifier(["source", "externalId"])
    .authorization((allow) => [
      // Lecture publique via API Key (ton site front)
      allow.publicApiKey().to(["read"]),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    // Mode par défaut : API Key (lecture publique ContentPost / UserUpload)
    defaultAuthorizationMode: "apiKey",
    apiKeyAuthorizationMode: {
      expiresInDays: 365,
    },
    // Le mode User Pool (requis pour allow.owner()) est automatiquement activé
    // par Amplify Gen 2 lorsque la ressource auth est déclarée dans defineBackend.
  },
});
