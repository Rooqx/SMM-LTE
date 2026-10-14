export class PermanentProviderError extends Error {
  override readonly name = "PermanentProviderError";
}

export class TransientProviderError extends Error {
  override readonly name = "TransientProviderError";
}

/** Maps provider/transport failures without retaining response bodies or prompts. */
export function classifyProviderError(error: unknown): Error {
  if (error instanceof PermanentProviderError || error instanceof TransientProviderError) {
    return error;
  }
  const status = typeof (error as { status?: unknown } | null)?.status === "number"
    ? (error as { status: number }).status
    : null;
  const code = typeof (error as { code?: unknown } | null)?.code === "string"
    ? (error as { code: string }).code
    : null;
  const name = error instanceof Error ? error.name : "ProviderError";
  const safeMessage = status === null
    ? `Model provider request failed (${name}${code ? `/${code}` : ""})`
    : `Model provider request failed with status ${status}`;
  if (status === 408 || status === 409 || status === 429 || (status !== null && status >= 500) ||
      name === "AbortError" || code === "ETIMEDOUT" || code === "ECONNRESET") {
    return new TransientProviderError(safeMessage);
  }
  if (status !== null && status >= 400 && status < 500) {
    return new PermanentProviderError(safeMessage);
  }
  return new TransientProviderError(safeMessage);
}
