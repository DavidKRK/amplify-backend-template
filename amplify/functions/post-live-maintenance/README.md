# post-live-maintenance

Lambda planifiée toutes les heures pour finaliser les sessions terminées et publier un enregistrement d'archive dans `ContentPost`.

## Actions

- Recherche des `StreamSession` avec `status = ended` et sans `postLiveProcessedAt`
- Création idempotente d'un `ContentPost` source `livestream`
- Marquage `postLiveProcessedAt`

## Variables d'environnement

- `STREAM_SESSION_TABLE_NAME`
- `CONTENT_POST_TABLE_NAME`
