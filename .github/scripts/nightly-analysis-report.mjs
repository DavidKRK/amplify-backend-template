import fs from "node:fs";

function readText(path) {
  if (!path || !fs.existsSync(path)) {
    return "";
  }
  return fs.readFileSync(path, "utf8");
}

function safeJsonParse(raw, fallback) {
  if (!raw.trim()) {
    return fallback;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function formatDateUtc() {
  const now = new Date();
  const day = String(now.getUTCDate()).padStart(2, "0");
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const year = now.getUTCFullYear();
  const hours = String(now.getUTCHours()).padStart(2, "0");
  const minutes = String(now.getUTCMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} à ${hours}h${minutes}`;
}

function countMatches(content, regex) {
  if (!content) {
    return 0;
  }
  const matches = content.match(regex);
  return matches ? matches.length : 0;
}

function section(title, body) {
  return [`## ${title}`, "", ...body, ""].join("\n");
}

const outputPath = process.argv[2] ?? "/tmp/report.md";
const branchName = process.argv[3] ?? process.env.GITHUB_REF_NAME ?? "unknown";
const typecheckExit = Number(process.env.TYPECHECK_EXIT ?? "0");
const auditExit = Number(process.env.AUDIT_EXIT ?? "0");

const typecheckText = readText("/tmp/typecheck-output.txt");
const auditText = readText("/tmp/audit-output.txt");
const auditJson = safeJsonParse(readText("/tmp/audit-output.json"), {});
const outdatedJson = safeJsonParse(readText("/tmp/outdated-output.json"), {});
const todosText = readText("/tmp/patterns-todos.txt");
const consoleText = readText("/tmp/patterns-console.txt");
const secretsText = readText("/tmp/patterns-secrets.txt");
const structureText = readText("/tmp/structure-output.txt");

const vulnerabilities = Object.entries(auditJson.vulnerabilities ?? {});
const vulnsBySeverity = vulnerabilities.reduce(
  (acc, [name, details]) => {
    const severity = details?.severity ?? "unknown";
    acc[severity] = acc[severity] ?? [];
    acc[severity].push({ name, isDirect: Boolean(details?.isDirect), fixAvailable: details?.fixAvailable });
    return acc;
  },
  {}
);

const outdatedRows = Object.entries(outdatedJson).map(([name, info]) => ({
  name,
  current: info?.current ?? "unknown",
  wanted: info?.wanted ?? "unknown",
  latest: info?.latest ?? "unknown"
}));

const todoCount = countMatches(todosText, /^.+$/gm);
const consoleCount = countMatches(consoleText, /^.+$/gm);
const secretsCount = countMatches(secretsText, /^.+$/gm);
const vulnCount = vulnerabilities.length;

const report = [];
report.push("# 🔍 Rapport d'Analyse Nocturne du Dépôt");
report.push("");
report.push(`**Date :** ${formatDateUtc()} (UTC)`);
report.push(`**Branche analysée :** \`${branchName}\``);
report.push("");
report.push("---");
report.push("");

report.push(section("📋 Résumé Exécutif", [
  "| Vérification | Statut | Détail |",
  "|---|---|---|",
  `| TypeScript (typecheck) | ${typecheckExit === 0 ? "✅ OK" : "❌ Erreurs détectées"} | ${typecheckExit === 0 ? "Compilation sans erreur." : "Des erreurs bloquent la compilation."} |`,
  `| Audit sécurité (npm audit) | ${auditExit === 0 ? "✅ OK" : "⚠️ Vulnérabilités détectées"} | ${vulnCount} vulnérabilité(s) listée(s). |`,
  `| Dépendances obsolètes | ${outdatedRows.length === 0 ? "✅ OK" : "⚠️ Mises à jour disponibles"} | ${outdatedRows.length} paquet(s) à mettre à jour. |`,
  `| TODO/FIXME/HACK | ${todoCount === 0 ? "✅ OK" : "⚠️ Restes détectés"} | ${todoCount} occurrence(s). |`,
  `| Console.log | ${consoleCount === 0 ? "✅ OK" : "⚠️ Restes détectés"} | ${consoleCount} occurrence(s). |`,
  `| Secrets potentiels (patterns) | ${secretsCount === 0 ? "✅ OK" : "❌ Risque détecté"} | ${secretsCount} occurrence(s). |`
]));

report.push(section("🔴 Erreurs TypeScript", [
  typecheckExit === 0
    ? "> Aucune erreur TypeScript détectée. Le code compile correctement. ✅"
    : "```",
  ...(typecheckExit === 0 ? [] : typecheckText.trim() ? [typecheckText.trim()] : ["Aucune sortie fournie par la commande typecheck."]),
  ...(typecheckExit === 0 ? [] : ["```"])
]));

const auditDetails = [];
if (auditExit === 0 || vulnCount === 0) {
  auditDetails.push("> Aucune vulnérabilité connue dans les dépendances. ✅");
} else {
  auditDetails.push("### Vulnérabilités par sévérité");
  auditDetails.push("");
  for (const severity of ["critical", "high", "moderate", "low", "unknown"]) {
    const list = vulnsBySeverity[severity] ?? [];
    if (list.length === 0) {
      continue;
    }
    auditDetails.push(`- \`${severity}\`: ${list.length}`);
  }
  auditDetails.push("");
  auditDetails.push("### Détails des vulnérabilités");
  auditDetails.push("");
  for (const [name, details] of vulnerabilities) {
    const fix = details?.fixAvailable;
    const fixText =
      fix && typeof fix === "object" && fix.name
        ? `Correction suggérée: \`npm install ${fix.name}@${fix.version ?? "latest"}\``
        : "Correction suggérée: `npm audit fix` puis validation manuelle.";
    auditDetails.push(
      `- \`${name}\` (${details?.severity ?? "unknown"}, ${details?.isDirect ? "directe" : "transitive"}). ${fixText}`
    );
  }
  auditDetails.push("");
  auditDetails.push("### Sortie complète npm audit");
  auditDetails.push("");
  auditDetails.push("```");
  auditDetails.push(auditText.trim() || "Aucune sortie texte fournie.");
  auditDetails.push("```");
}
report.push(section("🛡️ Audit de Sécurité (npm audit)", auditDetails));

const outdatedDetails = [];
if (outdatedRows.length === 0) {
  outdatedDetails.push("> Toutes les dépendances sont à jour. ✅");
} else {
  outdatedDetails.push("| Package | Current | Wanted | Latest | Commande conseillée |");
  outdatedDetails.push("|---|---|---|---|---|");
  for (const row of outdatedRows) {
    const hasSafeUpgrade = row.wanted !== "unknown" && row.current !== "unknown" && row.wanted !== row.current;
    const suggestedCommand = hasSafeUpgrade
      ? `npm install ${row.name}@${row.wanted}`
      : `Migration manuelle vers ${row.latest} (risque de breaking changes)`;
    outdatedDetails.push(
      `| \`${row.name}\` | \`${row.current}\` | \`${row.wanted}\` | \`${row.latest}\` | ${suggestedCommand} |`
    );
  }
}
report.push(section("📦 Dépendances Obsolètes", outdatedDetails));

const patternDetails = [];
patternDetails.push("### TODO / FIXME / HACK restants");
patternDetails.push("");
if (todoCount === 0) {
  patternDetails.push("Aucun trouvé ✅");
} else {
  patternDetails.push("```");
  patternDetails.push(todosText.trim());
  patternDetails.push("```");
}
patternDetails.push("");
patternDetails.push("### Console.log restants");
patternDetails.push("");
if (consoleCount === 0) {
  patternDetails.push("Aucun trouvé ✅");
} else {
  patternDetails.push("```");
  patternDetails.push(consoleText.trim());
  patternDetails.push("```");
}
patternDetails.push("");
patternDetails.push("### Secrets potentiels (patterns sensibles)");
patternDetails.push("");
if (secretsCount === 0) {
  patternDetails.push("Aucun trouvé ✅");
} else {
  patternDetails.push("```");
  patternDetails.push(secretsText.trim());
  patternDetails.push("```");
}
report.push(section("⚠️ Patterns Problématiques", patternDetails));

report.push(section("🗂️ Structure du Projet", [
  structureText.trim() || "> Aucune information de structure disponible."
]));

const recommendations = [];
recommendations.push("> Ce rapport est généré automatiquement chaque nuit à 2h00 UTC.");
recommendations.push("");
recommendations.push("### Actions recommandées");
recommendations.push("");
if (typecheckExit !== 0) {
  recommendations.push("- Corriger les erreurs TypeScript dans l'ordre affiché puis relancer `npm run typecheck`.");
}
if (auditExit !== 0 && vulnCount > 0) {
  recommendations.push("- Appliquer les correctifs de sécurité proposés ci-dessus et relancer `npm audit`.");
}
if (outdatedRows.length > 0) {
  recommendations.push("- Mettre à jour d'abord vers la version `wanted` puis exécuter `npm run typecheck`.");
}
if (todoCount > 0 || consoleCount > 0) {
  recommendations.push("- Nettoyer les marqueurs techniques restants (`TODO`, `FIXME`, `HACK`, `console.log`).");
}
if (secretsCount > 0) {
  recommendations.push("- Vérifier les faux positifs; si vrai secret, retirer immédiatement, le révoquer/rotater et utiliser GitHub Secrets.");
}
if (
  typecheckExit === 0 &&
  (auditExit === 0 || vulnCount === 0) &&
  outdatedRows.length === 0 &&
  todoCount === 0 &&
  consoleCount === 0 &&
  secretsCount === 0
) {
  recommendations.push("- Aucun problème détecté cette nuit. Continuer la surveillance automatique.");
}

report.push(section("💡 Recommandations", recommendations));
report.push("---");
report.push("*Généré automatiquement par le workflow **Analyse Nocturne** 🤖*");
report.push("");

fs.writeFileSync(outputPath, report.join("\n"), "utf8");
console.log(`Rapport généré: ${outputPath}`);
