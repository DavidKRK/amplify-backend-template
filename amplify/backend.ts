import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { syncYoutube } from './functions/sync-youtube/resource';
import { streamOrchestrator } from './functions/stream-orchestrator/resource';
import { postLiveMaintenance } from './functions/post-live-maintenance/resource';

/**
 * Backend V1.1 — DavidKRK Automation
 *
 * Ressources actives :
 *  - auth        : Cognito User Pool (généré par le template)
 *  - data        : AppSync + DynamoDB (modèles ContentPost et UserUpload)
 *  - storage     : S3 bucket pour les uploads utilisateur
 *  - syncYoutube : Lambda planifiée toutes les 1h (YouTube Data API v3)
 *  - streamOrchestrator : Lambda planifiée toutes les 5 min (pré-live/live/post-live)
 *  - postLiveMaintenance: Lambda planifiée toutes les 1h (archivage post-live)
 */
const backend = defineBackend({
  auth,
  data,
  storage,
  syncYoutube,
  streamOrchestrator,
  postLiveMaintenance,
});

// Récupère la table DynamoDB ContentPost et la fonction Lambda
const contentPostTable = backend.data.resources.tables["ContentPost"];
const streamDestinationTable = backend.data.resources.tables["StreamDestination"];
const streamSessionTable = backend.data.resources.tables["StreamSession"];
const lambdaFunction = backend.syncYoutube.resources.lambda;
const streamOrchestratorFunction = backend.streamOrchestrator.resources.lambda;
const postLiveMaintenanceFunction = backend.postLiveMaintenance.resources.lambda;

if (!contentPostTable) {
  throw new Error(
    'Missing DynamoDB table "ContentPost" in backend.data.resources.tables. Verify that the model/table name still matches "ContentPost" and that the data resources were generated successfully.'
  );
}

if (!lambdaFunction) {
  throw new Error(
    'Missing Lambda resource for "syncYoutube" at backend.syncYoutube.resources.lambda. Verify that the function resource is defined and generated as expected.'
  );
}

if (!streamDestinationTable) {
  throw new Error(
    'Missing DynamoDB table "StreamDestination" in backend.data.resources.tables. Verify that the model/table name still matches "StreamDestination" and that the data resources were generated successfully.'
  );
}

if (!streamSessionTable) {
  throw new Error(
    'Missing DynamoDB table "StreamSession" in backend.data.resources.tables. Verify that the model/table name still matches "StreamSession" and that the data resources were generated successfully.'
  );
}

if (!streamOrchestratorFunction) {
  throw new Error(
    'Missing Lambda resource for "streamOrchestrator" at backend.streamOrchestrator.resources.lambda. Verify that the function resource is defined and generated as expected.'
  );
}

if (!postLiveMaintenanceFunction) {
  throw new Error(
    'Missing Lambda resource for "postLiveMaintenance" at backend.postLiveMaintenance.resources.lambda. Verify that the function resource is defined and generated as expected.'
  );
}

// Accorde à la Lambda les droits de lecture/écriture sur la table DynamoDB
contentPostTable.grantReadWriteData(lambdaFunction);
streamDestinationTable.grantReadData(streamOrchestratorFunction);
streamSessionTable.grantReadWriteData(streamOrchestratorFunction);
contentPostTable.grantReadWriteData(postLiveMaintenanceFunction);
streamSessionTable.grantReadWriteData(postLiveMaintenanceFunction);

// Injecte le nom de la table dans les variables d'environnement de la Lambda
backend.syncYoutube.addEnvironment(
  "CONTENT_POST_TABLE_NAME",
  contentPostTable.tableName
);

backend.streamOrchestrator.addEnvironment(
  "STREAM_DESTINATION_TABLE_NAME",
  streamDestinationTable.tableName
);
backend.streamOrchestrator.addEnvironment(
  "STREAM_SESSION_TABLE_NAME",
  streamSessionTable.tableName
);

backend.postLiveMaintenance.addEnvironment(
  "STREAM_SESSION_TABLE_NAME",
  streamSessionTable.tableName
);
backend.postLiveMaintenance.addEnvironment(
  "CONTENT_POST_TABLE_NAME",
  contentPostTable.tableName
);
