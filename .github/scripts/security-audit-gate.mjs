import fs from "node:fs";

const auditPath = process.argv[2] ?? "audit.json";
const exceptionsPath = process.argv[3] ?? ".github/security/audit-exceptions.json";

const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const exceptionConfig = JSON.parse(fs.readFileSync(exceptionsPath, "utf8"));
const exceptions = exceptionConfig.exceptions ?? [];
const vulnerabilities = Object.entries(audit.vulnerabilities ?? {});

const blockers = [];
const allowedExceptions = [];
const transitiveWarnings = [];

const today = new Date().toISOString().slice(0, 10);

for (const [name, vuln] of vulnerabilities) {
  if (!["high", "critical"].includes(vuln.severity)) {
    continue;
  }

  if (vuln.isDirect) {
    blockers.push(`${name}: vulnérabilité ${vuln.severity} directe`);
    continue;
  }

  const match = exceptions.find((exception) => {
    if (exception.package !== name) {
      return false;
    }

    const nodes = vuln.nodes ?? [];
    return nodes.some((node) => node.includes(exception.nodePathContains));
  });

  if (!match) {
    transitiveWarnings.push(`${name}: vulnérabilité ${vuln.severity} transitive (non bloquante)`);
    continue;
  }

  if (today > match.expiresOn) {
    blockers.push(
      `${name}: exception expirée le ${match.expiresOn} (${match.id})`
    );
    continue;
  }

  allowedExceptions.push(`${name}: exception ${match.id} valide jusqu'au ${match.expiresOn}`);
}

console.log("Résumé audit sécurité:");
console.log(`- Exceptions actives: ${allowedExceptions.length}`);
console.log(`- Vulnérabilités transitives non bloquantes: ${transitiveWarnings.length}`);
console.log(`- Bloquantes: ${blockers.length}`);

if (allowedExceptions.length > 0) {
  console.log("Exceptions appliquées:");
  for (const line of allowedExceptions) {
    console.log(`  - ${line}`);
  }
}

if (transitiveWarnings.length > 0) {
  console.log("Transitifs à surveiller:");
  for (const line of transitiveWarnings) {
    console.log(`  - ${line}`);
  }
}

if (blockers.length > 0) {
  console.error("Échec policy sécurité CI:");
  for (const line of blockers) {
    console.error(`  - ${line}`);
  }
  process.exit(1);
}

console.log("Policy sécurité CI: OK");
