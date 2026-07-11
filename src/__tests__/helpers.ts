/** Minimal fetch mock that records calls and returns canned JSON. */
export interface RecordedCall {
  url: string;
  init: RequestInit;
}

export function mockFetch(
  responder: (url: string, init: RequestInit) => { status?: number; body: unknown },
): { fetch: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const safeInit = init ?? {};
    calls.push({ url, init: safeInit });
    const { status = 200, body } = responder(url, safeInit);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  }) as unknown as typeof fetch;

  return { fetch: fetchImpl, calls };
}

export function jsonBody(init: RequestInit): Record<string, unknown> {
  return init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
}

export function authHeader(init: RequestInit): string | undefined {
  const headers = (init.headers ?? {}) as Record<string, string>;
  return headers.Authorization;
}
