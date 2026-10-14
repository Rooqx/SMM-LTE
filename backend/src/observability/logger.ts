type LogFields = Record<string, unknown>;

const SECRET_PATTERN = /(authorization|cookie|token|secret|password|prompt|content|payload)/i;

function sanitize(value: unknown, key = ""): unknown {
  if (SECRET_PATTERN.test(key)) return "[REDACTED]";
  if (typeof value === "string") {
    return value
      .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
      .slice(0, 2_000);
  }
  if (value instanceof Error) {
    return { name: value.name, message: sanitize(value.message, "message") };
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([nestedKey, nestedValue]) => [nestedKey, sanitize(nestedValue, nestedKey)]),
    );
  }
  return value;
}

/** Minimal structured worker/CLI logger with defensive field redaction. */
export class OperationalLogger {
  constructor(readonly component: string) {}

  info(fields: LogFields, message: string): void {
    this.#write("info", fields, message);
  }

  warn(fields: LogFields, message: string): void {
    this.#write("warn", fields, message);
  }

  error(fields: LogFields, message: string): void {
    this.#write("error", fields, message);
  }

  #write(level: "info" | "warn" | "error", fields: LogFields, message: string): void {
    const line = JSON.stringify({
      level,
      time: new Date().toISOString(),
      component: this.component,
      message,
      ...sanitize(fields) as LogFields,
    });
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }
}
