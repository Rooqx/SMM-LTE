/** Shared browser/server password limits. Better Auth remains authoritative. */
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_LENGTH_MESSAGE =
  `Use a password between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`;
