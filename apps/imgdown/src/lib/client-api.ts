import type { Locale } from "@imgdown/shared";
import { DEFAULT_LOCALE, translate } from "./messages";

/**
 * Sends a JSON request and throws a readable Error when the API fails.
 * @param url - Request URL.
 * @param init - Fetch options.
 * @param locale - Locale used for fallback error messages.
 * @returns The parsed JSON response.
 */
export async function api<T>(
  url: string,
  init?: RequestInit,
  locale: Locale = DEFAULT_LOCALE,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new Error(data?.error ?? translate(locale, "api.requestFailed", { status: response.status }));
  }
  return data as T;
}

/**
 * Extracts a human-readable message from an unknown error.
 * @param error - The caught error.
 * @param locale - Locale used for the generic fallback.
 * @returns A readable error message.
 */
export function errorMessage(error: unknown, locale: Locale = DEFAULT_LOCALE): string {
  return error instanceof Error && error.message
    ? error.message
    : translate(locale, "api.genericError");
}
