// injectFetch — adapt a Fastify instance to a `fetch`-compatible function so the @oursay/identity
// CivicHttpClient (which speaks browser `fetch`) can be driven over `app.inject()` in tests, with no
// real socket. It parses the request URL's path + query, forwards method/headers/body to inject, and
// wraps the result as a standard Response (status + body — the SDK reads the body via `.text()`).

import type { FastifyInstance } from "fastify";

/** The civic SDK only issues GET/POST; this subset keeps inject's overload resolution happy. */
type InjectMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

/** Statuses that must carry a null body when constructing a Response. */
const NULL_BODY_STATUS = new Set([101, 204, 205, 304]);

export function injectFetch(app: FastifyInstance): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const raw = typeof input === "string" ? input : input.toString();
    const { pathname, search } = new URL(raw, "http://localhost");
    const res = await app.inject({
      method: (init?.method ?? "GET").toUpperCase() as InjectMethod,
      url: pathname + search,
      headers: init?.headers as Record<string, string> | undefined,
      payload: init?.body as string | undefined,
    });
    const body = NULL_BODY_STATUS.has(res.statusCode) ? null : res.payload;
    return new Response(body, { status: res.statusCode });
  }) as typeof fetch;
}
