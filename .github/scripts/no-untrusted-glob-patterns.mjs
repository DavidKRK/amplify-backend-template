import fs from "node:fs";
import path from "node:path";

const roots = [".github", "amplify"];
const extensions = new Set([".yml", ".yaml", ".js", ".mjs", ".cjs", ".ts"]);
const globCall = /(minimatch|globby|fast-glob|glob)\s*\(\s*[^"'`]/;
const untrusted = /(github\.event|inputs\.|process\.env|argv|event\.|req\.|request\.|body\.)/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, out);
      continue;
    }

    if (extensions.has(path.extname(entry.name))) {
      out.push(fullPath);
    }
  }

  return out;
}

const files = roots.flatMap((root) => (fs.existsSync(root) ? walk(root) : []));
const violations = [];

for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  if (!globCall.test(content)) {
    continue;
  }

  if (untrusted.test(content)) {
    violations.push(file);
  }
}

if (violations.length > 0) {
  console.error("Patterns glob potentiellement alimentés par entrée non fiable:");
  for (const file of violations) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log("Vérification glob: aucune utilisation à risque détectée.");
