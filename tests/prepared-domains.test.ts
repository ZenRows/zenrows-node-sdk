import { http, HttpResponse, type JsonBodyType } from "msw";
import { beforeEach, describe, expect, test } from "vitest";
import { ZenRows, ZenRowsPreparedDomainError } from "../src";
import { server } from "./_setup";

const apiKey = "API_KEY";
const base = "https://api.zenrows.com/v1/extract/prepared-domains";

const preparing = {
  domain: "www.example.com",
  status: "preparing",
  state: "received",
  submitted_at: "2026-10-15T10:00:00Z",
  updated_at: "2026-10-15T10:00:00Z",
};

const problem = (status: number, code: string, extra: Record<string, string> = {}) => ({
  code,
  detail: `detail for ${code}`,
  status,
  title: `Title (${code})`,
  type: `https://docs.zenrows.com/api-error-codes#${code}`,
  ...extra,
});

interface Seen {
  method: string;
  url: URL;
  apiKey: string | null;
  body: unknown;
}

// Answers every prepared-domains request with `status` / `body` and records what was sent.
function stub(status: number, body: JsonBodyType, headers: Record<string, string> = {}) {
  const seen: Seen[] = [];
  const answer = async ({ request }: { request: Request }) => {
    const text = await request.text();
    seen.push({
      method: request.method,
      url: new URL(request.url),
      apiKey: request.headers.get("X-API-Key"),
      body: text ? JSON.parse(text) : undefined,
    });
    return HttpResponse.json(body, { status, headers });
  };
  server.use(http.post(base, answer), http.get(`${base}/:domain`, answer));
  return seen;
}

describe("prepared domains", () => {
  let client: ZenRows;

  beforeEach(() => {
    client = new ZenRows(apiKey);
  });

  test("prepareDomain posts the domain and example URLs and returns the status", async () => {
    const seen = stub(202, preparing);

    const status = await client.prepareDomain("www.example.com", [
      "https://www.example.com/a",
      "https://www.example.com/b",
    ]);

    expect(status).toEqual(preparing);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.method).toBe("POST");
    expect(seen[0]?.url.pathname).toBe("/v1/extract/prepared-domains");
    expect(seen[0]?.url.search).toBe("");
    expect(seen[0]?.apiKey).toBe(apiKey);
    expect(seen[0]?.body).toEqual({
      domain: "www.example.com",
      example_urls: ["https://www.example.com/a", "https://www.example.com/b"],
    });
  });

  test("preparedDomainStatus gets the domain and returns the status", async () => {
    const ready = { ...preparing, status: "ready", state: "ready" };
    const seen = stub(200, ready);

    const status = await client.preparedDomainStatus("www.example.com");

    expect(status).toEqual(ready);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.method).toBe("GET");
    expect(seen[0]?.url.pathname).toBe("/v1/extract/prepared-domains/www.example.com");
    expect(seen[0]?.apiKey).toBe(apiKey);
  });

  test("preparedDomainStatus returns a failed preparation without rejecting", async () => {
    stub(200, {
      ...preparing,
      status: "failed",
      state: "failed",
      failure: { code: "unsupported", detail: "x", slot_consumed: true },
    });

    const status = await client.preparedDomainStatus("www.example.com");

    expect(status.failure?.code).toBe("unsupported");
  });

  test("preparedDomainStatus escapes the domain in the path", async () => {
    const seen = stub(200, preparing);

    await client.preparedDomainStatus("bad/domain?x");

    expect(seen[0]?.url.pathname).toBe("/v1/extract/prepared-domains/bad%2Fdomain%3Fx");
  });

  test("prepareDomain does not poll", async () => {
    const seen = stub(202, preparing);

    await client.prepareDomain("www.example.com", ["https://www.example.com/"]);

    expect(seen).toHaveLength(1);
  });

  const errors: Array<[number, string, Record<string, string>]> = [
    [400, "invalid_argument", { reason: "invalid_domain" }],
    [409, "in_progress", {}],
    [429, "out_of_allowance", {}],
    [503, "overloaded", {}],
    [503, "disabled", {}],
  ];

  for (const [status, code, extra] of errors) {
    test(`prepareDomain rejects with ZenRowsPreparedDomainError on ${status} ${code}`, async () => {
      const seen = stub(status, problem(status, code, extra), { "Retry-After": "7" });

      const error = await client
        .prepareDomain("www.example.com", ["https://www.example.com/"])
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ZenRowsPreparedDomainError);
      const err = error as ZenRowsPreparedDomainError;
      expect(err.status).toBe(status);
      expect(err.code).toBe(code);
      expect(err.detail).toBe(`detail for ${code}`);
      expect(err.reason).toBe(extra.reason);
      expect(err.retryAfter).toBe(7);
      expect(err.problem?.status).toBe(status);
      expect(err.message).toContain(code);
      expect(seen).toHaveLength(1);
    });
  }

  test("preparedDomainStatus rejects with not_found for a domain never submitted", async () => {
    stub(404, problem(404, "not_found"));

    const error = await client.preparedDomainStatus("www.example.com").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ZenRowsPreparedDomainError);
    expect((error as ZenRowsPreparedDomainError).code).toBe("not_found");
  });

  test("an error without a JSON body has no problem", async () => {
    server.use(http.get(`${base}/:domain`, () => new HttpResponse("bad gateway", { status: 502 })));

    const error = await client.preparedDomainStatus("www.example.com").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ZenRowsPreparedDomainError);
    const err = error as ZenRowsPreparedDomainError;
    expect(err.status).toBe(502);
    expect(err.code).toBeUndefined();
    expect(err.problem).toBeUndefined();
  });
  test("an empty or whitespace-only domain rejects with a TypeError before any request", async () => {
    const seen = stub(200, preparing);

    for (const domain of ["", "   ", "\t\n"]) {
      await expect(client.preparedDomainStatus(domain)).rejects.toThrow(TypeError);
      await expect(client.prepareDomain(domain, ["https://www.example.com/"])).rejects.toThrow(
        TypeError,
      );
    }

    expect(seen).toHaveLength(0);
  });

  test("a 503 is not retried even with retries configured", async () => {
    const retrying = new ZenRows(apiKey, { retries: 2 });
    const seen = stub(503, problem(503, "overloaded"));

    const error = await retrying.preparedDomainStatus("www.example.com").catch((e: unknown) => e);

    expect((error as ZenRowsPreparedDomainError).code).toBe("overloaded");
    expect(seen).toHaveLength(1);
  });
});
