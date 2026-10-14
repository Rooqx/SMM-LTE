/**
 * An expected application failure that is safe to return to an API caller.
 * Unexpected errors are logged server-side and converted to a generic 500.
 */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(400, code, message, details);

export const unauthorized = (message = "Authentication is required") =>
  new AppError(401, "unauthorized", message);

export const forbidden = (message = "You do not have permission to perform this action") =>
  new AppError(403, "forbidden", message);

export const notFound = (resource: string) =>
  new AppError(404, "not_found", `${resource} was not found`);

export const conflict = (code: string, message: string) =>
  new AppError(409, code, message);

export const tooManyRequests = (code: string, message: string) =>
  new AppError(429, code, message);

export const serviceUnavailable = (code: string, message: string) =>
  new AppError(503, code, message);
