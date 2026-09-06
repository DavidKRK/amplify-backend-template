# sync-youtube — Fonction planifiée V1.1

Cette Lambda Amplify Gen 2 synchronise automatiquement les vidéos YouTube
de la chaîne **DavidKRK** vers la table DynamoDB `ContentPost`.
Les **YouTube Shorts** sont automatiquement détectés et stockés avec l'URL
au format `youtube.com/shorts/{id}`.

## Fréquence

Toutes les **heures** (configurable dans `resource.ts` → `schedule`).

## Variables d'environnement

À définir comme secrets Amplify pour l'environnement déployé :

| Variable            | Description                                          | Exemple                  |
|---------------------|------------------------------------------------------|---------------------------|
| `YOUTUBE_API_KEY`   | Clé API Google Cloud (YouTube Data API v3 activée)   | `AIzaSy...`              |
| `YOUTUBE_CHANNEL_ID`| ID de la chaîne YouTube (commence par UC...)         | `UCxxxxxxxxxxxxxxxxxxxxxxx` |

> ⚠️ Ne jamais committer ces valeurs dans le code source.

Après le déploiement de cette modification, définir les deux secrets avec la CLI
Amplify (`npx ampx secret set YOUTUBE_API_KEY` puis
`npx ampx secret set YOUTUBE_CHANNEL_ID`) ou leur équivalent dans la
configuration des secrets du pipeline Amplify. Les variables d'environnement
classiques d'Amplify Console ne sont pas automatiquement transmises à cette
Lambda.

## Comment obtenir les variables

### YOUTUBE_API_KEY
1. Aller sur [Google Cloud Console](https://console.cloud.google.com/)
2. Créer un projet ou utiliser un projet existant
3. Activer l'API **YouTube Data API v3**
4. `APIs & Services → Credentials → Create credentials → API Key`
5. Restreindre la clé à l'API **YouTube Data API v3** au minimum
6. Ne restreindre par IP que si la Lambda dispose d'une IP sortante fixe explicitement configurée (ex. VPC + NAT/EIP)

### YOUTUBE_CHANNEL_ID
1. Aller sur ta chaîne YouTube
2. `Paramètres → Informations sur la chaîne → ID de la chaîne`
3. Ou depuis l'URL : `https://www.youtube.com/channel/UCxxxxxxxx` → prendre `UCxxxxxxxx`

## Quota YouTube Data API v3

| Appel               | Coût quota |
|---------------------|------------|
| `channels.list`     | 1 unité    |
| `playlistItems.list`| 1 unité    |
| `videos.list`       | 1 unité    |
| **Total / exécution**| **~3 unités** |

Avec 10 000 unités/jour gratuites et 24 exécutions/jour (toutes les heures),
la consommation est de **~72 unités/jour** (bien en dessous du quota gratuit).

## Flux d'exécution

```
1. channels.list(channelId)          →  uploadsPlaylistId
2. playlistItems.list(uploadsPlaylistId, maxResults=50)
3. videos.list(videoIds, part=contentDetails)
   → détecte les Shorts (durée ≤ 180 s)
4. Pour chaque vidéo :
   - Construit l'URL : shorts/{id} si Short, watch?v={id} sinon
   - Vérifie si externalId existe déjà dans DynamoDB
   - Si non → PutItem dans ContentPost
   - Si oui → skip (pas de doublon)
```

## Modèle de données ContentPost

```
source        : 'youtube'
externalId    : videoId YouTube
title         : titre de la vidéo
url           : https://www.youtube.com/shorts/{id}  (Short)
              : https://www.youtube.com/watch?v={id} (vidéo classique)
publishedAt   : date ISO 8601
thumbnailUrl  : URL de la miniature (maxres > high > default)
description   : 500 premiers caractères de la description
status        : 'published'
rawJson       : snippet brut (debug)
```
