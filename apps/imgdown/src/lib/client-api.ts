/** Sends a JSON request and throws a readable Error when the API fails. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new Error(data?.error ?? `Yêu cầu thất bại (${response.status})`);
  }
  return data as T;
}

/** Extracts a human-readable message from an unknown error. */
export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Có lỗi xảy ra, vui lòng thử lại.";
}
