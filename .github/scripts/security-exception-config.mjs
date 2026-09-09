const REQUIRED_EXCEPTION_FIELDS = [
  "id",
  "package",
  "nodePathContains",
  "advisory",
  "severity",
  "owner",
  "issue",
  "expiresOn",
];

const VALID_SEVERITIES = new Set(["low", "moderate", "high", "critical"]);

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function validateExceptionConfig(exceptionConfig, { requireUpstreamPackage = false } = {}) {
  if (!exceptionConfig || typeof exceptionConfig !== "object" || Array.isArray(exceptionConfig)) {
    throw new Error("le fichier d'exceptions doit contenir un objet JSON.");
  }

  const { exceptions = [] } = exceptionConfig;
  if (!Array.isArray(exceptions)) {
    throw new Error("`exceptions` doit être un tableau.");
  }

  const errors = [];

  for (const [index, exception] of exceptions.entries()) {
    const label = exception?.id ?? `index ${index}`;

    if (!exception || typeof exception !== "object" || Array.isArray(exception)) {
      errors.push(`[${label}] chaque exception doit être un objet JSON.`);
      continue;
    }

    for (const field of REQUIRED_EXCEPTION_FIELDS) {
      if (!isNonEmptyString(exception[field])) {
        errors.push(`[${label}] champ obligatoire invalide: ${field}.`);
      }
    }

    if (requireUpstreamPackage && !isNonEmptyString(exception.upstreamPackage)) {
      errors.push(`[${label}] champ obligatoire invalide: upstreamPackage.`);
    }

    if (
      exception.effectContains !== undefined &&
      !isNonEmptyString(exception.effectContains)
    ) {
      errors.push(`[${label}] champ optionnel invalide: effectContains.`);
    }

    if (isNonEmptyString(exception.severity) && !VALID_SEVERITIES.has(exception.severity)) {
      errors.push(
        `[${label}] severity doit être l'une de: ${Array.from(VALID_SEVERITIES).join(", ")}.`
      );
    }

    if (isNonEmptyString(exception.expiresOn) && !isValidIsoDate(exception.expiresOn)) {
      errors.push(`[${label}] expiresOn doit être une date ISO YYYY-MM-DD valide.`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  return exceptions;
}
