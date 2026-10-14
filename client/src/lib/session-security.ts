import type { QueryClient } from "@tanstack/react-query";
import { signOut } from "@/lib/auth-client";

const PRIVATE_SESSION_KEY_PREFIX = "smm_active_run_";

/**
 * Removes transient workflow identifiers that must not cross account sessions.
 * Durable application state remains owned by the backend and is intentionally
 * untouched.
 */
export function clearPrivateBrowserState(storage: Storage = sessionStorage) {
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key?.startsWith(PRIVATE_SESSION_KEY_PREFIX)) storage.removeItem(key);
  }
}

/**
 * Ends a private session only after all account-scoped client caches are
 * cancelled and cleared. Callers should redirect after this resolves.
 */
export async function endPrivateSession(queryClient: QueryClient) {
  await queryClient.cancelQueries();
  queryClient.clear();
  clearPrivateBrowserState();

  const response = await signOut();
  if (response.error) {
    throw new Error("Secure sign-out could not be completed.");
  }
}
