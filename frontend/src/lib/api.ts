export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const BASE = `${API_URL}/api/v1`;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: string[],
  ) {
    super(message);
  }
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { statusCode: number; message: string; details?: string[] };
}

/** Calls the REST API (cookie auth) and unwraps the `{success,data}` envelope. */
export async function api<T>(
  path: string,
  init: Omit<RequestInit, "body"> & { body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init.headers },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError("Cannot reach the server. Is the API running?", 0);
  }
  let json: Envelope<T> | null = null;
  try {
    json = (await res.json()) as Envelope<T>;
  } catch {
    /* non-JSON response */
  }
  if (!res.ok || !json?.success) {
    const err = json?.error;
    throw new ApiError(
      err?.details?.length
        ? err.details.join(". ")
        : (err?.message ?? `Request failed (${res.status})`),
      res.status,
      err?.details,
    );
  }
  return json.data as T;
}

export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body });
export const patch = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "PATCH", body });
export const del = <T>(path: string) => api<T>(path, { method: "DELETE" });
