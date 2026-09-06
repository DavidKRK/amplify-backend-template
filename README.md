# davidkrk-automation-backend

Backend AWS Amplify Gen 2 pour l'automatisation de la chaîne **DavidKRK** — synchronisation YouTube, gestion des uploads utilisateurs et API publique.

## Architecture

| Ressource | Service AWS | Rôle |
|-----------|-------------|------|
| `auth` | Amazon Cognito | Authentification des utilisateurs |
| `data` | AWS AppSync + DynamoDB | API GraphQL + modèles `ContentPost` et `UserUpload` |
| `storage` | Amazon S3 | Stockage des fichiers uploadés |
| `sync-youtube` | Lambda (planifiée) | Synchronisation YouTube toutes les heures |
| `stream-orchestrator` | Lambda (planifiée) | Orchestration multi-plateformes (pré-live/live/post-live) toutes les 5 min |
| `post-live-maintenance` | Lambda (planifiée) | Archivage post-live, enrichissement et republication toutes les 1 h |

## Modèles de données

### ContentPost
Vidéos YouTube synchronisées automatiquement depuis la chaîne DavidKRK.
- Lecture/liste publique via API Key
- Écriture via la Lambda `sync-youtube` (IAM)

### StreamDestination
Configuration des destinations de diffusion (YouTube, Twitch, Facebook, etc.).
- Gestion des URLs/keys/tokens via références de secrets
- Activation/désactivation par destination

### StreamSession
Session de livestream pilotée par orchestrateur backend.
- Cycle de vie: `pending` → `starting` → `live` → `ending` → `ended`/`failed`
- Suivi centralisé des résultats et erreurs par destination

### UserUpload
Fichiers uploadés par les utilisateurs authentifiés (audio, images, etc.).
- CRUD propriétaire via User Pool (Cognito)
- Lecture publique via API Key

## Prise en main

1. Cloner le dépôt :

```bash
git clone https://github.com/DavidKRK/davidkrk-automation-backend.git
cd davidkrk-automation-backend
```

2. Installer les dépendances :

```bash
npm install
```

3. Vérifier les types TypeScript :

```bash
npm run typecheck
```

4. Déployer via Amplify CLI :

```bash
npx ampx pipeline-deploy --branch <branche> --app-id <app-id>
```

## Variables d'environnement requises

À définir dans **Amplify Console → App settings → Environment variables** :

| Variable | Description |
|----------|-------------|
| `YOUTUBE_API_KEY` | Clé API Google Cloud (YouTube Data API v3) |
| `YOUTUBE_CHANNEL_ID` | ID de la chaîne YouTube (commence par `UC`) |
| `YOUTUBE_LIVE_WEBHOOK_URL` | Endpoint d'intégration live YouTube (optionnel) |
| `TWITCH_LIVE_WEBHOOK_URL` | Endpoint d'intégration live Twitch (optionnel) |
| `FACEBOOK_LIVE_WEBHOOK_URL` | Endpoint d'intégration live Facebook Page (optionnel) |
| `ALLOW_SIMULATED_CONNECTORS` | `true` pour autoriser un mode simulation sans webhook (sinon échec explicite) |

## Lancement d'un livestream (V1)

1. Créer/activer les `StreamDestination` (YouTube/Twitch/Facebook).
2. Créer une `StreamSession` avec `status = pending` et les destinations ciblées (`destinationsJson`).
3. Démarrer le stream dans OBS (profil/scène).
4. `stream-orchestrator` exécute automatiquement:
   - Pré-live (préparation plateformes)
   - Live (démarrage)
   - Post-live (arrêt selon `plannedEndAt`)
5. `post-live-maintenance` archive la session terminée dans `ContentPost`.

## Incidents fréquents

- **Aucune destination active**: la session passe en `failed` avec `lastError`.
- **Plateforme non supportée**: la destination est rejetée au niveau orchestrateur.
- **Webhook indisponible**: la phase concernée échoue, la session passe en `failed`.
- **Archive déjà créée**: ignorée automatiquement (idempotence DynamoDB).

> ⚠️ Ne jamais committer ces valeurs dans le code source.

Voir [`amplify/functions/sync-youtube/README.md`](amplify/functions/sync-youtube/README.md) pour le détail de la Lambda.

## Sécurité

Voir [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) pour plus d'informations.

## Licence

Ce projet est sous licence MIT-0. Voir le fichier LICENSE.