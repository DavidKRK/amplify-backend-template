# stream-orchestrator

Lambda planifiée toutes les 5 minutes pour piloter les sessions de livestream (`StreamSession`) vers les destinations configurées (`StreamDestination`).

## Phases gérées

- `pending` -> `starting` via `prepareLive`
- `starting` -> `live` via `startLive`
- `live` -> `ending` quand `plannedEndAt` est atteint
- `ending` -> `ended` via `stopLive`

## Variables d'environnement

- `STREAM_SESSION_TABLE_NAME`
- `STREAM_DESTINATION_TABLE_NAME`
- `YOUTUBE_LIVE_WEBHOOK_URL` (optionnel)
- `TWITCH_LIVE_WEBHOOK_URL` (optionnel)
- `FACEBOOK_LIVE_WEBHOOK_URL` (optionnel)
- `ALLOW_SIMULATED_CONNECTORS` (optionnel, `true` pour simuler sans webhook)
