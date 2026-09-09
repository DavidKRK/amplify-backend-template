import fs from "node:fs";
import { execFileSync } from "node:child_process";

const auditPath = process.argv[2] ?? "audit.json";
const exceptionsPath = process.argv[3] ?? ".github/security/audit-exceptions.json";

const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const exceptionConfig = JSON.parse(fs.readFileSync(exceptionsPath, "utf8"));
const exceptions = (exceptionConfig.exceptions ?? []).filter(
  (item) => item.upstreamPackage
);

if (exceptions.length === 0) {
  console.log(
    "Aucune exception transitive temporaire active : rien à surveiller."
  );
  process.exit(0);
}

const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const today = new Date().toISOString().slice(0, 10);
const requiredFields = [
  "id",
  "package",
  "nodePathContains",
  "advisory",
  "severity",
  "owner",
  "issue",
  "upstreamPackage",
  "expiresOn",
];

let hasFailure = false;

console.log("Suivi hebdomadaire amont:");

for (const exception of exceptions) {
  const missingFields = requiredFields.filter((field) => !exception[field]);
  if (missingFields.length > 0) {
    console.error(
      `[${exception.id ?? "unknown"}] Champs obligatoires manquants dans l'exception: ${missingFields.join(", ")}`
    );
    hasFailure = true;
    continue;
  }

  const installed = lock.packages?.[`node_modules/${exception.upstreamPackage}`]?.version;
  if (!installed) {
    console.error(
      `[${exception.id}] Version installée introuvable dans package-lock.json pour ${exception.upstreamPackage}.`
    );
    hasFailure = true;
    continue;
  }

  let latest;
  try {
    latest = execFileSync("npm", ["view", exception.upstreamPackage, "version"], {
      encoding: "utf8",
    }).trim();
  } catch (err) {
    console.error(
      `[${exception.id}] Impossible de récupérer la version npm de ${exception.upstreamPackage}: ${err.message}`
    );
    hasFailure = true;
    continue;
  }

  const vuln = audit.vulnerabilities?.[exception.package];
  const stillPresent =
    Boolean(vuln) &&
    (vuln.nodes ?? []).some((node) => node.includes(exception.nodePathContains)) &&
    (!exception.effectContains ||
      (vuln.effects ?? []).some((effect) => effect.includes(exception.effectContains)));

  console.log(`- [${exception.id}] ${exception.package}`);
  console.log(`  - ${exception.upstreamPackage} installé: ${installed}`);
  console.log(`  - ${exception.upstreamPackage} latest npm: ${latest}`);
  console.log(`  - Vulnérabilité ciblée encore présente: ${stillPresent ? "oui" : "non"}`);
  console.log(`  - Exception expire le: ${exception.expiresOn}`);
  console.log(`  - Suivi: ${exception.issue}`);

  if (!stillPresent) {
    console.error(
      `[${exception.id}] La vulnérabilité ciblée n'apparaît plus: supprimez l'exception temporaire, retirez l'ignore Dependabot et clôturez ${exception.issue}.`
    );
    hasFailure = true;
    continue;
  }

  if (latest !== installed) {
    console.warn(
      `[${exception.id}] Une nouvelle version de ${exception.upstreamPackage} est disponible (${latest}): évaluez l'upgrade dans ${exception.issue} pour retirer l'exception si elle corrige la chaîne transitive.`
    );
    continue;
  }

  if (today > exception.expiresOn) {
    console.error(
      `[${exception.id}] Dérogation expirée: retirez l'exception ou prolongez-la avec justification.`
    );
    hasFailure = true;
  }
}

if (hasFailure) {
  process.exit(1);
}

console.log("Aucune action immédiate requise cette semaine.");
