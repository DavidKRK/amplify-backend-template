import fs from "node:fs";
import { execSync } from "node:child_process";

const auditPath = process.argv[2] ?? "audit.json";
const exceptionsPath = process.argv[3] ?? ".github/security/audit-exceptions.json";

const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const exceptionConfig = JSON.parse(fs.readFileSync(exceptionsPath, "utf8"));
const exception = (exceptionConfig.exceptions ?? []).find(
  (item) => item.id === "brace-expansion-aws-cdk-lib-transitive"
);

if (!exception) {
  console.log(
    "Aucune exception 'brace-expansion-aws-cdk-lib-transitive' active : la vulnérabilité ciblée est résolue. Rien à surveiller."
  );
  process.exit(0);
}

const requiredFields = ["id", "package", "nodePathContains", "advisory", "severity", "owner", "expiresOn"];
const missingFields = requiredFields.filter((f) => !exception[f]);
if (missingFields.length > 0) {
  console.error(`Champs obligatoires manquants dans l'exception: ${missingFields.join(", ")}`);
  process.exit(1);
}

const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const installed = lock.packages?.["node_modules/aws-cdk-lib"]?.version;
if (!installed) {
  console.error("Version aws-cdk-lib installée introuvable dans package-lock.json.");
  process.exit(1);
}

let latest;
try {
  latest = execSync("npm view aws-cdk-lib version", { encoding: "utf8" }).trim();
} catch (err) {
  console.error(`Impossible de récupérer la version npm de aws-cdk-lib: ${err.message}`);
  process.exit(1);
}

const brace = audit.vulnerabilities?.["brace-expansion"];
const stillPresent =
  Boolean(brace) &&
  (brace.nodes ?? []).some((node) =>
    node.includes(exception.nodePathContains)
  );

const today = new Date().toISOString().slice(0, 10);

console.log("Suivi hebdomadaire amont:");
console.log(`- aws-cdk-lib installé: ${installed}`);
console.log(`- aws-cdk-lib latest npm: ${latest}`);
console.log(`- Vulnérabilité ciblée encore présente: ${stillPresent ? "oui" : "non"}`);
console.log(`- Exception expire le: ${exception.expiresOn}`);

if (!stillPresent) {
  console.error(
    "La vulnérabilité ciblée n'apparaît plus: supprimez l'exception temporaire et clôturez la dérogation."
  );
  process.exit(1);
}

if (latest !== installed) {
  console.error(
    "Une nouvelle version de aws-cdk-lib est disponible: mettez à jour et revalidez pour retirer l'exception."
  );
  process.exit(1);
}

if (today > exception.expiresOn) {
  console.error("Dérogation expirée: retirez l'exception ou prolongez-la avec justification.");
  process.exit(1);
}

console.log("Aucune action immédiate requise cette semaine.");
